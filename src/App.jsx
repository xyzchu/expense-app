import React, { useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Pencil, Trash2, X, Send, LogOut, Plus, Check, Copy,
  Home as HomeIcon, BarChart3, Settings as SettingsIcon, ArrowRight,
  Eye, EyeOff, UserPlus
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

/* ─── CONSTANTS ─── */
const MONO = '"SF Mono","Fira Code","Cascadia Code","Consolas","Liberation Mono",monospace';
const RATES = { AUD:1, USD:0.63, EUR:0.58, GBP:0.50, JPY:94, CNY:4.57, HKD:4.93, THB:21.6, NZD:1.07, SGD:0.85, KRW:870, INR:53.3, VND:16025, IDR:9975 };
const NO_DEC = new Set(['JPY','KRW','VND','IDR']);
const CURR_SYM = {'¥':'CNY','€':'EUR','£':'GBP','₩':'KRW','₹':'INR','฿':'THB'};
const CURR_FLAG = {AUD:'🇦🇺',USD:'🇺🇸',EUR:'🇪🇺',GBP:'🇬🇧',JPY:'🇯🇵',CNY:'🇨🇳',HKD:'🇭🇰',THB:'🇹🇭',NZD:'🇳🇿',SGD:'🇸🇬',KRW:'🇰🇷',INR:'🇮🇳',VND:'🇻🇳',IDR:'🇮🇩'};
const ALL_CUR = Object.keys(RATES);
const CURR_WORDS = [[/\b(yuan|rmb)\b/i,'CNY'],[/\byen\b/i,'JPY'],[/\bwon\b/i,'KRW'],[/\bbaht\b/i,'THB'],[/\brupees?\b/i,'INR'],[/\beuros?\b/i,'EUR'],[/\bpounds?\b(?!\s+of)/i,'GBP'],[/\bdollars?\b/i,'USD']];
const PCOL = ['#3b82f6','#ec4899','#f59e0b','#22c55e','#a855f7','#06b6d4'];
const CATS = {
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
  Restaurant:/\b(restaurant|dinner|lunch|breakfast|brunch|cafe|coffee|tea|eat|food|drink|bar|pizza|burger|sushi|ramen|noodle|takeaway|meal|snack|bubble\s?tea|dessert|cake|ice\s?cream)\b/i,
  Groceries:/\b(grocer|supermarket|woolworth|coles|aldi|market|fruit|vegetable|meat|milk|bread|egg|rice)\b/i,
  Transport:/\b(uber|lyft|taxi|cab|bus|train|tram|metro|fuel|gas|petrol|parking|car|bike|transport)\b/i,
  Utilities:/\b(electric|power|water|gas|internet|wifi|phone|bill|utility|subscription|spotify|netflix|disney|rent)\b/i,
  Travel:/\b(flight|hotel|hostel|airbnb|travel|airport|tour|trip|holiday|vacation|resort)\b/i,
  Home:/\b(furniture|ikea|bed|sofa|chair|table|desk|lamp|cleaning|laundry|repair|garden|bunnings)\b/i,
};
const STOP = new Set('the and for from with this that have been were they them their what when where which who will would could should about into over after before between under through during each just also than very some only other most paid owes owed split share'.split(' '));

const MOCK_MEMBERS = [
  { id:1, user_id:'u1', display_name:'Alex', email:'alex@demo.com' },
  { id:2, user_id:'u2', display_name:'Sam', email:'sam@demo.com' },
  { id:3, user_id:'u3', display_name:'Jordan', email:'jordan@demo.com' },
];

const d = n => { const t=new Date(); t.setDate(t.getDate()-n); return t.toISOString().slice(0,10); };
const MOCK_EXPENSES = [
  { id:1, item:'Dinner Out', category:'Restaurant', date:d(2), total_amount:62, paid_by:'Alex', split_type:'equal', shares:{Alex:20.67,Sam:20.67,Jordan:20.67}, original_currency:null, original_amount:null },
  { id:2, item:'Grocery Run', category:'Groceries', date:d(3), total_amount:45.50, paid_by:'Sam', split_type:'equal', shares:{Alex:15.17,Sam:15.17,Jordan:15.17}, original_currency:null, original_amount:null },
  { id:3, item:'Uber to City', category:'Transport', date:d(5), total_amount:28, paid_by:'Alex', split_type:'equal', shares:{Alex:9.33,Sam:9.33,Jordan:9.33}, original_currency:'JPY', original_amount:3500 },
  { id:4, item:'Netflix', category:'Utilities', date:d(10), total_amount:16.99, paid_by:'Alex', split_type:'equal', shares:{Alex:5.66,Sam:5.66,Jordan:5.66}, original_currency:null, original_amount:null },
  { id:5, item:'Coffee & Cake', category:'Restaurant', date:d(12), total_amount:24, paid_by:'Jordan', split_type:'equal', shares:{Alex:8,Sam:8,Jordan:8}, original_currency:null, original_amount:null },
  { id:6, item:'Electric Bill', category:'Utilities', date:d(20), total_amount:120, paid_by:'Alex', split_type:'equal', shares:{Alex:40,Sam:40,Jordan:40}, original_currency:null, original_amount:null },
  { id:7, item:'Bubble Tea', category:'Restaurant', date:d(15), total_amount:18, paid_by:'Sam', split_type:'equal', shares:{Alex:6,Sam:6,Jordan:6}, original_currency:'CNY', original_amount:85 },
  { id:8, item:'Flight Booking', category:'Travel', date:d(35), total_amount:250, paid_by:'Alex', split_type:'custom', shares:{Alex:150,Sam:100}, original_currency:null, original_amount:null },
  { id:9, item:'New Lamp', category:'Home', date:d(40), total_amount:39.95, paid_by:'Alex', split_type:'personal', shares:{Alex:39.95}, original_currency:null, original_amount:null },
  { id:10, item:'Weekend Groceries', category:'Groceries', date:d(45), total_amount:68, paid_by:'Jordan', split_type:'equal', shares:{Alex:22.67,Sam:22.67,Jordan:22.67}, original_currency:null, original_amount:null },
];

/* ─── UTILITIES ─── */
const fmt = (n, cur='AUD') => {
  const dc = NO_DEC.has(cur)?0:2;
  try { return new Intl.NumberFormat('en-AU',{style:'currency',currency:cur,minimumFractionDigits:dc,maximumFractionDigits:dc}).format(n); }
  catch { return `${cur} ${n.toFixed(dc)}`; }
};
const today = () => new Date().toISOString().slice(0,10);
const sigWords = t => t.toLowerCase().split(/\s+/).filter(w => w.length>3 && !STOP.has(w));
const cvt = (amt,from,to) => { if(from===to)return amt; return(amt/(RATES[from]||1))*(RATES[to]||1); };
const catFor = (name) => CATS[name] || CATS.Other;

const simplify = nets => {
  const txns=[], cr=[], dr=[];
  Object.entries(nets).forEach(([p,b])=>{ if(b>0.005)cr.push({p,a:b}); else if(b<-0.005)dr.push({p,a:-b}); });
  cr.sort((a,b)=>b.a-a.a); dr.sort((a,b)=>b.a-a.a);
  let i=0,j=0;
  while(i<cr.length&&j<dr.length){
    const a=Math.min(cr[i].a,dr[j].a);
    if(a>0.005)txns.push({from:dr[j].p,to:cr[i].p,amount:Math.round(a*100)/100});
    cr[i].a-=a;dr[j].a-=a;
    if(cr[i].a<0.005)i++; if(dr[j].a<0.005)j++;
  }
  return txns;
};

const detectCat = (text, overrides={}) => {
  const lo=text.toLowerCase().trim();
  if(overrides[lo])return overrides[lo];
  for(const w of sigWords(text)){if(overrides[w])return overrides[w];}
  for(const [cat,re] of Object.entries(CAT_KW)){if(re.test(text))return cat;}
  return 'Other';
};

/* ─── NLP PARSER ─── */
function parseExpense(raw, names, myName, defCur, overrides={}) {
  if(!raw.trim())return null;
  let t=raw, cur=null, amt=null;
  const sm=t.match(/([¥€£₩₹฿])\s*(\d+(?:\.\d+)?)/);
  if(sm){cur=CURR_SYM[sm[1]]; if(sm[1]==='¥'&&/\b(jpy|japan|yen)\b/i.test(t))cur='JPY'; amt=parseFloat(sm[2]);t=t.replace(sm[0],' ');}
  if(amt==null){const m=t.match(/\$\s*(\d+(?:\.\d+)?)/);if(m){amt=parseFloat(m[1]);t=t.replace(m[0],' ');}}
  if(amt==null){const cc=ALL_CUR.join('|');const m1=t.match(new RegExp(`\\b(${cc})\\s*(\\d+(?:\\.\\d+)?)\\b`,'i'));if(m1){cur=m1[1].toUpperCase();amt=parseFloat(m1[2]);t=t.replace(m1[0],' ');}else{const m2=t.match(new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(${cc})\\b`,'i'));if(m2){amt=parseFloat(m2[1]);cur=m2[2].toUpperCase();t=t.replace(m2[0],' ');}}}
  if(!cur){for(const[re,code]of CURR_WORDS){if(re.test(t)){cur=code;t=t.replace(re,' ');break;}}}
  if(!cur){const cc=ALL_CUR.join('|');const m=t.match(new RegExp(`\\b(${cc})\\b`,'i'));if(m){cur=m[1].toUpperCase();t=t.replace(m[0],' ');}}
  if(amt==null){const m=t.match(/\b(\d+(?:\.\d+)?)\b/);if(m){amt=parseFloat(m[1]);t=t.replace(m[0],' ');}}
  if(amt==null)return null;

  const origCur=cur||defCur, origAmt=amt;
  const total=cur&&cur!==defCur?cvt(origAmt,cur,defCur):amt;
  if(!cur)cur=defCur;

  let paidBy=myName;
  for(const n of names){if(new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b`,'i').test(raw)){paidBy=n;break;}}
  let st=raw;
  for(const n of names)st=st.replace(new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b`,'ig'),' ');

  let splitType='equal', shares={};
  const personalRe=/\b(for\s+myself|for\s+me|mine\s+only|personal|just\s+me|no\s+split|my\s+own|only\s+me|myself)\b/i;
  const personalShort=/(?:^|\s)(me|own)(?:\s|$)/i;
  const ratioMatch=st.match(/\b(\d+(?:\/\d+)+)\b/);

  let fullPerson=null;
  for(const n of names){if(new RegExp(`\\bfor\\s+${n}\\b|\\b${n}\\s+owes?\\b`,'i').test(st)){fullPerson=n;break;}}

  if(personalRe.test(st)||personalShort.test(st)){splitType='personal';shares={[paidBy]:total};}
  else if(fullPerson){splitType='full';shares={[fullPerson]:total};}
  else if(ratioMatch){
    splitType='custom';const parts=ratioMatch[1].split('/').map(Number);const sum=parts.reduce((a,b)=>a+b,0);
    const use=names.slice(0,parts.length);
    if(sum>0)use.forEach((n,i)=>{shares[n]=total*(parts[i]/sum);});
  } else { splitType='equal'; names.forEach(n=>{shares[n]=total/names.length;}); }

  let item=raw;
  item=item.replace(/[¥€£₩₹฿$]\s*\d+(\.\d+)?/g,' ');
  item=item.replace(/\b\d+(\.\d+)?\s*(AUD|USD|EUR|GBP|JPY|CNY|HKD|THB|NZD|SGD|KRW|INR|VND|IDR)\b/gi,' ');
  item=item.replace(/\b(AUD|USD|EUR|GBP|JPY|CNY|HKD|THB|NZD|SGD|KRW|INR|VND|IDR)\s*\d+(\.\d+)?\b/gi,' ');
  item=item.replace(/\b\d+(\.\d+)?\b/g,' ');
  for(const n of names)item=item.replace(new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b|\\bfor\\s+${n}\\b|\\b${n}\\s+owes?\\b`,'gi'),' ');
  item=item.replace(/\b(for\s+myself|for\s+me|mine\s+only|personal|just\s+me|no\s+split|my\s+own|only\s+me|myself|yuan|rmb|yen|won|baht|rupees?|euros?|pounds?|dollars?)\b/gi,' ');
  item=item.replace(/\b(me|own)\b/gi,' ');
  item=item.replace(/\b\d+(?:\/\d+)+\b/g,' ');
  for(const[re]of CURR_WORDS)item=item.replace(re,' ');
  item=item.replace(/\s+/g,' ').trim();
  if(!item)item='Expense';

  return {
    item, category:detectCat(item,overrides), date:today(),
    original_currency:origCur!==defCur?origCur:null,
    original_amount:origCur!==defCur?origAmt:null,
    total_amount:Math.round(total*100)/100,
    paid_by:paidBy, split_type:splitType,
    shares:Object.fromEntries(Object.entries(shares).map(([k,v])=>[k,Math.round(v*100)/100]))
  };
}

/* ─── STYLES ─── */
const CSS = `
.se{font-family:${MONO};background:#FAFAF5;color:#1a1a1a;-webkit-font-smoothing:antialiased}
.se *{box-sizing:border-box}
.se input,.se select,.se button{font-family:inherit}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
input[type=number]{-moz-appearance:textfield}
.se-noscroll::-webkit-scrollbar{display:none}
.se-noscroll{-ms-overflow-style:none;scrollbar-width:none}
.se-label{font-size:10px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.35;font-weight:700}
.se-upper{text-transform:uppercase;letter-spacing:0.08em}
.se-tabnum{font-variant-numeric:tabular-nums}
.se-input{width:100%;background:#F0F0EA;border:none;border-radius:12px;padding:12px 14px;font-size:13px;color:#1a1a1a;outline:none;letter-spacing:0.04em}
.se-input:focus{background:#e8e8df}
.se-input::placeholder{opacity:0.25;text-transform:uppercase;letter-spacing:0.08em;font-size:11px}
.se-card{background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.06),0 1px 3px rgba(0,0,0,0.04)}
.se-tag{font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:3px 8px;border-radius:9999px;font-weight:600;display:inline-block}
.se-chip{font-size:12px;letter-spacing:0.08em;text-transform:uppercase;padding:8px 14px;border-radius:9999px;border:none;cursor:pointer;transition:all 0.2s;background:#f0f0ea;color:#1a1a1a;opacity:0.6}
.se-chip:hover{opacity:1}
.se-chip-a{background:#222;color:#f5f5ee;opacity:1;font-weight:700}
.se-btn{width:100%;padding:14px;border:2px solid #222;background:#222;color:#f5f5ee;font-size:14px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;border-radius:12px;cursor:pointer;transition:all 0.2s}
.se-btn:hover{background:#444;border-color:#444}
.se-btn-o{width:100%;padding:14px;border:2px solid #bbb;background:transparent;color:#1a1a1a;font-size:14px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;border-radius:12px;cursor:pointer;transition:all 0.2s}
.se-btn-o:hover{border-color:#222}
.se-ghost{background:none;border:none;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.35;cursor:pointer;padding:8px 0;transition:opacity 0.2s;color:#1a1a1a}
.se-ghost:hover{opacity:1}
.se-sm{font-size:12px;letter-spacing:0.08em;text-transform:uppercase;padding:8px 14px;border-radius:12px;border:none;cursor:pointer;transition:all 0.2s;background:#f0f0ea;color:#1a1a1a}
.se-sm:hover{background:#e8e8df}
.se-sm-a{background:#222;color:#f5f5ee;font-weight:700}
.se-sm-a:hover{background:#444}
.se-split{font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:6px 10px;border-radius:12px;border:1px solid #ddd;background:#fff;cursor:pointer;transition:all 0.2s;color:#1a1a1a}
.se-split-a{background:#222;color:#f5f5ee;border-color:#222;font-weight:700}
`;

/* ─── MAIN COMPONENT ─── */
export default function SplitEase() {
  // Auth
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('alex@demo.com');
  const [authPass, setAuthPass] = useState('password123');
  const [showPass, setShowPass] = useState(false);
  const [authError, setAuthError] = useState('');

  // Lists
  const [currentList, setCurrentList] = useState(null);
  const [listScreen, setListScreen] = useState('select');
  const [newListName, setNewListName] = useState('');
  const [newListCur, setNewListCur] = useState('AUD');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // App
  const [tab, setTab] = useState('home');
  const [members, setMembers] = useState([]);
  const [myName, setMyName] = useState('');
  const [defCur, setDefCur] = useState('AUD');
  const [expenses, setExpenses] = useState([]);
  const [nextId, setNextId] = useState(100);

  // UI
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [inputText, setInputText] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [settleFrom, setSettleFrom] = useState('');
  const [settleTo, setSettleTo] = useState('');
  const [settleAmt, setSettleAmt] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addItem, setAddItem] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addCategory, setAddCategory] = useState('Other');
  const [addPaidBy, setAddPaidBy] = useState('');
  const [addDate, setAddDate] = useState(today());
  const [addSplitType, setAddSplitType] = useState('equal');
  const [addExact, setAddExact] = useState({});
  const [addRatio, setAddRatio] = useState({});
  const [addPct, setAddPct] = useState({});
  const [addOrigCur, setAddOrigCur] = useState('');
  const [addOrigAmt, setAddOrigAmt] = useState('');
  const [selMonth, setSelMonth] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [catOverrides, setCatOverrides] = useState({});
  const [customCats, setCustomCats] = useState({});
  const [newCatName, setNewCatName] = useState('');
  const [nameEditing, setNameEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);
  const [showForeign, setShowForeign] = useState(false);

  // Toast
  const [toast, setToast] = useState({ msg:'', show:false });
  const inputRef = useRef(null);

  const showToast = useCallback(msg => {
    setToast({msg,show:true});
    setTimeout(()=>setToast(t=>({...t,show:false})),2800);
  },[]);

  const names = useMemo(()=>members.map(m=>m.display_name),[members]);
  const allCatNames = useMemo(()=>[...Object.keys(CATS),...Object.keys(customCats)],[customCats]);

  // Auth
  const handleAuth = () => {
    if(!authEmail.trim()||!authPass.trim()){setAuthError('Fill in all fields');return;}
    if(authMode==='signup'){showToast('Account created!');setAuthMode('login');return;}
    setUser({id:'u1',email:authEmail});
    setAuthError('');
  };

  // Select list
  const selectList = (list) => {
    setCurrentList(list);
    setDefCur(list.currency);
    setMyName(list.myName);
    setMembers(list.members);
    setExpenses(list.expenses);
    setTab('home');
  };

  const LISTS = useMemo(()=>[
    { id:'l1', name:'Housemates', currency:'AUD', invite_code:'abc123xyz', myName:'Alex', members:MOCK_MEMBERS, expenses:MOCK_EXPENSES },
    { id:'l2', name:'Japan Trip 2025', currency:'JPY', invite_code:'jpn456', myName:'Alex', members:MOCK_MEMBERS.slice(0,2), expenses:[] },
  ],[]);

  // Create list
  const handleCreateList = () => {
    if(!newListName.trim()||!newDisplayName.trim())return;
    const list = { id:'l'+Date.now(), name:newListName.trim(), currency:newListCur, invite_code:Math.random().toString(36).slice(2,10), myName:newDisplayName.trim(), members:[{id:Date.now(),user_id:'u1',display_name:newDisplayName.trim(),email:user?.email}], expenses:[] };
    selectList(list);
    setListScreen('select');
    setNewListName('');setNewDisplayName('');
    showToast('List created! Code: '+list.invite_code);
  };

  const handleJoinList = () => {
    if(!joinCode.trim()||!newDisplayName.trim())return;
    const found = LISTS.find(l=>l.invite_code===joinCode.trim().toLowerCase());
    if(!found){showToast('Invalid invite code');return;}
    selectList({...found,myName:newDisplayName.trim()});
    setListScreen('select');setJoinCode('');setNewDisplayName('');
    showToast('Joined "'+found.name+'"!');
  };

  // Balances
  const { netBalances, txns } = useMemo(()=>{
    const nets={};
    members.forEach(m=>{nets[m.display_name]=0;});
    expenses.forEach(e=>{
      if(nets[e.paid_by]!==undefined)nets[e.paid_by]+=(e.total_amount||0);
      Object.entries(e.shares||{}).forEach(([n,a])=>{if(nets[n]!==undefined)nets[n]-=a;});
    });
    return {netBalances:nets,txns:simplify(nets)};
  },[expenses,members]);

  // Monthly spend
  const monthSpend = useMemo(()=>{
    const thisMonth=new Date().toISOString().slice(0,7);
    const lm=new Date();lm.setDate(1);lm.setMonth(lm.getMonth()-1);
    const lastMonth=lm.toISOString().slice(0,7);
    const sp={};
    names.forEach(n=>{sp[n]={cur:0,prev:0};});
    expenses.forEach(e=>{
      const m=e.date?.slice(0,7);
      Object.entries(e.shares||{}).forEach(([n,a])=>{
        if(!sp[n])return;
        if(m===thisMonth)sp[n].cur+=a;
        else if(m===lastMonth)sp[n].prev+=a;
      });
    });
    return sp;
  },[expenses,names]);

  // NLP preview
  const parsedPreview = useMemo(()=>{
    if(!inputText.trim()||names.length===0)return null;
    return parseExpense(inputText,names,myName,defCur,catOverrides);
  },[inputText,names,myName,defCur,catOverrides]);

  // Add expense (NLP)
  const addExpense = () => {
    if(!parsedPreview)return;
    const id=nextId;setNextId(id+1);
    setExpenses(prev=>[{...parsedPreview,id},...prev]);
    setInputText('');setInputFocused(false);
    showToast('Added: '+parsedPreview.item);
  };

  // Add manual
  const addManualExpense = () => {
    if(!addItem.trim()||!addAmount)return;
    const amount=parseFloat(addAmount);
    if(!amount||amount<=0){showToast('Enter a valid amount');return;}
    const payer=addPaidBy||names[0];
    let shares={};
    if(addSplitType==='equal'){names.forEach(n=>{shares[n]=amount/names.length;});}
    else if(addSplitType==='ratio'){
      const totalR=Object.values(addRatio).reduce((s,v)=>s+(parseFloat(v)||0),0);
      if(totalR===0){showToast('Enter ratios');return;}
      names.forEach(n=>{const r=parseFloat(addRatio[n])||0;if(r>0)shares[n]=(r/totalR)*amount;});
    } else if(addSplitType==='percent'){
      const totalP=Object.values(addPct).reduce((s,v)=>s+(parseFloat(v)||0),0);
      if(Math.abs(totalP-100)>0.01){showToast('Must total 100%');return;}
      names.forEach(n=>{const p=parseFloat(addPct[n])||0;if(p>0)shares[n]=(p/100)*amount;});
    } else if(addSplitType==='exact'){
      names.forEach(n=>{const v=parseFloat(addExact[n]);if(v>0)shares[n]=v;});
      const sum=Object.values(shares).reduce((a,b)=>a+b,0);
      if(Math.abs(sum-amount)>0.01){showToast('Must equal total');return;}
    } else if(addSplitType==='payer'){shares={[payer]:amount};}
    shares=Object.fromEntries(Object.entries(shares).map(([k,v])=>[k,Math.round(v*100)/100]));

    let oc=null,oa=null;
    if(addOrigCur&&addOrigCur!==defCur&&addOrigAmt){oc=addOrigCur;oa=parseFloat(addOrigAmt);}

    const id=nextId;setNextId(id+1);
    setExpenses(prev=>[{id,item:addItem.trim(),category:addCategory,date:addDate,original_currency:oc,original_amount:oa,total_amount:Math.round(amount*100)/100,paid_by:payer,split_type:addSplitType,shares},...prev]);
    setShowAddForm(false);setAddItem('');setAddAmount('');setAddCategory('Other');setAddSplitType('equal');setAddExact({});setAddRatio({});setAddPct({});setAddOrigCur('');setAddOrigAmt('');setShowForeign(false);
    showToast('Added: '+addItem.trim());
  };

  // Settlement
  const addSettlement = () => {
    if(!settleFrom||!settleTo||!settleAmt)return;
    const amount=parseFloat(settleAmt);if(!amount||amount<=0)return;
    const id=nextId;setNextId(id+1);
    setExpenses(prev=>[{id,item:`💸 ${settleFrom} paid ${settleTo}`,category:'Settlement',date:today(),original_currency:null,original_amount:null,total_amount:amount,paid_by:settleFrom,split_type:'settlement',shares:{[settleTo]:amount}},...prev]);
    setShowSettle(false);setSettleAmt('');
    showToast(`Settled: ${settleFrom} → ${settleTo} ${fmt(amount,defCur)}`);
  };

  // Delete
  const deleteExpense = id => {
    setExpenses(prev=>prev.filter(e=>e.id!==id));
    setConfirmDelete(null);
    showToast('Deleted');
  };

  // Edit
  const startEdit = exp => {
    setEditingId(exp.id);
    setEditForm({item:exp.item,total_amount:exp.total_amount,category:exp.category,paid_by:exp.paid_by,date:exp.date,split_type:exp.split_type,shares:{...(exp.shares||{})}});
  };

  const saveEdit = () => {
    if(!editingId)return;
    const total=parseFloat(editForm.total_amount);
    let shares=editForm.shares;
    if(editForm.split_type==='equal'){shares={};names.forEach(n=>{shares[n]=total/names.length;});}
    else if(editForm.split_type==='personal'){shares={[editForm.paid_by]:total};}
    shares=Object.fromEntries(Object.entries(shares).map(([k,v])=>[k,Math.round(parseFloat(v)*100)/100]));

    const oldExp=expenses.find(e=>e.id===editingId);
    if(oldExp&&oldExp.category!==editForm.category){
      const newOv={...catOverrides};
      newOv[editForm.item.toLowerCase().trim()]=editForm.category;
      sigWords(editForm.item).forEach(w=>{newOv[w]=editForm.category;});
      setCatOverrides(newOv);
    }

    setExpenses(prev=>prev.map(e=>e.id===editingId?{...e,item:editForm.item,total_amount:total,category:editForm.category,paid_by:editForm.paid_by,date:editForm.date,split_type:editForm.split_type,shares}:e));
    setEditingId(null);
    showToast('Saved');
  };

  // Filtered
  const filtered = useMemo(()=>{
    if(!search.trim())return expenses;
    const q=search.toLowerCase();
    return expenses.filter(e=>e.item?.toLowerCase().includes(q)||e.category?.toLowerCase().includes(q)||e.date?.includes(q)||e.paid_by?.toLowerCase().includes(q));
  },[expenses,search]);

  // Stats
  const months = useMemo(()=>{
    const s=new Set(expenses.map(e=>e.date?.slice(0,7)).filter(Boolean));
    return [...s].sort().reverse();
  },[expenses]);

  const activeMonth = selMonth || months[0] || '';
  const monthExps = useMemo(()=>expenses.filter(e=>e.date?.startsWith(activeMonth)),[expenses,activeMonth]);

  // Export
  const exportJSON = () => {
    const blob=new Blob([JSON.stringify({expenses,members:members.map(m=>({display_name:m.display_name,email:m.email})),defaultCurrency:defCur},null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`splitease-${today()}.json`;a.click();
  };
  const exportCSV = () => {
    const hdr=['item','category','date','total_amount','paid_by','split_type',...names.map(n=>`share_${n}`)];
    const rows=expenses.map(e=>[`"${(e.item||'').replace(/"/g,'""')}"`,e.category,e.date,e.total_amount,e.paid_by,e.split_type,...names.map(n=>e.shares?.[n]||0)]);
    const csv=[hdr.join(','),...rows.map(r=>r.join(','))].join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`splitease-${today()}.csv`;a.click();
  };

  // Custom cats
  const addCustomCat = () => {
    if(!newCatName.trim())return;
    setCustomCats(prev=>({...prev,[newCatName.trim()]:{emoji:'🏷️',c:'#06b6d4',bg:'#ecfeff',tx:'#0e7490'}}));
    showToast('Added: '+newCatName.trim());
    setNewCatName('');
  };

  // Name update
  const updateMyName = newN => {
    if(!newN.trim())return;
    const old=myName;
    setMyName(newN.trim());
    setMembers(prev=>prev.map(m=>m.user_id==='u1'?{...m,display_name:newN.trim()}:m));
    if(old!==newN.trim()){
      setExpenses(prev=>prev.map(e=>{
        let ne={...e};
        if(e.paid_by===old)ne.paid_by=newN.trim();
        if(e.shares&&e.shares[old]!==undefined){const ns={...e.shares};ns[newN.trim()]=ns[old];delete ns[old];ne.shares=ns;}
        return ne;
      }));
    }
  };

  // Logout
  const logout = () => {setUser(null);setCurrentList(null);setTab('home');setExpenses([]);setMembers([]);};

  /* ─── RENDER ─── */
  const Toast = (
    <AnimatePresence>
      {toast.show&&(<motion.div initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}}
        style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',zIndex:99,background:'#222',color:'#f5f5ee',padding:'10px 20px',borderRadius:16,fontSize:12,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:700,textAlign:'center',fontFamily:MONO,maxWidth:320,boxShadow:'0 8px 32px rgba(0,0,0,0.2)'}}>
        {toast.msg}
      </motion.div>)}
    </AnimatePresence>
  );

  // Confirm delete modal
  const ConfirmModal = confirmDelete !== null && (
    <div style={{position:'fixed',inset:0,zIndex:90,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={()=>setConfirmDelete(null)}>
      <div style={{margin:16,maxWidth:360,width:'100%',padding:24,borderRadius:20,background:'#FAFAF5',fontFamily:MONO}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:700,marginBottom:8}}>Delete Expense?</div>
        <div style={{fontSize:12,opacity:0.5,lineHeight:1.6,marginBottom:20}}>This action cannot be undone.</div>
        <div style={{display:'flex',gap:8}}>
          <button className="se-sm" style={{flex:1,textAlign:'center'}} onClick={()=>setConfirmDelete(null)}>Cancel</button>
          <button className="se-sm se-sm-a" style={{flex:1,textAlign:'center'}} onClick={()=>deleteExpense(confirmDelete)}>Delete</button>
        </div>
      </div>
    </div>
  );

  // ─── AUTH SCREEN ───
  if(!user) return (
    <>
      <style>{CSS}</style>
      <div className="se" style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
        {Toast}
        <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} className="se-card" style={{width:'100%',maxWidth:380,padding:'32px 24px'}}>
          <div style={{fontSize:32,fontWeight:700,textTransform:'uppercase',letterSpacing:'-0.02em',textAlign:'center',marginBottom:4}}>💰 SplitEase</div>
          <div className="se-label" style={{textAlign:'center',marginBottom:24}}>{authMode==='login'?'Welcome back':'Create an account'}</div>
          {authError&&<div style={{background:'#fef2f2',color:'#dc2626',fontSize:12,padding:8,borderRadius:12,marginBottom:12}}>{authError}</div>}
          <div style={{marginBottom:12}}>
            <div className="se-label" style={{marginBottom:6}}>Email</div>
            <input className="se-input" type="email" placeholder="you@email.com" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} />
          </div>
          <div style={{marginBottom:16,position:'relative'}}>
            <div className="se-label" style={{marginBottom:6}}>Password</div>
            <input className="se-input" type={showPass?'text':'password'} placeholder="••••••••" value={authPass}
              onChange={e=>setAuthPass(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleAuth();}}
              style={{paddingRight:40}} />
            <button onClick={()=>setShowPass(!showPass)} style={{position:'absolute',right:12,bottom:12,background:'none',border:'none',cursor:'pointer',opacity:0.3}}>
              {showPass?<EyeOff size={16}/>:<Eye size={16}/>}
            </button>
          </div>
          <button className="se-btn" style={{marginBottom:12}} onClick={handleAuth}>{authMode==='login'?'Log In':'Sign Up'}</button>
          <p style={{textAlign:'center',fontSize:12,letterSpacing:'0.06em',textTransform:'uppercase',opacity:0.35}}>
            {authMode==='login'?"Don't have an account? ":"Already have an account? "}
            <button className="se-ghost" style={{opacity:1,fontWeight:700,padding:0}} onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthError('');}}>
              {authMode==='login'?'Sign Up':'Log In'}
            </button>
          </p>
        </motion.div>
      </div>
    </>
  );

  // ─── LIST SELECT ───
  if(!currentList) return (
    <>
      <style>{CSS}</style>
      <div className="se" style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
        {Toast}
        <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} className="se-card" style={{width:'100%',maxWidth:380,padding:'32px 24px'}}>

          {listScreen==='select'&&(<>
            <div style={{fontSize:24,fontWeight:700,textTransform:'uppercase',letterSpacing:'-0.02em',marginBottom:2}}>💰 SplitEase</div>
            <div className="se-label" style={{marginBottom:20}}>{user.email}</div>
            <div className="se-label" style={{marginBottom:8}}>Your Lists</div>
            <div style={{marginBottom:16}}>
              {LISTS.map(l=>(
                <button key={l.id} onClick={()=>selectList(l)} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'#F0F0EA',borderRadius:12,border:'none',cursor:'pointer',textAlign:'left',marginBottom:8,fontFamily:MONO,transition:'background 0.2s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#e8e8df'} onMouseLeave={e=>e.currentTarget.style.background='#F0F0EA'}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em'}}>{l.name}</div>
                    <div style={{fontSize:10,opacity:0.35,letterSpacing:'0.08em',textTransform:'uppercase',marginTop:2}}>{l.currency} • as {l.myName}</div>
                  </div>
                  <ArrowRight size={14} style={{opacity:0.3}} />
                </button>
              ))}
            </div>
            <button className="se-btn" style={{marginBottom:8}} onClick={()=>setListScreen('create')}><Plus size={16} style={{display:'inline',marginRight:4,verticalAlign:'middle'}} /> New List</button>
            <button className="se-btn-o" onClick={()=>setListScreen('join')}><UserPlus size={16} style={{display:'inline',marginRight:4,verticalAlign:'middle'}} /> Join with Code</button>
            <button className="se-ghost" style={{display:'block',width:'100%',textAlign:'center',marginTop:12}} onClick={logout}>Log Out</button>
          </>)}

          {listScreen==='create'&&(<>
            <div style={{fontSize:18,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:16}}>Create New List</div>
            <div style={{marginBottom:12}}><input className="se-input" placeholder="List name" value={newListName} onChange={e=>setNewListName(e.target.value)} /></div>
            <div style={{marginBottom:12}}><input className="se-input" placeholder="Your display name" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)} /></div>
            <div style={{marginBottom:16}}><select className="se-input" value={newListCur} onChange={e=>setNewListCur(e.target.value)}>{ALL_CUR.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <button className="se-btn" style={{marginBottom:8}} onClick={handleCreateList}>Create</button>
            <button className="se-ghost" style={{display:'block',width:'100%',textAlign:'center'}} onClick={()=>setListScreen('select')}>Back</button>
          </>)}

          {listScreen==='join'&&(<>
            <div style={{fontSize:18,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:16}}>Join List</div>
            <div style={{marginBottom:12}}><input className="se-input" placeholder="Invite code" value={joinCode} onChange={e=>setJoinCode(e.target.value)} style={{fontFamily:MONO}} /></div>
            <div style={{marginBottom:16}}><input className="se-input" placeholder="Your display name" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)} /></div>
            <button className="se-btn" style={{marginBottom:8}} onClick={handleJoinList}>Join</button>
            <button className="se-ghost" style={{display:'block',width:'100%',textAlign:'center'}} onClick={()=>setListScreen('select')}>Back</button>
          </>)}
        </motion.div>
      </div>
    </>
  );

  /* ═══ HOME TAB ═══ */
  const HomeTab = (
    <div style={{paddingBottom:80}}>
      {/* Balance Card */}
      <div style={{background:'#222',color:'#f5f5ee',borderRadius:20,padding:20,margin:16,boxShadow:'0 4px 20px rgba(0,0,0,0.15)'}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
          <div>
            <div style={{fontSize:18,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase'}}>{currentList.name}</div>
            <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',opacity:0.5,marginTop:4}}>Logged in as {myName}</div>
          </div>
          <span style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,background:'rgba(255,255,255,0.12)',padding:'6px 10px',borderRadius:9999}}>{defCur}</span>
        </div>

        {txns.length===0?(
          <div style={{textAlign:'center',fontSize:12,letterSpacing:'0.1em',textTransform:'uppercase',opacity:0.6,padding:'10px 0'}}>All settled up! ✨</div>
        ):(
          txns.map((t,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(255,255,255,0.08)',borderRadius:12,padding:'10px 14px',marginBottom:6,fontSize:12,letterSpacing:'0.04em',textTransform:'uppercase'}}>
              <span>{t.from} owes {t.to}</span>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{fmt(t.amount,defCur)}</span>
                <button onClick={()=>{setShowSettle(!showSettle);setSettleFrom(t.from);setSettleTo(t.to);setSettleAmt(t.amount.toString());}}
                  style={{fontFamily:MONO,fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',background:'rgba(255,255,255,0.2)',border:'none',color:'#f5f5ee',padding:'4px 10px',borderRadius:9999,cursor:'pointer'}}>💸 Settle</button>
              </div>
            </div>
          ))
        )}

        {/* Spend Grid */}
        <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(names.length,2)}, 1fr)`,gap:8,marginTop:12}}>
          {names.map(n=>(
            <div key={n} style={{background:'rgba(255,255,255,0.08)',borderRadius:12,padding:'10px 12px'}}>
              <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',opacity:0.5,marginBottom:4}}>{n}</div>
              <div style={{fontSize:14,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{fmt(monthSpend[n]?.cur||0,defCur)}</div>
              <div style={{fontSize:10,opacity:0.4,marginTop:2,letterSpacing:'0.06em',textTransform:'uppercase'}}>this month</div>
            </div>
          ))}
        </div>

        {/* Settle Form */}
        <AnimatePresence>
          {showSettle&&(<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} style={{overflow:'hidden'}}>
            <div style={{background:'rgba(255,255,255,0.08)',borderRadius:12,padding:12,marginTop:10}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <select value={settleFrom} onChange={e=>setSettleFrom(e.target.value)} style={{flex:1,background:'rgba(255,255,255,0.15)',border:'none',color:'#f5f5ee',borderRadius:12,padding:'8px 10px',fontFamily:MONO,fontSize:12,outline:'none',letterSpacing:'0.06em',textTransform:'uppercase'}}>
                  {names.map(n=><option key={n} value={n} style={{color:'#1a1a1a'}}>{n}</option>)}
                </select>
                <span style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',opacity:0.5}}>paid</span>
                <select value={settleTo} onChange={e=>setSettleTo(e.target.value)} style={{flex:1,background:'rgba(255,255,255,0.15)',border:'none',color:'#f5f5ee',borderRadius:12,padding:'8px 10px',fontFamily:MONO,fontSize:12,outline:'none',letterSpacing:'0.06em',textTransform:'uppercase'}}>
                  {names.filter(n=>n!==settleFrom).map(n=><option key={n} value={n} style={{color:'#1a1a1a'}}>{n}</option>)}
                </select>
              </div>
              <div style={{display:'flex',gap:6}}>
                <input type="number" placeholder="0.00" value={settleAmt} onChange={e=>setSettleAmt(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter')addSettlement();}}
                  style={{flex:1,background:'rgba(255,255,255,0.15)',border:'none',color:'#f5f5ee',borderRadius:12,padding:'8px 10px',fontFamily:MONO,fontSize:12,outline:'none',fontVariantNumeric:'tabular-nums'}} />
                <button onClick={addSettlement} style={{fontFamily:MONO,fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,background:'#f5f5ee',color:'#222',border:'none',padding:'8px 14px',borderRadius:12,cursor:'pointer'}}>Record</button>
              </div>
            </div>
          </motion.div>)}
        </AnimatePresence>
      </div>

      {/* Manual Add Form */}
      <AnimatePresence>
        {showAddForm&&(<motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}} className="se-card" style={{margin:'12px 16px 0',padding:16,border:'2px solid #222'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:12,letterSpacing:'0.12em',textTransform:'uppercase',fontWeight:700}}>Add Expense</span>
            <button onClick={()=>setShowAddForm(false)} style={{background:'none',border:'none',cursor:'pointer',opacity:0.3}}><X size={18}/></button>
          </div>
          <div style={{marginBottom:8}}><input className="se-input" placeholder="Item name" value={addItem} onChange={e=>setAddItem(e.target.value)} /></div>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <input className="se-input" type="number" placeholder="0.00" value={addAmount} onChange={e=>setAddAmount(e.target.value)} />
            <select className="se-input" value={addCategory} onChange={e=>setAddCategory(e.target.value)}>
              {allCatNames.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <select className="se-input" value={addPaidBy||names[0]} onChange={e=>setAddPaidBy(e.target.value)}>
              {names.map(n=><option key={n} value={n}>{n} paid</option>)}
            </select>
            <input className="se-input" type="date" value={addDate} onChange={e=>setAddDate(e.target.value)} />
          </div>

          {/* Foreign currency toggle */}
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',opacity:0.35,cursor:'pointer',padding:'4px 0',marginBottom:8}} onClick={()=>setShowForeign(!showForeign)}>
            {showForeign?'▾':'▸'} Foreign currency?
          </div>
          {showForeign&&(
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <select className="se-input" value={addOrigCur} onChange={e=>{setAddOrigCur(e.target.value);if(e.target.value&&addOrigAmt)setAddAmount(cvt(parseFloat(addOrigAmt),e.target.value,defCur).toFixed(2));}}>
                <option value="">None</option>
                {ALL_CUR.filter(c=>c!==defCur).map(c=><option key={c} value={c}>{CURR_FLAG[c]} {c}</option>)}
              </select>
              <input className="se-input" type="number" placeholder="Original amount" value={addOrigAmt}
                onChange={e=>{setAddOrigAmt(e.target.value);if(addOrigCur&&e.target.value)setAddAmount(cvt(parseFloat(e.target.value),addOrigCur,defCur).toFixed(2));}} />
            </div>
          )}

          {/* Split type */}
          <div className="se-label" style={{marginBottom:6}}>Split type</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:12}}>
            {['equal','ratio','percent','exact','payer'].map(st=>(
              <button key={st} className={`se-split ${addSplitType===st?'se-split-a':''}`} onClick={()=>setAddSplitType(st)}>{st}</button>
            ))}
          </div>

          {addSplitType==='ratio'&&(
            <div style={{marginBottom:12}}>
              {names.map(n=>(
                <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{fontSize:12,width:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textTransform:'uppercase',letterSpacing:'0.06em'}}>{n}</span>
                  <input className="se-input" type="number" min="0" placeholder="0" value={addRatio[n]||''} onChange={e=>setAddRatio(p=>({...p,[n]:e.target.value}))} style={{flex:1}} />
                  <span style={{fontSize:10,opacity:0.35,textTransform:'uppercase'}}>parts</span>
                </div>
              ))}
            </div>
          )}
          {addSplitType==='percent'&&(
            <div style={{marginBottom:12}}>
              {names.map(n=>(
                <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{fontSize:12,width:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textTransform:'uppercase',letterSpacing:'0.06em'}}>{n}</span>
                  <input className="se-input" type="number" min="0" max="100" placeholder="0" value={addPct[n]||''} onChange={e=>setAddPct(p=>({...p,[n]:e.target.value}))} style={{flex:1}} />
                  <span style={{fontSize:10,opacity:0.35}}>%</span>
                </div>
              ))}
              {(()=>{const total=Object.values(addPct).reduce((s,v)=>s+(parseFloat(v)||0),0);return <div style={{fontSize:10,padding:4,color:Math.abs(total-100)<0.01?'#15803d':'#dc2626'}}>Total: {total.toFixed(1)}%{Math.abs(total-100)<0.01?' ✓':''}</div>;})()}
            </div>
          )}
          {addSplitType==='exact'&&(
            <div style={{marginBottom:12}}>
              {names.map(n=>(
                <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{fontSize:12,width:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textTransform:'uppercase',letterSpacing:'0.06em'}}>{n}</span>
                  <input className="se-input" type="number" min="0" placeholder="0" value={addExact[n]||''} onChange={e=>setAddExact(p=>({...p,[n]:e.target.value}))} style={{flex:1}} />
                </div>
              ))}
              {(()=>{const sum=Object.values(addExact).reduce((s,v)=>s+(parseFloat(v)||0),0);const target=parseFloat(addAmount)||0;return <div style={{fontSize:10,padding:4,color:Math.abs(target-sum)<0.01?'#15803d':'#dc2626'}}>Total: {fmt(sum,defCur)}{Math.abs(target-sum)<0.01?' ✓':''}</div>;})()}
            </div>
          )}
          {addSplitType==='payer'&&<div style={{fontSize:10,opacity:0.35,textTransform:'uppercase',letterSpacing:'0.06em',background:'#F0F0EA',borderRadius:12,padding:8,marginBottom:12}}>Entire amount assigned to payer — no split</div>}

          <button className="se-btn" onClick={addManualExpense}>Add Expense</button>
        </motion.div>)}
      </AnimatePresence>

      {/* Quick Input */}
      <div className="se-card" style={{margin:'12px 16px 0',overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'14px 16px'}}>
          <button onClick={()=>{setShowAddForm(!showAddForm);setAddPaidBy(myName);}} style={{background:'none',border:'none',cursor:'pointer',opacity:showAddForm?1:0.3,transition:'all 0.2s',transform:showAddForm?'rotate(45deg)':'none'}}>
            <Plus size={18}/>
          </button>
          <input ref={inputRef} placeholder="Add expense… e.g. 'dinner ¥500 Sam paid'" value={inputText}
            onChange={e=>setInputText(e.target.value)} onFocus={()=>setInputFocused(true)}
            onKeyDown={e=>{if(e.key==='Enter'&&parsedPreview)addExpense();}}
            style={{flex:1,fontSize:12,outline:'none',background:'transparent',border:'none',fontFamily:MONO,color:'#1a1a1a',letterSpacing:'0.04em'}} />
          {inputText&&<button onClick={()=>{setInputText('');setInputFocused(false);}} style={{background:'none',border:'none',cursor:'pointer',opacity:0.3}}><X size={16}/></button>}
          {parsedPreview&&<button onClick={addExpense} style={{background:'#222',color:'#f5f5ee',border:'none',width:32,height:32,borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Send size={14}/></button>}
        </div>
        <AnimatePresence>
          {inputFocused&&parsedPreview&&(<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} style={{overflow:'hidden'}}>
            <div style={{borderTop:'1px solid #eee',padding:'12px 16px',fontSize:12}}>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                <span style={{fontSize:14,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>{parsedPreview.item}</span>
                <span className="se-tag" style={{background:catFor(parsedPreview.category).bg,color:catFor(parsedPreview.category).tx}}>{catFor(parsedPreview.category).emoji} {parsedPreview.category}</span>
              </div>
              <div style={{fontSize:18,fontWeight:700,fontVariantNumeric:'tabular-nums',marginTop:4}}>{fmt(parsedPreview.total_amount,defCur)}</div>
              {parsedPreview.original_currency&&<span className="se-tag" style={{background:'#fef3c7',color:'#92400e',marginTop:4}}>{CURR_FLAG[parsedPreview.original_currency]} {fmt(parsedPreview.original_amount,parsedPreview.original_currency)}</span>}
              <div style={{opacity:0.35,marginTop:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>Paid by <strong>{parsedPreview.paid_by}</strong> • {parsedPreview.split_type}</div>
              {Object.keys(parsedPreview.shares).length>0&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
                  {Object.entries(parsedPreview.shares).map(([n,a])=>(<span key={n} style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',background:'#F0F0EA',padding:'4px 8px',borderRadius:9999}}>{n}: {fmt(a,defCur)}</span>))}
                </div>
              )}
            </div>
          </motion.div>)}
        </AnimatePresence>
      </div>

      {/* Search */}
      <div style={{margin:'12px 16px 0',position:'relative'}}>
        <Search size={14} style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',opacity:0.3}} />
        <input className="se-input" placeholder="Search expenses…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{paddingLeft:36,borderRadius:12,border:'1px solid #eee',background:'#fff'}} />
      </div>

      {/* Expense List */}
      <div style={{padding:'12px 16px'}}>
        <AnimatePresence>
          {filtered.map(exp=>{
            const ci=catFor(exp.category);
            const isEditing=editingId===exp.id;
            return (
              <motion.div key={exp.id} layout initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,x:-100}} className="se-card" style={{marginBottom:10,overflow:'hidden'}}>
                {!isEditing?(
                  <div style={{padding:'14px 16px'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:10,flex:1,minWidth:0}}>
                        <span style={{fontSize:20,flexShrink:0,marginTop:1}}>{ci.emoji}</span>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{exp.item}</div>
                          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6,alignItems:'center'}}>
                            <span className="se-tag" style={{background:ci.bg,color:ci.tx}}>{exp.category}</span>
                            <span className="se-tag" style={{background:'#F0F0EA',color:'#1a1a1a',opacity:0.4}}>{exp.date}</span>
                            {exp.original_currency&&<span className="se-tag" style={{background:'#fef3c7',color:'#92400e'}}>{CURR_FLAG[exp.original_currency]} {fmt(exp.original_amount,exp.original_currency)}</span>}
                            <span className="se-tag" style={{background:'#F0F0EA',color:'#1a1a1a',opacity:0.35}}>{exp.split_type}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontSize:14,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{fmt(exp.total_amount,defCur)}</div>
                        <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',opacity:0.35,marginTop:2}}>{exp.paid_by} paid</div>
                      </div>
                    </div>
                    {exp.shares&&Object.keys(exp.shares).length>1&&(
                      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:8}}>
                        {Object.entries(exp.shares).map(([n,a])=>(<span key={n} style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',background:'#F0F0EA',padding:'4px 8px',borderRadius:9999,fontVariantNumeric:'tabular-nums'}}>{n}: {fmt(a,defCur)}</span>))}
                      </div>
                    )}
                    <div style={{display:'flex',gap:4,justifyContent:'flex-end',marginTop:8}}>
                      <button onClick={()=>startEdit(exp)} style={{width:32,height:32,borderRadius:12,border:'none',background:'transparent',cursor:'pointer',opacity:0.2,display:'flex',alignItems:'center',justifyContent:'center',transition:'opacity 0.2s'}}
                        onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.2'}><Pencil size={14}/></button>
                      <button onClick={()=>setConfirmDelete(exp.id)} style={{width:32,height:32,borderRadius:12,border:'none',background:'transparent',cursor:'pointer',opacity:0.2,display:'flex',alignItems:'center',justifyContent:'center',transition:'opacity 0.2s'}}
                        onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.2'}><Trash2 size={14}/></button>
                    </div>
                  </div>
                ):(
                  <div style={{padding:'14px 16px',background:'#fafaf8'}}>
                    <div style={{display:'flex',gap:8,marginBottom:8}}><input className="se-input" value={editForm.item} onChange={e=>setEditForm({...editForm,item:e.target.value})} /></div>
                    <div style={{display:'flex',gap:8,marginBottom:8}}>
                      <input className="se-input" type="number" value={editForm.total_amount} onChange={e=>setEditForm({...editForm,total_amount:e.target.value})} />
                      <select className="se-input" value={editForm.category} onChange={e=>setEditForm({...editForm,category:e.target.value})}>
                        {allCatNames.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={{display:'flex',gap:8,marginBottom:8}}>
                      <select className="se-input" value={editForm.paid_by} onChange={e=>setEditForm({...editForm,paid_by:e.target.value})}>
                        {names.map(n=><option key={n} value={n}>{n}</option>)}
                      </select>
                      <input className="se-input" type="date" value={editForm.date} onChange={e=>setEditForm({...editForm,date:e.target.value})} />
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                      {['equal','personal','custom'].map(s=>(
                        <button key={s} className={`se-split ${editForm.split_type===s?'se-split-a':''}`} onClick={()=>{
                          const total=parseFloat(editForm.total_amount)||0;
                          let shares={};
                          if(s==='equal')names.forEach(n=>{shares[n]=total/names.length;});
                          else if(s==='personal')shares={[editForm.paid_by]:total};
                          else shares={...editForm.shares};
                          setEditForm({...editForm,split_type:s,shares});
                        }}>{s}</button>
                      ))}
                    </div>
                    {editForm.split_type==='custom'&&(
                      <div style={{marginBottom:8}}>
                        {names.map(n=>(
                          <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <span style={{fontSize:11,width:50,textTransform:'uppercase',letterSpacing:'0.06em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n}</span>
                            <input className="se-input" type="number" value={editForm.shares?.[n]||0}
                              onChange={e=>setEditForm({...editForm,shares:{...editForm.shares,[n]:parseFloat(e.target.value)||0}})} style={{flex:1,padding:'8px 10px'}} />
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                      <button className="se-sm" onClick={()=>setEditingId(null)}>Cancel</button>
                      <button className="se-sm se-sm-a" onClick={saveEdit}>Save</button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {filtered.length===0&&<div style={{textAlign:'center',padding:'60px 16px',fontSize:12,letterSpacing:'0.12em',textTransform:'uppercase',opacity:0.2}}>{expenses.length===0?'No expenses yet':'No results found'}</div>}
      </div>
    </div>
  );

  /* ═══ STATS TAB ═══ */
  const StatsTab = (()=>{
    const personTotals={};
    names.forEach(n=>{personTotals[n]=0;});
    monthExps.forEach(e=>{Object.entries(e.shares||{}).forEach(([n,a])=>{personTotals[n]=(personTotals[n]||0)+a;});});
    const grandTotal=Object.values(personTotals).reduce((s,v)=>s+v,0);

    const visExps=personFilter?monthExps.filter(e=>e.shares?.[personFilter]>0):monthExps;
    const catTotals={};
    visExps.forEach(e=>{catTotals[e.category]=(catTotals[e.category]||0)+e.total_amount;});
    const catData=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));

    const monthlyData={};
    expenses.forEach(e=>{
      const m=e.date?.slice(0,7);if(!m)return;
      if(!monthlyData[m]){monthlyData[m]={};names.forEach(n=>{monthlyData[m][n]=0;});}
      Object.entries(e.shares||{}).forEach(([n,a])=>{if(monthlyData[m][n]!==undefined)monthlyData[m][n]+=a;});
    });
    const barData=Object.entries(monthlyData).sort((a,b)=>a[0].localeCompare(b[0])).map(([m,dd])=>({month:m,...dd}));

    return (
      <div style={{paddingBottom:80,padding:16}}>
        {/* Month pills */}
        <div className="se-noscroll" style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:8}}>
          {months.map(m=>(<button key={m} className={`se-chip ${activeMonth===m?'se-chip-a':''}`} onClick={()=>setSelMonth(m)}>{m}</button>))}
        </div>

        {/* Summary Cards */}
        <div className="se-noscroll" style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4,marginTop:12}}>
          <button className="se-card" onClick={()=>setPersonFilter('')}
            style={{flexShrink:0,minWidth:100,padding:12,textAlign:'center',cursor:'pointer',border:'none',fontFamily:MONO,...(!personFilter?{background:'#222',color:'#f5f5ee'}:{})}}>
            <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',opacity:0.5}}>Together</div>
            <div style={{fontSize:14,fontWeight:700,fontVariantNumeric:'tabular-nums',marginTop:4}}>{fmt(grandTotal,defCur)}</div>
          </button>
          {names.map((n,i)=>(
            <button key={n} className="se-card" onClick={()=>setPersonFilter(personFilter===n?'':n)}
              style={{flexShrink:0,minWidth:100,padding:12,textAlign:'center',cursor:'pointer',border:'none',fontFamily:MONO,...(personFilter===n?{background:PCOL[i%PCOL.length],color:'#fff'}:{})}}>
              <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',opacity:0.5}}>{n}</div>
              <div style={{fontSize:14,fontWeight:700,fontVariantNumeric:'tabular-nums',marginTop:4}}>{fmt(personTotals[n]||0,defCur)}</div>
            </button>
          ))}
        </div>

        {/* Bar Chart */}
        {barData.length>0&&(
          <div className="se-card" style={{padding:16,marginTop:12}}>
            <div className="se-label" style={{marginBottom:12}}>Monthly by Person</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData}>
                <XAxis dataKey="month" tick={{fontSize:10,fontFamily:MONO}} tickFormatter={v=>v.slice(5)} />
                <YAxis tick={{fontSize:10,fontFamily:MONO}} width={40} />
                <RTooltip formatter={(v,n)=>[fmt(v,defCur),n]} contentStyle={{fontFamily:MONO,fontSize:11}} />
                {names.map((n,i)=>(<Bar key={n} dataKey={n} fill={PCOL[i%PCOL.length]} opacity={personFilter&&personFilter!==n?0.2:1} radius={[3,3,0,0]} />))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Pie Chart */}
        {catData.length>0&&(
          <div className="se-card" style={{padding:16,marginTop:12}}>
            <div className="se-label" style={{marginBottom:12}}>Categories</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} style={{fontSize:9,fontFamily:MONO}}>
                  {catData.map((dd,i)=>(<Cell key={i} fill={catFor(dd.name).c} />))}
                </Pie>
                <RTooltip formatter={v=>fmt(v,defCur)} contentStyle={{fontFamily:MONO,fontSize:11}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Category Breakdown */}
        {catData.length>0&&(
          <div className="se-card" style={{padding:16,marginTop:12}}>
            <div className="se-label" style={{marginBottom:12}}>Breakdown</div>
            {catData.map(({name,value})=>{
              const ci=catFor(name);const pct=grandTotal>0?(value/grandTotal*100):0;
              return (
                <div key={name} style={{marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:12,letterSpacing:'0.04em',textTransform:'uppercase'}}>
                    <span>{ci.emoji} {name}</span>
                    <span style={{fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{fmt(value,defCur)} <span style={{fontSize:10,opacity:0.35}}>({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{height:6,background:'#F0F0EA',borderRadius:99,marginTop:4,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:99,width:`${pct}%`,background:ci.c,transition:'width 0.5s ease'}} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  })();

  /* ═══ SETTINGS TAB ═══ */
  const SettingsTab = (
    <div style={{paddingBottom:80,padding:16}}>
      {/* Session */}
      <div className="se-card" style={{padding:16,marginBottom:12}}>
        <div className="se-label" style={{marginBottom:12}}>Session</div>
        <div style={{fontSize:12,letterSpacing:'0.04em',textTransform:'uppercase',opacity:0.5,marginBottom:4}}>Logged in as <strong style={{opacity:1}}>{user?.email}</strong></div>
        <div style={{fontSize:12,letterSpacing:'0.04em',textTransform:'uppercase',opacity:0.5,marginBottom:12}}>List: <strong style={{opacity:1}}>{currentList?.name}</strong></div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button className="se-sm" onClick={()=>{setCurrentList(null);setTab('home');}}>Switch List</button>
          <button className="se-sm" style={{color:'#dc2626'}} onClick={logout}><LogOut size={12} style={{marginRight:4,verticalAlign:'middle'}} />Log Out</button>
        </div>
        {!confirmDeleteList?(
          <button className="se-ghost" style={{marginTop:12,fontSize:10,color:'#dc2626',opacity:0.5}} onClick={()=>setConfirmDeleteList(true)}>Delete this list…</button>
        ):(
          <div style={{marginTop:12,background:'#fef2f2',borderRadius:12,padding:12}}>
            <div style={{fontSize:12,fontWeight:700,color:'#dc2626',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Delete "{currentList?.name}"?</div>
            <div style={{fontSize:10,color:'#dc2626',opacity:0.6,marginBottom:8}}>This will permanently delete everything.</div>
            <div style={{display:'flex',gap:8}}>
              <button className="se-sm" style={{background:'#dc2626',color:'#fff',fontWeight:700}} onClick={()=>{setCurrentList(null);setTab('home');setConfirmDeleteList(false);showToast('List deleted');}}>Delete</button>
              <button className="se-sm" onClick={()=>setConfirmDeleteList(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Invite Code */}
      <div className="se-card" style={{padding:16,marginBottom:12}}>
        <div className="se-label" style={{marginBottom:8}}>Invite Code</div>
        <div style={{background:'#F0F0EA',padding:'12px 14px',borderRadius:12,fontSize:14,fontWeight:700,letterSpacing:'0.1em',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span>{currentList?.invite_code}</span>
          <button onClick={()=>showToast('Copied!')} style={{width:32,height:32,borderRadius:12,border:'none',background:'#e8e8df',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}><Copy size={14}/></button>
        </div>
        <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',opacity:0.25,marginTop:8}}>Share this code so others can join</div>
      </div>

      {/* Members */}
      <div className="se-card" style={{padding:16,marginBottom:12}}>
        <div className="se-label" style={{marginBottom:12}}>Members ({members.length})</div>
        {members.map((m,i)=>(
          <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:10,background:'#F0F0EA',borderRadius:12,marginBottom:6}}>
            <div style={{width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700,flexShrink:0,background:PCOL[i%PCOL.length]}}>{m.display_name?.[0]?.toUpperCase()}</div>
            <div style={{flex:1,minWidth:0}}>
              {m.user_id==='u1'&&nameEditing?(
                <div style={{display:'flex',gap:4}}>
                  <input className="se-input" value={editName} onChange={e=>setEditName(e.target.value)} style={{flex:1,padding:'6px 10px',fontSize:12}} />
                  <button onClick={()=>{updateMyName(editName);setNameEditing(false);showToast('Name updated');}} style={{background:'none',border:'none',cursor:'pointer',color:'#15803d'}}><Check size={16}/></button>
                  <button onClick={()=>setNameEditing(false)} style={{background:'none',border:'none',cursor:'pointer',opacity:0.4}}><X size={16}/></button>
                </div>
              ):(
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <span style={{fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em'}}>{m.display_name}</span>
                  {m.user_id==='u1'&&<>
                    <span style={{fontSize:9,letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:700,background:'#e8e8df',padding:'2px 6px',borderRadius:9999}}>you</span>
                    <button onClick={()=>{setEditName(m.display_name);setNameEditing(true);}} style={{background:'none',border:'none',cursor:'pointer',opacity:0.3,marginLeft:4}}><Pencil size={12}/></button>
                  </>}
                </div>
              )}
              <div style={{fontSize:10,opacity:0.35,letterSpacing:'0.04em',marginTop:1}}>{m.email}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Currency */}
      <div className="se-card" style={{padding:16,marginBottom:12}}>
        <div className="se-label" style={{marginBottom:8}}>Currency & Exchange Rates</div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <span style={{background:'#222',color:'#f5f5ee',padding:'8px 14px',borderRadius:12,fontSize:14,fontWeight:700,letterSpacing:'0.1em'}}>{defCur}</span>
          <span style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',opacity:0.35}}>Set at list creation</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:6}}>
          {ALL_CUR.filter(c=>c!==defCur).map(c=>(
            <div key={c} style={{background:'#F0F0EA',borderRadius:12,padding:'8px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:11}}>
              <span style={{fontWeight:700,letterSpacing:'0.06em'}}>{CURR_FLAG[c]} {c}</span>
              <span style={{opacity:0.4,fontVariantNumeric:'tabular-nums'}}>{RATES[c]?(RATES[c]).toFixed(NO_DEC.has(c)?0:2):'–'}</span>
            </div>
          ))}
        </div>
        <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',opacity:0.25,marginTop:8}}>1 {defCur} = listed amount in each currency</div>
      </div>

      {/* Categories */}
      <div className="se-card" style={{padding:16,marginBottom:12}}>
        <div className="se-label" style={{marginBottom:8}}>Categories</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:12}}>
          {Object.entries(CATS).map(([n,c])=>(<span key={n} className="se-tag" style={{background:c.bg,color:c.tx}}>{c.emoji} {n}</span>))}
          {Object.entries(customCats).map(([n,c])=>(
            <span key={n} className="se-tag" style={{background:c.bg,color:c.tx,display:'flex',alignItems:'center',gap:4}}>
              {c.emoji} {n}
              <button onClick={()=>{const nc={...customCats};delete nc[n];setCustomCats(nc);showToast('Deleted: '+n);}} style={{background:'none',border:'none',cursor:'pointer',opacity:0.5,padding:0,lineHeight:1}}><X size={10}/></button>
            </span>
          ))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <input className="se-input" placeholder="New category…" value={newCatName} onChange={e=>setNewCatName(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')addCustomCat();}} style={{flex:1}} />
          <button className="se-sm se-sm-a" onClick={addCustomCat}><Plus size={14}/></button>
        </div>
      </div>

      {/* Learned */}
      {Object.keys(catOverrides).length>0&&(
        <div className="se-card" style={{padding:16,marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div className="se-label">Learned Categories</div>
            <button className="se-ghost" style={{fontSize:10,color:'#dc2626',opacity:0.6,padding:0}} onClick={()=>{setCatOverrides({});showToast('Cleared');}}>Clear all</button>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {Object.entries(catOverrides).map(([w,c])=>(<span key={w} style={{background:'#F0F0EA',padding:'4px 8px',borderRadius:8,fontSize:10,letterSpacing:'0.04em'}}>{w} → {c}</span>))}
          </div>
        </div>
      )}

      {/* Import/Export */}
      <div className="se-card" style={{padding:16,marginBottom:12}}>
        <div className="se-label" style={{marginBottom:8}}>Import & Export</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          <button className="se-sm" style={{textAlign:'center'}} onClick={exportJSON}>↓ JSON</button>
          <button className="se-sm" style={{textAlign:'center'}} onClick={exportCSV}>↓ CSV</button>
          <button className="se-sm" style={{textAlign:'center',opacity:0.4}} onClick={()=>showToast('Use JSON export above to backup data')}>↑ JSON</button>
          <button className="se-sm" style={{textAlign:'center',opacity:0.4}} onClick={()=>showToast('Use CSV export above to backup data')}>↑ CSV</button>
        </div>
      </div>

      {/* Tips */}
      <div className="se-card" style={{padding:16,marginBottom:12}}>
        <div className="se-label" style={{marginBottom:8}}>Quick Add Tips</div>
        <div style={{fontSize:11,letterSpacing:'0.04em',opacity:0.4,lineHeight:1.8}}>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>dinner 50</code> — equal split in {defCur}</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>coffee ¥500</code> — auto-converts from CNY</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>taxi 30 Sam paid</code> — Sam paid</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>groceries 80 personal</code> — no split</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>dinner 120 for Sam</code> — 100% Sam</div>
          <div><code style={{background:'#F0F0EA',padding:'2px 6px',borderRadius:4,opacity:1,color:'#1a1a1a'}}>rent 900 60/40</code> — custom ratio</div>
        </div>
      </div>
    </div>
  );

  /* ═══ MAIN LAYOUT ═══ */
  return (
    <>
      <style>{CSS}</style>
      <div className="se" style={{minHeight:'100vh',maxWidth:480,margin:'0 auto',position:'relative'}}>
        {Toast}
        {ConfirmModal}
        {tab==='home'&&HomeTab}
        {tab==='stats'&&StatsTab}
        {tab==='settings'&&SettingsTab}

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
              <span style={{fontSize:9,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,marginTop:2}}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}