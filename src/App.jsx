// supaBase account xyzchu@hotmail.com
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
import { usePushNotifications } from './usePushNotifications';

/* ══════════════════════════════════════════════════════════════
   THEME
   ══════════════════════════════════════════════════════════════ */

const MONO = '"SF Mono","Fira Code","Cascadia Code","Consolas","Liberation Mono",monospace';

const THEME_CSS = `
  .se * { box-sizing: border-box; }
  .se, .se input, .se select, .se button, .se textarea, .se code {
    font-family: ${MONO};
  }
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }
  .se-noscroll::-webkit-scrollbar { display: none; }
  .se-noscroll { -ms-overflow-style: none; scrollbar-width: none; }
`;

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
  Restaurant:{emoji:'🍽️',c:'#f97316',bg:'#fff7ed',tx:'#c2410c'},
  Groceries:{emoji:'🛒',c:'#22c55e',bg:'#f0fdf4',tx:'#15803d'},
  Transport:{emoji:'🚗',c:'#3b82f6',bg:'#eff6ff',tx:'#1d4ed8'},
  Utilities:{emoji:'💡',c:'#eab308',bg:'#fefce8',tx:'#a16207'},
  Travel:{emoji:'✈️',c:'#a855f7',bg:'#faf5ff',tx:'#7e22ce'},
  Home:{emoji:'🏠',c:'#ec4899',bg:'#fdf2f8',tx:'#be185d'},
  Settlement:{emoji:'💸',c:'#10b981',bg:'#ecfdf5',tx:'#047857'},
  Other:{emoji:'📦',c:'#6b7280',bg:'#f3f4f6',tx:'#4b5563'},
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
  if (mi >= 0) return {emoji:'👤', c: PERSON_COLORS[mi % PERSON_COLORS.length], bg:'#eef2ff', tx:'#4338ca'};
  return BASE_CATS.Other;
};

/* ── Shared inline style helpers ── */
const s = {
  page: { minHeight:'100vh', background:'#FAFAF5', color:'#1a1a1a', fontFamily:MONO, WebkitFontSmoothing:'antialiased' },
  centerPage: { minHeight:'100vh', background:'#FAFAF5', display:'flex', alignItems:'center', justifyContent:'center', padding:16, fontFamily:MONO, color:'#1a1a1a' },
  card: { background:'#fff', borderRadius:16, boxShadow:'0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)', padding:'24px' },
  input: { width:'100%', background:'#F0F0EA', border:'none', borderRadius:12, padding:'12px 14px', fontSize:13, color:'#1a1a1a', outline:'none', letterSpacing:'0.04em', fontFamily:MONO },
  inputFocus: { background:'#e8e8df' },
  label: { fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', opacity:0.35, fontWeight:700, marginBottom:6, display:'block' },
  btnDark: { width:'100%', padding:'14px', border:'2px solid #222', background:'#222', color:'#f5f5ee', fontSize:13, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', borderRadius:12, cursor:'pointer', fontFamily:MONO, transition:'all 0.2s' },
  btnOutline: { width:'100%', padding:'14px', border:'2px solid #bbb', background:'transparent', color:'#1a1a1a', fontSize:13, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', borderRadius:12, cursor:'pointer', fontFamily:MONO, transition:'all 0.2s' },
  ghost: { background:'none', border:'none', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', opacity:0.35, cursor:'pointer', padding:'8px 0', color:'#1a1a1a', fontFamily:MONO },
  tag: (bg,tx) => ({ fontSize:10, letterSpacing:'0.06em', textTransform:'uppercase', padding:'3px 8px', borderRadius:9999, fontWeight:600, display:'inline-block', background:bg||'#f3f4f6', color:tx||'#4b5563' }),
  chip: (active) => ({ fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', padding:'8px 14px', borderRadius:9999, border:'none', cursor:'pointer', transition:'all 0.2s', fontFamily:MONO, fontWeight: active?700:400, background: active?'#222':'#F0F0EA', color: active?'#f5f5ee':'#1a1a1a', opacity: active?1:0.6 }),
  sm: (active) => ({ fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', padding:'8px 14px', borderRadius:12, border:'none', cursor:'pointer', transition:'all 0.2s', fontFamily:MONO, background: active?'#222':'#F0F0EA', color: active?'#f5f5ee':'#1a1a1a', fontWeight: active?700:400 }),
  split: (active) => ({ fontSize:10, letterSpacing:'0.06em', textTransform:'uppercase', padding:'6px 10px', borderRadius:12, border: active?'1px solid #222':'1px solid #ddd', background: active?'#222':'#fff', color: active?'#f5f5ee':'#1a1a1a', cursor:'pointer', transition:'all 0.2s', fontFamily:MONO, fontWeight: active?700:400 }),
  tabnum: { fontVariantNumeric:'tabular-nums' },
  upper: { textTransform:'uppercase', letterSpacing:'0.08em' },
};

/* ══════════════════════════════════════════════════════════════
   NLP PARSER
   ══════════════════════════════════════════════════════════════ */

function parseExpense(raw, members, myName, rates, defCur, overrides, customCats) {
  if (!raw.trim()) return null;
  let t = raw, cur = null, amt = null;

  const sm = t.match(/([¥€£₩₹฿])\s*(\d+(?:\.\d+)?)/);
  if (sm) {
    cur = CURR_SYM[sm[1]];
    if (sm[1]==='¥' && /\b(jpy|japan|yen)\b/i.test(t)) cur='JPY';
    amt = parseFloat(sm[2]); t = t.replace(sm[0],' ');
  }

  if (amt==null) { const m = t.match(/\$\s*(\d+(?:\.\d+)?)/); if(m){amt=parseFloat(m[1]);t=t.replace(m[0],' ');} }

  if (amt==null) {
    const cc = ALL_CUR.join('|');
    const m1 = t.match(new RegExp(`\\b(${cc})\\s*(\\d+(?:\\.\\d+)?)\\b`,'i'));
    if (m1) { cur=m1[1].toUpperCase(); amt=parseFloat(m1[2]); t=t.replace(m1[0],' '); }
    else { const m2=t.match(new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(${cc})\\b`,'i')); if(m2){amt=parseFloat(m2[1]);cur=m2[2].toUpperCase();t=t.replace(m2[0],' ');} }
  }

  if (!cur) { for (const [re,code] of CURR_WORDS) { if (re.test(t)){cur=code; t=t.replace(re,' '); break;} } }

  if (!cur) {
    const cc = ALL_CUR.join('|');
    const m = t.match(new RegExp(`\\b(${cc})\\b`, 'i'));
    if (m) { cur = m[1].toUpperCase(); t = t.replace(m[0], ' '); }
  }

  if (amt==null) { const m=t.match(/\b(\d+(?:\.\d+)?)\b/); if(m){amt=parseFloat(m[1]);t=t.replace(m[0],' ');} }
  if (amt==null) return null;

  const origCur = cur || defCur, origAmt = amt;
  const total = cur && cur !== defCur ? cvt(origAmt, cur, defCur, rates) : amt;
  if (!cur) cur = defCur;

  let paidBy = myName;
  const names = members.map(m => m.display_name);
  for (const n of names) {
    if (new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b`,'i').test(raw)) { paidBy = n; break; }
  }

  let st = raw;
  for (const n of names) st = st.replace(new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b`,'ig'),' ');

  let splitType = 'equal', shares = {};
  const personalRe = /\b(for\s+myself|for\s+me|mine\s+only|personal|just\s+me|no\s+split|my\s+own|only\s+me|myself)\b/i;
  const personalShort = /(?:^|\s)(me|own)(?:\s|$)/i;
  const ratioMatch = st.match(/\b(\d+(?:\/\d+)+)\b/);
  const pctMatch = st.match(/\b(\d+)\s*%\s*(\w+)/i);

  let fullPerson = null;
  for (const n of names) {
    if (new RegExp(`\\bfor\\s+${n}\\b|\\b${n}\\s+owes?\\b|\\bowed\\s+by\\s+${n}\\b|\\b100\\s*%\\s*${n}\\b|\\ball\\s+${n}\\b`,'i').test(st)) {
      fullPerson = n; break;
    }
  }

  if (personalRe.test(st) || personalShort.test(st)) {
    splitType = 'personal'; shares = {[paidBy]: total};
  } else if (fullPerson) {
    splitType = 'full'; shares = {[fullPerson]: total};
  } else if (ratioMatch) {
    splitType = 'custom';
    const parts = ratioMatch[1].split('/').map(Number);
    const sum = parts.reduce((a,b)=>a+b,0);
    if (parts.length === names.length && sum > 0) {
      names.forEach((n,i) => { shares[n] = total * (parts[i]/sum); });
    } else {
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

  let item = raw;
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
  const [listScreen, setListScreen] = useState('select');
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
  const [showForeign, setShowForeign] = useState(false);

  // ── Exchange Rates ──
  const [rates, setRates] = useState(FALLBACK_RATES_USD);
  const [ratesDate, setRatesDate] = useState('');

  // ── UI ──
  const [toast, setToast] = useState({msg:'', show:false});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const csvRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToast({msg, show:true});
    setTimeout(() => setToast(t=>({...t, show:false})), 3500);
  }, []);

  const { supported: pushSupported, permission: pushPermission, subscribed: pushSubscribed,
          loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe,
          sendNotification } = usePushNotifications(user, currentList, showToast);

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
    try {
      const cached = JSON.parse(localStorage.getItem('splitease_rates'));
      if (cached && cached.rates) {
        if (cached.base === base) {
          setRates(cached.rates); setRatesDate(cached.date + ' (cached)'); return cached.rates;
        }
        const baseRate = cached.rates[base] || 1;
        const rebased = {};
        Object.entries(cached.rates).forEach(([k,v]) => { rebased[k] = v / baseRate; });
        setRates(rebased); setRatesDate(cached.date + ' (cached)'); return rebased;
      }
    } catch {}
    const fb = {};
    const baseRate = FALLBACK_RATES_USD[base] || 1;
    Object.entries(FALLBACK_RATES_USD).forEach(([k,v]) => { fb[k] = v / baseRate; });
    setRates(fb); setRatesDate('hardcoded'); return fb;
  }, []);

  useEffect(() => { fetchRates(defCur); }, [defCur]);

  /* ── Select a List ── */
  const selectList = useCallback(async (list) => {
    setCurrentList(list);
    setDefCur(list.default_currency || 'AUD');
    setMyName(list.myDisplayName || '');
    localStorage.setItem('splitease_list', list.id);
    fetchRates(list.default_currency || 'AUD');
    const {data: mems} = await sb.from('list_members').select('*').eq('list_id', list.id);
    setMembers(mems || []);
    const {data: exps} = await sb.from('expenses').select('*').eq('list_id', list.id).order('date',{ascending:false}).order('created_at',{ascending:false});
    setExpenses(exps || []);
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

    const name = newDisplayName.trim();
    const d = (daysAgo) => {
      const dt = new Date(); dt.setDate(dt.getDate() - daysAgo);
      return dt.toISOString().slice(0, 10);
    };
    const samples = [
      { item: 'Grocery run', category: 'Groceries', date: d(1), total_amount: 45.50, paid_by: name, split_type: 'equal', shares: {[name]: 45.50} },
      { item: 'Coffee & cake', category: 'Restaurant', date: d(3), total_amount: 12.00, paid_by: name, split_type: 'equal', shares: {[name]: 12.00} },
      { item: 'Uber to city', category: 'Transport', date: d(5), total_amount: 28.00, paid_by: name, split_type: 'equal', shares: {[name]: 28.00} },
      { item: 'Netflix subscription', category: 'Utilities', date: d(10), total_amount: 16.99, paid_by: name, split_type: 'equal', shares: {[name]: 16.99} },
      { item: 'Dinner out', category: 'Restaurant', date: d(18), total_amount: 62.00, paid_by: name, split_type: 'equal', shares: {[name]: 62.00} },
      { item: 'Flight booking', category: 'Travel', date: d(35), total_amount: 250.00, paid_by: name, split_type: 'equal', shares: {[name]: 250.00} },
      { item: 'New lamp', category: 'Home', date: d(40), total_amount: 39.95, paid_by: name, split_type: 'equal', shares: {[name]: 39.95} },
    ].map(s => ({ ...s, list_id: list.id, original_currency: null, original_amount: null }));

    await sb.from('expenses').insert(samples);
    const full = {...list, myDisplayName: name};
    setLists(prev => [...prev, full]);
    selectList(full);
    setListScreen('select');
    setNewListName(''); setNewDisplayName('');
    showToast('List created with sample data! Share code: ' + list.invite_code);
  };

  /* ── Delete List ── */
  const deleteList = async () => {
    if (!currentList) return;
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
      list_id: currentList.id, item: `💸 ${settleFrom} paid ${settleTo}`,
      category: 'Settlement', date: today(), original_currency: null, original_amount: null,
      total_amount: amount, paid_by: settleFrom, split_type: 'settlement', shares: {[settleTo]: amount}
    };
    const {data, error} = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setExpenses(prev => [data, ...prev]);
    setShowSettle(false); setSettleAmt('');
    showToast(`Recorded: ${settleFrom} paid ${settleTo} ${fmt(amount, defCur)}`);
    sendNotification(`💸 ${settleFrom} paid ${settleTo}`, `${fmt(amount, defCur)} in ${currentList.name}`, 'settlement');
  };

  const addManualExpense = async () => {
    if (!addItem.trim() || !addAmount || !currentList) return;
    const amount = parseFloat(addAmount);
    if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
    const ns = members.map(m => m.display_name);
    const payer = addPaidBy || ns[0];
    let shares = {};
    if (addSplitType === 'equal') { ns.forEach(n => { shares[n] = amount / ns.length; }); }
    else if (addSplitType === 'ratio') {
      const totalRatio = Object.values(addProportions).reduce((s,v) => s + (parseFloat(v)||0), 0);
      if (totalRatio === 0) { showToast('Enter at least one ratio'); return; }
      ns.forEach(n => { const r = parseFloat(addProportions[n]) || 0; if (r > 0) shares[n] = (r / totalRatio) * amount; });
    } else if (addSplitType === 'percent') {
      const totalPct = Object.values(addPercentages).reduce((s,v) => s + (parseFloat(v)||0), 0);
      if (Math.abs(totalPct - 100) > 0.01) { showToast('Percentages must add up to 100%'); return; }
      ns.forEach(n => { const p = parseFloat(addPercentages[n]) || 0; if (p > 0) shares[n] = (p / 100) * amount; });
    } else if (addSplitType === 'exact') {
      ns.forEach(n => { const v = parseFloat(addExactAmounts[n]); if (v > 0) shares[n] = v; });
      const sum = Object.values(shares).reduce((a,b)=>a+b,0);
      if (Math.abs(sum - amount) > 0.01) { showToast('Exact amounts must equal total'); return; }
    } else if (addSplitType === 'payer') { shares = {[payer]: amount}; }
    shares = Object.fromEntries(Object.entries(shares).map(([k,v])=>[k,Math.round(v*100)/100]));

    let origCur = null, origAmt = null;
    if (addOrigCur && addOrigCur !== defCur && addOrigAmt) { origCur = addOrigCur; origAmt = parseFloat(addOrigAmt); }

    const row = {
      list_id: currentList.id, item: addItem.trim(), category: addCategory, date: addDate,
      original_currency: origCur, original_amount: origAmt, total_amount: Math.round(amount * 100) / 100,
      paid_by: payer, split_type: addSplitType, shares
    };
    const {data, error} = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setExpenses(prev => [data, ...prev]);
    setShowAddForm(false);
    setAddItem(''); setAddAmount(''); setAddCategory('Other'); setAddSplitType('equal');
    setAddExactAmounts({}); setAddProportions({}); setAddPercentages({});
    setAddOrigCur(''); setAddOrigAmt(''); setShowForeign(false);
    showToast('Added: ' + data.item);
    sendNotification(`New expense in ${currentList.name}`, `${myName} added ${data.item} — ${fmt(data.total_amount, defCur)}`);
  };

  const addExpense = async () => {
    if (!parsedPreview || !currentList) return;
    const row = {...parsedPreview, list_id: currentList.id};
    const {data, error} = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setExpenses(prev => [data, ...prev]);
    setInputText(''); setInputFocused(false);
    showToast('Added: ' + data.item);
    sendNotification(`New expense in ${currentList.name}`, `${myName} added ${data.item} — ${fmt(data.total_amount, defCur)}`);
  };

  /* ── Delete Expense ── */
  const deleteExpense = async (id) => {
    await sb.from('expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    setConfirmDelete(null);
    showToast('Deleted');
  };

  /* ── Edit Expense ── */
  const startEdit = (exp) => {
    setEditingId(exp.id);
    const hasOrig = exp.original_currency && exp.original_amount;
    setEditForm({
      item: exp.item, total_amount: exp.total_amount, category: exp.category,
      paid_by: exp.paid_by, date: exp.date, split_type: exp.split_type,
      shares: {...(exp.shares || {})},
      original_currency: exp.original_currency || '',
      original_amount: exp.original_amount ?? '',
      exchange_rate: hasOrig ? parseFloat((exp.total_amount / exp.original_amount).toFixed(6)) : 1,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const names = members.map(m => m.display_name);
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

    const {_computedShares, exchange_rate, ...cleanForm} = editForm;
    const upd = {
      ...cleanForm, total_amount: total, shares,
      original_currency: editForm.original_currency || null,
      original_amount: editForm.original_currency ? (parseFloat(editForm.original_amount) || null) : null,
    };
    const {error} = await sb.from('expenses').update(upd).eq('id', editingId);
    if (error) { showToast('Error: '+error.message); return; }

    const oldExp = expenses.find(e => e.id === editingId);
    if (oldExp && oldExp.category !== editForm.category) {
      const newOv = {...catOverrides};
      newOv[editForm.item.toLowerCase().trim()] = editForm.category;
      sigWords(editForm.item).forEach(w => { newOv[w] = editForm.category; });
      setCatOverrides(newOv);
      saveSetting('categoryOverrides', newOv);
      let count = 0;
      const updated = expenses.map(e => {
        if (e.id === editingId) return {...e, ...upd};
        const sw = sigWords(e.item);
        const lo = e.item.toLowerCase().trim();
        if (lo === editForm.item.toLowerCase().trim() || sw.some(w => newOv[w] === editForm.category)) {
          count++; return {...e, category: editForm.category};
        }
        return e;
      });
      setExpenses(updated);
      if (count > 0) {
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
    sendNotification(`Expense updated in ${currentList.name}`, `${myName} updated ${upd.item} — ${fmt(upd.total_amount, defCur)}`);
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
      e.item?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q) ||
      e.date?.includes(q) || e.paid_by?.toLowerCase().includes(q) ||
      e.original_currency?.toLowerCase().includes(q)
    );
  }, [expenses, search]);

  /* ── Stats Data ── */
  const months = useMemo(() => {
    const ms = new Set(expenses.map(e => e.date?.slice(0,7)).filter(Boolean));
    return [...ms].sort().reverse();
  }, [expenses]);

  useEffect(() => { if (months.length && !selMonth) setSelMonth(months[0]); }, [months]);

  const monthExpenses = useMemo(() =>
    expenses.filter(e => e.date?.startsWith(selMonth)),
  [expenses, selMonth]);

  const allCats = useMemo(() => {
    const merged = {...BASE_CATS};
    members.forEach((m,i) => {
      merged[m.display_name] = {emoji:'👤', c:PERSON_COLORS[i%PERSON_COLORS.length], bg:'#eef2ff', tx:'#4338ca'};
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
    a.download = `splitease-${currentList?.name || 'backup'}-${today()}.json`; a.click();
  };

  const exportCSV = () => {
    const ns = members.map(m => m.display_name);
    const hdr = ['item','category','date','original_currency','original_amount','total_amount','paid_by','split_type',...ns.map(n=>`share_${n}`)];
    const rows = expenses.map(e => [
      `"${(e.item||'').replace(/"/g,'""')}"`, e.category, e.date,
      e.original_currency||'', e.original_amount||'', e.total_amount,
      e.paid_by, e.split_type, ...ns.map(n => e.shares?.[n] || 0)
    ]);
    const csv = [hdr.join(','), ...rows.map(r=>r.join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = `splitease-${today()}.csv`; a.click();
  };

  const importJSON = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.expenses && currentList) {
          await sb.from('expenses').delete().eq('list_id', currentList.id);
          const rows = d.expenses.map(exp => ({
            list_id: currentList.id, item: exp.item, category: exp.category,
            date: exp.date, original_currency: exp.original_currency,
            original_amount: exp.original_amount, total_amount: exp.total_amount,
            paid_by: exp.paid_by, split_type: exp.split_type, shares: exp.shares || {}
          }));
          const {data} = await sb.from('expenses').insert(rows).select();
          setExpenses(data || []);
          if (d.catOverrides) { setCatOverrides(d.catOverrides); saveSetting('categoryOverrides', d.catOverrides); }
          if (d.customCats) { setCustomCats(d.customCats); saveSetting('customCats', d.customCats); }
          showToast(`Imported ${rows.length} expenses`);
        }
      } catch(err) { showToast('Import error: '+err.message); }
    };
    reader.readAsText(file); e.target.value = '';
  };

  const importCSV = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('Empty CSV');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const ns = members.map(m => m.display_name);
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const vals = []; let current = '', inQuotes = false;
          for (const ch of lines[i]) {
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = ''; }
            else { current += ch; }
          }
          vals.push(current.trim());
          const get = (key) => vals[headers.indexOf(key)] || '';
          const shares = {};
          let hasNewShares = false;
          for (const n of ns) {
            const idx = headers.indexOf(`share_${n.toLowerCase()}`);
            if (idx >= 0 && vals[idx]) { shares[n] = parseFloat(vals[idx]) || 0; hasNewShares = true; }
          }
          if (!hasNewShares && headers.includes('your_share')) {
            const ys = parseFloat(get('your_share')) || 0;
            const ps = parseFloat(get('partner_share')) || 0;
            if (ns.length >= 1) shares[ns[0]] = ys;
            if (ns.length >= 2) shares[ns[1]] = ps;
          }
          if (Object.keys(shares).length === 0) {
            const total = parseFloat(get('total_amount')) || 0;
            ns.forEach(n => { shares[n] = total / Math.max(ns.length, 1); });
          }
          rows.push({
            list_id: currentList.id, item: get('item') || 'Imported',
            category: get('category') || 'Other', date: get('date') || today(),
            original_currency: get('original_currency') || null,
            original_amount: parseFloat(get('original_amount')) || null,
            total_amount: parseFloat(get('total_amount')) || 0,
            paid_by: get('paid_by') || ns[0] || 'Unknown',
            split_type: get('split_type') || 'equal', shares
          });
        }
        if (rows.length > 0) {
          const {data} = await sb.from('expenses').insert(rows).select();
          setExpenses(prev => [...(data||[]), ...prev]);
          showToast(`Imported ${rows.length} expenses from CSV`);
        }
      } catch(err) { showToast('CSV import error: ' + err.message); }
    };
    reader.readAsText(file); e.target.value = '';
  };

  /* ── Add Custom Category ── */
  const addCustomCat = () => {
    if (!newCatName.trim()) return;
    const n = newCatName.trim();
    const idx = Object.keys(customCats).length % CUST_COLORS.length;
    const newC = {...customCats, [n]: {emoji:'🏷️', c:CUST_COLORS[idx], bg:'#ecfeff', tx:'#0e7490'}};
    setCustomCats(newC);
    saveSetting('customCats', newC);
    setNewCatName('');
    showToast('Added category: ' + n);
  };

  const deleteCustomCat = async (name) => {
    const nc = {...customCats}; delete nc[name];
    setCustomCats(nc); saveSetting('customCats', nc);
    const updated = expenses.map(e => {
      if (e.category === name) { return {...e, category: detectCategory(e.item, catOverrides, nc)}; }
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
  const updateMyName = async (newN) => {
    if (!newN.trim() || !currentList) return;
    const oldName = myName;
    await sb.from('list_members').update({display_name: newN.trim()}).eq('list_id',currentList.id).eq('user_id',user.id);
    setMyName(newN.trim());
    setMembers(prev => prev.map(m => m.user_id===user.id ? {...m,display_name:newN.trim()} : m));
    if (oldName !== newN.trim()) {
      const updated = expenses.map(e => {
        let changed = false; let ne = {...e};
        if (e.paid_by === oldName) { ne.paid_by = newN.trim(); changed = true; }
        if (e.shares && e.shares[oldName] !== undefined) {
          const ns = {...e.shares}; ns[newN.trim()] = ns[oldName]; delete ns[oldName];
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

  const catInfo = (name) => getCat(name, customCats, members);

  // ── Toast ──
  const ToastEl = (
    <AnimatePresence>
      {toast.show && (
        <motion.div initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}}
          style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',zIndex:99,background:'#222',color:'#f5f5ee',padding:'10px 20px',borderRadius:16,fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:700,textAlign:'center',fontFamily:MONO,maxWidth:320,boxShadow:'0 8px 32px rgba(0,0,0,0.2)'}}>
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Confirm Delete Modal ──
  const ConfirmModal = confirmDelete !== null && (
    <div style={{position:'fixed',inset:0,zIndex:90,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={()=>setConfirmDelete(null)}>
      <div style={{...s.card,margin:16,maxWidth:360,width:'100%'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,...s.upper,fontWeight:700,marginBottom:8}}>Delete Expense?</div>
        <div style={{fontSize:12,opacity:0.5,lineHeight:1.6,marginBottom:20}}>This action cannot be undone.</div>
        <div style={{display:'flex',gap:8}}>
          <button style={s.sm(false)} onClick={()=>setConfirmDelete(null)}>Cancel</button>
          <button style={s.sm(true)} onClick={()=>deleteExpense(confirmDelete)}>Delete</button>
        </div>
      </div>
    </div>
  );

  // ── Loading ──
  if (authLoading) return (
    <div style={s.centerPage}>
      <style>{THEME_CSS}</style>
      <motion.div animate={{rotate:360}} transition={{repeat:Infinity,duration:1}}
        style={{width:40,height:40,border:'4px solid #222',borderTopColor:'transparent',borderRadius:'50%'}}/>
    </div>
  );

  // ── Auth Screen ──
  if (!user) return (
    <div className="se" style={s.centerPage}>
      <style>{THEME_CSS}</style>
      {ToastEl}
      <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}}
        style={{...s.card,width:'100%',maxWidth:380,padding:'32px 24px'}}>
        <div style={{fontSize:32,fontWeight:700,...s.upper,letterSpacing:'-0.02em',textAlign:'center',marginBottom:4}}>💰 SplitEase</div>
        <div style={{...s.label,textAlign:'center',marginBottom:24}}>{authMode==='login'?'Welcome back':'Create an account'}</div>
        {authError && <div style={{background:'#fef2f2',color:'#dc2626',fontSize:12,padding:8,borderRadius:12,marginBottom:12}}>{authError}</div>}
        <div style={{marginBottom:12}}>
          <div style={s.label}>Email</div>
          <input type="email" placeholder="you@email.com" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}
            style={s.input}/>
        </div>
        <div style={{marginBottom:16,position:'relative'}}>
          <div style={s.label}>Password</div>
          <input type={showPass?'text':'password'} placeholder="••••••••" value={authPass}
            onChange={e=>setAuthPass(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleAuth();}}
            style={{...s.input,paddingRight:40}}/>
          <button onClick={()=>setShowPass(!showPass)} style={{position:'absolute',right:12,bottom:12,background:'none',border:'none',cursor:'pointer',opacity:0.3}}>
            {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
          </button>
        </div>
        <button onClick={handleAuth} disabled={authBusy} style={{...s.btnDark,opacity:authBusy?0.5:1,marginBottom:12}}>
          {authBusy ? '...' : authMode==='login' ? 'Log In' : 'Sign Up'}
        </button>
        <p style={{textAlign:'center',fontSize:11,...s.upper,opacity:0.35}}>
          {authMode==='login' ? "Don't have an account? " : 'Already have an account? '}
          <button style={{...s.ghost,opacity:1,fontWeight:700,padding:0}} onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthError('');}}>
            {authMode==='login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </motion.div>
    </div>
  );

  // ── List Selection ──
  if (!currentList) return (
    <div className="se" style={s.centerPage}>
      <style>{THEME_CSS}</style>
      {ToastEl}
      <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}}
        style={{...s.card,width:'100%',maxWidth:380,padding:'32px 24px'}}>

        {listScreen === 'select' && (<>
          <div style={{fontSize:24,fontWeight:700,...s.upper,letterSpacing:'-0.02em',marginBottom:2}}>💰 SplitEase</div>
          <div style={{...s.label,marginBottom:20}}>{user.email}</div>
          {lists.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{...s.label,marginBottom:8}}>Your Lists</div>
              {lists.map(l => (
                <button key={l.id} onClick={()=>selectList(l)}
                  style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'#F0F0EA',borderRadius:12,border:'none',cursor:'pointer',textAlign:'left',marginBottom:8,fontFamily:MONO,transition:'background 0.2s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#e8e8df'}
                  onMouseLeave={e=>e.currentTarget.style.background='#F0F0EA'}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,...s.upper}}>{l.name}</div>
                    <div style={{fontSize:10,opacity:0.35,...s.upper,marginTop:2}}>{l.default_currency} • as {l.myDisplayName}</div>
                  </div>
                  <ArrowRight size={14} style={{opacity:0.3}}/>
                </button>
              ))}
            </div>
          )}
          <button style={{...s.btnDark,marginBottom:8,display:'flex',alignItems:'center',justifyContent:'center',gap:6}} onClick={()=>setListScreen('create')}>
            <Plus size={16}/> New Expense List
          </button>
          <button style={{...s.btnOutline,display:'flex',alignItems:'center',justifyContent:'center',gap:6}} onClick={()=>setListScreen('join')}>
            <UserPlus size={16}/> Join with Code
          </button>
          <button style={{...s.ghost,display:'block',width:'100%',textAlign:'center',marginTop:12}} onClick={logout}>Log Out</button>
        </>)}

        {listScreen === 'create' && (<>
          <div style={{fontSize:18,fontWeight:700,...s.upper,marginBottom:16}}>Create New List</div>
          <div style={{marginBottom:12}}><input placeholder="List name (e.g. 'Housemates')" value={newListName} onChange={e=>setNewListName(e.target.value)} style={s.input}/></div>
          <div style={{marginBottom:12}}><input placeholder="Your display name" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)} style={s.input}/></div>
          <div style={{marginBottom:16}}>
            <select value={newListCur} onChange={e=>setNewListCur(e.target.value)} style={s.input}>
              {ALL_CUR.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button style={{...s.btnDark,marginBottom:8}} onClick={handleCreateList}>Create</button>
          <button style={{...s.ghost,display:'block',width:'100%',textAlign:'center'}} onClick={()=>setListScreen('select')}>Back</button>
        </>)}

        {listScreen === 'join' && (<>
          <div style={{fontSize:18,fontWeight:700,...s.upper,marginBottom:16}}>Join Expense List</div>
          <div style={{marginBottom:12}}><input placeholder="Invite code" value={joinCode} onChange={e=>setJoinCode(e.target.value)} style={s.input}/></div>
          <div style={{marginBottom:16}}><input placeholder="Your display name" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)} style={s.input}/></div>
          <button style={{...s.btnDark,marginBottom:8}} onClick={handleJoinList}>Join</button>
          <button style={{...s.ghost,display:'block',width:'100%',textAlign:'center'}} onClick={()=>setListScreen('select')}>Back</button>
        </>)}
      </motion.div>
    </div>
  );

  // ── Derived ──
  const names = members.map(m => m.display_name);
  const allCatNames = [...Object.keys(BASE_CATS), ...Object.keys(customCats), ...names];

  /* ════════════════════════════════════════════════════════════
     HOME TAB
     ════════════════════════════════════════════════════════════ */
  const HomeTab = () => (
    <div style={{paddingBottom:80}}>
      {/* Balance Header */}
      <div style={{background:'#222',color:'#f5f5ee',borderRadius:20,padding:20,margin:'16px 16px 0',boxShadow:'0 4px 20px rgba(0,0,0,0.15)'}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
          <div>
            <div style={{fontSize:18,fontWeight:700,...s.upper}}>{currentList.name}</div>
            <div style={{fontSize:10,...s.upper,opacity:0.5,marginTop:4}}>Logged in as {myName}</div>
          </div>
          <span style={{fontSize:10,...s.upper,fontWeight:700,background:'rgba(255,255,255,0.12)',padding:'6px 10px',borderRadius:9999}}>{defCur}</span>
        </div>

        {txns.length === 0 ? (
          <div style={{textAlign:'center',fontSize:12,...s.upper,opacity:0.6,padding:'10px 0'}}>All settled up! ✨</div>
        ) : (
          txns.map((t,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(255,255,255,0.08)',borderRadius:12,padding:'10px 14px',marginBottom:6,fontSize:12,...s.upper}}>
              <span>{t.from} owes {t.to}</span>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontWeight:700,...s.tabnum}}>{fmt(t.amount, defCur)}</span>
                <button onClick={()=>{setShowSettle(!showSettle);setSettleFrom(t.from);setSettleTo(t.to);setSettleAmt(t.amount.toString());}}
                  style={{fontFamily:MONO,fontSize:10,...s.upper,background:'rgba(255,255,255,0.2)',border:'none',color:'#f5f5ee',padding:'4px 10px',borderRadius:9999,cursor:'pointer'}}>
                  💸 Settle
                </button>
              </div>
            </div>
          ))
        )}

        {/* Spend Grid */}
        {(() => {
          const thisMonth = new Date().toISOString().slice(0,7);
          const lm = new Date(); lm.setDate(1); lm.setMonth(lm.getMonth()-1);
          const lastMonth = lm.toISOString().slice(0,7);
          const spend = {}; names.forEach(n => { spend[n] = {cur:0, prev:0}; });
          expenses.forEach(e => {
            const m = e.date?.slice(0,7);
            Object.entries(e.shares||{}).forEach(([n,a]) => {
              if (!spend[n]) return;
              if (m === thisMonth) spend[n].cur += a;
              else if (m === lastMonth) spend[n].prev += a;
            });
          });
          return (
            <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(names.length,2)}, 1fr)`,gap:8,marginTop:12}}>
              {names.map(n => (
                <div key={n} style={{background:'rgba(255,255,255,0.08)',borderRadius:12,padding:'10px 12px'}}>
                  <div style={{fontSize:10,...s.upper,opacity:0.5,marginBottom:4}}>{n}</div>
                  <div style={{fontSize:14,fontWeight:700,...s.tabnum}}>{fmt(spend[n].cur, defCur)}</div>
                  <div style={{fontSize:10,opacity:0.4,...s.upper,marginTop:2}}>this month</div>
                  <div style={{fontSize:10,opacity:0.3,...s.tabnum,marginTop:1}}>{fmt(spend[n].prev, defCur)} last month</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Settle Form */}
        <AnimatePresence>
          {showSettle && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} style={{overflow:'hidden'}}>
              <div style={{background:'rgba(255,255,255,0.08)',borderRadius:12,padding:12,marginTop:10}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                  <select value={settleFrom} onChange={e=>setSettleFrom(e.target.value)}
                    style={{flex:1,background:'rgba(255,255,255,0.15)',border:'none',color:'#f5f5ee',borderRadius:12,padding:'8px 10px',fontFamily:MONO,fontSize:12,outline:'none',...s.upper}}>
                    {names.map(n=><option key={n} value={n} style={{color:'#1a1a1a'}}>{n}</option>)}
                  </select>
                  <span style={{fontSize:10,...s.upper,opacity:0.5}}>paid</span>
                  <select value={settleTo} onChange={e=>setSettleTo(e.target.value)}
                    style={{flex:1,background:'rgba(255,255,255,0.15)',border:'none',color:'#f5f5ee',borderRadius:12,padding:'8px 10px',fontFamily:MONO,fontSize:12,outline:'none',...s.upper}}>
                    {names.filter(n=>n!==settleFrom).map(n=><option key={n} value={n} style={{color:'#1a1a1a'}}>{n}</option>)}
                  </select>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <input type="number" placeholder="0.00" value={settleAmt} onChange={e=>setSettleAmt(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')addSettlement();}}
                    style={{flex:1,background:'rgba(255,255,255,0.15)',border:'none',color:'#f5f5ee',borderRadius:12,padding:'8px 10px',fontFamily:MONO,fontSize:12,outline:'none',...s.tabnum}}/>
                  <button onClick={addSettlement}
                    style={{fontFamily:MONO,fontSize:11,...s.upper,fontWeight:700,background:'#f5f5ee',color:'#222',border:'none',padding:'8px 14px',borderRadius:12,cursor:'pointer'}}>
                    Record
                  </button>
                </div>
                {txns.length > 0 && (
                  <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:8}}>
                    {txns.map((t,i)=>(
                      <button key={i} onClick={()=>{setSettleFrom(t.from);setSettleTo(t.to);setSettleAmt(t.amount.toString());}}
                        style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#f5f5ee',borderRadius:9999,padding:'4px 10px',fontSize:10,...s.upper,cursor:'pointer',fontFamily:MONO}}>
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
            style={{...s.card,margin:'12px 16px 0',border:'2px solid #222',padding:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <span style={{fontSize:12,...s.upper,fontWeight:700}}>Add Expense</span>
              <button onClick={()=>setShowAddForm(false)} style={{background:'none',border:'none',cursor:'pointer',opacity:0.3}}><X size={18}/></button>
            </div>
            <div style={{marginBottom:8}}><input placeholder="Item name" value={addItem} onChange={e=>setAddItem(e.target.value)} style={s.input}/></div>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <input type="number" placeholder="0.00" value={addAmount} onChange={e=>setAddAmount(e.target.value)} style={s.input}/>
              <select value={addCategory} onChange={e=>setAddCategory(e.target.value)} style={s.input}>
                {allCatNames.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <select value={addPaidBy||names[0]} onChange={e=>setAddPaidBy(e.target.value)} style={s.input}>
                {names.map(n=><option key={n} value={n}>{n} paid</option>)}
              </select>
              <input type="date" value={addDate} onChange={e=>setAddDate(e.target.value)} style={s.input}/>
            </div>

            {/* Foreign currency */}
            <div style={{fontSize:10,...s.upper,opacity:0.35,cursor:'pointer',padding:'4px 0',marginBottom:8}} onClick={()=>setShowForeign(!showForeign)}>
              {showForeign?'▾':'▸'} Foreign currency?
            </div>
            {showForeign && (
              <div style={{display:'flex',gap:8,marginBottom:8}}>
                <select value={addOrigCur} onChange={e=>{setAddOrigCur(e.target.value);if(e.target.value&&addOrigAmt)setAddAmount(cvt(parseFloat(addOrigAmt),e.target.value,defCur,rates).toFixed(2));}} style={s.input}>
                  <option value="">None</option>
                  {ALL_CUR.filter(c=>c!==defCur).map(c=><option key={c} value={c}>{CURR_FLAG[c]} {c}</option>)}
                </select>
                <input type="number" placeholder="Original amount" value={addOrigAmt}
                  onChange={e=>{setAddOrigAmt(e.target.value);if(addOrigCur&&e.target.value)setAddAmount(cvt(parseFloat(e.target.value),addOrigCur,defCur,rates).toFixed(2));}}
                  style={s.input}/>
              </div>
            )}

            {/* Split type */}
            <div style={{...s.label,marginBottom:6}}>Split type</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:12}}>
              {['equal','ratio','percent','exact','payer'].map(st=>(
                <button key={st} style={s.split(addSplitType===st)} onClick={()=>setAddSplitType(st)}>{st}</button>
              ))}
            </div>

            {/* Ratio inputs */}
            {addSplitType === 'ratio' && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,opacity:0.4,...s.upper,marginBottom:6}}>Enter ratio for each person (0 = excluded)</div>
                {names.map(n => (
                  <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize:12,width:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',...s.upper}}>{n}</span>
                    <input type="number" min="0" placeholder="0" value={addProportions[n]||''} onChange={e=>setAddProportions(p=>({...p,[n]:e.target.value}))} style={{...s.input,flex:1}}/>
                    <span style={{fontSize:10,opacity:0.35,...s.upper}}>parts</span>
                  </div>
                ))}
                {addAmount > 0 && (() => {
                  const total = Object.values(addProportions).reduce((ss,v) => ss + (parseFloat(v)||0), 0);
                  if (total === 0) return null;
                  return (
                    <div style={{background:'#F0F0EA',borderRadius:12,padding:8,fontSize:10,...s.upper}}>
                      <div style={{fontWeight:700,marginBottom:4}}>Preview:</div>
                      {names.filter(n => parseFloat(addProportions[n]) > 0).map(n => (
                        <div key={n} style={{display:'flex',justifyContent:'space-between',opacity:0.6}}>
                          <span>{n} ({addProportions[n]} of {total} = {((parseFloat(addProportions[n])/total)*100).toFixed(1)}%)</span>
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
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,opacity:0.4,...s.upper,marginBottom:6}}>Enter percentage (must total 100%)</div>
                {names.map(n => (
                  <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize:12,width:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',...s.upper}}>{n}</span>
                    <input type="number" min="0" max="100" placeholder="0" value={addPercentages[n]||''} onChange={e=>setAddPercentages(p=>({...p,[n]:e.target.value}))} style={{...s.input,flex:1}}/>
                    <span style={{fontSize:10,opacity:0.35}}>%</span>
                  </div>
                ))}
                {(() => {
                  const total = Object.values(addPercentages).reduce((ss,v) => ss + (parseFloat(v)||0), 0);
                  const isValid = Math.abs(total - 100) < 0.01;
                  return (
                    <div style={{fontSize:10,padding:8,borderRadius:12,background:isValid?'#f0fdf4':'#fef2f2',color:isValid?'#15803d':'#dc2626'}}>
                      Total: {total.toFixed(1)}% {isValid?'✓':`(${total < 100 ? 'need '+(100-total).toFixed(1)+'% more' : (total-100).toFixed(1)+'% over'})`}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Exact inputs */}
            {addSplitType === 'exact' && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,opacity:0.4,...s.upper,marginBottom:6}}>Enter exact amount (must total {addAmount || '0'})</div>
                {names.map(n => (
                  <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize:12,width:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',...s.upper}}>{n}</span>
                    <input type="number" min="0" placeholder="0" value={addExactAmounts[n]||''} onChange={e=>setAddExactAmounts(p=>({...p,[n]:e.target.value}))} style={{...s.input,flex:1}}/>
                  </div>
                ))}
                {(() => {
                  const sum = Object.values(addExactAmounts).reduce((ss,v) => ss + (parseFloat(v)||0), 0);
                  const target = parseFloat(addAmount) || 0;
                  const diff = target - sum;
                  return <div style={{fontSize:10,padding:8,borderRadius:12,background:Math.abs(diff)<0.01?'#f0fdf4':'#fef2f2',color:Math.abs(diff)<0.01?'#15803d':'#dc2626'}}>
                    Total: {fmt(sum, defCur)} {Math.abs(diff)<0.01?'✓':`(${diff > 0 ? fmt(diff,defCur)+' remaining' : fmt(-diff,defCur)+' over'})`}
                  </div>;
                })()}
              </div>
            )}

            {addSplitType === 'payer' && (
              <div style={{fontSize:10,opacity:0.4,...s.upper,background:'#F0F0EA',borderRadius:12,padding:8,marginBottom:12}}>
                Entire amount assigned to the payer — no split.
              </div>
            )}

            <button style={s.btnDark} onClick={addManualExpense}>Add Expense</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Input */}
      <div style={{...s.card,margin:'12px 16px 0',padding:0,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'14px 16px'}}>
          <button onClick={()=>{setShowAddForm(!showAddForm);setAddPaidBy(myName);}}
            style={{background:'none',border:'none',cursor:'pointer',opacity:showAddForm?1:0.3,transition:'all 0.2s',transform:showAddForm?'rotate(45deg)':'none'}}>
            <Plus size={18}/>
          </button>
          <input ref={inputRef} placeholder="Add expense… e.g. 'dinner ¥500 Sam paid'" value={inputText}
            onChange={e=>setInputText(e.target.value)} onFocus={()=>setInputFocused(true)}
            onKeyDown={e=>{if(e.key==='Enter'&&parsedPreview)addExpense();}}
            style={{flex:1,fontSize:12,outline:'none',background:'transparent',border:'none',fontFamily:MONO,color:'#1a1a1a',letterSpacing:'0.04em'}}/>
          {inputText && <button onClick={()=>{setInputText('');setInputFocused(false);}} style={{background:'none',border:'none',cursor:'pointer',opacity:0.3}}><X size={16}/></button>}
          {parsedPreview && <button onClick={addExpense} style={{background:'#222',color:'#f5f5ee',border:'none',width:32,height:32,borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Send size={14}/></button>}
        </div>
        <AnimatePresence>
          {inputFocused && parsedPreview && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} style={{overflow:'hidden'}}>
              <div style={{borderTop:'1px solid #eee',padding:'12px 16px',fontSize:12}}>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                  <span style={{fontSize:14,fontWeight:700,...s.upper}}>{parsedPreview.item}</span>
                  <span style={s.tag(catInfo(parsedPreview.category).bg, catInfo(parsedPreview.category).tx)}>
                    {catInfo(parsedPreview.category).emoji} {parsedPreview.category}
                  </span>
                </div>
                <div style={{fontSize:18,fontWeight:700,...s.tabnum,marginTop:4}}>{fmt(parsedPreview.total_amount, defCur)}</div>
                {parsedPreview.original_currency && (
                  <span style={{...s.tag('#fef3c7','#92400e'),marginTop:4}}>
                    {CURR_FLAG[parsedPreview.original_currency]||''} {fmt(parsedPreview.original_amount, parsedPreview.original_currency)}
                  </span>
                )}
                <div style={{opacity:0.35,marginTop:4,...s.upper}}>Paid by <strong>{parsedPreview.paid_by}</strong> • {parsedPreview.split_type}</div>
                {Object.keys(parsedPreview.shares).length > 0 && (
                  <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
                    {Object.entries(parsedPreview.shares).map(([n,a])=>(
                      <span key={n} style={{fontSize:10,...s.upper,background:'#F0F0EA',padding:'4px 8px',borderRadius:9999,...s.tabnum}}>{n}: {fmt(a,defCur)}</span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Search */}
      <div style={{margin:'12px 16px 0',position:'relative'}}>
        <Search size={14} style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',opacity:0.3}}/>
        <input placeholder="Search expenses…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{...s.input,paddingLeft:36,borderRadius:12,border:'1px solid #eee',background:'#fff'}}/>
      </div>

      {/* Expense List */}
      <div style={{padding:'12px 16px'}}>
        <AnimatePresence>
          {filtered.map(exp => {
            const ci = catInfo(exp.category);
            const isEditing = editingId === exp.id;
            return (
              <motion.div key={exp.id} layout initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,x:-100}}
                style={{...s.card,marginBottom:10,padding:0,overflow:'hidden'}}>
                {!isEditing ? (
                  <div style={{padding:'14px 16px'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:10,flex:1,minWidth:0}}>
                        <span style={{fontSize:20,flexShrink:0,marginTop:1}}>{ci.emoji}</span>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:700,...s.upper,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{exp.item}</div>
                          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6,alignItems:'center'}}>
                            <span style={s.tag(ci.bg,ci.tx)}>{exp.category}</span>
                            <span style={s.tag('#F0F0EA','#1a1a1a')}>{exp.date}</span>
                            {exp.original_currency && <span style={s.tag('#fef3c7','#92400e')}>{CURR_FLAG[exp.original_currency]||''} {fmt(exp.original_amount, exp.original_currency)}</span>}
                            <span style={{...s.tag('#F0F0EA','#1a1a1a'),opacity:0.5}}>{exp.split_type}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontSize:14,fontWeight:700,...s.tabnum}}>{fmt(exp.total_amount, defCur)}</div>
                        <div style={{fontSize:10,...s.upper,opacity:0.35,marginTop:2}}>{exp.paid_by} paid</div>
                      </div>
                    </div>
                    {exp.shares && Object.keys(exp.shares).length > 1 && (
                      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:8}}>
                        {Object.entries(exp.shares).map(([n,a])=>(
                          <span key={n} style={{fontSize:10,...s.upper,background:'#F0F0EA',padding:'4px 8px',borderRadius:9999,...s.tabnum}}>{n}: {fmt(a,defCur)}</span>
                        ))}
                      </div>
                    )}
                    <div style={{display:'flex',gap:4,justifyContent:'flex-end',marginTop:8}}>
                      <button onClick={()=>startEdit(exp)} style={{width:32,height:32,borderRadius:12,border:'none',background:'transparent',cursor:'pointer',opacity:0.2,display:'flex',alignItems:'center',justifyContent:'center',transition:'opacity 0.2s'}}
                        onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.2'}><Pencil size={14}/></button>
                      <button onClick={()=>setConfirmDelete(exp.id)} style={{width:32,height:32,borderRadius:12,border:'none',background:'transparent',cursor:'pointer',opacity:0.2,display:'flex',alignItems:'center',justifyContent:'center',transition:'opacity 0.2s'}}
                        onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.2'}><Trash2 size={14}/></button>
                    </div>
                  </div>
                ) : (
                  <div style={{padding:'14px 16px',background:'#fafaf8'}}>
                    <div style={{marginBottom:8}}><input value={editForm.item} onChange={e=>setEditForm({...editForm,item:e.target.value})} style={s.input}/></div>
                    {/* Amount + Currency */}
                    <div style={{display:'flex',gap:8,marginBottom:8}}>
                      <input type="number"
                        value={editForm.original_currency ? editForm.original_amount : editForm.total_amount}
                        onChange={e => {
                          const val = e.target.value;
                          if (editForm.original_currency) {
                            const rate = parseFloat(editForm.exchange_rate) || 0;
                            setEditForm({...editForm, original_amount: val, total_amount: parseFloat(((parseFloat(val)||0) * rate).toFixed(2))});
                          } else {
                            setEditForm({...editForm, total_amount: val});
                          }
                        }}
                        style={s.input} placeholder="Amount"/>
                      <select
                        value={editForm.original_currency || defCur}
                        onChange={e => {
                          const cur = e.target.value;
                          if (cur === defCur) {
                            setEditForm(f => ({...f, original_currency: '', original_amount: '', exchange_rate: 1}));
                          } else {
                            const rate = rates[cur] ? parseFloat((1 / rates[cur]).toFixed(6)) : 1;
                            if (!editForm.original_currency) {
                              const total = parseFloat(editForm.total_amount) || 0;
                              const origAmt = rate > 0 ? parseFloat((total / rate).toFixed(NO_DEC.has(cur)?0:2)) : 0;
                              setEditForm(f => ({...f, original_currency: cur, original_amount: origAmt, exchange_rate: rate}));
                            } else {
                              setEditForm(f => {
                                const origAmt = parseFloat(f.original_amount) || 0;
                                return {...f, original_currency: cur, exchange_rate: rate, total_amount: parseFloat((origAmt * rate).toFixed(2))};
                              });
                            }
                          }
                        }}
                        style={{...s.input, maxWidth: 120}}>
                        {ALL_CUR.map(c => <option key={c} value={c}>{CURR_FLAG[c]||''} {c}</option>)}
                      </select>
                    </div>

                    {/* Exchange rate row — only for foreign currency */}
                    {editForm.original_currency && (
                      <div style={{background:'#fef9e7',border:'1px solid #f0e6c0',borderRadius:12,padding:'8px 12px',marginBottom:8,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <span style={{fontSize:10,...s.upper,opacity:0.5,whiteSpace:'nowrap'}}>1 {editForm.original_currency} =</span>
                        <input type="number" step="0.000001"
                          value={editForm.exchange_rate}
                          onChange={e => {
                            const rate = e.target.value;
                            const origAmt = parseFloat(editForm.original_amount) || 0;
                            setEditForm({...editForm, exchange_rate: rate, total_amount: parseFloat((origAmt * (parseFloat(rate)||0)).toFixed(2))});
                          }}
                          style={{...s.input,width:100,background:'#fff',padding:'6px 10px',flex:'0 0 auto'}}/>
                        <span style={{fontSize:10,...s.upper,opacity:0.5}}>{defCur}</span>
                        <span style={{fontSize:11,fontWeight:700,...s.tabnum,marginLeft:'auto'}}>≈ {fmt(parseFloat(editForm.total_amount)||0, defCur)}</span>
                      </div>
                    )}

                    {/* Category */}
                    <div style={{marginBottom:8}}>
                      <select value={editForm.category} onChange={e=>setEditForm({...editForm,category:e.target.value})} style={s.input}>
                        {allCatNames.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div style={{display:'flex',gap:8,marginBottom:8}}>
                      <select value={editForm.paid_by} onChange={e=>setEditForm({...editForm,paid_by:e.target.value})} style={s.input}>
                        {names.map(n=><option key={n} value={n}>{n}</option>)}
                      </select>
                      <input type="date" value={editForm.date} onChange={e=>setEditForm({...editForm,date:e.target.value})} style={s.input}/>
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                      {['equal','ratio','percent','personal','full','custom'].map(ss=>(
                        <button key={ss} style={s.split(editForm.split_type===ss)} onClick={()=>{
                          const total = parseFloat(editForm.total_amount) || 0;
                          let shares = {};
                          if (ss==='equal') names.forEach(n=>{shares[n]=total/names.length;});
                          else if (ss==='personal') shares = {[editForm.paid_by]:total};
                          else if (ss==='full') shares = {[names[0]]:total};
                          else shares = {...editForm.shares};
                          setEditForm({...editForm,split_type:ss,shares});
                        }}>{ss}</button>
                      ))}
                    </div>
                    {editForm.split_type==='ratio' && (
                      <div style={{marginBottom:8}}>
                        {names.map(n=>(
                          <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <span style={{fontSize:11,width:50,...s.upper,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n}</span>
                            <input type="number" min="0" placeholder="0" value={editForm.shares?.[n]||''} onChange={e=>{
                              const ns2 = {...editForm.shares, [n]:e.target.value};
                              const total = parseFloat(editForm.total_amount)||0;
                              const sum = Object.values(ns2).reduce((ss2,v)=>ss2+(parseFloat(v)||0),0);
                              if (sum > 0) {
                                const computed = {};
                                names.forEach(nm=>{const r=parseFloat(ns2[nm])||0; if(r>0) computed[nm]=Math.round((r/sum)*total*100)/100;});
                                setEditForm({...editForm,shares:ns2,_computedShares:computed});
                              } else setEditForm({...editForm,shares:ns2});
                            }} style={{...s.input,flex:1,padding:'8px 10px'}}/>
                            <span style={{fontSize:10,opacity:0.35,...s.upper}}>parts</span>
                          </div>
                        ))}
                        {editForm._computedShares && (
                          <div style={{background:'#F0F0EA',borderRadius:8,padding:6,fontSize:10,opacity:0.6}}>
                            {Object.entries(editForm._computedShares).map(([n,a])=><span key={n} style={{marginRight:8}}>{n}: {fmt(a,defCur)}</span>)}
                          </div>
                        )}
                      </div>
                    )}
                    {editForm.split_type==='percent' && (
                      <div style={{marginBottom:8}}>
                        {names.map(n=>(
                          <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <span style={{fontSize:11,width:50,...s.upper,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n}</span>
                            <input type="number" min="0" max="100" placeholder="0" value={editForm.shares?.[n]||''} onChange={e=>setEditForm({...editForm,shares:{...editForm.shares,[n]:e.target.value}})} style={{...s.input,flex:1,padding:'8px 10px'}}/>
                            <span style={{fontSize:10,opacity:0.35}}>%</span>
                          </div>
                        ))}
                        {(()=>{const sum=Object.values(editForm.shares||{}).reduce((ss2,v)=>ss2+(parseFloat(v)||0),0);return <div style={{fontSize:10,padding:4,color:Math.abs(sum-100)<0.01?'#15803d':'#dc2626'}}>Total: {sum.toFixed(1)}%</div>;})()}
                      </div>
                    )}
                    {(editForm.split_type==='custom'||editForm.split_type==='full') && (
                      <div style={{marginBottom:8}}>
                        {names.map(n=>(
                          <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <span style={{fontSize:11,width:50,...s.upper,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n}</span>
                            <input type="number" value={editForm.shares?.[n]||0} onChange={e=>setEditForm({...editForm,shares:{...editForm.shares,[n]:parseFloat(e.target.value)||0}})} style={{...s.input,flex:1,padding:'8px 10px'}}/>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                      <button style={s.sm(false)} onClick={()=>setEditingId(null)}>Cancel</button>
                      <button style={s.sm(true)} onClick={saveEdit}>Save</button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div style={{textAlign:'center',padding:'60px 16px',fontSize:12,...s.upper,opacity:0.2}}>
            {expenses.length === 0 ? 'No expenses yet. Add one above!' : 'No results found.'}
          </div>
        )}
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════
     STATS TAB
     ════════════════════════════════════════════════════════════ */
  const StatsTab = () => {
    const personTotals = {};
    names.forEach(n => { personTotals[n] = 0; });
    monthExpenses.forEach(e => {
      Object.entries(e.shares||{}).forEach(([n,a]) => { personTotals[n] = (personTotals[n]||0) + a; });
    });
    const grandTotal = Object.values(personTotals).reduce((ss,v)=>ss+v, 0);

    const visExps = personFilter ? monthExpenses.filter(e => e.shares?.[personFilter] > 0) : monthExpenses;
    const catTotals = {};
    visExps.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + e.total_amount; });
    const catData = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));

    const monthlyData = {};
    expenses.forEach(e => {
      const m = e.date?.slice(0,7); if (!m) return;
      if (!monthlyData[m]) { monthlyData[m] = {}; names.forEach(n=>{monthlyData[m][n]=0;}); }
      Object.entries(e.shares||{}).forEach(([n,a])=>{ monthlyData[m][n] = (monthlyData[m][n]||0) + a; });
    });
    const barData = Object.entries(monthlyData).sort((a,b)=>a[0].localeCompare(b[0])).map(([m,d])=>({month:m,...d}));

    return (
      <div style={{paddingBottom:80,padding:16}}>
        {/* Month pills */}
        <div className="se-noscroll" style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:8}}>
          {months.map(m=>(
            <button key={m} style={s.chip(selMonth===m)} onClick={()=>setSelMonth(m)}>{m}</button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="se-noscroll" style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4,marginTop:12}}>
          <button onClick={()=>setPersonFilter('')}
            style={{...s.card,flexShrink:0,minWidth:100,padding:12,textAlign:'center',cursor:'pointer',border:'none',fontFamily:MONO,...(!personFilter?{background:'#222',color:'#f5f5ee'}:{})}}>
            <div style={{fontSize:10,...s.upper,opacity:0.5}}>Together</div>
            <div style={{fontSize:14,fontWeight:700,...s.tabnum,marginTop:4}}>{fmt(grandTotal,defCur)}</div>
          </button>
          {names.map((n,i)=>(
            <button key={n} onClick={()=>setPersonFilter(personFilter===n?'':n)}
              style={{...s.card,flexShrink:0,minWidth:100,padding:12,textAlign:'center',cursor:'pointer',border:'none',fontFamily:MONO,...(personFilter===n?{background:PERSON_COLORS[i%PERSON_COLORS.length],color:'#fff'}:{})}}>
              <div style={{fontSize:10,...s.upper,opacity:0.5}}>{n}</div>
              <div style={{fontSize:14,fontWeight:700,...s.tabnum,marginTop:4}}>{fmt(personTotals[n]||0,defCur)}</div>
            </button>
          ))}
        </div>

        {/* Bar Chart */}
        {barData.length > 0 && (
          <div style={{...s.card,padding:16,marginTop:12}}>
            <div style={{...s.label,marginBottom:12}}>Monthly by Person</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <XAxis dataKey="month" tick={{fontSize:10,fontFamily:MONO}} tickFormatter={v=>v.slice(5)}/>
                <YAxis tick={{fontSize:10,fontFamily:MONO}} width={40}/>
                <RTooltip formatter={(v,n)=>[fmt(v,defCur),n]} contentStyle={{fontFamily:MONO,fontSize:11}}/>
                {names.map((n,i)=>(<Bar key={n} dataKey={n} fill={PERSON_COLORS[i%PERSON_COLORS.length]} opacity={personFilter&&personFilter!==n?0.2:1} radius={[3,3,0,0]}/>))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Pie Chart */}
        {catData.length > 0 && (
          <div style={{...s.card,padding:16,marginTop:12}}>
            <div style={{...s.label,marginBottom:12}}>Categories</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}
                  style={{fontSize:9,fontFamily:MONO}}>
                  {catData.map((dd,i)=>(<Cell key={i} fill={getCat(dd.name,customCats,members).c || '#6b7280'}/>))}
                </Pie>
                <RTooltip formatter={(v)=>fmt(v,defCur)} contentStyle={{fontFamily:MONO,fontSize:11}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Breakdown */}
        {catData.length > 0 && (
          <div style={{...s.card,padding:16,marginTop:12}}>
            <div style={{...s.label,marginBottom:12}}>Breakdown</div>
            {catData.map(({name,value})=>{
              const ci = getCat(name,customCats,members);
              const pct = grandTotal > 0 ? (value/grandTotal*100) : 0;
              return (
                <div key={name} style={{marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:12,...s.upper}}>
                    <span>{ci.emoji} {name}</span>
                    <span style={{fontWeight:700,...s.tabnum}}>{fmt(value,defCur)} <span style={{fontSize:10,opacity:0.35}}>({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{height:6,background:'#F0F0EA',borderRadius:99,marginTop:4,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:99,width:`${pct}%`,background:ci.c,transition:'width 0.5s ease'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  /* ════════════════════════════════════════════════════════════
     SETTINGS TAB
     ════════════════════════════════════════════════════════════ */
  const SettingsTab = () => (
    <div style={{paddingBottom:80,padding:16}}>
      {/* Session */}
      <div style={{...s.card,marginBottom:12}}>
        <div style={{...s.label,marginBottom:12}}>Session</div>
        <div style={{fontSize:12,...s.upper,opacity:0.5,marginBottom:4}}>Logged in as <strong style={{opacity:1}}>{user.email}</strong></div>
        <div style={{fontSize:12,...s.upper,opacity:0.5,marginBottom:12}}>List: <strong style={{opacity:1}}>{currentList.name}</strong></div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button style={s.sm(false)} onClick={()=>{setCurrentList(null);localStorage.removeItem('splitease_list');setTab('home');}}>Switch List</button>
          <button style={{...s.sm(false),color:'#dc2626',display:'flex',alignItems:'center',gap:4}} onClick={logout}><LogOut size={12}/> Log Out</button>
        </div>
        <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid #eee'}}>
          {!confirmDeleteList ? (
            <button style={{...s.ghost,fontSize:10,color:'#dc2626',opacity:0.5}} onClick={()=>setConfirmDeleteList(true)}>Delete this list…</button>
          ) : (
            <div style={{background:'#fef2f2',borderRadius:12,padding:12}}>
              <div style={{fontSize:12,fontWeight:700,color:'#dc2626',...s.upper,marginBottom:4}}>Delete "{currentList.name}"?</div>
              <div style={{fontSize:10,color:'#dc2626',opacity:0.6,marginBottom:8}}>This will permanently delete everything. Cannot be undone.</div>
              <div style={{display:'flex',gap:8}}>
                <button style={{...s.sm(true),background:'#dc2626',display:'flex',alignItems:'center',gap:4}} onClick={deleteList}><Trash2 size={12}/> Yes, delete</button>
                <button style={s.sm(false)} onClick={()=>setConfirmDeleteList(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invite Code */}
      <div style={{...s.card,marginBottom:12}}>
        <div style={{...s.label,marginBottom:8}}>Invite Code</div>
        <div style={{background:'#F0F0EA',padding:'12px 14px',borderRadius:12,fontSize:14,fontWeight:700,letterSpacing:'0.1em',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span>{currentList.invite_code}</span>
          <button onClick={()=>{navigator.clipboard?.writeText(currentList.invite_code);showToast('Copied!');}}
            style={{width:32,height:32,borderRadius:12,border:'none',background:'#e8e8df',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Copy size={14}/>
          </button>
        </div>
        <div style={{fontSize:10,...s.upper,opacity:0.25,marginTop:8}}>Share this code so others can join</div>
      </div>

      {/* Members */}
      <div style={{...s.card,marginBottom:12}}>
        <div style={{...s.label,marginBottom:12}}>Members ({members.length})</div>
        {members.map((m,i) => (
          <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:10,background:'#F0F0EA',borderRadius:12,marginBottom:6}}>
            <div style={{width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700,flexShrink:0,background:PERSON_COLORS[i%PERSON_COLORS.length]}}>
              {m.display_name?.[0]?.toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              {m.user_id === user.id && nameEditing ? (
                <div style={{display:'flex',gap:4}}>
                  <input value={editName} onChange={e=>setEditName(e.target.value)} style={{...s.input,flex:1,padding:'6px 10px',fontSize:12}}/>
                  <button onClick={()=>{updateMyName(editName);setNameEditing(false);showToast('Name updated');}} style={{background:'none',border:'none',cursor:'pointer',color:'#15803d'}}><Check size={16}/></button>
                  <button onClick={()=>setNameEditing(false)} style={{background:'none',border:'none',cursor:'pointer',opacity:0.4}}><X size={16}/></button>
                </div>
              ) : (
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <span style={{fontSize:12,fontWeight:700,...s.upper}}>{m.display_name}</span>
                  {m.user_id === user.id && <>
                    <span style={{fontSize:9,...s.upper,fontWeight:700,background:'#e8e8df',padding:'2px 6px',borderRadius:9999}}>you</span>
                    <button onClick={()=>{setEditName(m.display_name);setNameEditing(true);}} style={{background:'none',border:'none',cursor:'pointer',opacity:0.3,marginLeft:4}}><Pencil size={12}/></button>
                  </>}
                </div>
              )}
              <div style={{fontSize:10,opacity:0.35,letterSpacing:'0.04em',marginTop:1}}>{m.email}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Currency & Rates */}
      <div style={{...s.card,marginBottom:12}}>
        <div style={{...s.label,marginBottom:8}}>Currency & Exchange Rates</div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <span style={{background:'#222',color:'#f5f5ee',padding:'8px 14px',borderRadius:12,fontSize:14,fontWeight:700,letterSpacing:'0.1em'}}>{defCur}</span>
          <span style={{fontSize:10,...s.upper,opacity:0.35}}>Set at list creation</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
          <span style={{fontSize:10,opacity:0.4}}>Rates: {ratesDate || 'N/A'}</span>
          <button onClick={()=>{fetchRates(defCur);showToast('Rates refreshed');}} style={{background:'none',border:'none',cursor:'pointer',color:'#222',opacity:0.4}}><RefreshCw size={12}/></button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:6}}>
          {ALL_CUR.filter(c => c !== defCur).map(c => (
            <div key={c} style={{background:'#F0F0EA',borderRadius:12,padding:'8px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:11}}>
              <span style={{fontWeight:700,...s.upper}}>{CURR_FLAG[c]||''} {c}</span>
              <span style={{opacity:0.4,...s.tabnum}}>{rates[c] ? rates[c].toFixed(NO_DEC.has(c)?0:2) : '–'}</span>
            </div>
          ))}
        </div>
        <div style={{fontSize:10,...s.upper,opacity:0.25,marginTop:8}}>1 {defCur} = listed amount in each currency</div>
      </div>

      {/* Categories */}
      <div style={{...s.card,marginBottom:12}}>
        <div style={{...s.label,marginBottom:8}}>Categories</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:12}}>
          {Object.entries(BASE_CATS).map(([n,c])=>(
            <span key={n} style={s.tag(c.bg,c.tx)}>{c.emoji} {n}</span>
          ))}
          {Object.entries(customCats).map(([n,c])=>(
            <span key={n} style={{...s.tag(c.bg||'#ecfeff',c.tx||'#0e7490'),display:'flex',alignItems:'center',gap:4}}>
              {c.emoji} {n}
              <button onClick={()=>deleteCustomCat(n)} style={{background:'none',border:'none',cursor:'pointer',opacity:0.5,padding:0,lineHeight:1}}><X size={10}/></button>
            </span>
          ))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <input placeholder="New category…" value={newCatName} onChange={e=>setNewCatName(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')addCustomCat();}} style={{...s.input,flex:1}}/>
          <button style={s.sm(true)} onClick={addCustomCat}><Plus size={14}/></button>
        </div>
      </div>

      {/* Learned */}
      {Object.keys(catOverrides).length > 0 && (
        <div style={{...s.card,marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div style={s.label}>Learned Categories</div>
            <button style={{...s.ghost,fontSize:10,color:'#dc2626',opacity:0.6,padding:0}} onClick={()=>{setCatOverrides({});saveSetting('categoryOverrides',{});showToast('Cleared all overrides');}}>Clear all</button>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {Object.entries(catOverrides).map(([w,c])=>(<span key={w} style={{background:'#F0F0EA',padding:'4px 8px',borderRadius:8,fontSize:10}}>{w} → {c}</span>))}
          </div>
        </div>
      )}

      {/* Import/Export */}
      <div style={{...s.card,marginBottom:12}}>
        <div style={{...s.label,marginBottom:8}}>Import & Export</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          <button style={{...s.sm(false),textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center',gap:4}} onClick={exportJSON}><Download size={12}/> JSON</button>
          <button style={{...s.sm(false),textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center',gap:4}} onClick={exportCSV}><Download size={12}/> CSV</button>
          <button style={{...s.sm(false),textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center',gap:4}} onClick={()=>fileRef.current?.click()}><Upload size={12}/> JSON</button>
          <button style={{...s.sm(false),textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center',gap:4}} onClick={()=>csvRef.current?.click()}><Upload size={12}/> CSV</button>
        </div>
        <input ref={fileRef} type="file" accept=".json" style={{display:'none'}} onChange={importJSON}/>
        <input ref={csvRef} type="file" accept=".csv" style={{display:'none'}} onChange={importCSV}/>
        <div style={{fontSize:10,...s.upper,opacity:0.25,marginTop:8}}>CSV import supports old 2-person format (your_share/partner_share columns)</div>
      </div>

      {/* Notifications */}
      {pushSupported && (
        <div style={{...s.card,marginBottom:12}}>
          <div style={{...s.label,marginBottom:8}}>Push Notifications</div>
          {pushPermission === 'denied' ? (
            <div style={{fontSize:11,opacity:0.5,lineHeight:1.6}}>
              Notifications are blocked in your browser settings. Enable them for this site to receive alerts.
            </div>
          ) : pushSubscribed ? (
            <div>
              <div style={{fontSize:11,opacity:0.5,marginBottom:10}}>You'll receive a notification when someone adds or edits an expense in this list.</div>
              <button
                style={{...s.sm(false),display:'flex',alignItems:'center',gap:4,color:'#dc2626'}}
                onClick={pushUnsubscribe}
                disabled={pushLoading}
              >
                {pushLoading ? 'Turning off…' : 'Turn off notifications'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{fontSize:11,opacity:0.5,marginBottom:10}}>Get notified when someone adds or edits an expense in this list.</div>
              <button
                style={{...s.sm(true),display:'flex',alignItems:'center',gap:4}}
                onClick={() => { showToast('btn clicked'); pushSubscribe(); }}
                disabled={pushLoading}
              >
                {pushLoading ? 'Enabling…' : 'Enable notifications'}
              </button>
              {/iphone|ipad|ipod/i.test(navigator.userAgent) && pushPermission !== 'granted' && (
                <div style={{fontSize:10,opacity:0.4,marginTop:6}}>
                  On iOS, install SplitEase to your Home Screen first (Share → Add to Home Screen).
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tips */}
      <div style={{...s.card,marginBottom:12}}>
        <div style={{...s.label,marginBottom:8}}>Quick Add Tips</div>
        <div style={{fontSize:11,letterSpacing:'0.04em',opacity:0.4,lineHeight:1.8}}>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>dinner 50</code> — equal split in {defCur}</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>coffee ¥500</code> — auto-converts from CNY</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>taxi 30 Alice paid</code> — Alice paid</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>groceries 80 personal</code> — no split</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>dinner 120 for Bob</code> — 100% Bob's</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>rent 900 60/40</code> — custom ratio</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>gift 50 70% Alice</code> — 70% Alice, rest split</div>
        </div>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════
     MAIN LAYOUT
     ════════════════════════════════════════════════════════════ */
  return (
    <div className="se" style={{...s.page,maxWidth:480,margin:'0 auto',position:'relative'}}>
      <style>{THEME_CSS}</style>
      {ToastEl}
      {ConfirmModal}

      {tab === 'home' && HomeTab()}
      {tab === 'stats' && StatsTab()}
      {tab === 'settings' && SettingsTab()}

      {/* Footer */}
      <div style={{
        textAlign:'center',
        padding:'16px 16px 80px',
        fontSize:9,
        letterSpacing:'0.08em',
        textTransform:'uppercase',
        opacity:0.2,
        fontFamily:MONO,
        lineHeight:1.8,
      }}>
        <div>© {new Date().getFullYear()} By Roland Chu. All rights reserved.</div>
        <div>Last updated: {typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '—'} {typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''}</div>
      </div>

      {/* Bottom Nav */}
      <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:480,background:'#fff',borderTop:'1px solid #eee',boxShadow:'0 -2px 10px rgba(0,0,0,0.04)',zIndex:40,display:'flex',fontFamily:MONO}}>
        {[
          {id:'home',icon:HomeIcon,label:'Home'},
          {id:'stats',icon:BarChart3,label:'Stats'},
          {id:'settings',icon:SettingsIcon,label:'Settings'},
        ].map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setEditingId(null);}}
            style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'10px 0 12px',border:'none',background:'none',cursor:'pointer',fontFamily:MONO,transition:'all 0.2s',color:'#1a1a1a',opacity:tab===t.id?1:0.25}}>
            <t.icon size={20}/>
            <span style={{fontSize:9,...s.upper,fontWeight:700,marginTop:2}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}