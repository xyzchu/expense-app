import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip as RTooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Plus, Trash2, X, Eye, EyeOff, Upload, ChevronDown, ChevronUp,
  MessageSquare, BarChart2, Table2, Settings2, Send, RefreshCw, Check
} from 'lucide-react';

/* ─── constants ─────────────────────────────────────────────────── */
const MONO = '"SF Mono","Fira Code","Cascadia Code","Consolas","Liberation Mono",monospace';
const CATS = ['Cash', 'Securities', 'Credit Card', 'Income', 'Expense', 'Others'];
const CAT_COLOR = {
  Cash: '#3b82f6', Securities: '#8b5cf6', 'Credit Card': '#ef4444',
  Income: '#22c55e', Expense: '#f97316', Others: '#6b7280',
};
const ALL_CUR = ['HKD', 'AUD', 'USD', 'CNY', 'THB', 'EUR', 'SGD'];

// Convert amount from one currency to another using rates object (USD-based)
const cvt = (amount, from, to, rates) => {
  if (!amount || from === to || !from || !to) return amount || 0;
  const fr = rates?.[from] || 1, tr = rates?.[to] || 1;
  return (amount / fr) * tr;
};

const fmtNum = (n, cur = 'HKD') => {
  const noDec = new Set(['JPY', 'KRW', 'VND', 'IDR']);
  const d = noDec.has(cur) ? 0 : 0; // show 0 decimals for cleaner table
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: cur,
      minimumFractionDigits: d, maximumFractionDigits: d
    }).format(n);
  } catch { return `${cur} ${n?.toFixed(d) ?? 0}`; }
};

/* ─── mock data ──────────────────────────────────────────────────── */
const MOCK_ACCOUNTS = [
  { id: 'a1', bank: 'HSBC', account_name: 'Saving', account_number: '001', currency: 'HKD', category: 'Cash', sort_order: 1 },
  { id: 'a2', bank: 'HSBC', account_name: 'USD', account_number: '892', currency: 'USD', category: 'Cash', sort_order: 2 },
  { id: 'a3', bank: 'HSBC Securities', account_name: 'Renee Stock', account_number: '210', currency: 'HKD', category: 'Securities', sort_order: 3 },
  { id: 'a4', bank: 'HSBC Securities', account_name: 'US Stock', account_number: '445', currency: 'USD', category: 'Securities', sort_order: 4 },
  { id: 'a5', bank: 'Commonwealth Bank', account_name: 'Everyday Offset', account_number: '334', currency: 'AUD', category: 'Cash', sort_order: 5 },
  { id: 'a6', bank: 'Commonwealth Bank', account_name: 'Home Loan', account_number: '512', currency: 'AUD', category: 'Cash', sort_order: 6 },
  { id: 'a7', bank: 'DBS', account_name: 'Master Card', account_number: '781', currency: 'HKD', category: 'Credit Card', sort_order: 7 },
  { id: 'a8', bank: 'Futubull', account_name: 'US Stock', account_number: '993', currency: 'USD', category: 'Securities', sort_order: 8 },
  { id: 'a9', bank: 'Bangkok Bank', account_name: 'THB', account_number: '226', currency: 'THB', category: 'Cash', sort_order: 9 },
  { id: 'a10', bank: 'Skypark', account_name: 'Rent', account_number: null, currency: 'HKD', category: 'Income', sort_order: 10 },
  { id: 'a11', bank: 'Australia', account_name: 'Mortgage', account_number: null, currency: 'AUD', category: 'Expense', sort_order: 11 },
];

const MOCK_SNAPSHOTS = [
  // 2026-03-12
  { id: 's1', account_id: 'a1', snapshot_date: '2026-03-12', balance: 74323 },
  { id: 's2', account_id: 'a2', snapshot_date: '2026-03-12', balance: 886 },
  { id: 's3', account_id: 'a3', snapshot_date: '2026-03-12', balance: 649344 },
  { id: 's4', account_id: 'a4', snapshot_date: '2026-03-12', balance: 206821 },
  { id: 's5', account_id: 'a5', snapshot_date: '2026-03-12', balance: 15201 },
  { id: 's6', account_id: 'a6', snapshot_date: '2026-03-12', balance: 375666 },
  { id: 's7', account_id: 'a7', snapshot_date: '2026-03-12', balance: 24528 },
  { id: 's8', account_id: 'a8', snapshot_date: '2026-03-12', balance: 406819 },
  { id: 's9', account_id: 'a9', snapshot_date: '2026-03-12', balance: 225554 },
  { id: 's10', account_id: 'a10', snapshot_date: '2026-03-12', balance: 19500 },
  { id: 's11', account_id: 'a11', snapshot_date: '2026-03-12', balance: 3837 },
  // 2026-02-12
  { id: 's12', account_id: 'a1', snapshot_date: '2026-02-12', balance: 108852 },
  { id: 's13', account_id: 'a2', snapshot_date: '2026-02-12', balance: 643 },
  { id: 's14', account_id: 'a3', snapshot_date: '2026-02-12', balance: 696572 },
  { id: 's15', account_id: 'a4', snapshot_date: '2026-02-12', balance: 210743 },
  { id: 's16', account_id: 'a5', snapshot_date: '2026-02-12', balance: 12040 },
  { id: 's17', account_id: 'a6', snapshot_date: '2026-02-12', balance: 376386 },
  { id: 's18', account_id: 'a7', snapshot_date: '2026-02-12', balance: 28643 },
  { id: 's19', account_id: 'a8', snapshot_date: '2026-02-12', balance: 361574 },
  { id: 's20', account_id: 'a9', snapshot_date: '2026-02-12', balance: 185554 },
  // 2026-01-11
  { id: 's21', account_id: 'a1', snapshot_date: '2026-01-11', balance: 111768 },
  { id: 's22', account_id: 'a2', snapshot_date: '2026-01-11', balance: 367 },
  { id: 's23', account_id: 'a3', snapshot_date: '2026-01-11', balance: 626506 },
  { id: 's24', account_id: 'a4', snapshot_date: '2026-01-11', balance: 213986 },
  { id: 's25', account_id: 'a5', snapshot_date: '2026-01-11', balance: 10920 },
  { id: 's26', account_id: 'a6', snapshot_date: '2026-01-11', balance: 376826 },
  { id: 's27', account_id: 'a7', snapshot_date: '2026-01-11', balance: 64553 },
  { id: 's28', account_id: 'a8', snapshot_date: '2026-01-11', balance: 423909 },
  { id: 's29', account_id: 'a9', snapshot_date: '2026-01-11', balance: 175687 },
  // 2025-12-13
  { id: 's30', account_id: 'a1', snapshot_date: '2025-12-13', balance: 142825 },
  { id: 's31', account_id: 'a2', snapshot_date: '2025-12-13', balance: 14 },
  { id: 's32', account_id: 'a3', snapshot_date: '2025-12-13', balance: 590327 },
  { id: 's33', account_id: 'a4', snapshot_date: '2025-12-13', balance: 216755 },
  { id: 's34', account_id: 'a5', snapshot_date: '2025-12-13', balance: 9297 },
  { id: 's35', account_id: 'a6', snapshot_date: '2025-12-13', balance: 377267 },
  { id: 's36', account_id: 'a7', snapshot_date: '2025-12-13', balance: 95653 },
  { id: 's37', account_id: 'a8', snapshot_date: '2025-12-13', balance: 415816 },
  { id: 's38', account_id: 'a9', snapshot_date: '2025-12-13', balance: 135535 },
  // 2025-11-12
  { id: 's39', account_id: 'a1', snapshot_date: '2025-11-12', balance: 180805 },
  { id: 's40', account_id: 'a2', snapshot_date: '2025-11-12', balance: 15 },
  { id: 's41', account_id: 'a3', snapshot_date: '2025-11-12', balance: 576397 },
  { id: 's42', account_id: 'a4', snapshot_date: '2025-11-12', balance: 83106 },
  { id: 's43', account_id: 'a5', snapshot_date: '2025-11-12', balance: 5756 },
  { id: 's44', account_id: 'a6', snapshot_date: '2025-11-12', balance: 377779 },
  { id: 's45', account_id: 'a7', snapshot_date: '2025-11-12', balance: 78410 },
  { id: 's46', account_id: 'a8', snapshot_date: '2025-11-12', balance: 255095 },
  { id: 's47', account_id: 'a9', snapshot_date: '2025-11-12', balance: 95535 },
];

/* ─── styles ─────────────────────────────────────────────────────── */
const S = {
  card: { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 12 },
  input: { border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: MONO, outline: 'none', background: '#fafafa', width: '100%', boxSizing: 'border-box' },
  btnDark: { background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 12, fontFamily: MONO, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' },
  btnGhost: { background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontFamily: MONO, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  label: { fontSize: 10, fontFamily: MONO, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280' },
  pill: (active) => ({
    display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 11,
    fontFamily: MONO, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? '#1a1a1a' : '#f3f4f6',
    color: active ? '#fff' : '#374151',
    border: 'none',
    letterSpacing: '0.04em',
  }),
  catBadge: (cat) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10,
    fontFamily: MONO, fontWeight: 700, textTransform: 'uppercase',
    background: CAT_COLOR[cat] + '20', color: CAT_COLOR[cat],
  }),
};

/* ─── helpers ────────────────────────────────────────────────────── */
const normalizeDate = (s) => {
  if (!s) return null;
  const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  let m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (m) return `${m[3]}-${String(months[m[2]]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  m = s.match(/(\d{4})-([A-Za-z]{3})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(months[m[2]]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return null;
};

const parseCSVLine = (line) => {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
};

const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function FinancesTab({ user, sb, showToast, rates, MONO: monoFont }) {
  /* ── state ── */
  const [accounts, setAccounts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [dates, setDates] = useState([]);
  const [selDate, setSelDate] = useState('');
  const [view, setView] = useState('table');          // 'table' | 'chart' | 'chat' | 'settings'
  const [displayCurrency, setDisplayCurrency] = useState('HKD');

  // add account
  const [showAddAcc, setShowAddAcc] = useState(false);
  const [newAcc, setNewAcc] = useState({ bank: '', account_name: '', account_number: '', currency: 'HKD', category: 'Cash' });

  // manual entry
  const [showManual, setShowManual] = useState(false);
  const [manualAccId, setManualAccId] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualBalance, setManualBalance] = useState('');

  // extraction
  const [extracting, setExtracting] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const fileRef = useRef(null);
  const csvRef = useRef(null);

  // csv import
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  // chat
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Hi! Ask me anything about your finances — e.g. "What is my net worth in HKD?" or "Average cash balance in 2025?"' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // settings
  const [xaiApiKey, setXaiApiKey] = useState('');
  const [showXaiKey, setShowXaiKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  // confirm delete
  const [confirmDeleteAcc, setConfirmDeleteAcc] = useState(null);

  /* ── derived dates ── */
  useEffect(() => {
    const unique = [...new Set(snapshots.map(s => s.snapshot_date))].sort().reverse();
    setDates(unique);
    if (!selDate && unique.length) setSelDate(unique[0]);
  }, [snapshots]);

  /* ── scroll chat to bottom ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /* ── load from DB ── */
  const loadAll = useCallback(async () => {
    if (!user || !sb) return;
    const [{ data: accs }, { data: snaps }, { data: settings }] = await Promise.all([
      sb.from('financial_accounts').select('*').eq('user_id', user.id).order('sort_order'),
      sb.from('financial_snapshots').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
      sb.from('user_settings').select('*').eq('user_id', user.id),
    ]);
    if (accs) setAccounts(accs);
    if (snaps) setSnapshots(snaps);
    if (settings) {
      const key = settings.find(r => r.key === 'xai_api_key');
      if (key?.value) setXaiApiKey(key.value);
      const cur = settings.find(r => r.key === 'finances_display_currency');
      if (cur?.value) setDisplayCurrency(cur.value);
    }
  }, [user, sb]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── currency conversion ── */
  const toDisplay = (amount, fromCur) => cvt(amount, fromCur, displayCurrency, rates);

  /* ── balance for account on date ── */
  const bal = (accId, date) => snapshots.find(s => s.account_id === accId && s.snapshot_date === date)?.balance;

  /* ── category totals for selected date ── */
  const catTotal = (cat) => {
    return accounts
      .filter(a => a.category === cat)
      .reduce((sum, a) => {
        const b = bal(a.id, selDate);
        return b != null ? sum + toDisplay(b, a.currency) : sum;
      }, 0);
  };

  const netWorth = catTotal('Cash') + catTotal('Securities') - catTotal('Credit Card');

  /* ── chart data (last 12 months) ── */
  const chartData = dates.slice(0, 12).reverse().map(date => {
    const cashTotal = accounts.filter(a => a.category === 'Cash')
      .reduce((sum, a) => { const b = bal(a.id, date); return b != null ? sum + toDisplay(b, a.currency) : sum; }, 0);
    const secTotal = accounts.filter(a => a.category === 'Securities')
      .reduce((sum, a) => { const b = bal(a.id, date); return b != null ? sum + toDisplay(b, a.currency) : sum; }, 0);
    const ccTotal = accounts.filter(a => a.category === 'Credit Card')
      .reduce((sum, a) => { const b = bal(a.id, date); return b != null ? sum + toDisplay(b, a.currency) : sum; }, 0);
    return {
      date: date.slice(0, 7), // YYYY-MM
      Cash: Math.round(cashTotal),
      Securities: Math.round(secTotal),
      'Credit Card': Math.round(ccTotal),
      Net: Math.round(cashTotal + secTotal - ccTotal),
    };
  });

  /* ── pie data for selected date ── */
  const pieData = CATS.filter(c => c !== 'Income' && c !== 'Expense').map(cat => ({
    name: cat,
    value: Math.abs(Math.round(catTotal(cat))),
    color: CAT_COLOR[cat],
  })).filter(d => d.value > 0);

  /* ── CSV import ── */
  const handleCsvFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target: { result } }) => {
      const lines = result.split('\n');
      const header = parseCSVLine(lines[0]);
      const dateCols = header.slice(4).map(d => d.trim()).filter(Boolean);
      const rows = [];
      for (const line of lines.slice(1)) {
        if (!line.trim() || line.startsWith(',,,,')) continue;
        const cols = parseCSVLine(line);
        const [bank, account, currency, category] = cols;
        if (!bank || !account || !currency || !category) continue;
        if (['Exchange Rate', 'Adjustment', 'Remark', ''].includes(bank.trim())) continue;
        const snaps = [];
        dateCols.forEach((rawDate, i) => {
          const raw = cols[4 + i]?.replace(/[$," ]/g, '').trim();
          if (!raw || raw === '-' || raw === '' || raw.includes('#REF') || raw.includes('#')) return;
          const balance = parseFloat(raw.replace(/\(([^)]+)\)/, '-$1'));
          if (isNaN(balance)) return;
          const date = normalizeDate(rawDate);
          if (date) snaps.push({ date, balance });
        });
        if (snaps.length) rows.push({ bank: bank.trim(), account_name: account.trim(), currency: currency.trim(), category: category.trim(), snapshots: snaps });
      }
      setImportPreview(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /* ── extraction from image/PDF ── */
  const handleExtractFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    if (!xaiApiKey) { showToast?.('Set xAI API key in Finances Settings first'); return; }
    setExtracting(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const resp = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${xaiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-4.1-fast',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${file.type};base64,${base64}` } },
              { type: 'text', text: 'Extract from this bank statement or screenshot: account number (last 4 digits only), statement date (YYYY-MM-DD format), and account balance (numeric only, no currency symbol). Return only valid JSON: {"account_number":"1234","date":"YYYY-MM-DD","balance":12345.67}' }
            ]
          }],
          temperature: 0
        })
      });
      const json = await resp.json();
      const raw = json.choices?.[0]?.message?.content || '';
      let parsed = {};
      try { parsed = JSON.parse(raw); }
      catch { const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) try { parsed = JSON.parse(m[1]); } catch { } }
      const matched = accounts.find(a => a.account_number && parsed.account_number &&
        a.account_number.replace(/\D/g, '').endsWith(parsed.account_number.replace(/\D/g, '')));
      setPendingExtraction({
        matched_account_id: matched?.id || '',
        detected_account_number: parsed.account_number || '',
        detected_date: parsed.date || new Date().toISOString().slice(0, 10),
        detected_balance: parsed.balance ?? '',
        raw
      });
    } catch (err) {
      showToast?.('Extraction failed: ' + err.message);
    }
    setExtracting(false);
  };

  const confirmExtraction = async () => {
    const { matched_account_id, detected_date, detected_balance } = pendingExtraction;
    if (!matched_account_id || !detected_date) { showToast?.('Select an account'); return; }
    if (sb && user) {
      await sb.from('financial_snapshots').upsert(
        { account_id: matched_account_id, user_id: user.id, snapshot_date: detected_date, balance: Number(detected_balance) },
        { onConflict: 'account_id,snapshot_date' }
      );
      await loadAll();
    }
    setPendingExtraction(null);
    showToast?.('Saved');
  };

  /* ── manual save ── */
  const saveManual = async () => {
    if (!manualAccId || !manualDate || manualBalance === '') return;
    if (sb && user) {
      await sb.from('financial_snapshots').upsert(
        { account_id: manualAccId, user_id: user.id, snapshot_date: manualDate, balance: parseFloat(manualBalance) },
        { onConflict: 'account_id,snapshot_date' }
      );
      await loadAll();
    }
    setShowManual(false);
    setManualBalance('');
    showToast?.('Saved');
  };

  /* ── add account ── */
  const addAccount = async () => {
    if (!newAcc.bank || !newAcc.account_name) return;
    if (sb && user) {
      await sb.from('financial_accounts').insert({
        ...newAcc, user_id: user.id, sort_order: accounts.length + 1
      });
      await loadAll();
    } else {
      setAccounts(prev => [...prev, { ...newAcc, id: 'new_' + Date.now(), sort_order: prev.length + 1 }]);
    }
    setNewAcc({ bank: '', account_name: '', account_number: '', currency: 'HKD', category: 'Cash' });
    setShowAddAcc(false);
    showToast?.('Account added');
  };

  /* ── AI chat ── */
  const buildContext = () => {
    const recentDates = dates.slice(0, 12);
    let ctx = `User financial data (balances in native currency):\n`;
    ctx += `Accounts: ${accounts.length} across ${[...new Set(accounts.map(a => a.bank))].length} banks\n\n`;
    for (const date of recentDates) {
      ctx += `Date: ${date}\n`;
      for (const acc of accounts) {
        const b = bal(acc.id, date);
        if (b != null) ctx += `  ${acc.bank} / ${acc.account_name} (${acc.currency}, ${acc.category}): ${b}\n`;
      }
    }
    return ctx;
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    if (!xaiApiKey) { showToast?.('Set xAI API key in Finances Settings'); return; }
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(m => [...m, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    try {
      const context = buildContext();
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${xaiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-4.1-fast',
          messages: [
            { role: 'system', content: `You are a personal financial assistant. Answer concisely.\n\n${context}` },
            ...chatMessages.filter(m => m.role !== 'system'),
            { role: 'user', content: userMsg }
          ]
        })
      });
      const json = await res.json();
      const reply = json.choices?.[0]?.message?.content || 'No response';
      setChatMessages(m => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      setChatMessages(m => [...m, { role: 'assistant', content: 'Error: ' + err.message }]);
    }
    setChatLoading(false);
  };

  const saveUserSetting = async (key, value) => {
    if (!sb || !user) return;
    await sb.from('user_settings').upsert({ user_id: user.id, key, value }, { onConflict: 'user_id,key' });
  };

  const saveApiKey = async () => {
    setSavingKey(true);
    await saveUserSetting('xai_api_key', xaiApiKey);
    setSavingKey(false);
    showToast?.('API key saved');
  };

  const changeDisplayCurrency = (cur) => {
    setDisplayCurrency(cur);
    saveUserSetting('finances_display_currency', cur);
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER SECTIONS
  ═══════════════════════════════════════════════════════════════ */

  /* ── top bar ── */
  const TopBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px' }}>
      <div style={{ ...S.label, fontSize: 13, color: '#1a1a1a' }}>Finances</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setShowManual(true)} style={{ ...S.btnGhost, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={14} /> <span style={{ fontSize: 11 }}>Add</span>
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={extracting}
          style={{ ...S.btnGhost, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          {extracting ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
          <span style={{ fontSize: 11 }}>Scan</span>
        </button>
        <button onClick={() => csvRef.current?.click()} style={{ ...S.btnGhost, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Upload size={14} /><span style={{ fontSize: 11 }}>CSV</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleExtractFile} />
        <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvFile} />
      </div>
    </div>
  );

  /* ── display currency pills ── */
  const CurrencyPills = (
    <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', overflowX: 'auto' }}>
      <span style={{ ...S.label, lineHeight: '26px', flexShrink: 0 }}>View in</span>
      {ALL_CUR.map(c => (
        <button key={c} style={S.pill(c === displayCurrency)} onClick={() => changeDisplayCurrency(c)}>{c}</button>
      ))}
    </div>
  );

  /* ── date pills ── */
  const DatePills = (
    <div style={{ display: 'flex', gap: 6, padding: '0 16px 12px', overflowX: 'auto' }}>
      {dates.map(d => (
        <button key={d} style={S.pill(d === selDate)} onClick={() => setSelDate(d)}>{fmtDate(d)}</button>
      ))}
    </div>
  );

  /* ── view toggle ── */
  const ViewToggle = (
    <div style={{ display: 'flex', gap: 0, margin: '0 16px 12px', background: '#f3f4f6', borderRadius: 12, padding: 3 }}>
      {[
        { id: 'table', icon: Table2, label: 'Table' },
        { id: 'chart', icon: BarChart2, label: 'Chart' },
        { id: 'chat', icon: MessageSquare, label: 'AI Chat' },
        { id: 'settings', icon: Settings2, label: 'Settings' },
      ].map(v => (
        <button key={v.id} onClick={() => setView(v.id)} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '7px 4px', border: 'none', cursor: 'pointer', borderRadius: 10,
          background: view === v.id ? '#fff' : 'none',
          color: view === v.id ? '#1a1a1a' : '#9ca3af',
          fontFamily: MONO, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          boxShadow: view === v.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.15s',
        }}>
          <v.icon size={13} />
          <span style={{ display: window.innerWidth > 360 ? 'inline' : 'none' }}>{v.label}</span>
        </button>
      ))}
    </div>
  );

  /* ── table view ── */
  const TableView = (
    <div style={{ padding: '0 16px' }}>
      {CATS.map(cat => {
        const catAccounts = accounts.filter(a => a.category === cat);
        if (!catAccounts.length) return null;
        const total = catTotal(cat);
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={S.catBadge(cat)}>{cat}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: cat === 'Credit Card' ? '#ef4444' : cat === 'Income' ? '#22c55e' : '#1a1a1a' }}>
                {fmtNum(total, displayCurrency)}
              </span>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              {catAccounts.map((acc, i) => {
                const balance = bal(acc.id, selDate);
                return (
                  <div key={acc.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                    padding: '10px 14px', gap: 8, alignItems: 'center',
                    borderBottom: i < catAccounts.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: '#111' }}>{acc.bank}</div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280' }}>
                        {acc.account_name}{acc.account_number ? ` ···${acc.account_number}` : ''}
                      </div>
                    </div>
                    <span style={{ ...S.label, color: '#9ca3af', fontSize: 9 }}>{acc.currency}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: balance == null ? '#d1d5db' : cat === 'Credit Card' ? '#ef4444' : '#1a1a1a', textAlign: 'right' }}>
                      {balance != null ? fmtNum(balance, acc.currency) : '—'}
                    </span>
                    <button onClick={() => setConfirmDeleteAcc(acc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 2 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Summary card */}
      <div style={{ ...S.card, background: '#1a1a1a', color: '#fff' }}>
        <div style={{ ...S.label, color: '#9ca3af', marginBottom: 12 }}>Net Worth Summary ({displayCurrency})</div>
        {[
          { label: 'Total Cash', value: catTotal('Cash'), positive: true },
          { label: 'Total Securities', value: catTotal('Securities'), positive: true },
          { label: 'Credit Card', value: catTotal('Credit Card'), positive: false },
          { label: 'Total Income', value: catTotal('Income'), positive: true },
          { label: 'Total Expense', value: catTotal('Expense'), positive: false },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: '#9ca3af' }}>{row.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: row.positive ? '#86efac' : '#fca5a5' }}>
              {fmtNum(row.value, displayCurrency)}
            </span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #374151', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#fff' }}>NET (Cash + Sec − Credit)</span>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: netWorth >= 0 ? '#4ade80' : '#f87171' }}>
            {fmtNum(netWorth, displayCurrency)}
          </span>
        </div>
      </div>

      {/* Add account button */}
      <button onClick={() => setShowAddAcc(true)} style={{ ...S.btnGhost, width: '100%', marginBottom: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={14} /> Add Account
      </button>
    </div>
  );

  /* ── chart view ── */
  const ChartView = (
    <div style={{ padding: '0 16px' }}>
      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 12 }}>Net Worth Trend ({displayCurrency})</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <XAxis dataKey="date" tick={{ fontSize: 9, fontFamily: MONO }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fontFamily: MONO }} tickLine={false} axisLine={false}
              tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} width={40} />
            <RTooltip formatter={(v, name) => [fmtNum(v, displayCurrency), name]}
              labelStyle={{ fontFamily: MONO, fontSize: 10 }} contentStyle={{ borderRadius: 8, fontSize: 11, fontFamily: MONO }} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: MONO }} />
            <Line type="monotone" dataKey="Cash" stroke={CAT_COLOR.Cash} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Securities" stroke={CAT_COLOR.Securities} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Credit Card" stroke={CAT_COLOR['Credit Card']} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Net" stroke="#1a1a1a" strokeWidth={2.5} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 12 }}>Portfolio Breakdown — {fmtDate(selDate)} ({displayCurrency})</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
              {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <RTooltip formatter={(v, name) => [fmtNum(v, displayCurrency), name]}
              contentStyle={{ borderRadius: 8, fontSize: 11, fontFamily: MONO }} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: MONO }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  /* ── chat view ── */
  const ChatView = (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 260px)', padding: '0 16px' }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: 14,
              background: msg.role === 'user' ? '#1a1a1a' : '#f3f4f6',
              color: msg.role === 'user' ? '#fff' : '#1a1a1a',
              fontFamily: MONO, fontSize: 12, lineHeight: 1.5,
              borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
              borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 14,
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {chatLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 4, background: '#f3f4f6', fontFamily: MONO, fontSize: 12, color: '#9ca3af' }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, paddingTop: 8, paddingBottom: 80 }}>
        <input
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
          placeholder="Ask about your finances…"
          style={{ ...S.input, flex: 1 }}
        />
        <button onClick={sendChat} disabled={chatLoading} style={{ ...S.btnDark, padding: '9px 14px' }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );

  /* ── settings view ── */
  const SettingsView = (
    <div style={{ padding: '0 16px 80px' }}>
      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 12 }}>xAI API Key</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type={showXaiKey ? 'text' : 'password'}
            value={xaiApiKey}
            onChange={e => setXaiApiKey(e.target.value)}
            placeholder="xai-…"
            style={{ ...S.input, flex: 1 }}
          />
          <button onClick={() => setShowXaiKey(v => !v)} style={{ ...S.btnGhost, padding: '8px 10px' }}>
            {showXaiKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button onClick={saveApiKey} disabled={savingKey} style={{ ...S.btnDark, padding: '8px 14px' }}>
            {savingKey ? <RefreshCw size={14} /> : <Check size={14} />}
          </button>
        </div>
        <div style={{ ...S.label, fontSize: 9, opacity: 0.6 }}>
          Used for AI chat and statement scanning. Get key at x.ai/api
        </div>
      </div>

      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 12 }}>Accounts ({accounts.length})</div>
        {accounts.map((acc, i) => (
          <div key={acc.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 0', borderBottom: i < accounts.length - 1 ? '1px solid #f3f4f6' : 'none'
          }}>
            <div>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{acc.bank} / {acc.account_name}</span>
              {acc.account_number && <span style={{ fontFamily: MONO, fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>···{acc.account_number}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={S.catBadge(acc.category)}>{acc.currency}</span>
              <button onClick={() => setConfirmDeleteAcc(acc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db' }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        <button onClick={() => setShowAddAcc(true)} style={{ ...S.btnGhost, width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={14} /> Add Account
        </button>
      </div>
    </div>
  );

  /* ── modals ── */
  const Modals = (
    <AnimatePresence>
      {/* Extraction review */}
      {pendingExtraction && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ ...S.label, fontSize: 13, color: '#1a1a1a' }}>Statement Extraction Review</div>
              <button onClick={() => setPendingExtraction(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Account</div>
              <select value={pendingExtraction.matched_account_id}
                onChange={e => setPendingExtraction(p => ({ ...p, matched_account_id: e.target.value }))}
                style={{ ...S.input }}>
                <option value="">— select account —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.bank} / {a.account_name}{a.account_number ? ` ···${a.account_number}` : ''} ({a.currency})</option>
                ))}
              </select>
              {pendingExtraction.detected_account_number && (
                <div style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280', marginTop: 4 }}>
                  Detected account number: ···{pendingExtraction.detected_account_number}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>Date</div>
                <input type="date" value={pendingExtraction.detected_date}
                  onChange={e => setPendingExtraction(p => ({ ...p, detected_date: e.target.value }))}
                  style={S.input} />
              </div>
              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>Balance</div>
                <input type="number" value={pendingExtraction.detected_balance}
                  onChange={e => setPendingExtraction(p => ({ ...p, detected_balance: e.target.value }))}
                  style={S.input} />
              </div>
            </div>

            <button onClick={() => setShowRaw(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, ...S.label, marginBottom: showRaw ? 8 : 16 }}>
              {showRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Raw Grok response
            </button>
            {showRaw && (
              <pre style={{ background: '#f3f4f6', borderRadius: 8, padding: 10, fontSize: 10, fontFamily: MONO, overflowX: 'auto', marginBottom: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {pendingExtraction.raw}
              </pre>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPendingExtraction(null)} style={{ ...S.btnGhost, flex: 1 }}>Discard</button>
              <button onClick={confirmExtraction} style={{ ...S.btnDark, flex: 2 }}>Confirm & Save</button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Manual entry */}
      {showManual && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ ...S.label, fontSize: 13, color: '#1a1a1a' }}>Manual Entry</div>
              <button onClick={() => setShowManual(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Account</div>
              <select value={manualAccId} onChange={e => setManualAccId(e.target.value)} style={S.input}>
                <option value="">— select —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.bank} / {a.account_name} ({a.currency})</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>Date</div>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} style={S.input} />
              </div>
              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>Balance</div>
                <input type="number" value={manualBalance} onChange={e => setManualBalance(e.target.value)} placeholder="0" style={S.input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowManual(false)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={saveManual} style={{ ...S.btnDark, flex: 2 }}>Save</button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Add account */}
      {showAddAcc && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ ...S.label, fontSize: 13, color: '#1a1a1a' }}>Add Account</div>
              <button onClick={() => setShowAddAcc(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {[
                { key: 'bank', label: 'Bank / Institution', placeholder: 'e.g. HSBC' },
                { key: 'account_name', label: 'Account Name', placeholder: 'e.g. Saving' },
                { key: 'account_number', label: 'Account Number (last 4)', placeholder: 'e.g. 4321' },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ ...S.label, marginBottom: 5 }}>{f.label}</div>
                  <input value={newAcc[f.key]} onChange={e => setNewAcc(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder} style={S.input} />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ ...S.label, marginBottom: 5 }}>Currency</div>
                  <select value={newAcc.currency} onChange={e => setNewAcc(p => ({ ...p, currency: e.target.value }))} style={S.input}>
                    {ALL_CUR.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom: 5 }}>Category</div>
                  <select value={newAcc.category} onChange={e => setNewAcc(p => ({ ...p, category: e.target.value }))} style={S.input}>
                    {CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAddAcc(false)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={addAccount} style={{ ...S.btnDark, flex: 2 }}>Add Account</button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Confirm delete */}
      {confirmDeleteAcc && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontFamily: MONO, fontWeight: 700, marginBottom: 8 }}>Delete account?</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
              {confirmDeleteAcc.bank} / {confirmDeleteAcc.account_name} and all its snapshots will be permanently deleted.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDeleteAcc(null)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={async () => {
                if (sb && user) {
                  await sb.from('financial_accounts').delete().eq('id', confirmDeleteAcc.id);
                  await loadAll();
                } else {
                  setAccounts(prev => prev.filter(a => a.id !== confirmDeleteAcc.id));
                  setSnapshots(prev => prev.filter(s => s.account_id !== confirmDeleteAcc.id));
                }
                setConfirmDeleteAcc(null);
                showToast?.('Deleted');
              }} style={{ ...S.btnDark, flex: 1, background: '#ef4444' }}>Delete</button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* CSV import preview */}
      {importPreview && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ ...S.label, fontSize: 13, color: '#1a1a1a' }}>CSV Import Preview</div>
              <button onClick={() => setImportPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
              {importPreview.length} accounts found with data across multiple dates.
            </div>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
              {importPreview.slice(0, 20).map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{row.bank} / {row.account_name}</span>
                    <span style={S.catBadge(row.category) && { fontFamily: MONO, fontSize: 10, color: '#9ca3af', marginLeft: 6 }}> {row.currency}</span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#6b7280' }}>{row.snapshots.length} dates</span>
                </div>
              ))}
              {importPreview.length > 20 && <div style={{ fontFamily: MONO, fontSize: 11, color: '#9ca3af', padding: '8px 0' }}>+{importPreview.length - 20} more…</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setImportPreview(null)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={async () => {
                setImporting(true);
                if (sb && user) {
                  for (const row of importPreview) {
                    // find or create account
                    let { data: existing } = await sb.from('financial_accounts')
                      .select('id').eq('user_id', user.id)
                      .eq('bank', row.bank).eq('account_name', row.account_name).eq('currency', row.currency)
                      .maybeSingle();
                    let accountId = existing?.id;
                    if (!accountId) {
                      const { data: ins } = await sb.from('financial_accounts')
                        .insert({ user_id: user.id, bank: row.bank, account_name: row.account_name, currency: row.currency, category: row.category, sort_order: accounts.length + 1 })
                        .select('id').single();
                      accountId = ins?.id;
                    }
                    if (!accountId) continue;
                    // upsert snapshots in chunks of 100
                    const rows = row.snapshots.map(sn => ({ account_id: accountId, user_id: user.id, snapshot_date: sn.date, balance: sn.balance }));
                    for (let i = 0; i < rows.length; i += 100) {
                      await sb.from('financial_snapshots').upsert(rows.slice(i, i + 100), { onConflict: 'account_id,snapshot_date' });
                    }
                  }
                  await loadAll();
                }
                setImportPreview(null);
                setImporting(false);
                showToast?.('Import complete');
              }} style={{ ...S.btnDark, flex: 2 }}>
                {importing ? 'Importing…' : `Import ${importPreview.length} Accounts`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  /* ═══════════════════════════════════════════════════════════════
     MAIN RENDER
  ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ paddingTop: 8, paddingBottom: 80 }}>
      {TopBar}
      {CurrencyPills}
      {(view === 'table' || view === 'chart') && DatePills}
      {ViewToggle}

      {view === 'table' && TableView}
      {view === 'chart' && ChartView}
      {view === 'chat' && ChatView}
      {view === 'settings' && SettingsView}

      {Modals}
    </div>
  );
}
