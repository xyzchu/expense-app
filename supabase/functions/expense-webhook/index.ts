import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Parse body — sanitize to handle any encoding issues from MacroDroid
    const raw = await req.text();
    // Fix common MacroDroid JSON issues:
    // 1. Strip control characters
    // 2. Fix "key":,"value" → "key":"value" (stray comma after colon)
    const sanitized = raw
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/:\s*,\s*"/g, ':"');
    let body: Record<string, string>;
    try {
      body = JSON.parse(sanitized);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON', raw: sanitized.slice(0, 200) }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { secret, item, currency, paid_by, split } = body;
    const amount = String(body.amount ?? '');
    if (!secret || !item || !amount) {
      return new Response(JSON.stringify({ error: 'Missing required fields: secret, item, amount' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Look up token → get user_id, list_id
    const { data: token, error: tokenErr } = await supabase
      .from('webhook_tokens')
      .select('user_id, list_id, display_name')
      .eq('secret', secret)
      .maybeSingle();

    if (tokenErr || !token) {
      return new Response(JSON.stringify({ error: 'Invalid secret' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { list_id, user_id, display_name } = token;

    // Strip currency symbols and spaces MacroDroid might include e.g. "$12.50" or "AUD 12.50"
    const cleanAmount = String(amount).replace(/[^0-9.]/g, '');
    const totalAmount = parseFloat(cleanAmount);
    if (!totalAmount || isNaN(totalAmount)) {
      return new Response(JSON.stringify({ error: `Invalid amount: "${amount}" → cleaned: "${cleanAmount}"` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const splitPct = split == null ? null : parseFloat(String(split).replace(/[^0-9.]/g, ''));
    const normalizedSplit = splitPct == null || isNaN(splitPct)
      ? null
      : Math.min(100, Math.max(0, splitPct));

    const payer = paid_by || display_name || null;

    // Insert into pending_expenses — the user will confirm + categorize
    // + pick the split in the app before it moves to the expenses table.
    const { data: pending, error: pendErr } = await supabase
      .from('pending_expenses')
      .insert({
        list_id,
        user_id,
        item: item.trim(),
        amount: totalAmount,
        currency: currency || null,
        paid_by: payer,
        split: normalizedSplit,
        raw_payload: body,
      })
      .select()
      .single();

    if (pendErr) {
      return new Response(JSON.stringify({ error: pendErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fire push notification so the user sees the prompt to confirm
    const listRow = await supabase
      .from('expense_lists')
      .select('default_currency, name')
      .eq('id', list_id)
      .single();
    const defCur = listRow.data?.default_currency || 'AUD';
    const cur = currency || defCur;
    const formatted = (() => {
      try {
        return new Intl.NumberFormat('en-AU', {
          style: 'currency', currency: cur,
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        }).format(totalAmount);
      } catch {
        return `${cur} ${totalAmount.toFixed(2)}`;
      }
    })();

    await supabase.functions.invoke('send-push', {
      body: {
        list_id,
        sender_user_id: null,
        title: `Confirm: ${item.trim()}`,
        body: `${formatted} — tap to review and add`,
        tag: 'pending-expense',
      },
    });

    return new Response(JSON.stringify({ ok: true, pending_id: pending.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('expense-webhook error:', err?.message, err?.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
