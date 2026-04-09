import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, X, Eye, EyeOff, Upload, ChevronDown, ChevronUp,
  MessageSquare, Table2, Settings2, Send, RefreshCw, Check, ClipboardList,
  TrendingUp, TrendingDown
} from 'lucide-react';

/* ─── constants ─────────────────────────────────────────────────── */
const MONO = '"SF Mono","Fira Code","Cascadia Code","Consolas","Liberation Mono",monospace';
const CATS = ['Cash', 'Securities', 'Credit Card', 'Income', 'Expense', 'Others'];
const CAT_COLOR = {
  Cash: '#3b82f6', Securities: '#8b5cf6', 'Credit Card': '#ef4444',
  Income: '#22c55e', Expense: '#f97316', Others: '#6b7280',
};
const ALL_CUR = ['HKD', 'AUD', 'USD', 'CNY', 'THB', 'EUR', 'SGD'];

const cvt = (amount, from, to, rates) => {
  if (!amount || from === to || !from || !to) return amount || 0;
  const fr = rates?.[from] || 1, tr = rates?.[to] || 1;
  return (amount / fr) * tr;
};

const fmtNum = (n, cur = 'HKD') => {
  const noDec = new Set(['JPY', 'KRW', 'VND', 'IDR']);
  const d = noDec.has(cur) ? 0 : 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: cur,
      minimumFractionDigits: d, maximumFractionDigits: d
    }).format(n);
  } catch { return `${cur} ${n?.toFixed(d) ?? 0}`; }
};

/* ─── styles ─────────────────────────────────────────────────────── */
const S = {
  card: { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 12 },
  input: { border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: MONO, outline: 'none', background: '#fafafa', width: '100%', boxSizing: 'border-box' },
  inputSm: { border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontFamily: MONO, outline: 'none', background: '#fafafa', width: '100%', boxSizing: 'border-box', textAlign: 'right' },
  btnDark: { background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 12, fontFamily: MONO, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' },
  btnGhost: { background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontFamily: MONO, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  label: { fontSize: 10, fontFamily: MONO, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280' },
  pill: (active) => ({
    display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 11,
    fontFamily: MONO, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? '#1a1a1a' : '#f3f4f6',
    color: active ? '#fff' : '#374151',
    border: 'none', letterSpacing: '0.04em',
  }),
  catBadge: (cat) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10,
    fontFamily: MONO, fontWeight: 700, textTransform: 'uppercase',
    background: CAT_COLOR[cat] + '20', color: CAT_COLOR[cat],
  }),
};

/* ─── helpers ─────────────────────────────────────────────────────── */
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
  const [y, mo, day] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parseInt(day)} ${months[parseInt(mo) - 1]} ${y}`;
};

const fmtPct = (n) => {
  if (!isFinite(n)) return null;
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function FinancesTab({ user, sb, showToast, rates }) {
  /* ── state ── */
  const [accounts, setAccounts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [dates, setDates] = useState([]);
  const [selDate, setSelDate] = useState('');
  const [view, setView] = useState('table');   // 'table' | 'summary' | 'entry' | 'chat' | 'settings'
  const [displayCurrency, setDisplayCurrency] = useState('HKD');

  // add account
  const [showAddAcc, setShowAddAcc] = useState(false);
  const [newAcc, setNewAcc] = useState({ bank: '', account_name: '', account_number: '', currency: 'HKD', category: 'Cash' });

  // bulk entry
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryValues, setEntryValues] = useState({});
  const [savingEntry, setSavingEntry] = useState(false);

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

  /* ── pre-fill entry values when entryDate or data changes ── */
  useEffect(() => {
    if (!entryDate || !accounts.length) return;
    const filled = {};
    for (const acc of accounts) {
      const b = snapshots.find(s => s.account_id === acc.id && s.snapshot_date === entryDate)?.balance;
      if (b != null) filled[acc.id] = String(b);
    }
    setEntryValues(filled);
  }, [entryDate, accounts, snapshots]);

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

  /* ── helpers ── */
  const toDisplay = (amount, fromCur) => cvt(amount, fromCur, displayCurrency, rates);
  const bal = (accId, date) => snapshots.find(s => s.account_id === accId && s.snapshot_date === date)?.balance;

  const catTotalOnDate = useCallback((cat, date) =>
    accounts.filter(a => a.category === cat).reduce((sum, a) => {
      const b = bal(a.id, date);
      return b != null ? sum + toDisplay(b, a.currency) : sum;
    }, 0), [accounts, snapshots, displayCurrency, rates]);

  // currency breakdown for a category on a date: { HKD: 12345, USD: 678, ... }
  const catByCurrency = (cat, date) => {
    const byCur = {};
    for (const acc of accounts.filter(a => a.category === cat)) {
      const b = bal(acc.id, date);
      if (b != null) byCur[acc.currency] = (byCur[acc.currency] || 0) + b;
    }
    return byCur;
  };

  const prevDate = dates[dates.indexOf(selDate) + 1] || null;
  const netWorth = catTotalOnDate('Cash', selDate) + catTotalOnDate('Securities', selDate) - catTotalOnDate('Credit Card', selDate);
  const prevNetWorth = prevDate ? catTotalOnDate('Cash', prevDate) + catTotalOnDate('Securities', prevDate) - catTotalOnDate('Credit Card', prevDate) : null;

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
    if (!xaiApiKey) { showToast?.('Set xAI API key in Settings first'); return; }
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

  /* ── bulk save ── */
  const saveBulkEntry = async () => {
    if (!entryDate) return;
    setSavingEntry(true);
    const rows = Object.entries(entryValues)
      .filter(([, v]) => v !== '' && v !== undefined && !isNaN(parseFloat(v)))
      .map(([accId, v]) => ({ account_id: accId, user_id: user?.id, snapshot_date: entryDate, balance: parseFloat(v) }));
    if (rows.length && sb && user) {
      await sb.from('financial_snapshots').upsert(rows, { onConflict: 'account_id,snapshot_date' });
      await loadAll();
    }
    setSavingEntry(false);
    showToast?.(`Saved ${rows.length} entries for ${fmtDate(entryDate)}`);
  };

  /* ── add account ── */
  const addAccount = async () => {
    if (!newAcc.bank || !newAcc.account_name) return;
    if (sb && user) {
      await sb.from('financial_accounts').insert({ ...newAcc, user_id: user.id, sort_order: accounts.length + 1 });
      await loadAll();
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
    if (!xaiApiKey) { showToast?.('Set xAI API key in Settings'); return; }
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(m => [...m, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    try {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${xaiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-4.1-fast',
          messages: [
            { role: 'system', content: `You are a personal financial assistant. Answer concisely.\n\n${buildContext()}` },
            ...chatMessages.filter(m => m.role !== 'system'),
            { role: 'user', content: userMsg }
          ]
        })
      });
      const json = await res.json();
      setChatMessages(m => [...m, { role: 'assistant', content: json.choices?.[0]?.message?.content || 'No response' }]);
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
        { id: 'summary', icon: TrendingUp, label: 'Summary' },
        { id: 'entry', icon: ClipboardList, label: 'Entry' },
        { id: 'chat', icon: MessageSquare, label: 'Chat' },
        { id: 'settings', icon: Settings2, label: 'Settings' },
      ].map(v => (
        <button key={v.id} onClick={() => setView(v.id)} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          padding: '7px 2px', border: 'none', cursor: 'pointer', borderRadius: 10,
          background: view === v.id ? '#fff' : 'none',
          color: view === v.id ? '#1a1a1a' : '#9ca3af',
          fontFamily: MONO, fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
          boxShadow: view === v.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.15s',
        }}>
          <v.icon size={13} />
          <span>{v.label}</span>
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
        const total = catTotalOnDate(cat, selDate);
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
      <button onClick={() => setShowAddAcc(true)} style={{ ...S.btnGhost, width: '100%', marginBottom: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={14} /> Add Account
      </button>
    </div>
  );

  /* ── summary view ── */
  const SummaryView = (() => {
    const Delta = ({ cur, prev }) => {
      if (prev == null || prev === 0) return null;
      const diff = cur - prev;
      const pct = (diff / Math.abs(prev)) * 100;
      const up = diff >= 0;
      return (
        <span style={{ fontFamily: MONO, fontSize: 10, color: up ? '#16a34a' : '#dc2626', display: 'flex', alignItems: 'center', gap: 2 }}>
          {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {fmtPct(pct)}
        </span>
      );
    };

    return (
      <div style={{ padding: '0 16px 80px' }}>
        {CATS.map(cat => {
          const byCur = catByCurrency(cat, selDate);
          const prevByCur = prevDate ? catByCurrency(cat, prevDate) : {};
          const curCurs = Object.keys(byCur);
          if (!curCurs.length) return null;

          const totalDisp = catTotalOnDate(cat, selDate);
          const prevTotalDisp = prevDate ? catTotalOnDate(cat, prevDate) : null;

          return (
            <div key={cat} style={{ ...S.card, padding: '14px 16px' }}>
              {/* Category header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={S.catBadge(cat)}>{cat}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: cat === 'Credit Card' || cat === 'Expense' ? '#ef4444' : '#1a1a1a' }}>
                    {fmtNum(totalDisp, displayCurrency)}
                  </span>
                  <Delta cur={totalDisp} prev={prevTotalDisp} />
                </div>
              </div>

              {/* Per-currency rows */}
              {curCurs.map(cur => {
                const native = byCur[cur];
                const prevNative = prevByCur[cur] ?? null;
                const diff = prevNative != null ? native - prevNative : null;
                return (
                  <div key={cur} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 0', borderTop: '1px solid #f3f4f6'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ ...S.label, fontSize: 9, color: '#9ca3af', minWidth: 32 }}>{cur}</span>
                      {diff != null && (
                        <span style={{ fontFamily: MONO, fontSize: 9, color: diff >= 0 ? '#16a34a' : '#dc2626' }}>
                          {diff >= 0 ? '+' : ''}{fmtNum(diff, cur)}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>
                        {fmtNum(native, cur)}
                      </div>
                      {prevNative != null && (
                        <div style={{ fontFamily: MONO, fontSize: 9, color: '#9ca3af' }}>
                          prev: {fmtNum(prevNative, cur)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Display currency total (if different from native) */}
              {curCurs.length > 1 || curCurs[0] !== displayCurrency ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, marginTop: 4, borderTop: '1px dashed #e5e7eb' }}>
                  <span style={{ ...S.label, fontSize: 9 }}>Total in {displayCurrency}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {prevTotalDisp != null && (
                      <span style={{ fontFamily: MONO, fontSize: 9, color: '#9ca3af' }}>prev: {fmtNum(prevTotalDisp, displayCurrency)}</span>
                    )}
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{fmtNum(totalDisp, displayCurrency)}</span>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {/* Net worth card */}
        <div style={{ ...S.card, background: '#1a1a1a', color: '#fff', padding: '16px 18px' }}>
          <div style={{ ...S.label, color: '#6b7280', marginBottom: 12 }}>Net Worth ({displayCurrency})</div>
          {[
            { label: 'Cash', value: catTotalOnDate('Cash', selDate), prev: prevDate ? catTotalOnDate('Cash', prevDate) : null },
            { label: 'Securities', value: catTotalOnDate('Securities', selDate), prev: prevDate ? catTotalOnDate('Securities', prevDate) : null },
            { label: '− Credit Card', value: catTotalOnDate('Credit Card', selDate), prev: prevDate ? catTotalOnDate('Credit Card', prevDate) : null, negate: true },
          ].map(row => {
            const diff = row.prev != null ? (row.negate ? row.prev - row.value : row.value - row.prev) : null;
            return (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: '#9ca3af' }}>{row.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {diff != null && (
                    <span style={{ fontFamily: MONO, fontSize: 10, color: diff >= 0 ? '#4ade80' : '#f87171' }}>
                      {diff >= 0 ? '+' : ''}{fmtNum(diff, displayCurrency)}
                    </span>
                  )}
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#e5e7eb' }}>
                    {fmtNum(row.value, displayCurrency)}
                  </span>
                </div>
              </div>
            );
          })}
          <div style={{ borderTop: '1px solid #374151', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#fff' }}>Net</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {prevNetWorth != null && (
                <span style={{ fontFamily: MONO, fontSize: 11, color: netWorth - prevNetWorth >= 0 ? '#4ade80' : '#f87171' }}>
                  {netWorth - prevNetWorth >= 0 ? '+' : ''}{fmtNum(netWorth - prevNetWorth, displayCurrency)}
                  {' '}({fmtPct(((netWorth - prevNetWorth) / Math.abs(prevNetWorth)) * 100)})
                </span>
              )}
              <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: netWorth >= 0 ? '#4ade80' : '#f87171' }}>
                {fmtNum(netWorth, displayCurrency)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  })();

  /* ── bulk entry view ── */
  const EntryView = (() => {
    // group accounts by bank
    const banks = [...new Set(accounts.map(a => a.bank))].sort();
    return (
      <div style={{ padding: '0 16px 100px' }}>
        {/* Date selector */}
        <div style={{ ...S.card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ ...S.label, flexShrink: 0 }}>Snapshot Date</div>
          <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={{ ...S.input, flex: 1 }} />
        </div>

        {accounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: MONO, fontSize: 12, color: '#9ca3af' }}>
            No accounts yet. Add accounts in Settings first.
          </div>
        ) : (
          banks.map(bank => {
            const bankAccs = accounts.filter(a => a.bank === bank).sort((a, b) => a.sort_order - b.sort_order);
            return (
              <div key={bank} style={{ marginBottom: 16 }}>
                <div style={{ ...S.label, marginBottom: 6, paddingLeft: 2 }}>{bank}</div>
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  {bankAccs.map((acc, i) => (
                    <div key={acc.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr auto 120px',
                      padding: '10px 14px', gap: 10, alignItems: 'center',
                      borderBottom: i < bankAccs.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: '#111' }}>
                          {acc.account_name}{acc.account_number ? ` ···${acc.account_number}` : ''}
                        </div>
                        <span style={S.catBadge(acc.category)}>{acc.category}</span>
                      </div>
                      <span style={{ ...S.label, fontSize: 9, color: '#9ca3af' }}>{acc.currency}</span>
                      <input
                        type="number"
                        value={entryValues[acc.id] ?? ''}
                        onChange={e => setEntryValues(prev => ({ ...prev, [acc.id]: e.target.value }))}
                        placeholder="—"
                        style={S.inputSm}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {accounts.length > 0 && (
          <button onClick={saveBulkEntry} disabled={savingEntry} style={{ ...S.btnDark, width: '100%', padding: '14px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {savingEntry ? <RefreshCw size={15} /> : <Check size={15} />}
            {savingEntry ? 'Saving…' : `Save All — ${fmtDate(entryDate)}`}
          </button>
        )}
      </div>
    );
  })();

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
        <input value={chatInput} onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
          placeholder="Ask about your finances…" style={{ ...S.input, flex: 1 }} />
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
          <input type={showXaiKey ? 'text' : 'password'} value={xaiApiKey}
            onChange={e => setXaiApiKey(e.target.value)} placeholder="xai-…" style={{ ...S.input, flex: 1 }} />
          <button onClick={() => setShowXaiKey(v => !v)} style={{ ...S.btnGhost, padding: '8px 10px' }}>
            {showXaiKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button onClick={saveApiKey} disabled={savingKey} style={{ ...S.btnDark, padding: '8px 14px' }}>
            {savingKey ? <RefreshCw size={14} /> : <Check size={14} />}
          </button>
        </div>
        <div style={{ ...S.label, fontSize: 9, opacity: 0.6 }}>Used for AI chat and statement scanning. Get key at x.ai/api</div>
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
                style={S.input}>
                <option value="">— select account —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.bank} / {a.account_name}{a.account_number ? ` ···${a.account_number}` : ''} ({a.currency})</option>
                ))}
              </select>
              {pendingExtraction.detected_account_number && (
                <div style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280', marginTop: 4 }}>
                  Detected: ···{pendingExtraction.detected_account_number}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>Date</div>
                <input type="date" value={pendingExtraction.detected_date}
                  onChange={e => setPendingExtraction(p => ({ ...p, detected_date: e.target.value }))} style={S.input} />
              </div>
              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>Balance</div>
                <input type="number" value={pendingExtraction.detected_balance}
                  onChange={e => setPendingExtraction(p => ({ ...p, detected_balance: e.target.value }))} style={S.input} />
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
                if (sb && user) { await sb.from('financial_accounts').delete().eq('id', confirmDeleteAcc.id); await loadAll(); }
                setConfirmDeleteAcc(null); showToast?.('Deleted');
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
              {importPreview.length} accounts found.
            </div>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
              {importPreview.slice(0, 20).map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{row.bank} / {row.account_name} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({row.currency})</span></span>
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
                    let { data: existing } = await sb.from('financial_accounts').select('id')
                      .eq('user_id', user.id).eq('bank', row.bank).eq('account_name', row.account_name).eq('currency', row.currency).maybeSingle();
                    let accountId = existing?.id;
                    if (!accountId) {
                      const { data: ins } = await sb.from('financial_accounts')
                        .insert({ user_id: user.id, bank: row.bank, account_name: row.account_name, currency: row.currency, category: row.category, sort_order: accounts.length + 1 })
                        .select('id').single();
                      accountId = ins?.id;
                    }
                    if (!accountId) continue;
                    const rows = row.snapshots.map(sn => ({ account_id: accountId, user_id: user.id, snapshot_date: sn.date, balance: sn.balance }));
                    for (let i = 0; i < rows.length; i += 100)
                      await sb.from('financial_snapshots').upsert(rows.slice(i, i + 100), { onConflict: 'account_id,snapshot_date' });
                  }
                  await loadAll();
                }
                setImportPreview(null); setImporting(false); showToast?.('Import complete');
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
  const showDatePills = view === 'table' || view === 'summary';

  return (
    <div style={{ paddingTop: 8, paddingBottom: 80 }}>
      {TopBar}
      {(view !== 'entry' && view !== 'chat' && view !== 'settings') && CurrencyPills}
      {showDatePills && DatePills}
      {ViewToggle}

      {view === 'table' && TableView}
      {view === 'summary' && SummaryView}
      {view === 'entry' && EntryView}
      {view === 'chat' && ChatView}
      {view === 'settings' && SettingsView}

      {Modals}
    </div>
  );
}
