import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── VAPID helpers using Web Crypto API ─────────────────────────────────────

function base64urlDecode(str: string): Uint8Array {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function makeVapidToken(
  audience: string,
  subject: string,
  publicKeyB64u: string,
  privateKeyB64u: string
): Promise<string> {
  const pubRaw = base64urlDecode(publicKeyB64u); // 65 bytes: 0x04 + x + y
  const privRaw = base64urlDecode(privateKeyB64u); // 32 bytes

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64urlEncode(pubRaw.slice(1, 33)),
    y: base64urlEncode(pubRaw.slice(33, 65)),
    d: base64urlEncode(privRaw),
    ext: true,
  };

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: subject }))
  );
  const sigInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(sigInput)
  );
  return `${sigInput}.${base64urlEncode(sig)}`;
}

// ── Web Push encryption (RFC 8291 / aes128gcm) ─────────────────────────────

async function encryptPayload(
  plaintext: string,
  clientPublicKeyB64u: string,
  authB64u: string
): Promise<{ ciphertext: Uint8Array; serverPublicKey: Uint8Array; salt: Uint8Array }> {
  const encoder = new TextEncoder();
  const clientPublicKeyRaw = base64urlDecode(clientPublicKeyB64u);
  const authSecret = base64urlDecode(authB64u);

  // Generate ephemeral server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  );

  // Import client public key for ECDH
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPublicKey },
      serverKeyPair.privateKey,
      256
    )
  );

  // Salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF extract PRK using auth secret
  const prk = await hkdf(authSecret, sharedSecret, concat(encoder.encode('WebPush: info\0'), clientPublicKeyRaw, serverPublicKeyRaw), 32);

  // HKDF expand CEK and nonce
  const contentKey = await hkdf(salt, prk, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, encoder.encode('Content-Encoding: nonce\0'), 12);

  // Import AES-GCM key
  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);

  // Plaintext with padding
  const paddedPlaintext = concat(encoder.encode(plaintext), new Uint8Array([2])); // delimiter byte

  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    paddedPlaintext
  );

  // Build aes128gcm record: salt (16) + rs (4) + keyid_len (1) + keyid (65) + ciphertext
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = 65;
  header.set(serverPublicKeyRaw, 21);

  return {
    ciphertext: concat(header, new Uint8Array(ciphertextWithTag)),
    serverPublicKey: serverPublicKeyRaw,
    salt,
  };
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const okm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(okm);
}

// ── Send a single Web Push notification ────────────────────────────────────

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string
): Promise<void> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const token = await makeVapidToken(audience, `mailto:${vapidEmail}`, vapidPublicKey, vapidPrivateKey);

  const { ciphertext } = await encryptPayload(payload, subscription.keys.p256dh, subscription.keys.auth);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${token},k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
    },
    body: ciphertext,
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text().catch(() => '');
    throw new Error(`Push failed: ${res.status} ${text}`);
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { list_id, sender_user_id, title, body, tag, target_user_id } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let query = supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('list_id', list_id);
    // If target_user_id is set, only notify that specific user
    if (target_user_id) query = query.eq('user_id', target_user_id);
    const { data: subs } = await query;

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidEmail = Deno.env.get('VAPID_EMAIL')!;
    const payload = JSON.stringify({ title, body, tag, url: '/' });

    const results = await Promise.allSettled(
      subs.map(({ subscription }) =>
        sendWebPush(subscription, payload, vapidPublicKey, vapidPrivateKey, vapidEmail)
      )
    );

    // Remove expired/invalid subscriptions (410 Gone)
    const expired = subs
      .filter((_, i) => {
        const r = results[i];
        return r.status === 'rejected' && r.reason?.message?.includes('410');
      })
      .map((_, i) => subs[i]);

    if (expired.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('subscription', expired.map((s) => s.subscription));
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
