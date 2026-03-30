import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Pencil, Trash2, X, Send, LogOut, Plus, Users, Check, Copy,
  Upload, Download, UserPlus, Home as HomeIcon, BarChart3,
  Settings as SettingsIcon, ChevronDown, ChevronUp, ArrowRight,
  RefreshCw, Eye, EyeOff
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import sb from './supabaseClient';

/* ══════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════ */

const FALLBACK_RATES_USD = {
  USD:1, AUD:1.58, EUR:0.92, GBP:0.79, JPY:149.5, CNY:7.24, HKD:7.82,
  THB:34.2, NZD:1.70, SGD:1.34, KRW:1380, INR:84.5, VND:25400, IDR:15800
};

const NO_DEC = new Set(['JPY','KRW','VND','IDR']);
const CURR_SYM = {'¥':'CNY','€':'EUR','£':'GBP','₩':'KRW','₹':'INR','฿':'THB'};
const CURR_FLAG = {AUD:'🇦🇺',USD:'🇺🇸',EUR:'🇪🇺',GBP:'🇬🇧',JPY:'🇯🇵',CNY:'🇨🇳',HKD:'🇭🇰',THB:'🇹🇭',NZD:'🇳🇿',SGD:'🇸🇬',KRW:'🇰🇷',INR:'🇮🇳',VND:'🇻🇳',IDR:'🇮🇩'};
const CURR_WORDS = [
  [/\b(yuan|rmb|renminbi)\b/i,'CNY'],[/\byen\b/i,'JPY'],[/\bwon\b/i,'KRW'],
  [/\bbaht\b/i,'THB'],[/\brupees?\b/i,'INR'],[/\beuros?\b/i,'EUR'],
  [/\bpounds?\b(?!\s+of\b)/i,'GBP'],[/\bdollars?\b/i,'USD']
];
const ALL_CUR = ['AUD','USD','EUR','GBP','JPY','CNY','HKD','THB','NZD','SGD','KRW','INR','VND','IDR'];

const BASE_CATS = {
  Restaurant:{emoji:'🍽️',bg:'bg-orange-100',tx:'text-orange-700',c:'#f97316'},
  Groceries:{emoji:'🛒',bg:'bg-green-100',tx:'text-green-700',c:'#22c55e'},
  Transport:{emoji:'🚗',bg:'bg-blue-100',tx:'text-blue-700',c:'#3b82f6'},
  Utilities:{emoji:'💡',bg:'bg-yellow-100',tx:'text-yellow-700',c:'#eab308'},
  Travel:{emoji:'✈️',bg:'bg-purple-100',tx:'text-purple-700',c:'#a855f7'},
  Home:{emoji:'🏠',bg:'bg-pink-100',tx:'text-pink-700',c:'#ec4899'},
  Settlement:{emoji:'💸',bg:'bg-emerald-100',tx:'text-emerald-700',c:'#10b981'},
  Other:{emoji:'📦',bg:'bg-gray-100',tx:'text-gray-700',c:'#6b7280'},
};
const CAT_KW = {
  Restaurant:/\b(restaurant|dinner|lunch|breakfast|brunch|cafe|coffee|tea|eat|food|drink|bar|pub|pizza|burger|sushi|ramen|noodle|bbq|grill|takeaway|takeout|delivery|uber\s?eats|doordash|meal|snack|bubble\s?tea|boba|dessert|cake|ice\s?cream|mcdonald|kfc|subway)\b/i,
  Groceries:/\b(grocer|supermarket|woolworth|coles|aldi|costco|iga|market|fruit|vegetable|meat|chicken|pork|beef|fish|milk|bread|egg|rice|pasta|butter|cheese|grocery|shop)\b/i,
  Transport:/\b(uber|lyft|taxi|cab|bus|train|tram|metro|subway|fuel|gas|petrol|parking|toll|rego|car|vehicle|insurance|bike|scooter|opal|myki|transport)\b/i,
  Utilities:/\b(electric|power|water|gas|internet|wifi|phone|mobile|bill|utility|subscription|spotify|netflix|disney|hulu|youtube|rent|lease)\b/i,
  Travel:/\b(flight|hotel|hostel|airbnb|booking|travel|airport|luggage|visa|passport|tour|trip|holiday|vacation|accommodation|resort|cruise)\b/i,
  Home:/\b(furniture|ikea|bed|sofa|couch|chair|table|desk|lamp|curtain|rug|kitchen|bathroom|cleaning|laundry|repair|maintenance|garden|tool|hardware|bunnings)\b/i,
};
const CUST_COLORS = ['#06b6d4','#f43f5e','#8b5cf6','#14b8a6','#f59e0b','#6366f1','#10b981','#e11d48'];
const PERSON_COLORS = ['#3b82f6','#ec4899','#f59e0b','#22c55e','#a855f7','#06b6d4','#ef4444','#84cc16'];
const STOP = new Set('the and for from with this that have been were they them their what when where which who will would could should about into over after before between under through during each just also than very some only other most paid owes owed split share'.split(' '));

/* ══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ══════════════════════════════════════════════════════════════ */

const fmt = (n, cur='AUD') => {
  const d = NO_DEC.has(cur)?0:2;
  try { return new Intl.NumberFormat('en-AU',{style:'currency',currency:cur,minimumFractionDigits:d,maximumFractionDigits:d}).format(n); }
  catch { return `${cur} ${n.toFixed(d)}`; }
};

const today = () => new Date().toISOString().slice(0,10);

const sigWords = (text) =>
  text.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));

const cvt = (amount, from, to, rates) => {
  if (from === to || !from || !to) return amount;
  const fr = rates[from] || 1, tr = rates[to] || 1;
  return (amount / fr) * tr;
};

const simplifyDebts = (nets) => {
  const txns = [], cr = [], dr = [];
  Object.entries(nets).forEach(([p,b]) => {
    if (b > 0.005) cr.push({p,a:b});
    else if (b < -0.005) dr.push({p,a:-b});
  });
  cr.sort((a,b) => b.a - a.a);
  dr.sort((a,b) => b.a - a.a);
  let i=0, j=0;
  while (i < cr.length && j < dr.length) {
    const a = Math.min(cr[i].a, dr[j].a);
    if (a > 0.005) txns.push({from:dr[j].p, to:cr[i].p, amount:Math.round(a*100)/100});
    cr[i].a -= a; dr[j].a -= a;
    if (cr[i].a < 0.005) i++;
    if (dr[j].a < 0.005) j++;
  }
  return txns;
};

const detectCategory = (text, overrides, customCats) => {
  const lo = text.toLowerCase().trim();
  if (overrides[lo]) return overrides[lo];
  const sw = sigWords(text);
  for (const w of sw) { if (overrides[w]) return overrides[w]; }
  for (const [cat, re] of Object.entries(CAT_KW)) { if (re.test(text)) return cat; }
  return 'Other';
};

const getCat = (name, customCats, members) => {
  if (BASE_CATS[name]) return BASE_CATS[name];
  if (customCats[name]) return customCats[name];
  const mi = members.findIndex(m => m.display_name === name);
  if (mi >= 0) return {emoji:'👤', bg:'bg-indigo-100', tx:'text-indigo-700', c: PERSON_COLORS[mi % PERSON_COLORS.length]};
  return BASE_CATS.Other;
};

/* ══════════════════════════════════════════════════════════════
   NLP PARSER
   ══════════════════════════════════════════════════════════════ */

function parseExpense(raw, members, myName, rates, defCur, overrides, customCats) {
  if (!raw.trim()) return null;
  let t = raw, cur = null, amt = null;

  // Symbol prefix: ¥500
  const sm = t.match(/([¥€£₩₹฿])\s*(\d+(?:\.\d+)?)/);
  if (sm) {
    cur = CURR_SYM[sm[1]];
    if (sm[1]==='¥' && /\b(jpy|japan|yen)\b/i.test(t)) cur='JPY';
    amt = parseFloat(sm[2]); t = t.replace(sm[0],' ');
  }

  // $amount
  if (amt==null) { const m = t.match(/\$\s*(\d+(?:\.\d+)?)/); if(m){amt=parseFloat(m[1]);t=t.replace(m[0],' ');} }

  // CODE amount or amount CODE
  if (amt==null) {
    const cc = ALL_CUR.join('|');
    const m1 = t.match(new RegExp(`\\b(${cc})\\s*(\\d+(?:\\.\\d+)?)\\b`,'i'));
    if (m1) { cur=m1[1].toUpperCase(); amt=parseFloat(m1[2]); t=t.replace(m1[0],' '); }
    else { const m2=t.match(new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(${cc})\\b`,'i')); if(m2){amt=parseFloat(m2[1]);cur=m2[2].toUpperCase();t=t.replace(m2[0],' ');} }
  }

  // Currency words
  if (!cur) { for (const [re,code] of CURR_WORDS) { if (re.test(t)){cur=code; t=t.replace(re,' '); break;} } }

  // ── ADD THIS: Standalone currency code (e.g. "USD $10" where $ matched first) ──
  if (!cur) {
    const cc = ALL_CUR.join('|');
    const m = t.match(new RegExp(`\\b(${cc})\\b`, 'i'));
    if (m) { cur = m[1].toUpperCase(); t = t.replace(m[0], ' '); }
  }

  // Bare number
  if (amt==null) { const m=t.match(/\b(\d+(?:\.\d+)?)\b/); if(m){amt=parseFloat(m[1]);t=t.replace(m[0],' ');} }
  if (amt==null) return null;

  const origCur = cur || defCur, origAmt = amt;
  const total = cur && cur !== defCur ? cvt(origAmt, cur, defCur, rates) : amt;
  if (!cur) cur = defCur;

  // Paid by
  let paidBy = myName;
  const names = members.map(m => m.display_name);
  for (const n of names) {
    if (new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b`,'i').test(raw)) { paidBy = n; break; }
  }

  // Remove payer phrases from working text for split detection
  let st = raw;
  for (const n of names) st = st.replace(new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b`,'ig'),' ');

  // Split type
  let splitType = 'equal', shares = {};
  const personalRe = /\b(for\s+myself|for\s+me|mine\s+only|personal|just\s+me|no\s+split|my\s+own|only\s+me|myself)\b/i;
  const personalShort = /(?:^|\s)(me|own)(?:\s|$)/i;

  // Custom ratio: 60/40 or 60/20/20
  const ratioMatch = st.match(/\b(\d+(?:\/\d+)+)\b/);
  // Percentage: 60% Alice
  const pctMatch = st.match(/\b(\d+)\s*%\s*(\w+)/i);

  // Full: "for Alice" (not "for me/myself")
  let fullPerson = null;
  for (const n of names) {
    if (new RegExp(`\\bfor\\s+${n}\\b|\\b${n}\\s+owes?\\b|\\bowed\\s+by\\s+${n}\\b|\\b100\\s*%\\s*${n}\\b|\\ball\\s+${n}\\b`,'i').test(st)) {
      fullPerson = n; break;
    }
  }

  if (personalRe.test(st) || personalShort.test(st)) {
    splitType = 'personal';
    shares = {[paidBy]: total};
  } else if (fullPerson) {
    splitType = 'full';
    shares = {[fullPerson]: total};
  } else if (ratioMatch) {
    splitType = 'custom';
    const parts = ratioMatch[1].split('/').map(Number);
    const sum = parts.reduce((a,b)=>a+b,0);
    if (parts.length === names.length && sum > 0) {
      names.forEach((n,i) => { shares[n] = total * (parts[i]/sum); });
    } else {
      // Fallback: distribute what we can to first N members
      const use = names.slice(0, parts.length);
      use.forEach((n,i) => { shares[n] = total * (parts[i]/sum); });
    }
  } else if (pctMatch) {
    splitType = 'custom';
    const pct = parseInt(pctMatch[1]);
    const who = names.find(n => n.toLowerCase() === pctMatch[2].toLowerCase()) || pctMatch[2];
    shares[who] = total * pct / 100;
    const rest = total - shares[who];
    const others = names.filter(n => n !== who);
    others.forEach(n => { shares[n] = rest / Math.max(others.length, 1); });
  } else {
    splitType = 'equal';
    names.forEach(n => { shares[n] = total / names.length; });
  }

  // Clean item name
  let item = raw;
  // Remove amounts, currency, split keywords, payer phrases
  item = item.replace(/[¥€£₩₹฿$]\s*\d+(\.\d+)?/g,' ');
  item = item.replace(/\b\d+(\.\d+)?\s*(AUD|USD|EUR|GBP|JPY|CNY|HKD|THB|NZD|SGD|KRW|INR|VND|IDR)\b/gi,' ');
  item = item.replace(/\b(AUD|USD|EUR|GBP|JPY|CNY|HKD|THB|NZD|SGD|KRW|INR|VND|IDR)\s*\d+(\.\d+)?\b/gi,' ');
  item = item.replace(/\b\d+(\.\d+)?\b/g,' ');
  for (const n of names) item = item.replace(new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b|\\bfor\\s+${n}\\b|\\b${n}\\s+owes?\\b|\\bowed\\s+by\\s+${n}\\b|\\b100\\s*%\\s*${n}\\b|\\ball\\s+${n}\\b`,'gi'),' ');
  item = item.replace(/\b(for\s+myself|for\s+me|mine\s+only|personal|just\s+me|no\s+split|my\s+own|only\s+me|myself|yuan|rmb|renminbi|yen|won|baht|rupees?|euros?|pounds?|dollars?)\b/gi,' ');
  item = item.replace(/\b(me|own)\b/gi,' ');
  item = item.replace(/\b\d+\s*%\s*\w+/gi,' ');
  item = item.replace(/\b\d+(?:\/\d+)+\b/g,' ');
  for (const [re] of CURR_WORDS) item = item.replace(re,' ');
  item = item.replace(/\s+/g,' ').trim();
  if (!item) item = 'Expense';

  const category = detectCategory(item, overrides, customCats);

  return {
    item, category, date: today(),
    original_currency: origCur !== defCur ? origCur : null,
    original_amount: origCur !== defCur ? origAmt : null,
    total_amount: Math.round(total * 100) / 100,
    paid_by: paidBy, split_type: splitType,
    shares: Object.fromEntries(Object.entries(shares).map(([k,v])=>[k,Math.round(v*100)/100]))
  };
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function SplitEase() {
  // ── Auth State ──
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // ── List State ──
  const [lists, setLists] = useState([]);
  const [currentList, setCurrentList] = useState(null);
  const [members, setMembers] = useState([]);
  const [myName, setMyName] = useState('');
  const [listScreen, setListScreen] = useState('select'); // 'select' | 'create' | 'join'
  const [newListName, setNewListName] = useState('');
  const [newListCur, setNewListCur] = useState('AUD');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);

  // ── App State ──
  const [tab, setTab] = useState('home');
  const [expenses, setExpenses] = useState([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [inputText, setInputText] = useState('');
  const [inputFocused, setInputFocused] = useState(false);

  // ── Settings State ──
  const [catOverrides, setCatOverrides] = useState({});
  const [customCats, setCustomCats] = useState({});
  const [defCur, setDefCur] = useState('AUD');
  const [newCatName, setNewCatName] = useState('');

  // ── Stats State ──
  const [selMonth, setSelMonth] = useState('');
  const [personFilter, setPersonFilter] = useState('');

  // ── Settings Tab State ──
  const [editName, setEditName] = useState('');
  const [nameEditing, setNameEditing] = useState(false);

  // ── Settle State ──
  const [showSettle, setShowSettle] = useState(false);
  const [settleFrom, setSettleFrom] = useState('');
  const [settleTo, setSettleTo] = useState('');
  const [settleAmt, setSettleAmt] = useState('');

  // ── Manual Add Form ──
  const [showAddForm, setShowAddForm] = useState(false);
  const [addItem, setAddItem] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addCategory, setAddCategory] = useState('Other');
  const [addPaidBy, setAddPaidBy] = useState('');
  const [addDate, setAddDate] = useState(today());
  const [addSplitType, setAddSplitType] = useState('equal');
  const [addExactAmounts, setAddExactAmounts] = useState({});
  const [addProportions, setAddProportions] = useState({});
  const [addPercentages, setAddPercentages] = useState({});
  const [addOrigCur, setAddOrigCur] = useState('');
  const [addOrigAmt, setAddOrigAmt] = useState('');

  // ── Exchange Rates ──
  const [rates, setRates] = useState(FALLBACK_RATES_USD);
  const [ratesDate, setRatesDate] = useState('');

  // ── UI ──
  const [toast, setToast] = useState({msg:'', show:false});
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const csvRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToast({msg, show:true});
    setTimeout(() => setToast(t=>({...t, show:false})), 3500);
  }, []);

  /* ── Auth Effects ── */
  useEffect(() => {
    sb.auth.getSession().then(({data:{session}}) => {
      setUser(session?.user || null);
      setAuthLoading(false);
    });
    const {data:{subscription}} = sb.auth.onAuthStateChange((_,session) => {
      setUser(session?.user || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  /* ── Fetch Lists ── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const {data} = await sb.from('list_members').select('list_id, display_name, expense_lists(id, name, default_currency, invite_code)').eq('user_id', user.id);
      if (data && data.length > 0) {
        const ls = data.map(d => ({...d.expense_lists, myDisplayName: d.display_name}));
        setLists(ls);
        // Auto-select if only one list or previously selected
        const saved = localStorage.getItem('splitease_list');
        const found = ls.find(l => l.id === saved);
        if (found) { selectList(found); }
      } else {
        setLists([]);
        setCurrentList(null);
      }
    })();
  }, [user]);

  /* ── Fetch Exchange Rates ── */
const fetchRates = useCallback(async (base) => {
    try {
      const r = await fetch(`https://api.exchangerate-api.com/v4/latest/${base || 'USD'}`);
      if (r.ok) {
        const d = await r.json();
        setRates(d.rates);
        setRatesDate(d.date || today());
        localStorage.setItem('splitease_rates', JSON.stringify({rates: d.rates, date: d.date || today(), base}));
        return d.rates;
      }
    } catch {}
    // Try last successful rates from localStorage
    try {
      const cached = JSON.parse(localStorage.getItem('splitease_rates'));
      if (cached && cached.rates) {
        if (cached.base === base) {
          setRates(cached.rates);
          setRatesDate(cached.date + ' (cached)');
          return cached.rates;
        }
        const baseRate = cached.rates[base] || 1;
        const rebased = {};
        Object.entries(cached.rates).forEach(([k,v]) => { rebased[k] = v / baseRate; });
        setRates(rebased);
        setRatesDate(cached.date + ' (cached)');
        return rebased;
      }
    } catch {}
    // Final fallback: hardcoded rates
    const fb = {};
    const baseRate = FALLBACK_RATES_USD[base] || 1;
    Object.entries(FALLBACK_RATES_USD).forEach(([k,v]) => { fb[k] = v / baseRate; });
    setRates(fb);
    setRatesDate('hardcoded');
    return fb;
  }, []);

  useEffect(() => { fetchRates(defCur); }, [defCur]);

  /* ── Select a List ── */
  const selectList = useCallback(async (list) => {
    setCurrentList(list);
    setDefCur(list.default_currency || 'AUD');
    setMyName(list.myDisplayName || '');
    localStorage.setItem('splitease_list', list.id);
    fetchRates(list.default_currency || 'AUD');

    // Fetch members
    const {data: mems} = await sb.from('list_members').select('*').eq('list_id', list.id);
    setMembers(mems || []);

    // Fetch expenses
    const {data: exps} = await sb.from('expenses').select('*').eq('list_id', list.id).order('date',{ascending:false}).order('created_at',{ascending:false});
    setExpenses(exps || []);

    // Fetch settings
    const {data: sets} = await sb.from('list_settings').select('*').eq('list_id', list.id);
    if (sets) {
      const ov = sets.find(s=>s.key==='categoryOverrides');
      const cc = sets.find(s=>s.key==='customCats');
      if (ov) setCatOverrides(ov.value || {});
      if (cc) setCustomCats(cc.value || {});
    }
  }, [fetchRates]);

  /* ── Save Setting ── */
  const saveSetting = useCallback(async (key, value) => {
    if (!currentList) return;
    await sb.from('list_settings').upsert({list_id: currentList.id, key, value}, {onConflict:'list_id,key'});
  }, [currentList]);

  /* ── Auth Handlers ── */
  const handleAuth = async () => {
    setAuthError(''); setAuthBusy(true);
    try {
      if (authMode === 'login') {
        const {error} = await sb.auth.signInWithPassword({email:authEmail, password:authPass});
        if (error) throw error;
      } else {
        const {error} = await sb.auth.signUp({email:authEmail, password:authPass});
        if (error) throw error;
        showToast('Check your email to confirm your account!');
      }
    } catch(e) { setAuthError(e.message); }
    setAuthBusy(false);
  };

  /* ── Create List ── */
  const handleCreateList = async () => {
    if (!newListName.trim() || !newDisplayName.trim()) return;
    const {data: list, error} = await sb.from('expense_lists').insert({
      name: newListName.trim(), default_currency: newListCur, created_by: user.id
    }).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    await sb.from('list_members').insert({
      list_id: list.id, user_id: user.id,
      display_name: newDisplayName.trim(), email: user.email
    });

    // ── Insert sample expenses so the list isn't empty ──
    const name = newDisplayName.trim();
    const d = (daysAgo) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - daysAgo);
      return dt.toISOString().slice(0, 10);
    };
    const samples = [
      { item: 'Grocery run',          category: 'Groceries',  date: d(1),  total_amount: 45.50,  paid_by: name, split_type: 'equal', shares: {[name]: 45.50} },
      { item: 'Coffee & cake',        category: 'Restaurant', date: d(3),  total_amount: 12.00,  paid_by: name, split_type: 'equal', shares: {[name]: 12.00} },
      { item: 'Uber to city',         category: 'Transport',  date: d(5),  total_amount: 28.00,  paid_by: name, split_type: 'equal', shares: {[name]: 28.00} },
      { item: 'Netflix subscription', category: 'Utilities',  date: d(10), total_amount: 16.99,  paid_by: name, split_type: 'equal', shares: {[name]: 16.99} },
      { item: 'Dinner out',           category: 'Restaurant', date: d(18), total_amount: 62.00,  paid_by: name, split_type: 'equal', shares: {[name]: 62.00} },
      { item: 'Flight booking',       category: 'Travel',     date: d(35), total_amount: 250.00, paid_by: name, split_type: 'equal', shares: {[name]: 250.00} },
      { item: 'New lamp',             category: 'Home',       date: d(40), total_amount: 39.95,  paid_by: name, split_type: 'equal', shares: {[name]: 39.95} },
    ].map(s => ({
      ...s,
      list_id: list.id,
      original_currency: null,
      original_amount: null
    }));

    await sb.from('expenses').insert(samples);

    const full = {...list, myDisplayName: name};
    setLists(prev => [...prev, full]);
    selectList(full);
    setListScreen('select');
    setNewListName(''); setNewDisplayName('');
    showToast('List created with sample data! Share code: ' + list.invite_code);
  };

  /* delete list */
  const deleteList = async () => {
    if (!currentList) return;
    // Delete children first (in case RLS blocks cascade)
    await sb.from('expenses').delete().eq('list_id', currentList.id);
    await sb.from('list_settings').delete().eq('list_id', currentList.id);
    await sb.from('list_members').delete().eq('list_id', currentList.id);
    await sb.from('expense_lists').delete().eq('id', currentList.id);
    setLists(prev => prev.filter(l => l.id !== currentList.id));
    setCurrentList(null);
    localStorage.removeItem('splitease_list');
    setTab('home');
    setConfirmDeleteList(false);
    showToast('List deleted');
  };

  /* ── Join List ── */
  const handleJoinList = async () => {
    if (!joinCode.trim() || !newDisplayName.trim()) return;
    const {data: list} = await sb.from('expense_lists').select('*').eq('invite_code', joinCode.trim().toLowerCase()).single();
    if (!list) { showToast('Invalid invite code'); return; }
    // Check if already member
    const {data: existing} = await sb.from('list_members').select('id').eq('list_id',list.id).eq('user_id',user.id);
    if (existing && existing.length > 0) { showToast('Already a member!'); selectList({...list, myDisplayName: newDisplayName.trim()}); return; }
    await sb.from('list_members').insert({
      list_id: list.id, user_id: user.id,
      display_name: newDisplayName.trim(), email: user.email
    });
    const full = {...list, myDisplayName: newDisplayName.trim()};
    setLists(prev => [...prev, full]);
    selectList(full);
    setListScreen('select');
    setJoinCode(''); setNewDisplayName('');
    showToast('Joined "' + list.name + '"!');
  };

  /* ── Add Expense ── */
  const parsedPreview = useMemo(() => {
    if (!inputText.trim() || members.length === 0) return null;
    return parseExpense(inputText, members, myName, rates, defCur, catOverrides, customCats);
  }, [inputText, members, myName, rates, defCur, catOverrides, customCats]);

  const addSettlement = async () => {
    if (!settleFrom || !settleTo || !settleAmt || !currentList) return;
    const amount = parseFloat(settleAmt);
    if (!amount || amount <= 0) return;
    const row = {
      list_id: currentList.id,
      item: `💸 ${settleFrom} paid ${settleTo}`,
      category: 'Settlement',
      date: today(),
      original_currency: null,
      original_amount: null,
      total_amount: amount,
      paid_by: settleFrom,
      split_type: 'settlement',
      shares: {[settleTo]: amount}
    };
    const {data, error} = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setExpenses(prev => [data, ...prev]);
    setShowSettle(false);
    setSettleAmt('');
    showToast(`Recorded: ${settleFrom} paid ${settleTo} ${fmt(amount, defCur)}`);
  };

const addManualExpense = async () => {
    if (!addItem.trim() || !addAmount || !currentList) return;
    const amount = parseFloat(addAmount);
    if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
    const ns = members.map(m => m.display_name);
    const payer = addPaidBy || ns[0];

    let shares = {};
    if (addSplitType === 'equal') {
      ns.forEach(n => { shares[n] = amount / ns.length; });
    } else if (addSplitType === 'ratio') {
      const totalRatio = Object.values(addProportions).reduce((s,v) => s + (parseFloat(v)||0), 0);
      if (totalRatio === 0) { showToast('Enter at least one ratio'); return; }
      ns.forEach(n => {
        const r = parseFloat(addProportions[n]) || 0;
        if (r > 0) shares[n] = (r / totalRatio) * amount;
      });
    } else if (addSplitType === 'percent') {
      const totalPct = Object.values(addPercentages).reduce((s,v) => s + (parseFloat(v)||0), 0);
      if (Math.abs(totalPct - 100) > 0.01) { showToast('Percentages must add up to 100%'); return; }
      ns.forEach(n => {
        const p = parseFloat(addPercentages[n]) || 0;
        if (p > 0) shares[n] = (p / 100) * amount;
      });
    } else if (addSplitType === 'exact') {
      ns.forEach(n => { const v = parseFloat(addExactAmounts[n]); if (v > 0) shares[n] = v; });
      const sum = Object.values(shares).reduce((a,b)=>a+b,0);
      if (Math.abs(sum - amount) > 0.01) { showToast('Exact amounts must equal total'); return; }
    } else if (addSplitType === 'payer') {
      shares = {[payer]: amount};
    }
    shares = Object.fromEntries(Object.entries(shares).map(([k,v])=>[k,Math.round(v*100)/100]));

    // Handle foreign currency
    let origCur = null, origAmt = null;
    if (addOrigCur && addOrigCur !== defCur && addOrigAmt) {
      origCur = addOrigCur;
      origAmt = parseFloat(addOrigAmt);
    }

    const row = {
      list_id: currentList.id,
      item: addItem.trim(),
      category: addCategory,
      date: addDate,
      original_currency: origCur,
      original_amount: origAmt,
      total_amount: Math.round(amount * 100) / 100,
      paid_by: payer,
      split_type: addSplitType,
      shares
    };
    const {data, error} = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setExpenses(prev => [data, ...prev]);
    setShowAddForm(false);
    setAddItem(''); setAddAmount(''); setAddCategory('Other'); setAddSplitType('equal');
    setAddExactAmounts({}); setAddProportions({}); setAddPercentages({});
    setAddOrigCur(''); setAddOrigAmt('');
    showToast('Added: ' + data.item);
  };

  const addExpense = async () => {
    if (!parsedPreview || !currentList) return;
    const row = {...parsedPreview, list_id: currentList.id};
    const {data, error} = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setExpenses(prev => [data, ...prev]);
    setInputText('');
    setInputFocused(false);
    showToast('Added: ' + data.item);
  };

  /* ── Delete Expense ── */
  const deleteExpense = async (id) => {
    await sb.from('expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    showToast('Deleted');
  };

  /* ── Edit Expense ── */
  const startEdit = (exp) => {
    setEditingId(exp.id);
    setEditForm({
      item: exp.item, total_amount: exp.total_amount, category: exp.category,
      paid_by: exp.paid_by, date: exp.date, split_type: exp.split_type,
      shares: {...(exp.shares || {})}
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const names = members.map(m => m.display_name);
    // Recompute shares if split type changed
    let shares = editForm.shares;
    const total = parseFloat(editForm.total_amount);
    if (editForm.split_type === 'equal') {
      shares = {}; names.forEach(n => { shares[n] = total / names.length; });
    } else if (editForm.split_type === 'ratio') {
      const totalRatio = Object.values(editForm.shares||{}).reduce((s,v) => s + (parseFloat(v)||0), 0);
      shares = {};
      if (totalRatio > 0) names.forEach(n => { const r = parseFloat(editForm.shares?.[n])||0; if(r>0) shares[n]=(r/totalRatio)*total; });
    } else if (editForm.split_type === 'percent') {
      shares = {};
      names.forEach(n => { const p = parseFloat(editForm.shares?.[n])||0; if(p>0) shares[n]=(p/100)*total; });
    } else if (editForm.split_type === 'personal') {
      shares = {[editForm.paid_by]: total};
    }
    shares = Object.fromEntries(Object.entries(shares).map(([k,v])=>[k,Math.round(parseFloat(v)*100)/100]));

    const {_computedShares, ...cleanForm} = editForm;
    const upd = {...cleanForm, total_amount: total, shares};
    const {error} = await sb.from('expenses').update(upd).eq('id', editingId);
    if (error) { showToast('Error: '+error.message); return; }

    // Category learning
    const oldExp = expenses.find(e => e.id === editingId);
    if (oldExp && oldExp.category !== editForm.category) {
      const newOv = {...catOverrides};
      newOv[editForm.item.toLowerCase().trim()] = editForm.category;
      sigWords(editForm.item).forEach(w => { newOv[w] = editForm.category; });
      setCatOverrides(newOv);
      saveSetting('categoryOverrides', newOv);

      // Auto-update similar
      let count = 0;
      const updated = expenses.map(e => {
        if (e.id === editingId) return {...e, ...upd};
        const sw = sigWords(e.item);
        const lo = e.item.toLowerCase().trim();
        if (lo === editForm.item.toLowerCase().trim() || sw.some(w => newOv[w] === editForm.category)) {
          count++;
          return {...e, category: editForm.category};
        }
        return e;
      });
      setExpenses(updated);
      if (count > 0) {
        // Batch update in DB
        for (const e of updated) {
          if (e.id !== editingId && expenses.find(o => o.id === e.id)?.category !== e.category) {
            await sb.from('expenses').update({category: e.category}).eq('id', e.id);
          }
        }
        showToast(`Updated ${count + 1} similar items`);
      } else {
        setExpenses(prev => prev.map(e => e.id === editingId ? {...e,...upd} : e));
        showToast('Saved');
      }
    } else {
      setExpenses(prev => prev.map(e => e.id === editingId ? {...e,...upd} : e));
      showToast('Saved');
    }
    setEditingId(null);
  };

  /* ── Balance Computation ── */
  const {netBalances, txns, totals} = useMemo(() => {
    const nets = {}; const totals = {};
    members.forEach(m => { nets[m.display_name] = 0; totals[m.display_name] = 0; });
    expenses.forEach(e => {
      const payer = e.paid_by;
      if (nets[payer] !== undefined) {
        nets[payer] += (e.total_amount || 0);
        totals[payer] = (totals[payer] || 0) + (e.total_amount || 0);
      }
      const shares = e.shares || {};
      Object.entries(shares).forEach(([name, amt]) => {
        if (nets[name] !== undefined) nets[name] -= amt;
      });
    });
    return {netBalances: nets, txns: simplifyDebts(nets), totals};
  }, [expenses, members]);

  /* ── Filtered Expenses ── */
  const filtered = useMemo(() => {
    if (!search.trim()) return expenses;
    const q = search.toLowerCase();
    return expenses.filter(e =>
      e.item?.toLowerCase().includes(q) ||
      e.category?.toLowerCase().includes(q) ||
      e.date?.includes(q) ||
      e.paid_by?.toLowerCase().includes(q) ||
      e.original_currency?.toLowerCase().includes(q)
    );
  }, [expenses, search]);

  /* ── Stats Data ── */
  const months = useMemo(() => {
    const s = new Set(expenses.map(e => e.date?.slice(0,7)).filter(Boolean));
    return [...s].sort().reverse();
  }, [expenses]);

  useEffect(() => { if (months.length && !selMonth) setSelMonth(months[0]); }, [months]);

  const monthExpenses = useMemo(() =>
    expenses.filter(e => e.date?.startsWith(selMonth)),
  [expenses, selMonth]);

  const allCats = useMemo(() => {
    const merged = {...BASE_CATS};
    members.forEach((m,i) => {
      merged[m.display_name] = {emoji:'👤', bg:'bg-indigo-100', tx:'text-indigo-700', c:PERSON_COLORS[i%PERSON_COLORS.length]};
    });
    Object.entries(customCats).forEach(([k,v]) => { merged[k] = v; });
    return merged;
  }, [customCats, members]);

  /* ── Import/Export ── */
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({
      expenses, members: members.map(m=>({display_name:m.display_name,email:m.email})),
      catOverrides, customCats, defaultCurrency: defCur
    }, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `splitease-${currentList?.name || 'backup'}-${today()}.json`;
    a.click();
  };

  const exportCSV = () => {
    const names = members.map(m => m.display_name);
    const hdr = ['item','category','date','original_currency','original_amount','total_amount','paid_by','split_type',...names.map(n=>`share_${n}`)];
    const rows = expenses.map(e => [
      `"${(e.item||'').replace(/"/g,'""')}"`, e.category, e.date,
      e.original_currency||'', e.original_amount||'', e.total_amount,
      e.paid_by, e.split_type, ...names.map(n => e.shares?.[n] || 0)
    ]);
    const csv = [hdr.join(','), ...rows.map(r=>r.join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = `splitease-${today()}.csv`;
    a.click();
  };

  const importJSON = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.expenses && currentList) {
          // Delete existing
          await sb.from('expenses').delete().eq('list_id', currentList.id);
          // Insert new
          const rows = d.expenses.map(exp => ({
            list_id: currentList.id, item: exp.item, category: exp.category,
            date: exp.date, original_currency: exp.original_currency,
            original_amount: exp.original_amount, total_amount: exp.total_amount,
            paid_by: exp.paid_by, split_type: exp.split_type,
            shares: exp.shares || {}
          }));
          const {data} = await sb.from('expenses').insert(rows).select();
          setExpenses(data || []);
          if (d.catOverrides) { setCatOverrides(d.catOverrides); saveSetting('categoryOverrides', d.catOverrides); }
          if (d.customCats) { setCustomCats(d.customCats); saveSetting('customCats', d.customCats); }
          showToast(`Imported ${rows.length} expenses`);
        }
      } catch(err) { showToast('Import error: '+err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const importCSV = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('Empty CSV');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const names = members.map(m => m.display_name);

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          // Simple CSV parse (handles quoted fields)
          const vals = [];
          let current = '', inQuotes = false;
          for (const ch of lines[i]) {
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = ''; }
            else { current += ch; }
          }
          vals.push(current.trim());

          const get = (key) => vals[headers.indexOf(key)] || '';
          const shares = {};

          // Check for new format share columns: share_Name
          let hasNewShares = false;
          for (const n of names) {
            const idx = headers.indexOf(`share_${n.toLowerCase()}`);
            if (idx >= 0 && vals[idx]) { shares[n] = parseFloat(vals[idx]) || 0; hasNewShares = true; }
          }

          // Old format: your_share, partner_share
          if (!hasNewShares && headers.includes('your_share')) {
            const ys = parseFloat(get('your_share')) || 0;
            const ps = parseFloat(get('partner_share')) || 0;
            // Map to first two members
            if (names.length >= 1) shares[names[0]] = ys;
            if (names.length >= 2) shares[names[1]] = ps;
          }

          // If still no shares, compute equal split
          if (Object.keys(shares).length === 0) {
            const total = parseFloat(get('total_amount')) || 0;
            names.forEach(n => { shares[n] = total / Math.max(names.length, 1); });
          }

          rows.push({
            list_id: currentList.id,
            item: get('item') || 'Imported',
            category: get('category') || 'Other',
            date: get('date') || today(),
            original_currency: get('original_currency') || null,
            original_amount: parseFloat(get('original_amount')) || null,
            total_amount: parseFloat(get('total_amount')) || 0,
            paid_by: get('paid_by') || names[0] || 'Unknown',
            split_type: get('split_type') || 'equal',
            shares
          });
        }

        if (rows.length > 0) {
          const {data} = await sb.from('expenses').insert(rows).select();
          setExpenses(prev => [...(data||[]), ...prev]);
          showToast(`Imported ${rows.length} expenses from CSV`);
        }
      } catch(err) { showToast('CSV import error: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /* ── Add Custom Category ── */
  const addCustomCat = () => {
    if (!newCatName.trim()) return;
    const n = newCatName.trim();
    const idx = Object.keys(customCats).length % CUST_COLORS.length;
    const newC = {...customCats, [n]: {emoji:'🏷️', bg:'bg-cyan-100', tx:'text-cyan-700', c: CUST_COLORS[idx]}};
    setCustomCats(newC);
    saveSetting('customCats', newC);
    setNewCatName('');
    showToast('Added category: ' + n);
  };

  const deleteCustomCat = async (name) => {
    const nc = {...customCats}; delete nc[name];
    setCustomCats(nc);
    saveSetting('customCats', nc);
    // Reassign affected expenses
    const updated = expenses.map(e => {
      if (e.category === name) {
        const newCat = detectCategory(e.item, catOverrides, nc);
        return {...e, category: newCat};
      }
      return e;
    });
    setExpenses(updated);
    for (const e of updated) {
      if (expenses.find(o=>o.id===e.id)?.category !== e.category) {
        await sb.from('expenses').update({category:e.category}).eq('id',e.id);
      }
    }
    showToast('Deleted category: ' + name);
  };

  /* ── Update Member Name ── */
  const updateMyName = async (newName) => {
    if (!newName.trim() || !currentList) return;
    const oldName = myName;
    await sb.from('list_members').update({display_name: newName.trim()}).eq('list_id',currentList.id).eq('user_id',user.id);
    setMyName(newName.trim());
    setMembers(prev => prev.map(m => m.user_id===user.id ? {...m,display_name:newName.trim()} : m));

    // Update expenses that reference old name
    if (oldName !== newName.trim()) {
      const updated = expenses.map(e => {
        let changed = false;
        let ne = {...e};
        if (e.paid_by === oldName) { ne.paid_by = newName.trim(); changed = true; }
        if (e.shares && e.shares[oldName] !== undefined) {
          const ns = {...e.shares};
          ns[newName.trim()] = ns[oldName]; delete ns[oldName];
          ne.shares = ns; changed = true;
        }
        return changed ? ne : e;
      });
      setExpenses(updated);
      for (const e of updated) {
        const orig = expenses.find(o=>o.id===e.id);
        if (orig?.paid_by !== e.paid_by || JSON.stringify(orig?.shares) !== JSON.stringify(e.shares)) {
          await sb.from('expenses').update({paid_by:e.paid_by, shares:e.shares}).eq('id',e.id);
        }
      }
    }
  };

  /* ── Logout ── */
  const logout = async () => {
    await sb.auth.signOut();
    setUser(null); setCurrentList(null); setLists([]);
    setExpenses([]); setMembers([]); setTab('home');
    localStorage.removeItem('splitease_list');
  };

  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */

  // ── Toast ──
  const ToastEl = () => (
    <AnimatePresence>
      {toast.show && (
        <motion.div initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm shadow-lg max-w-xs text-center">
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Loading ──
  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
      <motion.div animate={{rotate:360}} transition={{repeat:Infinity,duration:1}} className="w-10 h-10 border-4 border-white border-t-transparent rounded-full"/>
    </div>
  );

  // ── Auth Screen ──
  if (!user) return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
      <ToastEl/>
      <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-1">💰 SplitEase</h1>
        <p className="text-gray-500 text-center text-sm mb-6">{authMode==='login'?'Welcome back':'Create an account'}</p>
        {authError && <div className="bg-red-50 text-red-600 text-sm p-2 rounded-lg mb-3">{authError}</div>}
        <div className="space-y-3">
          <div className="relative">
            <input type="email" placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 pl-10 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"/>
            <span className="absolute left-3 top-3.5 text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg></span>
          </div>
          <div className="relative">
            <input type={showPass?'text':'password'} placeholder="Password" value={authPass}
              onChange={e=>setAuthPass(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')handleAuth();}}
              className="w-full border rounded-xl px-4 py-3 pl-10 pr-10 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"/>
            <span className="absolute left-3 top-3.5 text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg></span>
            <button className="absolute right-3 top-3.5 text-gray-400" onClick={()=>setShowPass(!showPass)}>
              {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
            </button>
          </div>
          <button onClick={handleAuth} disabled={authBusy}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition disabled:opacity-50">
            {authBusy ? '...' : authMode==='login' ? 'Log In' : 'Sign Up'}
          </button>
        </div>
        <p className="text-center text-sm text-gray-500 mt-4">
          {authMode==='login' ? "Don't have an account? " : 'Already have an account? '}
          <button className="text-indigo-600 font-semibold" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthError('');}}>
            {authMode==='login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </motion.div>
    </div>
  );

  // ── List Selection ──
  if (!currentList) return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
      <ToastEl/>
      <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">

        {listScreen === 'select' && (<>
          <h2 className="text-xl font-bold mb-1">💰 SplitEase</h2>
          <p className="text-gray-500 text-sm mb-4">{user.email}</p>

          {lists.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase">Your Lists</p>
              {lists.map(l => (
                <button key={l.id} onClick={()=>selectList(l)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-indigo-50 transition">
                  <div className="text-left">
                    <div className="font-semibold text-sm">{l.name}</div>
                    <div className="text-xs text-gray-400">{l.default_currency} • as {l.myDisplayName}</div>
                  </div>
                  <ArrowRight size={16} className="text-gray-400"/>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <button onClick={()=>setListScreen('create')}
              className="w-full flex items-center gap-2 justify-center bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition">
              <Plus size={18}/> New Expense List
            </button>
            <button onClick={()=>setListScreen('join')}
              className="w-full flex items-center gap-2 justify-center border-2 border-indigo-200 text-indigo-600 py-3 rounded-xl font-semibold hover:bg-indigo-50 transition">
              <UserPlus size={18}/> Join with Code
            </button>
          </div>
          <button onClick={logout} className="mt-4 text-sm text-gray-400 hover:text-gray-600 w-full text-center">Log out</button>
        </>)}

        {listScreen === 'create' && (<>
          <h2 className="text-lg font-bold mb-4">Create New List</h2>
          <div className="space-y-3">
            <input placeholder="List name (e.g. 'Housemates')" value={newListName} onChange={e=>setNewListName(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"/>
            <input placeholder="Your display name" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"/>
            <select value={newListCur} onChange={e=>setNewListCur(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white">
              {ALL_CUR.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={handleCreateList}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition">
              Create
            </button>
            <button onClick={()=>setListScreen('select')} className="w-full text-sm text-gray-500 py-2">Back</button>
          </div>
        </>)}

        {listScreen === 'join' && (<>
          <h2 className="text-lg font-bold mb-4">Join Expense List</h2>
          <div className="space-y-3">
            <input placeholder="Invite code" value={joinCode} onChange={e=>setJoinCode(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-mono"/>
            <input placeholder="Your display name" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"/>
            <button onClick={handleJoinList}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition">
              Join
            </button>
            <button onClick={()=>setListScreen('select')} className="w-full text-sm text-gray-500 py-2">Back</button>
          </div>
        </>)}
      </motion.div>
    </div>
  );

  // ── Member Names ──
  const names = members.map(m => m.display_name);
  const allCatNames = [...Object.keys(BASE_CATS), ...Object.keys(customCats), ...names];

  /* ════════════════════════════════════════════════════════════
     HOME TAB
     ════════════════════════════════════════════════════════════ */
  const HomeTab = () => {
    const catInfo = (name) => getCat(name, customCats, members);

    return (
      <div className="pb-24">
        {/* Balance Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-4 mx-4 mt-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-bold text-lg">{currentList.name}</h2>
              <span className="text-xs opacity-80">Logged in as {myName}</span>
            </div>
            <span className="bg-white/20 px-2 py-1 rounded-full text-xs">{defCur}</span>
          </div>

          {txns.length === 0 ? (
            <p className="text-center text-sm opacity-90 py-2">All settled up! ✨</p>
          ) : (
            <div className="space-y-1.5">
              {txns.map((t,i) => (
                <div key={i} className="flex items-center justify-between bg-white/10 rounded-lg px-3 py-1.5 text-sm">
                  <span>{t.from} owes {t.to}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{fmt(t.amount, defCur)}</span>
                    <button onClick={()=>{setShowSettle(!showSettle);setSettleFrom(t.from);setSettleTo(t.to);setSettleAmt(t.amount.toString());}}
                      className="bg-white/30 hover:bg-white/40 rounded-full px-2 py-0.5 text-xs transition">
                      💸 Settle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(() => {
            const thisMonth = new Date().toISOString().slice(0,7);
            const lm = new Date(); lm.setDate(1); lm.setMonth(lm.getMonth()-1);
            const lastMonth = lm.toISOString().slice(0,7);
            const spend = {};
            names.forEach(n => { spend[n] = {cur:0, prev:0}; });
            expenses.forEach(e => {
              const m = e.date?.slice(0,7);
              Object.entries(e.shares||{}).forEach(([n,a]) => {
                if (!spend[n]) return;
                if (m === thisMonth) spend[n].cur += a;
                else if (m === lastMonth) spend[n].prev += a;
              });
            });
            return (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {names.map(n => (
                  <div key={n} className="bg-white/10 rounded-lg px-3 py-2">
                    <div className="text-xs opacity-80 mb-1">{n}</div>
                    <div className="text-sm font-semibold">{fmt(spend[n].cur, defCur)} <span className="text-xs opacity-70 font-normal">this month</span></div>
                    <div className="text-xs opacity-70">{fmt(spend[n].prev, defCur)} last month</div>
                  </div>
                ))}
              </div>
            );
          })()}

          <AnimatePresence>
            {showSettle && (
              <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
                className="overflow-hidden">
                <div className="bg-white/10 rounded-lg p-3 mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <select value={settleFrom} onChange={e=>setSettleFrom(e.target.value)}
                      className="flex-1 bg-white/20 text-white rounded-lg px-3 py-2 text-sm outline-none [&>option]:text-gray-900">
                      {names.map(n=><option key={n} value={n}>{n}</option>)}
                    </select>
                    <span className="text-sm">paid</span>
                    <select value={settleTo} onChange={e=>setSettleTo(e.target.value)}
                      className="flex-1 bg-white/20 text-white rounded-lg px-3 py-2 text-sm outline-none [&>option]:text-gray-900">
                      {names.filter(n=>n!==settleFrom).map(n=><option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70 text-sm">{defCur}</span>
                      <input type="number" placeholder="0.00" value={settleAmt} onChange={e=>setSettleAmt(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter')addSettlement();}}
                        className="w-full bg-white/20 text-white rounded-lg pl-12 pr-3 py-2 text-sm outline-none placeholder-white/50"/>
                    </div>
                    <button onClick={addSettlement}
                      className="bg-white text-indigo-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-white/90 transition">
                      Record
                    </button>
                  </div>
                  {txns.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {txns.map((t,i)=>(
                        <button key={i} onClick={()=>{setSettleFrom(t.from);setSettleTo(t.to);setSettleAmt(t.amount.toString());}}
                          className="bg-white/20 hover:bg-white/30 rounded-full px-2 py-1 text-xs transition">
                          {t.from} → {t.to}: {fmt(t.amount, defCur)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

{/* Manual Add Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}
              className="mx-4 mt-3 bg-white rounded-xl shadow-lg p-4 space-y-3 border-2 border-indigo-200">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">Add Expense</h3>
                <button onClick={()=>setShowAddForm(false)} className="text-gray-400"><X size={18}/></button>
              </div>

              <input placeholder="Item name" value={addItem} onChange={e=>setAddItem(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"/>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{defCur}</span>
                  <input type="number" placeholder="0.00" value={addAmount} onChange={e=>setAddAmount(e.target.value)}
                    className="w-full border rounded-lg pl-12 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"/>
                </div>
                <select value={addCategory} onChange={e=>setAddCategory(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none bg-white">
                  {allCatNames.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="flex gap-2">
                <select value={addPaidBy||names[0]} onChange={e=>setAddPaidBy(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none bg-white">
                  {names.map(n=><option key={n} value={n}>{n} paid</option>)}
                </select>
                <input type="date" value={addDate} onChange={e=>setAddDate(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none"/>
              </div>

              {/* Foreign currency (optional) */}
              <details className="text-xs">
                <summary className="text-gray-400 cursor-pointer">Foreign currency?</summary>
                <div className="flex gap-2 mt-2">
                  <select value={addOrigCur} onChange={e=>{
                    setAddOrigCur(e.target.value);
                    if(e.target.value && addOrigAmt) {
                      setAddAmount(cvt(parseFloat(addOrigAmt), e.target.value, defCur, rates).toFixed(2));
                    }
                  }} className="flex-1 border rounded-lg px-2 py-2 text-sm outline-none bg-white">
                    <option value="">None</option>
                    {ALL_CUR.filter(c=>c!==defCur).map(c=><option key={c} value={c}>{CURR_FLAG[c]} {c}</option>)}
                  </select>
                  <input type="number" placeholder="Original amount" value={addOrigAmt}
                    onChange={e=>{
                      setAddOrigAmt(e.target.value);
                      if(addOrigCur && e.target.value) {
                        setAddAmount(cvt(parseFloat(e.target.value), addOrigCur, defCur, rates).toFixed(2));
                      }
                    }}
                    className="flex-1 border rounded-lg px-2 py-2 text-sm outline-none"/>
                </div>
              </details>

              {/* Split Type */}
              <div>
                <div className="text-xs text-gray-400 mb-1">Split type</div>
                <div className="flex flex-wrap gap-1">
                  {['equal','ratio','percent','exact','payer'].map(st=>(
                    <button key={st} onClick={()=>setAddSplitType(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        addSplitType===st ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>{st}</button>
                  ))}
                </div>
              </div>

              {/* Ratio inputs */}
              {addSplitType === 'ratio' && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-500">Enter ratio for each person (0 = excluded)</div>
                  {names.map(n => (
                    <div key={n} className="flex items-center gap-2">
                      <span className="text-sm w-20 truncate">{n}</span>
                      <input type="number" min="0" placeholder="0"
                        value={addProportions[n] || ''}
                        onChange={e => setAddProportions(prev => ({...prev, [n]: e.target.value}))}
                        className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"/>
                      <span className="text-xs text-gray-400 w-8">parts</span>
                    </div>
                  ))}
                  {addAmount > 0 && (() => {
                    const total = Object.values(addProportions).reduce((s,v) => s + (parseFloat(v)||0), 0);
                    if (total === 0) return null;
                    return (
                      <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-500 space-y-1">
                        <div className="font-semibold text-gray-700">Preview:</div>
                        {names.filter(n => parseFloat(addProportions[n]) > 0).map(n => (
                          <div key={n} className="flex justify-between">
                            <span>{n} ({addProportions[n]} of {total} parts = {((parseFloat(addProportions[n])/total)*100).toFixed(1)}%)</span>
                            <span>{fmt((parseFloat(addProportions[n])/total) * parseFloat(addAmount), defCur)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Percent inputs */}
              {addSplitType === 'percent' && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-500">Enter percentage for each person (must total 100%)</div>
                  {names.map(n => (
                    <div key={n} className="flex items-center gap-2">
                      <span className="text-sm w-20 truncate">{n}</span>
                      <input type="number" min="0" max="100" placeholder="0"
                        value={addPercentages[n] || ''}
                        onChange={e => setAddPercentages(prev => ({...prev, [n]: e.target.value}))}
                        className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"/>
                      <span className="text-xs text-gray-400 w-4">%</span>
                    </div>
                  ))}
                  {(() => {
                    const total = Object.values(addPercentages).reduce((s,v) => s + (parseFloat(v)||0), 0);
                    const isValid = Math.abs(total - 100) < 0.01;
                    return (
                      <div className={`rounded-lg p-2 text-xs space-y-1 ${isValid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
                        <div className="flex justify-between font-semibold">
                          <span>Total</span>
                          <span>{total.toFixed(1)}% {isValid ? '✓' : `(${total < 100 ? 'need ' + (100-total).toFixed(1) + '% more' : (total-100).toFixed(1) + '% over'})`}</span>
                        </div>
                        {addAmount > 0 && isValid && names.filter(n => parseFloat(addPercentages[n]) > 0).map(n => (
                          <div key={n} className="flex justify-between">
                            <span>{n} ({addPercentages[n]}%)</span>
                            <span>{fmt((parseFloat(addPercentages[n])/100) * parseFloat(addAmount), defCur)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Exact inputs */}
              {addSplitType === 'exact' && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-500">Enter exact amount for each person (must total {addAmount || '0'})</div>
                  {names.map(n => (
                    <div key={n} className="flex items-center gap-2">
                      <span className="text-sm w-20 truncate">{n}</span>
                      <input type="number" min="0" placeholder="0"
                        value={addExactAmounts[n] || ''}
                        onChange={e => setAddExactAmounts(prev => ({...prev, [n]: e.target.value}))}
                        className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"/>
                    </div>
                  ))}
                  {(() => {
                    const sum = Object.values(addExactAmounts).reduce((s,v) => s + (parseFloat(v)||0), 0);
                    const target = parseFloat(addAmount) || 0;
                    const diff = target - sum;
                    return (
                      <div className={`rounded-lg p-2 text-xs font-semibold ${Math.abs(diff) < 0.01 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
                        Total: {fmt(sum, defCur)} {Math.abs(diff) < 0.01 ? '✓' : `(${diff > 0 ? fmt(diff,defCur)+' remaining' : fmt(-diff,defCur)+' over'})`}
                      </div>
                    );
                  })()}
                </div>
              )}

              {addSplitType === 'payer' && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                  Entire amount assigned to the payer — no split.
                </div>
              )}

              <button onClick={addManualExpense}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 transition">
                Add Expense
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Expense Input (inline) */}
        <div className="mx-4 mt-3">
          <div className={`bg-white rounded-xl shadow transition-all ${inputFocused ? 'ring-2 ring-indigo-400' : ''}`}>
            <div className="flex items-center gap-2 p-3">
              <button onClick={()=>{setShowAddForm(!showAddForm);setAddPaidBy(myName);}} className="flex-shrink-0">
                <Plus size={18} className={`transition ${showAddForm ? 'text-indigo-600 rotate-45' : 'text-indigo-400'}`}/>
              </button>
              <input ref={inputRef} placeholder="Add expense… e.g. 'dinner ¥500 Alice paid'"
                value={inputText} onChange={e=>setInputText(e.target.value)}
                onFocus={()=>setInputFocused(true)}
                onKeyDown={e=>{if(e.key==='Enter'&&parsedPreview)addExpense();}}
                className="flex-1 text-sm outline-none bg-transparent"/>
              {inputText && (
                <button onClick={()=>{setInputText('');setInputFocused(false);}} className="text-gray-400"><X size={16}/></button>
              )}
              {parsedPreview && (
                <button onClick={addExpense} className="bg-indigo-600 text-white p-1.5 rounded-lg"><Send size={14}/></button>
              )}
            </div>

            <AnimatePresence>
              {inputFocused && parsedPreview && (
                <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
                  className="overflow-hidden">
                  <div className="border-t px-3 pb-3 pt-2 space-y-1 text-xs text-gray-600">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="font-semibold text-sm text-gray-900">{parsedPreview.item}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${catInfo(parsedPreview.category).bg} ${catInfo(parsedPreview.category).tx}`}>
                        {catInfo(parsedPreview.category).emoji} {parsedPreview.category}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="font-bold text-base text-indigo-600">{fmt(parsedPreview.total_amount, defCur)}</span>
                      {parsedPreview.original_currency && (
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                          {CURR_FLAG[parsedPreview.original_currency]||''} {fmt(parsedPreview.original_amount, parsedPreview.original_currency)}
                        </span>
                      )}
                    </div>
                    <div>Paid by <strong>{parsedPreview.paid_by}</strong> • {parsedPreview.split_type}</div>
                    {Object.keys(parsedPreview.shares).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(parsedPreview.shares).map(([n,a])=>(
                          <span key={n} className="bg-gray-100 px-1.5 py-0.5 rounded">{n}: {fmt(a,defCur)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Search */}
        <div className="mx-4 mt-3 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input placeholder="Search expenses…" value={search} onChange={e=>setSearch(e.target.value)}
            className="w-full bg-white rounded-xl pl-9 pr-4 py-2.5 text-sm shadow-sm border border-gray-100 outline-none focus:ring-2 focus:ring-indigo-400"/>
        </div>

        {/* Expense List */}
        <div className="mt-3 mx-4 space-y-2">
          <AnimatePresence>
            {filtered.map(exp => {
              const ci = catInfo(exp.category);
              const isEditing = editingId === exp.id;

              return (
                <motion.div key={exp.id} layout initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,x:-100}}
                  className="bg-white rounded-xl shadow-sm overflow-hidden">

                  {!isEditing ? (
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="text-lg mt-0.5">{ci.emoji}</span>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{exp.item}</div>
                            <div className="flex flex-wrap gap-1 mt-1 items-center">
                              <span className={`px-1.5 py-0.5 rounded-full text-xs ${ci.bg} ${ci.tx}`}>{exp.category}</span>
                              <span className="text-xs text-gray-400">{exp.date}</span>
                              {exp.original_currency && (
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                                  {CURR_FLAG[exp.original_currency]||''} {fmt(exp.original_amount, exp.original_currency)}
                                </span>
                              )}
                              <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{exp.split_type}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-sm">{fmt(exp.total_amount, defCur)}</div>
                          <div className="text-xs text-gray-400">{exp.paid_by} paid</div>
                        </div>
                      </div>

                      {/* Share pills */}
                      {exp.shares && Object.keys(exp.shares).length > 1 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {Object.entries(exp.shares).map(([n,a])=>(
                            <span key={n} className="text-xs bg-gray-50 px-1.5 py-0.5 rounded">{n}: {fmt(a,defCur)}</span>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2 mt-2 justify-end">
                        <button onClick={()=>startEdit(exp)} className="text-gray-400 hover:text-indigo-600"><Pencil size={14}/></button>
                        <button onClick={()=>deleteExpense(exp.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={14}/></button>
                      </div>
                    </div>
                  ) : (
                    /* Edit Mode */
                    <div className="p-3 space-y-2 bg-indigo-50">
                      <input value={editForm.item} onChange={e=>setEditForm({...editForm,item:e.target.value})}
                        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"/>
                      <div className="flex gap-2">
                        <input type="number" value={editForm.total_amount} onChange={e=>setEditForm({...editForm,total_amount:e.target.value})}
                          className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"/>
                        <select value={editForm.category} onChange={e=>setEditForm({...editForm,category:e.target.value})}
                          className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none bg-white">
                          {allCatNames.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <select value={editForm.paid_by} onChange={e=>setEditForm({...editForm,paid_by:e.target.value})}
                          className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none bg-white">
                          {names.map(n=><option key={n} value={n}>{n}</option>)}
                        </select>
                        <input type="date" value={editForm.date} onChange={e=>setEditForm({...editForm,date:e.target.value})}
                          className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none"/>
                      </div>

                      {/* Split type buttons */}
                      <div className="flex flex-wrap gap-1">
                        {['equal','ratio','percent','personal','full','custom'].map(s=>(
                          <button key={s} onClick={()=>{
                            const total = parseFloat(editForm.total_amount) || 0;
                            let shares = {};
                            if (s==='equal') names.forEach(n=>{shares[n]=total/names.length;});
                            else if (s==='personal') shares = {[editForm.paid_by]:total};
                            else if (s==='full') shares = {[names[0]]:total};
                            else shares = {...editForm.shares};
                            setEditForm({...editForm,split_type:s,shares});
                          }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                              editForm.split_type===s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border'
                            }`}>{s}</button>
                        ))}
                      </div>

                      {/* Custom shares */}
                      {(editForm.split_type==='ratio') && (
                        <div className="space-y-1">
                          {names.map(n=>(
                            <div key={n} className="flex items-center gap-2">
                              <span className="text-xs w-20 truncate">{n}</span>
                              <input type="number" min="0" placeholder="0"
                                value={editForm.shares?.[n]||''}
                                onChange={e=>{
                                  const ns = {...editForm.shares, [n]:e.target.value};
                                  // Recompute as ratio
                                  const total = parseFloat(editForm.total_amount)||0;
                                  const sum = Object.values(ns).reduce((s,v)=>s+(parseFloat(v)||0),0);
                                  if (sum > 0) {
                                    const computed = {};
                                    names.forEach(nm=>{const r=parseFloat(ns[nm])||0; if(r>0) computed[nm]=Math.round((r/sum)*total*100)/100;});
                                    setEditForm({...editForm,shares:ns,_computedShares:computed});
                                  } else {
                                    setEditForm({...editForm,shares:ns});
                                  }
                                }}
                                className="flex-1 border rounded-lg px-2 py-1 text-sm outline-none"/>
                              <span className="text-xs text-gray-400">parts</span>
                            </div>
                          ))}
                          {editForm._computedShares && (
                            <div className="bg-gray-50 rounded p-1.5 text-xs text-gray-500">
                              {Object.entries(editForm._computedShares).map(([n,a])=>(
                                <span key={n} className="mr-2">{n}: {fmt(a,defCur)}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {(editForm.split_type==='percent') && (
                        <div className="space-y-1">
                          {names.map(n=>(
                            <div key={n} className="flex items-center gap-2">
                              <span className="text-xs w-20 truncate">{n}</span>
                              <input type="number" min="0" max="100" placeholder="0"
                                value={editForm.shares?.[n]||''}
                                onChange={e=>{
                                  const ns = {...editForm.shares, [n]:e.target.value};
                                  setEditForm({...editForm,shares:ns});
                                }}
                                className="flex-1 border rounded-lg px-2 py-1 text-sm outline-none"/>
                              <span className="text-xs text-gray-400">%</span>
                            </div>
                          ))}
                          {(()=>{
                            const sum = Object.values(editForm.shares||{}).reduce((s,v)=>s+(parseFloat(v)||0),0);
                            return <div className={`text-xs p-1 rounded ${Math.abs(sum-100)<0.01?'text-green-600':'text-red-500'}`}>Total: {sum.toFixed(1)}%</div>;
                          })()}
                        </div>
                      )}

                      {(editForm.split_type==='custom'||editForm.split_type==='full') && (
                        <div className="space-y-1">
                          {names.map(n=>(
                            <div key={n} className="flex items-center gap-2">
                              <span className="text-xs w-20 truncate">{n}</span>
                              <input type="number" value={editForm.shares?.[n]||0}
                                onChange={e=>{
                                  const ns = {...editForm.shares, [n]:parseFloat(e.target.value)||0};
                                  setEditForm({...editForm,shares:ns});
                                }}
                                className="flex-1 border rounded-lg px-2 py-1 text-sm outline-none"/>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2 justify-end">
                        <button onClick={()=>setEditingId(null)} className="px-3 py-1.5 rounded-lg text-xs bg-white border text-gray-600">Cancel</button>
                        <button onClick={saveEdit} className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 text-white font-semibold">Save</button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filtered.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">
              {expenses.length === 0 ? 'No expenses yet. Add one above!' : 'No results found.'}
            </p>
          )}
        </div>
      </div>
    );
  };

  /* ════════════════════════════════════════════════════════════
     STATS TAB
     ════════════════════════════════════════════════════════════ */
  const StatsTab = () => {
    // Month expenses filtered by person
    // Always compute from all month expenses
    const personTotals = {};
    names.forEach(n => { personTotals[n] = 0; });
    monthExpenses.forEach(e => {
      Object.entries(e.shares||{}).forEach(([n,a]) => {
        personTotals[n] = (personTotals[n]||0) + a;
      });
    });
    const grandTotal = Object.values(personTotals).reduce((s,v)=>s+v, 0);

    // Filtered for charts/breakdown below
    const visExps = personFilter
      ? monthExpenses.filter(e => e.shares?.[personFilter] > 0)
      : monthExpenses;

    // Category breakdown
    const catTotals = {};
    visExps.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + e.total_amount; });
    const catData = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));

    // Monthly chart data
    const monthlyData = {};
    expenses.forEach(e => {
      const m = e.date?.slice(0,7);
      if (!m) return;
      if (!monthlyData[m]) { monthlyData[m] = {}; names.forEach(n=>{monthlyData[m][n]=0;}); }
      Object.entries(e.shares||{}).forEach(([n,a])=>{
        monthlyData[m][n] = (monthlyData[m][n]||0) + a;
      });
    });
    const barData = Object.entries(monthlyData).sort((a,b)=>a[0].localeCompare(b[0])).map(([m,d])=>({month:m,...d}));

    return (
      <div className="pb-24 px-4 pt-4">
        {/* Month pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {months.map(m=>(
            <button key={m} onClick={()=>setSelMonth(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                selMonth===m ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border'
              }`}>{m}</button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={()=>setPersonFilter('')}
            className={`flex-shrink-0 p-3 rounded-xl text-center min-w-20 transition ${
              !personFilter ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border'
            }`}>
            <div className="text-xs opacity-80">Together</div>
            <div className="font-bold text-sm">{fmt(grandTotal,defCur)}</div>
          </button>
          {names.map((n,i)=>(
            <button key={n} onClick={()=>setPersonFilter(personFilter===n?'':n)}
              className={`flex-shrink-0 p-3 rounded-xl text-center min-w-20 transition ${
                personFilter===n ? 'text-white shadow-lg' : 'bg-white border'
              }`}
              style={personFilter===n ? {background:PERSON_COLORS[i%PERSON_COLORS.length]} : {}}>
              <div className="text-xs opacity-80">{n}</div>
              <div className="font-bold text-sm">{fmt(personTotals[n]||0,defCur)}</div>
            </button>
          ))}
        </div>

        {/* Bar Chart */}
        {barData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-3 mt-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Monthly by Person</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <XAxis dataKey="month" tick={{fontSize:10}} tickFormatter={v=>v.slice(5)}/>
                <YAxis tick={{fontSize:10}} width={40}/>
                <RTooltip formatter={(v,n)=>[fmt(v,defCur),n]}/>
                {names.map((n,i)=>(
                  <Bar key={n} dataKey={n} fill={PERSON_COLORS[i%PERSON_COLORS.length]}
                    opacity={personFilter && personFilter!==n ? 0.2 : 1} radius={[2,2,0,0]}/>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Pie Chart */}
        {catData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-3 mt-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Categories</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}
                  style={{fontSize:10}}>
                  {catData.map((d,i)=>(
                    <Cell key={i} fill={getCat(d.name,customCats,members).c || '#6b7280'}/>
                  ))}
                </Pie>
                <RTooltip formatter={(v)=>fmt(v,defCur)}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Category Breakdown Bars */}
        <div className="bg-white rounded-xl shadow-sm p-3 mt-3 space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase">Breakdown</h3>
          {catData.map(({name,value})=>{
            const ci = getCat(name,customCats,members);
            const pct = grandTotal > 0 ? (value/grandTotal*100) : 0;
            return (
              <div key={name}>
                <div className="flex items-center justify-between text-sm">
                  <span>{ci.emoji} {name}</span>
                  <span className="font-semibold">{fmt(value,defCur)} <span className="text-gray-400 text-xs">({pct.toFixed(0)}%)</span></span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
                  <div className="h-2 rounded-full transition-all" style={{width:`${pct}%`, background:ci.c}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ════════════════════════════════════════════════════════════
     SETTINGS TAB
     ════════════════════════════════════════════════════════════ */
  const SettingsTab = () => {
    return (
      <div className="pb-24 px-4 pt-4 space-y-4">

        {/* Session */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Session</h3>
          <p className="text-sm text-gray-600 mb-1">Logged in as <strong>{user.email}</strong></p>
          <p className="text-sm text-gray-600 mb-3">List: <strong>{currentList.name}</strong></p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={()=>{setCurrentList(null);localStorage.removeItem('splitease_list');setTab('home');}}
              className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition">Switch List</button>
            <button onClick={logout}
              className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition flex items-center gap-1">
              <LogOut size={14}/> Log Out
            </button>
          </div>

          {/* Delete List */}
          <div className="mt-4 pt-3 border-t">
            {!confirmDeleteList ? (
              <button onClick={()=>setConfirmDeleteList(true)}
                className="text-xs text-red-400 hover:text-red-600 transition">
                Delete this list…
              </button>
            ) : (
              <div className="bg-red-50 rounded-lg p-3 space-y-2">
                <p className="text-sm text-red-700 font-semibold">Delete "{currentList.name}"?</p>
                <p className="text-xs text-red-500">This will permanently delete all expenses, members, and settings. This cannot be undone.</p>
                <div className="flex gap-2">
                  <button onClick={deleteList}
                    className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition flex items-center gap-1">
                    <Trash2 size={14}/> Yes, delete everything
                  </button>
                  <button onClick={()=>setConfirmDeleteList(false)}
                    className="px-3 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Invite Code */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Invite Code</h3>
          <div className="flex items-center gap-2">
            <code className="bg-gray-100 px-3 py-2 rounded-lg text-sm font-mono flex-1">{currentList.invite_code}</code>
            <button onClick={()=>{navigator.clipboard?.writeText(currentList.invite_code);showToast('Copied!');}}
              className="p-2 bg-indigo-50 rounded-lg text-indigo-600 hover:bg-indigo-100"><Copy size={16}/></button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Share this code so others can join your list</p>
        </div>

        {/* Members */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Members ({members.length})</h3>
          <div className="space-y-2">
            {members.map((m,i) => (
              <div key={m.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{background:PERSON_COLORS[i%PERSON_COLORS.length]}}>
                  {m.display_name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  {m.user_id === user.id && nameEditing ? (
                    <div className="flex gap-1">
                      <input value={editName} onChange={e=>setEditName(e.target.value)}
                        className="flex-1 border rounded px-2 py-1 text-sm outline-none"/>
                      <button onClick={()=>{updateMyName(editName);setNameEditing(false);showToast('Name updated');}}
                        className="text-green-600"><Check size={16}/></button>
                      <button onClick={()=>setNameEditing(false)} className="text-gray-400"><X size={16}/></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-sm truncate">{m.display_name}</span>
                      {m.user_id === user.id && (
                        <>
                          <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">you</span>
                          <button onClick={()=>{setEditName(m.display_name);setNameEditing(true);}}
                            className="text-gray-400 hover:text-indigo-600 ml-1"><Pencil size={12}/></button>
                        </>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 truncate">{m.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Currency & Exchange Rates */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Currency & Exchange Rates</h3>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-sm font-bold">{defCur}</span>
            <span className="text-xs text-gray-400">Set at list creation</span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">Rates: {ratesDate || 'N/A'}</span>
            <button onClick={()=>{fetchRates(defCur);showToast('Rates refreshed');}}
              className="text-indigo-600 hover:text-indigo-800"><RefreshCw size={12}/></button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {ALL_CUR.filter(c => c !== defCur).map(c => (
              <div key={c} className="bg-gray-50 rounded-lg px-2 py-1.5 text-xs flex items-center justify-between">
                <span className="font-medium">{CURR_FLAG[c]||''} {c}</span>
                <span className="text-gray-500">{rates[c] ? rates[c].toFixed(c === 'JPY' || c === 'KRW' || c === 'VND' || c === 'IDR' ? 0 : 2) : '–'}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            1 {defCur} = listed amount in each currency
          </p>
        </div>

        {/* Categories */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Categories</h3>
          <div className="flex flex-wrap gap-1 mb-3">
            {Object.entries(BASE_CATS).map(([n,c])=>(
              <span key={n} className={`px-2 py-1 rounded-full text-xs ${c.bg} ${c.tx}`}>{c.emoji} {n}</span>
            ))}
            {Object.entries(customCats).map(([n,c])=>(
              <span key={n} className="px-2 py-1 rounded-full text-xs bg-cyan-100 text-cyan-700 flex items-center gap-1">
                {c.emoji} {n}
                <button onClick={()=>deleteCustomCat(n)}><X size={10}/></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input placeholder="New category…" value={newCatName} onChange={e=>setNewCatName(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')addCustomCat();}}
              className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none"/>
            <button onClick={addCustomCat} className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm"><Plus size={14}/></button>
          </div>
        </div>

        {/* Learned Categories */}
        {Object.keys(catOverrides).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase">Learned Categories</h3>
              <button onClick={()=>{setCatOverrides({});saveSetting('categoryOverrides',{});showToast('Cleared all overrides');}}
                className="text-xs text-red-500">Clear all</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(catOverrides).map(([word,cat])=>(
                <span key={word} className="bg-gray-100 px-2 py-1 rounded text-xs">{word} → {cat}</span>
              ))}
            </div>
          </div>
        )}

        {/* Import/Export */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Import & Export</h3>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={exportJSON} className="flex items-center gap-1 justify-center bg-indigo-50 text-indigo-600 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition">
              <Download size={14}/> JSON
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1 justify-center bg-green-50 text-green-600 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-100 transition">
              <Download size={14}/> CSV
            </button>
            <button onClick={()=>fileRef.current?.click()} className="flex items-center gap-1 justify-center bg-amber-50 text-amber-600 py-2.5 rounded-lg text-sm font-semibold hover:bg-amber-100 transition">
              <Upload size={14}/> JSON
            </button>
            <button onClick={()=>csvRef.current?.click()} className="flex items-center gap-1 justify-center bg-purple-50 text-purple-600 py-2.5 rounded-lg text-sm font-semibold hover:bg-purple-100 transition">
              <Upload size={14}/> CSV
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importJSON}/>
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={importCSV}/>
          <p className="text-xs text-gray-400">CSV import supports old 2-person format (your_share/partner_share columns) — maps to first 2 members.</p>
        </div>

        {/* Quick Add Tips */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Quick Add Tips</h3>
          <div className="text-xs text-gray-600 space-y-1">
            <p><code className="bg-gray-100 px-1 rounded">dinner 50</code> — equal split in {defCur}</p>
            <p><code className="bg-gray-100 px-1 rounded">coffee ¥500</code> — auto-converts from CNY</p>
            <p><code className="bg-gray-100 px-1 rounded">taxi 30 Alice paid</code> — Alice paid</p>
            <p><code className="bg-gray-100 px-1 rounded">groceries 80 personal</code> — no split (also: me, own, for myself)</p>
            <p><code className="bg-gray-100 px-1 rounded">dinner 120 for Bob</code> — 100% Bob's responsibility</p>
            <p><code className="bg-gray-100 px-1 rounded">rent 900 60/40</code> — custom ratio</p>
            <p><code className="bg-gray-100 px-1 rounded">gift 50 70% Alice</code> — 70% Alice, rest split equally</p>
          </div>
        </div>
      </div>
    );
  };

  /* ════════════════════════════════════════════════════════════
     MAIN LAYOUT
     ════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto relative">
      <ToastEl/>

      {/* Content */}
      {tab === 'home' && HomeTab()}
      {tab === 'stats' && StatsTab()}
      {tab === 'settings' && SettingsTab()}

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t shadow-lg z-40">
        <div className="flex">
          {[
            {id:'home', icon:HomeIcon, label:'Home'},
            {id:'stats', icon:BarChart3, label:'Stats'},
            {id:'settings', icon:SettingsIcon, label:'Settings'},
          ].map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setEditingId(null);}}
              className={`flex-1 flex flex-col items-center py-3 transition ${
                tab===t.id ? 'text-indigo-600' : 'text-gray-400'
              }`}>
              <t.icon size={20}/>
              <span className="text-xs mt-0.5">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}