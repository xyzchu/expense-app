import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/* ── Constants (mirrored from frontend) ── */
const ALL_CUR = ['AUD','USD','EUR','GBP','JPY','CNY','HKD','THB','NZD','SGD','KRW','INR','VND','IDR'];
const CURR_SYM: Record<string,string> = {'¥':'CNY','€':'EUR','£':'GBP','₩':'KRW','₹':'INR','฿':'THB'};
const FALLBACK_RATES_USD: Record<string,number> = {
  USD:1, AUD:1.58, EUR:0.92, GBP:0.79, JPY:149.5, CNY:7.24, HKD:7.82,
  THB:34.2, NZD:1.70, SGD:1.34, KRW:1380, INR:84.5, VND:25400, IDR:15800
};

async function fetchRates(base: string): Promise<Record<string,number>> {
  try {
    const r = await fetch(`https://api.exchangerate-api.com/v4/latest/${base}`);
    if (r.ok) { const j = await r.json(); return j.rates as Record<string,number>; }
  } catch { /* fall through */ }
  const baseRate = FALLBACK_RATES_USD[base] || 1;
  const fb: Record<string,number> = {};
  Object.entries(FALLBACK_RATES_USD).forEach(([k,v]) => { fb[k] = v / baseRate; });
  return fb;
}
const CURR_WORDS: [RegExp,string][] = [
  [/\b(yuan|rmb|renminbi)\b/i,'CNY'],[/\byen\b/i,'JPY'],[/\bwon\b/i,'KRW'],
  [/\bbaht\b/i,'THB'],[/\brupees?\b/i,'INR'],[/\beuros?\b/i,'EUR'],
  [/\bpounds?\b(?!\s+of\b)/i,'GBP'],[/\bdollars?\b/i,'USD'],
];

/* ── Natural language parser (TypeScript port of frontend parseExpense) ── */
function parseNaturalLanguage(raw: string, names: string[], defaultPayer: string, defCur: string): {
  item: string; amount: number; currency: string;
  splitType: string; shares: Record<string,number>; headcount: number | null; category: string;
} | null {
  if (!raw.trim()) return null;
  let t = raw;
  let cur: string | null = null;
  let amt: number | null = null;

  // Symbol currencies: ¥100, €50, £30
  const sm = t.match(/([¥€£₩₹฿])\s*(\d+(?:\.\d+)?)/);
  if (sm) {
    cur = CURR_SYM[sm[1]];
    if (sm[1] === '¥' && /\b(jpy|japan|yen)\b/i.test(t)) cur = 'JPY';
    amt = parseFloat(sm[2]);
    t = t.replace(sm[0], ' ');
  }

  // Dollar sign: $100
  if (amt == null) {
    const m = t.match(/\$\s*(\d+(?:\.\d+)?)/);
    if (m) { amt = parseFloat(m[1]); t = t.replace(m[0], ' '); }
  }

  // Currency code before or after number: HKD100, 100HKD, hkd 100
  if (amt == null) {
    const cc = ALL_CUR.join('|');
    const m1 = t.match(new RegExp(`\\b(${cc})\\s*(\\d+(?:\\.\\d+)?)\\b`, 'i'));
    if (m1) { cur = m1[1].toUpperCase(); amt = parseFloat(m1[2]); t = t.replace(m1[0], ' '); }
    else {
      const m2 = t.match(new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(${cc})\\b`, 'i'));
      if (m2) { amt = parseFloat(m2[1]); cur = m2[2].toUpperCase(); t = t.replace(m2[0], ' '); }
    }
  }

  // Word currencies: yen, yuan, baht, etc.
  if (!cur) {
    for (const [re, code] of CURR_WORDS) {
      if (re.test(t)) { cur = code; t = t.replace(re, ' '); break; }
    }
  }

  // Standalone currency code: HKD, USD
  if (!cur) {
    const cc = ALL_CUR.join('|');
    const m = t.match(new RegExp(`\\b(${cc})\\b`, 'i'));
    if (m) { cur = m[1].toUpperCase(); t = t.replace(m[0], ' '); }
  }

  // Bare number fallback
  if (amt == null) {
    const m = t.match(/\b(\d+(?:\.\d+)?)\b/);
    if (m) { amt = parseFloat(m[1]); t = t.replace(m[0], ' '); }
  }

  if (amt == null || isNaN(amt) || amt <= 0) return null;

  const currency = cur || defCur;

  // Payer detection
  let paidBy = defaultPayer;
  for (const n of names) {
    if (new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b`, 'i').test(raw)) {
      paidBy = n; break;
    }
  }

  // Strip payer phrases from working copy for split detection
  let st = raw;
  for (const n of names) st = st.replace(new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b`, 'ig'), ' ');

  // Split detection
  const personalRe = /\b(for\s+myself|for\s+me|mine\s+only|personal|just\s+me|no\s+split|my\s+own|only\s+me|myself)\b/i;
  const personalShort = /(?:^|\s)(me|own)(?:\s|$)/i;
  const ratioMatch = st.match(/\b(\d+(?:\/\d+)+)\b/);
  const pctMatch = st.match(/\b(\d+)\s*%\s*(\w+)/i);
  const headcountMatch = st.match(/\bfor\s+(\d+)\s+(?:people|persons?|ppl|guests?|friends?|heads?)\b|\b(\d+)\s+(?:people|persons?|ppl|guests?)\b|\bsplit\s+(\d+)\s*ways?\b/i);

  let fullPerson: string | null = null;
  for (const n of names) {
    if (new RegExp(`\\bfor\\s+${n}\\b|\\b${n}\\s+owes?\\b|\\bowed\\s+by\\s+${n}\\b|\\b100\\s*%\\s*${n}\\b|\\ball\\s+${n}\\b`, 'i').test(st)) {
      fullPerson = n; break;
    }
  }

  let splitType = 'equal';
  let shares: Record<string,number> = {};
  let headcount: number | null = null;

  if (personalRe.test(st) || personalShort.test(st)) {
    splitType = 'personal';
    shares = { [paidBy]: amt };
  } else if (fullPerson) {
    splitType = 'full';
    shares = { [fullPerson]: amt };
  } else if (headcountMatch) {
    const hc = parseInt(headcountMatch[1] || headcountMatch[2] || headcountMatch[3]);
    if (hc >= 2 && hc > names.length) {
      splitType = 'headcount';
      headcount = hc;
      const perPerson = amt / hc;
      names.forEach(n => { shares[n] = Math.round(perPerson * 100) / 100; });
    } else {
      splitType = 'equal';
      names.forEach(n => { shares[n] = Math.round((amt! / names.length) * 100) / 100; });
    }
  } else if (ratioMatch) {
    splitType = 'custom';
    const parts = ratioMatch[1].split('/').map(Number);
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      const use = parts.length === names.length ? names : names.slice(0, parts.length);
      use.forEach((n, i) => { shares[n] = Math.round((amt! * (parts[i] / sum)) * 100) / 100; });
    }
  } else if (pctMatch) {
    splitType = 'custom';
    const pct = parseInt(pctMatch[1]);
    const who = names.find(n => n.toLowerCase() === pctMatch[2].toLowerCase()) || pctMatch[2];
    shares[who] = Math.round(amt * pct / 100 * 100) / 100;
    const rest = amt - shares[who];
    const others = names.filter(n => n !== who);
    others.forEach(n => { shares[n] = Math.round((rest / Math.max(others.length, 1)) * 100) / 100; });
  } else {
    splitType = 'equal';
    names.forEach(n => { shares[n] = Math.round((amt! / names.length) * 100) / 100; });
  }

  // Build item name by stripping all parsed tokens
  let item = raw;
  item = item.replace(/[¥€£₩₹฿$]\s*\d+(\.\d+)?/g, ' ');
  item = item.replace(/\b\d+(\.\d+)?\s*(AUD|USD|EUR|GBP|JPY|CNY|HKD|THB|NZD|SGD|KRW|INR|VND|IDR)\b/gi, ' ');
  item = item.replace(/\b(AUD|USD|EUR|GBP|JPY|CNY|HKD|THB|NZD|SGD|KRW|INR|VND|IDR)\s*\d+(\.\d+)?\b/gi, ' ');
  item = item.replace(/\b\d+(\.\d+)?\b/g, ' ');
  for (const n of names) item = item.replace(new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b|\\bfor\\s+${n}\\b|\\b${n}\\s+owes?\\b|\\bowed\\s+by\\s+${n}\\b|\\b100\\s*%\\s*${n}\\b|\\ball\\s+${n}\\b`, 'gi'), ' ');
  item = item.replace(/\b(for\s+myself|for\s+me|mine\s+only|personal|just\s+me|no\s+split|my\s+own|only\s+me|myself|yuan|rmb|renminbi|yen|won|baht|rupees?|euros?|pounds?|dollars?)\b/gi, ' ');
  item = item.replace(/\b(me|own)\b/gi, ' ');
  item = item.replace(/\b\d+\s*%\s*\w+/gi, ' ');
  item = item.replace(/\b\d+(?:\/\d+)+\b/g, ' ');
  item = item.replace(/\bfor\s+\d+\s+(?:people|persons?|ppl|guests?|friends?|heads?)\b/gi, ' ');
  item = item.replace(/\b\d+\s+(?:people|persons?|ppl|guests?)\b/gi, ' ');
  item = item.replace(/\bsplit\s+\d+\s*ways?\b/gi, ' ');
  for (const [re] of CURR_WORDS) item = item.replace(re, ' ');
  item = item.replace(/\s+/g, ' ').trim();
  // Title-case
  item = item.replace(/\b\w/g, ch => ch.toUpperCase()) || 'Expense';

  const category = detectCategory(item);

  return { item, amount: amt, currency, splitType, shares, headcount, category };
}

function detectCategory(item: string): string {
  const t = item.toLowerCase();
  if (/restaurant|dinner|lunch|breakfast|cafe|coffee|food|eat|meal|pizza|burger|sushi|ramen|bar|pub|drink|feast|hotpot/.test(t)) return 'Restaurant';
  if (/grocery|supermarket|market|coles|woolworth|aldi|fresh|fruit|veg/.test(t)) return 'Groceries';
  if (/uber|lyft|taxi|bus|train|metro|mrt|grab|transport|parking|petrol|gas|fuel|ferry|toll/.test(t)) return 'Transport';
  if (/rent|mortgage|electricity|water|internet|phone|bill|utility/.test(t)) return 'Utilities';
  if (/cinema|movie|netflix|spotify|game|entertainment|concert|theatre|event/.test(t)) return 'Entertainment';
  if (/amazon|shop|store|purchase|clothing|clothes|shoes/.test(t)) return 'Shopping';
  if (/hotel|airbnb|flight|travel|holiday|vacation|resort/.test(t)) return 'Travel';
  if (/doctor|hospital|pharmacy|medicine|health|dental|clinic/.test(t)) return 'Health';
  if (/income|salary|payroll|dividend|interest|revenue/.test(t)) return 'Income';
  return 'Other';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const raw = await req.text();
    const sanitized = raw.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/:\s*,\s*"/g, ':"');
    let body: Record<string, string>;
    try {
      body = JSON.parse(sanitized);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON', raw: sanitized.slice(0, 200) }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { secret, text } = body;
    if (!secret) {
      return new Response(JSON.stringify({ error: 'Missing required field: secret' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!text && !body.item) {
      return new Response(JSON.stringify({ error: 'Provide either "text" (natural language) or "item" + "amount"' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

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

    const defaultPayer = display_name || names[0];
    const today = new Date().toISOString().slice(0, 10);

    let parsedItem: string, parsedAmount: number, parsedCurrency: string;
    let splitType: string, shares: Record<string,number>, headcount: number | null, category: string;

    if (text) {
      const parsed = parseNaturalLanguage(text, names, defaultPayer, defCur);
      if (!parsed) {
        return new Response(JSON.stringify({ error: 'Could not parse amount from text', text }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      parsedItem = parsed.item;
      parsedAmount = parsed.amount;
      parsedCurrency = parsed.currency;
      splitType = parsed.splitType;
      shares = parsed.shares;
      headcount = parsed.headcount;
      category = parsed.category;
    } else {
      const amountRaw = String(body.amount ?? '').replace(/[^0-9.]/g, '');
      parsedAmount = parseFloat(amountRaw);
      if (!parsedAmount || isNaN(parsedAmount)) {
        return new Response(JSON.stringify({ error: `Invalid amount: "${body.amount}"` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      parsedItem = body.item.trim();
      parsedCurrency = body.currency || defCur;
      headcount = null;
      category = detectCategory(parsedItem);

      const splitPct = parseFloat(String(body.split ?? '50').replace(/[^0-9.]/g, ''));
      const otherPct = isNaN(splitPct) ? 50 : Math.min(100, Math.max(0, splitPct));
      const payerPct = 100 - otherPct;
      const payer = body.paid_by || defaultPayer;
      shares = {};
      if (otherPct === 0) {
        splitType = 'personal';
        shares[payer] = parsedAmount;
      } else {
        const others = names.filter(n => n !== payer);
        if (payerPct > 0) shares[payer] = Math.round(parsedAmount * payerPct / 100 * 100) / 100;
        others.forEach(n => { shares[n] = Math.round(parsedAmount * otherPct / 100 / others.length * 100) / 100; });
        splitType = (otherPct === 50 && names.length === 2) ? 'equal' : 'exact';
      }
    }

    const isForeign = parsedCurrency !== defCur;
    let totalAmount = parsedAmount;
    let convertedShares = shares;
    if (isForeign) {
      const rates = await fetchRates(defCur);
      const rate = rates[parsedCurrency] || (FALLBACK_RATES_USD[parsedCurrency] / FALLBACK_RATES_USD[defCur]);
      totalAmount = Math.round(parsedAmount / rate * 100) / 100;
      convertedShares = Object.fromEntries(
        Object.entries(shares).map(([k, v]) => [k, Math.round(v / rate * 100) / 100])
      );
    }

    const row = {
      list_id,
      item: parsedItem,
      total_amount: totalAmount,
      paid_by: display_name || names[0],
      category, split_type: splitType, shares: convertedShares, headcount,
      original_currency: isForeign ? parsedCurrency : null,
      original_amount: isForeign ? parsedAmount : null,
      date: today,
    };

    const { data: expense, error: expErr } = await supabase
      .from('expenses').insert(row).select().single();

    if (expErr) {
      return new Response(JSON.stringify({ error: expErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const formatted = new Intl.NumberFormat('en-AU', {
      style: 'currency', currency: parsedCurrency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(parsedAmount);

    await supabase.functions.invoke('send-push', {
      body: {
        list_id, sender_user_id: null,
        title: `New expense: ${parsedItem}`,
        body: `${formatted} added via webhook`,
        tag: 'webhook-expense',
      },
    });

    return new Response(JSON.stringify({ ok: true, expense_id: expense.id, parsed: { item: parsedItem, amount: totalAmount, original_amount: isForeign ? parsedAmount : null, currency: defCur, original_currency: isForeign ? parsedCurrency : null, split_type: splitType, headcount } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('expense-webhook error:', err?.message, err?.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
