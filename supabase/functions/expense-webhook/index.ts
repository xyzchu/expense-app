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
    // Strip any non-printable / control characters that break JSON
    const sanitized = raw.replace(/[\x00-\x1F\x7F]/g, ' ');
    let body: Record<string, string>;
    try {
      body = JSON.parse(sanitized);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON', raw: sanitized.slice(0, 200) }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { secret, item, currency, paid_by } = body;
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

    // Get list default currency + members
    const [{ data: listRow }, { data: members }] = await Promise.all([
      supabase.from('expense_lists').select('default_currency').eq('id', list_id).single(),
      supabase.from('list_members').select('display_name').eq('list_id', list_id),
    ]);

    const defCur = listRow?.default_currency || 'AUD';
    const names = (members || []).map((m: { display_name: string }) => m.display_name);
    if (names.length === 0) {
      return new Response(JSON.stringify({ error: 'No members in list' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payer = paid_by || display_name || names[0];
    // Strip currency symbols and spaces MacroDroid might include e.g. "$12.50" or "AUD 12.50"
    const cleanAmount = String(amount).replace(/[^0-9.]/g, '');
    const totalAmount = parseFloat(cleanAmount);
    if (!totalAmount || isNaN(totalAmount)) {
      return new Response(JSON.stringify({ error: `Invalid amount: "${amount}" → cleaned: "${cleanAmount}"` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build equal shares
    const shareAmount = Math.round((totalAmount / names.length) * 100) / 100;
    const shares: Record<string, number> = {};
    names.forEach((n: string) => { shares[n] = shareAmount; });

    // Handle foreign currency
    const isForeign = currency && currency !== defCur;
    const row = {
      list_id,
      item: item.trim(),
      category: 'Other',
      date: new Date().toISOString().slice(0, 10),
      total_amount: totalAmount,
      paid_by: payer,
      split_type: 'equal',
      shares,
      original_currency: isForeign ? currency : null,
      original_amount: isForeign ? totalAmount : null,
    };

    const { data: expense, error: expErr } = await supabase
      .from('expenses')
      .insert(row)
      .select()
      .single();

    if (expErr) {
      return new Response(JSON.stringify({ error: expErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fire push notification to all subscribed members
    const cur = isForeign ? currency : defCur;
    const formatted = new Intl.NumberFormat('en-AU', {
      style: 'currency', currency: cur,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(totalAmount);

    await supabase.functions.invoke('send-push', {
      body: {
        list_id,
        sender_user_id: null,
        title: `${item.trim()} added automatically`,
        body: `${payer} paid ${formatted} — split equally`,
        tag: 'webhook-expense',
      },
    });

    return new Response(JSON.stringify({ ok: true, expense_id: expense.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('expense-webhook error:', err?.message, err?.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
