import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ── VAPID / Web Push helpers ────────────────────────────────────────────────

function base64urlDecode(str: string): Uint8Array {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
  const okm = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(okm);
}

async function makeVapidToken(audience: string, subject: string, pubB64u: string, privB64u: string): Promise<string> {
  const pubRaw = base64urlDecode(pubB64u);
  const privRaw = base64urlDecode(privB64u);
  const jwk = { kty: 'EC', crv: 'P-256', x: base64urlEncode(pubRaw.slice(1, 33)), y: base64urlEncode(pubRaw.slice(33, 65)), d: base64urlEncode(privRaw), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = base64urlEncode(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64urlEncode(sig)}`;
}

async function encryptPushPayload(plaintext: string, clientPubB64u: string, authB64u: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const clientPubRaw = base64urlDecode(clientPubB64u);
  const authSecret = base64urlDecode(authB64u);
  const serverKP = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKP.publicKey));
  const clientPub = await crypto.subtle.importKey('raw', clientPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPub }, serverKP.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), clientPubRaw, serverPubRaw), 32);
  const cek = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12);
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(enc.encode(plaintext), new Uint8Array([2])));
  const hdr = new Uint8Array(16 + 4 + 1 + 65);
  hdr.set(salt, 0);
  new DataView(hdr.buffer).setUint32(16, 4096, false);
  hdr[20] = 65;
  hdr.set(serverPubRaw, 21);
  return concat(hdr, new Uint8Array(ct));
}

async function sendWebPush(endpoint: string, p256dh: string, authKey: string, payloadJson: string): Promise<boolean> {
  const vapidPub = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const vapidPriv = Deno.env.get('VAPID_PRIVATE_KEY')!;
  const vapidEmail = Deno.env.get('VAPID_EMAIL')!;
  const url = new URL(endpoint);
  const token = await makeVapidToken(`${url.protocol}//${url.host}`, `mailto:${vapidEmail}`, vapidPub, vapidPriv);
  const body = await encryptPushPayload(payloadJson, p256dh, authKey);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `vapid t=${token},k=${vapidPub}`, 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: '86400' },
    body,
  });
  if (res.status === 410 || res.status === 404) return false;
  return true;
}

// ── Grok news fetch ─────────────────────────────────────────────────────────

interface GrokNewsItem {
  ticker: string;
  headline: string;
  summary: string;
  price?: number;
  price_change_pct?: number;
}

interface GrokCustomItem {
  query_id: string;
  headline: string;
  summary: string;
}

interface GrokBriefItem {
  headline: string;
  summary: string;
}

interface CompactTickerNewsItem {
  s?: string;
  h?: string;
  m?: string;
  p?: number;
  c?: number;
}

interface CompactCustomNewsItem {
  id?: string;
  h?: string;
  m?: string;
}

const MARKET_BRIEF_TICKER = 'MARKET_BRIEF';
const DEFAULT_NEWS_XAI_PROMPT =
  `Use web search once. Write one article from the requested stocks and custom topics, but keep unrelated themes separate.\n` +
  `Structure the article with short section headings when topics differ, e.g. Markets, Australia/Hong Kong, K-pop. Only combine topics in the same paragraph if they are directly related.\n` +
  `For ticker/finance sections, include only material current market news from roughly the last 24 hours: earnings/guidance, M&A, regulation, analyst action, major product/news events, or >3% price moves.\n` +
  `For non-finance custom topics, summarise them independently and do not force a finance angle unless the story clearly affects markets or a requested security.\n` +
  `Mention ticker symbols and custom topics naturally inside the article; do not make one card/list item per ticker.\n` +
  `If a section has no material/current news, say that briefly inside that section.`;

async function grokResponses(prompt: string, apiKey: string, model: string, timeoutMs = 300000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: [{ role: 'user', content: prompt }], tools: [{ type: 'web_search' }] }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Grok ${resp.status}`);
    const data = await resp.json();
    return (
      data.output_text ||
      data.output?.find((i: { type: string }) => i.type === 'message')
        ?.content?.find((c: { type: string }) => c.type === 'output_text')?.text ||
      ''
    ).trim();
  } finally {
    clearTimeout(timer);
  }
}

function cleanJson(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function limitWords(text: string, maxWords = 50): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? text.trim() : `${words.slice(0, maxWords).join(' ')}...`;
}

function validTickerNews(item: unknown): GrokNewsItem | null {
  const parsed = item as Partial<GrokNewsItem> & CompactTickerNewsItem;
  const ticker = parsed?.ticker ?? parsed?.s;
  const headline = parsed?.headline ?? parsed?.h;
  const summary = parsed?.summary ?? parsed?.m;
  const price = parsed?.price ?? parsed?.p;
  const priceChangePct = parsed?.price_change_pct ?? parsed?.c;
  if (typeof ticker === 'string' && typeof headline === 'string' && headline && typeof summary === 'string') {
    return {
      ticker: ticker.toUpperCase(),
      headline,
      summary: limitWords(summary),
      price,
      price_change_pct: priceChangePct,
    };
  }
  return null;
}

function validCustomNews(item: unknown): GrokCustomItem | null {
  const parsed = item as Partial<GrokCustomItem> & CompactCustomNewsItem;
  const queryId = parsed?.query_id ?? parsed?.id;
  const headline = parsed?.headline ?? parsed?.h;
  const summary = parsed?.summary ?? parsed?.m;
  if (typeof queryId === 'string' && typeof headline === 'string' && headline && typeof summary === 'string') {
    return { query_id: queryId, headline, summary: limitWords(summary) };
  }
  return null;
}

function validBriefNews(item: unknown): GrokBriefItem | null {
  const parsed = item as Partial<GrokBriefItem> & { h?: string; m?: string; body?: string; article?: string };
  const headline = parsed?.headline ?? parsed?.h;
  const summary = parsed?.summary ?? parsed?.m ?? parsed?.body ?? parsed?.article;
  if (typeof headline === 'string' && headline && typeof summary === 'string' && summary) {
    return { headline, summary: summary.trim() };
  }
  return null;
}

async function fetchNewsBatch(
  tickers: string[],
  queries: { id: string; query_text: string }[],
  apiKey: string,
  model: string,
  today: string,
  customPrompt = ''
): Promise<{ tickerNews: Map<string, GrokNewsItem>; customNews: Map<string, GrokCustomItem>; briefNews: GrokBriefItem | null }> {
  const instructions = customPrompt.trim() || DEFAULT_NEWS_XAI_PROMPT;
  const prompt =
    `D=${today}\n` +
    `T=${tickers.length ? tickers.join(',') : '-'}\n` +
    `Q=${queries.length ? queries.map(q => `${q.id}:${q.query_text}`).join(' | ') : '-'}\n\n` +
    `${instructions}\n\n` +
    `JSON only. No markdown.\n` +
    `{"brief":{"h":"Headline max 14 words","m":"4-8 paragraph market brief, 250-600 words"}}`;

  try {
    const raw = await grokResponses(prompt, apiKey, model);
    const parsed = JSON.parse(cleanJson(raw));
    const tickerNews = new Map<string, GrokNewsItem>();
    const customNews = new Map<string, GrokCustomItem>();
    const briefNews = validBriefNews(parsed?.brief ?? parsed?.article ?? parsed);
    const tickerItems = Array.isArray(parsed?.t) ? parsed.t : Array.isArray(parsed?.tickers) ? parsed.tickers : [];
    const queryItems = Array.isArray(parsed?.q) ? parsed.q : Array.isArray(parsed?.queries) ? parsed.queries : [];
    for (const item of tickerItems) {
      const news = validTickerNews(item);
      if (news) tickerNews.set(news.ticker, news);
    }
    for (const item of queryItems) {
      const news = validCustomNews(item);
      if (news) customNews.set(news.query_id, news);
    }
    return { tickerNews, customNews, briefNews };
  } catch {
    return { tickerNews: new Map(), customNews: new Map(), briefNews: null };
  }
}

// ── Ticker collection ───────────────────────────────────────────────────────

async function getUserTickers(userId: string, includeHoldings: boolean, includeWatchlist: boolean, excluded: Set<string>): Promise<string[]> {
  const tickers = new Set<string>();

  if (includeHoldings) {
    const { data } = await supabase.from('securities_transactions').select('ticker').eq('user_id', userId).not('ticker', 'is', null);
    for (const r of data || []) if (r.ticker) tickers.add(String(r.ticker).toUpperCase().trim());
  }

  if (includeWatchlist) {
    const { data } = await supabase.from('watchlist_items').select('ticker').eq('user_id', userId);
    for (const r of data || []) if (r.ticker) tickers.add(String(r.ticker).toUpperCase().trim());
  }

  return [...tickers].filter(t => !excluded.has(t)).sort();
}

// ── Push notification ───────────────────────────────────────────────────────

async function notifyUser(userId: string, itemCount: number): Promise<void> {
  const functionUrl = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-push`;
  await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
    },
    body: JSON.stringify({
      target_user_id: userId,
      title: 'Market news ready',
      body: `${itemCount} news item${itemCount === 1 ? '' : 's'} arrived`,
      tag: 'news',
    }),
  }).then(async (res) => {
    const text = await res.text().catch(() => '');
    if (!res.ok) console.error(`[fetch-stock-news] push notification failed: ${res.status} ${text}`);
    else {
      try {
        const result = text ? JSON.parse(text) : {};
        console.log(`[fetch-stock-news] push notification sent: ${Number(result.sent || 0)} device(s)`);
      } catch {
        console.log('[fetch-stock-news] push notification sent');
      }
    }
  }).catch((err) => console.error('[fetch-stock-news] push notification failed:', err?.message || err));
}

// ── On-demand: process all tickers/queries for a user in one call ───────────

async function processUser(
  userId: string,
  opts: { forceTickers?: string[]; forceQueryIds?: string[]; notify?: boolean } = {}
): Promise<{ tickers: number; items: number; customItems: number }> {
  const shouldNotify = opts.notify !== false;
  const { data: settings } = await supabase
    .from('user_settings')
    .select('key,value')
    .eq('user_id', userId)
    .in('key', ['xai_api_key', 'xai_model', 'news_excluded_tickers', 'news_include_holdings', 'news_include_watchlist', 'news_xai_prompt']);

  const sm = Object.fromEntries((settings || []).map(s => [s.key, s.value as string]));
  const apiKey = sm['xai_api_key'];
  if (!apiKey) throw new Error('No xAI API key configured');
  const model = sm['xai_model'] || 'grok-3-latest';

  let excludedArr: string[] = [];
  try { excludedArr = JSON.parse(sm['news_excluded_tickers'] || '[]'); } catch {}
  const excluded = new Set(excludedArr.map(t => t.toUpperCase()));

  const includeHoldings  = sm['news_include_holdings']  !== 'false';
  const includeWatchlist = sm['news_include_watchlist'] !== 'false';
  const newsPrompt = sm['news_xai_prompt'] || '';

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
  const fetchedAt = new Date().toISOString();

  const hasForceQueryIds = opts.forceQueryIds && opts.forceQueryIds.length > 0;
  const hasForceTickers  = opts.forceTickers  && opts.forceTickers.length  > 0;

  let tickers: string[];
  if (hasForceTickers) {
    tickers = opts.forceTickers!.map(t => t.toUpperCase());
  } else if (hasForceQueryIds) {
    tickers = [];
  } else {
    tickers = await getUserTickers(userId, includeHoldings, includeWatchlist, excluded);
  }

  const { data: allCustomQueries } = await supabase
    .from('news_custom_queries').select('id,query_text').eq('user_id', userId);

  let queriesToFetch = allCustomQueries || [];
  if (hasForceQueryIds) {
    queriesToFetch = queriesToFetch.filter(q => opts.forceQueryIds!.includes(q.id));
  } else if (hasForceTickers) {
    queriesToFetch = [];
  }

  const { tickerNews, customNews, briefNews } = await fetchNewsBatch(tickers, queriesToFetch, apiKey, model, today, newsPrompt);

  await Promise.allSettled([
    supabase.from('stock_news_items').delete().eq('user_id', userId).eq('fetch_date', today).neq('ticker', MARKET_BRIEF_TICKER),
    supabase.from('custom_news_items').delete().eq('user_id', userId).eq('fetch_date', today),
  ]);

  if (briefNews) {
    await supabase.from('stock_news_items').upsert({
      user_id: userId,
      ticker: MARKET_BRIEF_TICKER,
      fetch_date: today,
      headline: briefNews.headline,
      summary: briefNews.summary,
      price: null,
      price_change_pct: null,
      is_read: false,
      fetched_at: fetchedAt,
    }, { onConflict: 'user_id,ticker,fetch_date', ignoreDuplicates: false });

    if (shouldNotify) await notifyUser(userId, 1);
    return { tickers: tickers.length, items: 1, customItems: 0 };
  }

  let newsItemCount = 0;
  for (const ticker of tickers) {
    const news = tickerNews.get(ticker);
    await supabase.from('stock_news_items').upsert({
      user_id: userId,
      ticker,
      fetch_date: today,
      headline: news?.headline || '',
      summary: news?.summary || '',
      price: news?.price ?? null,
      price_change_pct: news?.price_change_pct ?? null,
      is_read: false,
      fetched_at: fetchedAt,
    }, { onConflict: 'user_id,ticker,fetch_date', ignoreDuplicates: false });
    if (news?.headline) newsItemCount++;
  }

  let customItems = 0;
  for (const query of queriesToFetch) {
    const news = customNews.get(query.id);
    await supabase.from('custom_news_items').upsert({
      user_id: userId, query_id: query.id, fetch_date: today,
      headline: news?.headline || '',
      summary: news?.summary || '',
      is_read: false,
      fetched_at: fetchedAt,
    }, { onConflict: 'user_id,query_id,fetch_date', ignoreDuplicates: false });
    if (news?.headline) customItems++;
  }

  const totalItems = newsItemCount + customItems;
  if (shouldNotify && totalItems > 0) await notifyUser(userId, totalItems);

  return { tickers: tickers.length, items: newsItemCount, customItems };
}

// ── Queue-based batch processing (for scheduled cron) ──────────────────────

const SCHEDULED_BATCH_SIZE = 8;

type PendingItem =
  | { type: 'ticker'; ticker: string }
  | { type: 'query'; id: string; text: string };

async function getPendingItems(
  userId: string,
  today: string,
  allTickers: string[],
  allQueries: { id: string; query_text: string }[]
): Promise<PendingItem[]> {
  const [{ data: existingTickers }, { data: existingQueries }] = await Promise.all([
    supabase.from('stock_news_items').select('ticker').eq('user_id', userId).eq('fetch_date', today),
    supabase.from('custom_news_items').select('query_id').eq('user_id', userId).eq('fetch_date', today),
  ]);

  const doneTickers = new Set((existingTickers || []).map(r => r.ticker as string));
  const doneQueryIds = new Set((existingQueries || []).map(r => r.query_id as string));

  const pending: PendingItem[] = [];
  for (const ticker of allTickers) {
    if (!doneTickers.has(ticker)) pending.push({ type: 'ticker', ticker });
  }
  for (const q of allQueries) {
    if (!doneQueryIds.has(q.id)) pending.push({ type: 'query', id: q.id, text: q.query_text });
  }
  return pending;
}

async function processNextBatch(
  userId: string,
  today: string,
  apiKey: string,
  model: string,
  allTickers: string[],
  allQueries: { id: string; query_text: string }[]
): Promise<{ processed: number; remaining: number; newItems: number }> {
  const pending = await getPendingItems(userId, today, allTickers, allQueries);
  if (pending.length === 0) return { processed: 0, remaining: 0, newItems: 0 };

  const batch = pending.slice(0, SCHEDULED_BATCH_SIZE);
  const fetchedAt = new Date().toISOString();
  const batchTickers = batch.filter(item => item.type === 'ticker').map(item => (item as { type: 'ticker'; ticker: string }).ticker);
  const batchQueries = batch
    .filter(item => item.type === 'query')
    .map(item => {
      const q = item as { type: 'query'; id: string; text: string };
      return { id: q.id, query_text: q.text };
    });
  const { tickerNews, customNews } = await fetchNewsBatch(batchTickers, batchQueries, apiKey, model, today);

  let newItems = 0;
  const upserts: Promise<unknown>[] = [];

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];

    if (item.type === 'ticker') {
      const news = tickerNews.get(item.ticker);
      upserts.push(supabase.from('stock_news_items').upsert({
        user_id: userId,
        ticker: item.ticker,
        fetch_date: today,
        headline: news?.headline || '',
        summary: news?.summary || '',
        price: news?.price ?? null,
        price_change_pct: news?.price_change_pct ?? null,
        is_read: false,
        fetched_at: fetchedAt,
      }, { onConflict: 'user_id,ticker,fetch_date', ignoreDuplicates: false }));
      if (news?.headline) newItems++;
    } else {
      const news = customNews.get(item.id);
      upserts.push(supabase.from('custom_news_items').upsert({
        user_id: userId,
        query_id: item.id,
        fetch_date: today,
        headline: news?.headline || '',
        summary: news?.summary || '',
        is_read: false,
        fetched_at: fetchedAt,
      }, { onConflict: 'user_id,query_id,fetch_date', ignoreDuplicates: false }));
      if (news?.headline) newItems++;
    }
  }

  await Promise.allSettled(upserts);

  const remaining = Math.max(0, pending.length - batch.length);
  return { processed: batch.length, remaining, newItems };
}

// ── Scheduled run: eligibility check ───────────────────────────────────────

function isTimeToFetch(fetchTimes: string[], timezone: string): boolean {
  try {
    const now = new Date();
    const local = now.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
    const [hh, mm] = local.split(':').map(Number);
    const cur = hh * 60 + mm;
    return fetchTimes.some(ft => {
      const [th, tm] = ft.split(':').map(Number);
      const target = th * 60 + tm;
      return cur >= target && cur < target + 15;
    });
  } catch { return false; }
}

// ── Handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let body: { user_id?: string; force?: boolean; tickers?: string[]; query_ids?: string[] } = {};
    try { body = await req.json(); } catch {}

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });

    // On-demand: called by the frontend with the user's auth token
    const authHeader = req.headers.get('Authorization');
    if (authHeader && body.user_id) {
      const saveStatus = (value: object) => supabase.from('user_settings').upsert(
        [{ user_id: body.user_id, key: 'news_last_auto_fetch_result', value: JSON.stringify(value) }],
        { onConflict: 'user_id,key' }
      );
      try {
        const result = await processUser(body.user_id, {
          forceTickers:  body.tickers,
          forceQueryIds: body.query_ids,
        });
        if (!body.tickers && !body.query_ids) {
          await saveStatus({ status: 'success', date: today, time: new Date().toISOString(), items: result.items + result.customItems });
        }
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        if (!body.tickers && !body.query_ids) {
          await saveStatus({ status: 'failed', date: today, time: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) }).catch(() => {});
        }
        throw err;
      }
    }

    // Scheduled: process next batch for users whose fetch time has come (or who are mid-queue)
    const [
      { data: fetchTimesSettings },
      { data: fetchTimeSettings },
      { data: tzSettings },
      { data: statusSettings },
      { data: lastFetchDateSettings },
    ] = await Promise.all([
      supabase.from('user_settings').select('user_id,value').eq('key', 'news_fetch_times'),
      supabase.from('user_settings').select('user_id,value').eq('key', 'news_fetch_time'),
      supabase.from('user_settings').select('user_id,value').eq('key', 'news_fetch_timezone'),
      supabase.from('user_settings').select('user_id,value').eq('key', 'news_last_auto_fetch_result'),
      supabase.from('user_settings').select('user_id,value').eq('key', 'news_last_auto_fetch_date'),
    ]);

    const tzMap = Object.fromEntries((tzSettings || []).map(s => [s.user_id as string, s.value as string]));
    const lastFetchDateMap = Object.fromEntries((lastFetchDateSettings || []).map(s => [s.user_id as string, s.value as string]));

    const statusMap: Record<string, Record<string, unknown>> = {};
    for (const s of statusSettings || []) {
      try { statusMap[s.user_id as string] = JSON.parse(s.value as string); } catch {}
    }

    const ftArrayMap: Record<string, string[]> = {};
    for (const s of fetchTimesSettings || []) {
      try { ftArrayMap[s.user_id as string] = JSON.parse(s.value as string); } catch {}
    }
    for (const s of fetchTimeSettings || []) {
      if (!ftArrayMap[s.user_id as string]) ftArrayMap[s.user_id as string] = [s.value as string];
    }

    const results: Record<string, unknown> = {};

    for (const [userId, fetchTimes] of Object.entries(ftArrayMap)) {
      const timezone = tzMap[userId] || 'Asia/Hong_Kong';
      const currentStatus = statusMap[userId] || {};
      const isRunningToday = currentStatus['status'] === 'running' && currentStatus['date'] === today;
      const alreadyDoneToday = lastFetchDateMap[userId] === today && !isRunningToday;

      // Skip if: not running mid-queue, not in time window, not forced
      if (!isRunningToday && !isTimeToFetch(fetchTimes, timezone) && !body.force) continue;
      // Skip if already successfully completed today
      if (alreadyDoneToday && !body.force) continue;

      const [{ data: settings }, { data: allQueries }] = await Promise.all([
        supabase.from('user_settings').select('key,value').eq('user_id', userId)
          .in('key', ['xai_api_key', 'xai_model', 'news_excluded_tickers', 'news_include_holdings', 'news_include_watchlist', 'news_xai_prompt']),
        supabase.from('news_custom_queries').select('id,query_text').eq('user_id', userId),
      ]);

      const sm = Object.fromEntries((settings || []).map(s => [s.key, s.value as string]));
      const apiKey = sm['xai_api_key'];
      if (!apiKey) continue;
      const model = sm['xai_model'] || 'grok-3-latest';

      let excludedArr: string[] = [];
      try { excludedArr = JSON.parse(sm['news_excluded_tickers'] || '[]'); } catch {}
      const excluded = new Set(excludedArr.map(t => t.toUpperCase()));

      const includeHoldings  = sm['news_include_holdings']  !== 'false';
      const includeWatchlist = sm['news_include_watchlist'] !== 'false';

      const allTickers = await getUserTickers(userId, includeHoldings, includeWatchlist, excluded);

      const saveResult = (value: object) => supabase.from('user_settings').upsert(
        [{ user_id: userId, key: 'news_last_auto_fetch_result', value: JSON.stringify(value) }],
        { onConflict: 'user_id,key' }
      );

      // Save date upfront on first tick to prevent retry loops on timeout
      if (!isRunningToday) {
        await Promise.all([
          supabase.from('user_settings').upsert(
            [{ user_id: userId, key: 'news_last_auto_fetch_date', value: today }],
            { onConflict: 'user_id,key' }
          ),
          saveResult({
            status: 'running',
            date: today,
            remaining: allTickers.length + (allQueries || []).length,
            totalNewItems: 0,
            time: new Date().toISOString(),
          }),
        ]);
      }

      try {
        const result = await processUser(userId, { notify: false });
        const totalItems = result.items + result.customItems;
        results[userId] = { remaining: 0, newItems: totalItems, accumulatedItems: totalItems };
        await saveResult({ status: 'success', date: today, items: totalItems, time: new Date().toISOString() });
        if (totalItems > 0) await notifyUser(userId, totalItems);
      } catch (err) {
        results[userId] = { error: err instanceof Error ? err.message : String(err) };
        await saveResult({ status: 'failed', date: today, time: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) });
        console.error(`[fetch-stock-news] user ${userId}:`, err);
      }
    }

    return new Response(JSON.stringify({ scheduled: true, processed: Object.keys(results).length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
