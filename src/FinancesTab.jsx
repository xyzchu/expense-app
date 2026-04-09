import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, X, Eye, EyeOff, Upload, ChevronDown,
  MessageSquare, Table2, Settings2, Send, RefreshCw, Check, ClipboardList,
  TrendingUp, TrendingDown, Copy, Download, Pencil, AlertTriangle
} from 'lucide-react';

/* ─── constants ─────────────────────────────────────────────────── */
const MONO = '"SF Mono","Fira Code","Cascadia Code","Consolas","Liberation Mono",monospace';
const CATS = ['Cash', 'Securities', 'Credit Card', 'Income', 'Expense', 'Points/Miles', 'Property', 'Others'];
const CAT_COLOR = {
  Cash: '#3b82f6', Securities: '#8b5cf6', 'Credit Card': '#ef4444',
  Income: '#22c55e', Expense: '#f97316', 'Points/Miles': '#06b6d4', Property: '#f59e0b', Others: '#6b7280',
};
// Categories excluded from net worth / summary totals / Grok context
const CATS_EXCLUDED = new Set(['Others']);
const ALL_CUR = ['HKD', 'AUD', 'USD', 'CNY', 'THB', 'EUR', 'SGD'];
// Fallback HKD-based rates (1 unit of currency = X HKD)
const FALLBACK_HKD = { HKD: 1, AUD: 4.95, USD: 7.78, CNY: 1.07, THB: 0.22, EUR: 8.55, SGD: 5.80 };

/* ─── pure helpers ─────────────────────────────────────────────── */
const fmtNum = (n, cur = 'HKD') => {
  if (n == null || isNaN(n)) return '—';
  const noDec = new Set(['JPY', 'KRW', 'VND', 'IDR']);
  const d = noDec.has(cur) ? 0 : 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: cur,
      minimumFractionDigits: d, maximumFractionDigits: d,
    }).format(n);
  } catch { return `${cur} ${Number(n).toFixed(0)}`; }
};

const normalizeDate = (s) => {
  if (!s) return null;
  s = String(s).trim();
  const mo = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  let m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (m) return `${m[3]}-${String(mo[m[2]]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  m = s.match(/(\d{4})-([A-Za-z]{3})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(mo[m[2]]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return null;
};

const parseCSVLine = (line) => {
  const result = []; let cur = '', inQ = false;
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
  return `${parseInt(day)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mo)-1]} ${y}`;
};

const fmtPct = (n) => {
  if (!isFinite(n)) return null;
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
};

// HKD-based cvt: amount * hkdRates[from] / hkdRates[to]
const cvtHKD = (amount, from, to, hkdRates) => {
  if (!amount || from === to || !from || !to) return amount || 0;
  const r = hkdRates || FALLBACK_HKD;
  return (amount * (r[from] || FALLBACK_HKD[from] || 1)) / (r[to] || FALLBACK_HKD[to] || 1);
};

/* ─── styles ─────────────────────────────────────────────────────── */
const S = {
  card:    { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 12 },
  input:   { border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: MONO, outline: 'none', background: '#fafafa', width: '100%', boxSizing: 'border-box' },
  inputSm: { border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontFamily: MONO, outline: 'none', background: '#fafafa', width: '100%', boxSizing: 'border-box', textAlign: 'right' },
  btnDark: { background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 12, fontFamily: MONO, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' },
  btnGhost:{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontFamily: MONO, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  btnRed:  { background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 12, fontFamily: MONO, fontWeight: 700, cursor: 'pointer' },
  label:   { fontSize: 10, fontFamily: MONO, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280' },
  pill: (active) => ({
    display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 11,
    fontFamily: MONO, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? '#1a1a1a' : '#f3f4f6', color: active ? '#fff' : '#374151',
    border: 'none', letterSpacing: '0.04em',
  }),
  catBadge: (cat) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10,
    fontFamily: MONO, fontWeight: 700, textTransform: 'uppercase',
    background: (CAT_COLOR[cat] || '#6b7280') + '20', color: CAT_COLOR[cat] || '#6b7280',
  }),
  select: { border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: MONO, outline: 'none', background: '#fafafa', width: '100%' },
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function FinancesTab({ user, sb, showToast, rates }) {

  /* ── state ── */
  const [accounts,  setAccounts]  = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [dateRates, setDateRates] = useState({});  // { "2026-03-12": { HKD:1, AUD:5.12, ... } }
  const [dates,     setDates]     = useState([]);
  const [selDate,   setSelDate]   = useState('');
  const [view,      setView]      = useState('table');
  const [displayCurrency, setDisplayCurrency] = useState('HKD');

  // account management
  const [showAddAcc,    setShowAddAcc]    = useState(false);
  const [newAcc,        setNewAcc]        = useState({ bank: '', account_name: '', account_number: '', currency: 'HKD', category: 'Cash', metadata: {} });
  const [editingAccId,  setEditingAccId]  = useState(null);
  const [editingAccData,setEditingAccData]= useState({});

  // bulk entry
  const [entryDate,      setEntryDate]      = useState(new Date().toISOString().slice(0, 10));
  const [entryValues,    setEntryValues]    = useState({});
  const [savingEntry,    setSavingEntry]    = useState(false);
  const [expenseSuggest, setExpenseSuggest] = useState(null);
  const [loadingExpenses,setLoadingExpenses]= useState(false);

  // extraction
  const [extracting,        setExtracting]        = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState(null);
  const [showRaw,           setShowRaw]           = useState(false);
  const fileRef        = useRef(null);
  const importCsvRef   = useRef(null);
  const importJsonRef  = useRef(null);

  // csv import
  const [importPreview, setImportPreview] = useState(null); // { rows: [], dateRates: {} }
  const [importing,     setImporting]     = useState(false);

  // chat
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Hi! Ask me anything about your finances — e.g. "What is my net worth in HKD?" or "Average cash balance in 2025?"' }
  ]);
  const [chatInput,  setChatInput]  = useState('');
  const [chatLoading,setChatLoading]= useState(false);
  const chatEndRef = useRef(null);

  // settings
  const [xaiApiKey,       setXaiApiKey]       = useState('');
  const [showXaiKey,      setShowXaiKey]       = useState(false);
  const [savingKey,       setSavingKey]        = useState(false);
  const [xaiModel,        setXaiModel]        = useState('grok-4-1-fast-reasoning');
  const [visionModel,     setVisionModel]     = useState('grok-2-vision-1212');
  const [xaiModels,       setXaiModels]       = useState([]);
  const [loadingModels,   setLoadingModels]   = useState(false);
  const [confirmClearData,setConfirmClearData] = useState(false);
  const [showRatesFor,    setShowRatesFor]     = useState(false);
  const [homeListName,    setHomeListName]     = useState('Home');
  const [expensePerson,   setExpensePerson]   = useState(''); // display_name to filter; '' = mine

  // confirm delete
  const [confirmDeleteAcc,  setConfirmDeleteAcc]  = useState(null);
  const [confirmDeleteSnap, setConfirmDeleteSnap] = useState(false);

  // inline balance editing
  const [editingBalance, setEditingBalance] = useState(null); // { accId, value }

  /* ── derived dates ── */
  useEffect(() => {
    const unique = [...new Set(snapshots.map(s => s.snapshot_date))].sort().reverse();
    setDates(unique);
    if (!selDate && unique.length) setSelDate(unique[0]);
  }, [snapshots]);

  /* ── pre-fill entry values ── */
  useEffect(() => {
    if (!entryDate || !accounts.length) return;
    const filled = {};
    for (const acc of accounts) {
      const b = snapshots.find(s => s.account_id === acc.id && s.snapshot_date === entryDate)?.balance;
      if (b != null) filled[acc.id] = String(b);
    }
    setEntryValues(filled);
    setExpenseSuggest(null);
  }, [entryDate, accounts, snapshots]);

  /* ── scroll chat ── */
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  /* ── load from DB ── */
  const loadAll = useCallback(async () => {
    if (!user || !sb) return;
    const [{ data: accs }, { data: snaps }, { data: settings }, { data: dRates }] = await Promise.all([
      sb.from('financial_accounts').select('*').eq('user_id', user.id).order('sort_order'),
      sb.from('financial_snapshots').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
      sb.from('user_settings').select('*').eq('user_id', user.id),
      sb.from('financial_date_rates').select('*').eq('user_id', user.id),
    ]);
    if (accs) setAccounts(accs);
    if (snaps) setSnapshots(snaps);
    if (dRates) {
      const rmap = {};
      for (const r of dRates) rmap[r.snapshot_date] = r.rates;
      setDateRates(rmap);
    }
    if (settings) {
      const k = settings.find(r => r.key === 'xai_api_key');
      if (k?.value) setXaiApiKey(k.value);
      const c = settings.find(r => r.key === 'finances_display_currency');
      if (c?.value) setDisplayCurrency(c.value);
      const m = settings.find(r => r.key === 'xai_model');
      if (m?.value) setXaiModel(m.value);
      const hl = settings.find(r => r.key === 'home_list_name');
      if (hl?.value) setHomeListName(hl.value);
      const vm = settings.find(r => r.key === 'vision_model');
      if (vm?.value) setVisionModel(vm.value);
      const ep = settings.find(r => r.key === 'expense_person');
      if (ep?.value) setExpensePerson(ep.value);
    }
  }, [user, sb]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── rate helpers ── */
  // Convert app's USD-based rates prop to HKD-based: { HKD:1, AUD:4.95, USD:7.78, ... }
  // rates[cur] = units of cur per 1 USD, so 1 cur = rates[HKD]/rates[cur] HKD
  const appToHKD = useCallback(() => {
    const hkdPerUSD = rates?.HKD || 7.82;
    const h = {};
    for (const [cur, usdRate] of Object.entries(rates || FALLBACK_HKD)) {
      if (usdRate) h[cur] = parseFloat((hkdPerUSD / usdRate).toFixed(8));
    }
    if (!h.HKD) h.HKD = 1;
    return h;
  }, [rates]);

  // Returns HKD-based rates for a date (historical if available, else live app rates)
  const getRatesForDate = useCallback((date) => {
    if (date && dateRates[date]) return dateRates[date];
    return appToHKD();
  }, [dateRates, appToHKD]);

  const toDisplay = useCallback((amount, fromCur, date) =>
    cvtHKD(amount, fromCur, displayCurrency, getRatesForDate(date)),
  [displayCurrency, getRatesForDate]);

  /* ── data helpers ── */
  const bal = (accId, date) => snapshots.find(s => s.account_id === accId && s.snapshot_date === date)?.balance;

  const catTotalOnDate = useCallback((cat, date) =>
    accounts.filter(a => a.category === cat).reduce((sum, a) => {
      if (a.currency === 'PTS') return sum; // points not currency-converted
      const b = bal(a.id, date);
      return b != null ? sum + toDisplay(b, a.currency, date) : sum;
    }, 0),
  [accounts, snapshots, toDisplay]);

  const catByCurrency = (cat, date) => {
    const byCur = {};
    for (const acc of accounts.filter(a => a.category === cat)) {
      const b = bal(acc.id, date);
      if (b != null) byCur[acc.currency] = (byCur[acc.currency] || 0) + b;
    }
    return byCur;
  };

  const prevDate = dates[dates.indexOf(selDate) + 1] || null;

  /* ── import CSV (app's own export format) ── */
  const handleImportCsvFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target: { result } }) => {
      const lines = result.split('\n').map(l => l.trimEnd());
      let section = null, headers = [], rateCurrencies = [];
      const importedAccounts = [], importedSnapshots = {}, importedDateRates = {};

      for (const line of lines) {
        if (!line.trim()) continue;
        const cols = parseCSVLine(line);
        if (cols[0] === 'SECTION') { section = cols[1]; headers = []; continue; }
        if (!headers.length) {
          headers = cols;
          if (section === 'exchange_rates') rateCurrencies = cols.slice(1);
          continue;
        }
        if (section === 'accounts') {
          const obj = {}; headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
          let metadata = {};
          try { metadata = JSON.parse(obj.metadata || '{}'); } catch {}
          importedAccounts.push({ id: obj.id, bank: obj.bank, account_name: obj.account_name,
            account_number: obj.account_number || null, currency: obj.currency, category: obj.category,
            sort_order: parseInt(obj.sort_order) || 0, is_active: obj.is_active !== 'false', metadata });
        } else if (section === 'snapshots') {
          const [account_id, snapshot_date, balance] = cols;
          if (account_id && snapshot_date && balance !== '') {
            const key = `${account_id}|${snapshot_date}`;
            importedSnapshots[key] = { account_id, snapshot_date, balance: parseFloat(balance) };
          }
        } else if (section === 'exchange_rates') {
          const date = cols[0];
          if (date) {
            const r = {};
            rateCurrencies.forEach((cur, i) => {
              const v = parseFloat(cols[i + 1]);
              if (!isNaN(v) && v > 0) r[cur] = v;
            });
            importedDateRates[date] = r;
          }
        }
      }
      setImportPreview({
        accounts: importedAccounts,
        snapshots: Object.values(importedSnapshots),
        dateRates: importedDateRates,
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /* ── import JSON (app's own export format) ── */
  const handleImportJsonFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target: { result } }) => {
      try {
        const data = JSON.parse(result);
        const importedDateRates = {};
        for (const { date, rates } of (data.exchange_rates || [])) importedDateRates[date] = rates;
        setImportPreview({
          accounts: data.accounts || [],
          snapshots: data.snapshots || [],
          dateRates: importedDateRates,
        });
      } catch { showToast?.('Invalid JSON file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /* ── save import (shared by CSV + JSON) ── */
  const saveImport = async () => {
    if (!importPreview || !sb || !user) return;
    setImporting(true);
    try {
      if (importPreview.accounts?.length) {
        const accRows = importPreview.accounts.map(a => ({ ...a, user_id: user.id }));
        for (let i = 0; i < accRows.length; i += 100)
          await sb.from('financial_accounts').upsert(accRows.slice(i, i + 100), { onConflict: 'id' });
      }
      if (importPreview.snapshots?.length) {
        const snapRows = importPreview.snapshots.map(s => ({ ...s, user_id: user.id }));
        for (let i = 0; i < snapRows.length; i += 100)
          await sb.from('financial_snapshots').upsert(snapRows.slice(i, i + 100), { onConflict: 'account_id,snapshot_date' });
      }
      const drRows = Object.entries(importPreview.dateRates || {}).map(([date, r]) => ({
        user_id: user.id, snapshot_date: date, rates: r,
      }));
      for (let i = 0; i < drRows.length; i += 100)
        await sb.from('financial_date_rates').upsert(drRows.slice(i, i + 100), { onConflict: 'user_id,snapshot_date' });
      setImportPreview(null);
      await loadAll();
      showToast?.('Import complete');
    } catch (err) { showToast?.('Import error: ' + err.message); }
    setImporting(false);
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
      // Use the configured vision model
      const mediaType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      const resp = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${xaiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: visionModel,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}`, detail: 'high' } },
              { type: 'text', text: 'Extract from this bank statement or screenshot: account number (last 4 digits only), statement date (YYYY-MM-DD), and total account balance as a number. Return ONLY valid JSON with no markdown: {"account_number":"1234","date":"YYYY-MM-DD","balance":12345.67}' }
            ]
          }],
          temperature: 0,
        })
      });
      const json = await resp.json();
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
      const raw = json.choices?.[0]?.message?.content || '';
      let parsed = {};
      try { parsed = JSON.parse(raw); }
      catch {
        const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
        if (m) try { parsed = JSON.parse(m[1]); } catch { }
      }
      if (!parsed.balance && !parsed.date) throw new Error(`Could not parse response: ${raw.slice(0, 200)}`);
      const matched = accounts.find(a => a.account_number && parsed.account_number &&
        a.account_number.replace(/\D/g, '').endsWith(parsed.account_number.replace(/\D/g, '')));
      setPendingExtraction({
        matched_account_id: matched?.id || '',
        detected_account_number: parsed.account_number || '',
        detected_date: parsed.date || new Date().toISOString().slice(0, 10),
        detected_balance: parsed.balance ?? '',
        raw,
      });
    } catch (err) { showToast?.('Extraction failed: ' + err.message); }
    setExtracting(false);
  };

  const confirmExtraction = async () => {
    const { matched_account_id, detected_date, detected_balance } = pendingExtraction;
    if (!matched_account_id || !detected_date) { showToast?.('Select an account'); return; }
    await sb.from('financial_snapshots').upsert(
      { account_id: matched_account_id, user_id: user.id, snapshot_date: detected_date, balance: Number(detected_balance) },
      { onConflict: 'account_id,snapshot_date' }
    );
    // Save current live rates for this date (new entry)
    await sb.from('financial_date_rates').upsert(
      { user_id: user.id, snapshot_date: detected_date, rates: appToHKD() },
      { onConflict: 'user_id,snapshot_date' }
    );
    await loadAll();
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
      // Save live rates for new entries (won't overwrite existing historical rates)
      await sb.from('financial_date_rates').upsert(
        { user_id: user.id, snapshot_date: entryDate, rates: appToHKD() },
        { onConflict: 'user_id,snapshot_date' }
      );
      await loadAll();
    }
    setSavingEntry(false);
    showToast?.(`Saved ${rows.length} entries for ${fmtDate(entryDate)}`);
  };

  /* ── copy from latest ── */
  const copyFromLatest = () => {
    const latestDate = dates.find(d => d < entryDate) || dates[0];
    if (!latestDate) { showToast?.('No previous data to copy'); return; }
    const filled = {};
    for (const acc of accounts) {
      const b = snapshots.find(s => s.account_id === acc.id && s.snapshot_date === latestDate)?.balance;
      if (b != null) filled[acc.id] = String(b);
    }
    setEntryValues(filled);
    showToast?.(`Copied from ${fmtDate(latestDate)}`);
  };

  /* ── expense suggestion from Home tab ── */
  const fetchExpenseSuggestion = useCallback(async () => {
    if (!sb || !user || !entryDate) return;
    const prevSnapDate = dates.find(d => d < entryDate);
    if (!prevSnapDate) { showToast?.('No previous snapshot date found'); return; }
    setLoadingExpenses(true);
    try {
      const { data: memberships } = await sb.from('list_members')
        .select('list_id, display_name').eq('user_id', user.id);
      if (!memberships?.length) { setLoadingExpenses(false); return; }

      const listIds = [...new Set(memberships.map(m => m.list_id))];
      const { data: listData } = await sb.from('expense_lists')
        .select('id, name, default_currency').in('id', listIds);

      // Filter to only the configured home list name
      const homeLists = (listData || []).filter(l => l.name === homeListName);
      if (!homeLists.length) { showToast?.(`List "${homeListName}" not found`); setLoadingExpenses(false); return; }
      const homeListIds = new Set(homeLists.map(l => l.id));
      const listCur = {};
      for (const l of listData || []) listCur[l.id] = l.default_currency || 'HKD';

      const hkdRates = getRatesForDate(entryDate);
      let total = 0;
      let listDefaultCur = homeLists[0].default_currency || 'HKD';
      // Get all distinct display_names in these lists to populate the person dropdown later
      const allNames = [...new Set(memberships.filter(m => homeListIds.has(m.list_id)).map(m => m.display_name))];
      for (const mem of memberships.filter(m => homeListIds.has(m.list_id))) {
        const { data: exps } = await sb.from('expenses')
          .select('total_amount, shares, original_currency, split_type, list_id')
          .eq('list_id', mem.list_id).neq('split_type', 'settlement')
          .gte('date', prevSnapDate).lte('date', entryDate);
        for (const exp of exps || []) {
          // Use configured person name, or fall back to the membership's display_name
          const targetName = expensePerson || mem.display_name;
          const userShare = exp.shares?.[targetName];
          if (userShare != null) {
            const cur = exp.original_currency || listCur[exp.list_id] || listDefaultCur;
            total += cvtHKD(userShare, cur, listDefaultCur, hkdRates);
          }
        }
      }
      setExpenseSuggest({ total, currency: listDefaultCur, fromDate: prevSnapDate, toDate: entryDate, person: expensePerson || allNames[0] || '' });
    } catch (err) { console.error('Expense suggestion error:', err); }
    setLoadingExpenses(false);
  }, [sb, user, entryDate, dates, getRatesForDate, homeListName, expensePerson]);

  /* ── add account ── */
  const addAccount = async () => {
    if (!newAcc.bank || !newAcc.account_name) return;
    await sb.from('financial_accounts').insert({ ...newAcc, user_id: user.id, sort_order: accounts.length + 1 });
    await loadAll();
    setNewAcc({ bank: '', account_name: '', account_number: '', currency: 'HKD', category: 'Cash', metadata: {} });
    setShowAddAcc(false);
    showToast?.('Account added');
  };

  /* ── update account ── */
  const updateAccount = async () => {
    if (!editingAccId || !sb) return;
    const { id, created_at, user_id, ...fields } = editingAccData;
    await sb.from('financial_accounts').update(fields).eq('id', editingAccId);
    setEditingAccId(null); setEditingAccData({});
    await loadAll();
    showToast?.('Account updated');
  };

  /* ── delete account ── */
  const deleteAccount = async (acc) => {
    await sb.from('financial_accounts').delete().eq('id', acc.id);
    await loadAll();
    setConfirmDeleteAcc(null);
    showToast?.('Account deleted');
  };

  /* ── save inline balance edit ── */
  const saveBalanceEdit = async () => {
    if (!editingBalance || !selDate || !sb || !user) return;
    const { accId, value } = editingBalance;
    const num = parseFloat(value);
    if (isNaN(num)) { setEditingBalance(null); return; }
    await sb.from('financial_snapshots').upsert(
      { account_id: accId, user_id: user.id, snapshot_date: selDate, balance: num },
      { onConflict: 'account_id,snapshot_date' }
    );
    setEditingBalance(null);
    await loadAll();
  };

  /* ── delete entire snapshot date ── */
  const deleteSnapshot = async () => {
    if (!selDate || !sb || !user) return;
    await sb.from('financial_snapshots').delete().eq('user_id', user.id).eq('snapshot_date', selDate);
    await sb.from('financial_date_rates').delete().eq('user_id', user.id).eq('snapshot_date', selDate);
    setConfirmDeleteSnap(false);
    const newDates = dates.filter(d => d !== selDate);
    setSelDate(newDates[0] || '');
    await loadAll();
    showToast?.('Snapshot deleted');
  };

  /* ── AI chat ── */
  const buildContext = () => {
    const recentDates = dates.slice(0, 24);
    let ctx = `Financial data. All HKD equivalents use the historical exchange rates recorded for each date.\n`;
    ctx += `Note: "Others" and "Property" categories are excluded from net worth calculations.\n`;
    ctx += `Accounts: ${accounts.length}\n\n`;
    for (const date of recentDates) {
      const r = getRatesForDate(date);
      const totals = {};
      for (const acc of accounts) {
        if (CATS_EXCLUDED.has(acc.category)) continue;
        const b = bal(acc.id, date);
        if (b == null) continue;
        if (acc.currency === 'PTS') continue; // points not converted to HKD
        const hkd = Math.round(cvtHKD(b, acc.currency, 'HKD', r));
        totals[acc.category] = (totals[acc.category] || 0) + hkd;
      }
      if (!Object.keys(totals).length) continue;
      ctx += `${date} (rates: ${Object.entries(r).filter(([c]) => c !== 'HKD').map(([c, v]) => `1 ${c}=HKD ${v}`).join(', ')}):\n`;
      for (const acc of accounts) {
        if (CATS_EXCLUDED.has(acc.category)) continue;
        const b = bal(acc.id, date);
        if (b == null) continue;
        if (acc.currency === 'PTS') {
          const miles = acc.metadata?.miles_ratio ? Math.round(b / acc.metadata.miles_ratio * 1000) : null;
          ctx += `  ${acc.bank}/${acc.account_name} [${acc.category}]: ${b} pts${miles ? ` = ${miles} miles` : ''}\n`;
        } else {
          const hkd = Math.round(cvtHKD(b, acc.currency, 'HKD', r));
          ctx += `  ${acc.bank}/${acc.account_name} [${acc.category}]: ${acc.currency} ${b} = HKD ${hkd}\n`;
        }
      }
      for (const [cat, total] of Object.entries(totals))
        ctx += `  SUBTOTAL ${cat}: HKD ${total}\n`;
      const netWorthHKD = (totals['Cash'] || 0) + (totals['Securities'] || 0) - (totals['Credit Card'] || 0);
      ctx += `  NET WORTH: HKD ${netWorthHKD}\n\n`;
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
          model: xaiModel,
          messages: [
            { role: 'system', content: `You are a personal financial assistant. Answer concisely.\n\n${buildContext()}` },
            ...chatMessages.filter(m => m.role !== 'system'),
            { role: 'user', content: userMsg }
          ],
        })
      });
      const json = await res.json();
      setChatMessages(m => [...m, { role: 'assistant', content: json.choices?.[0]?.message?.content || 'No response' }]);
    } catch (err) {
      setChatMessages(m => [...m, { role: 'assistant', content: 'Error: ' + err.message }]);
    }
    setChatLoading(false);
  };

  /* ── settings helpers ── */
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

  const fetchModels = async (key = xaiApiKey) => {
    if (!key) { showToast?.('Enter API key first'); return; }
    setLoadingModels(true);
    try {
      const res = await fetch('https://api.x.ai/v1/models', {
        headers: { Authorization: `Bearer ${key}` }
      });
      const json = await res.json();
      const ids = (json.data || []).map(m => m.id).sort();
      if (ids.length) { setXaiModels(ids); showToast?.(`${ids.length} models loaded`); }
      else showToast?.('No models returned');
    } catch (err) { showToast?.('Error fetching models: ' + err.message); }
    setLoadingModels(false);
  };

  const changeXaiModel = (model) => {
    setXaiModel(model);
    saveUserSetting('xai_model', model);
  };

  const changeDisplayCurrency = (cur) => {
    setDisplayCurrency(cur);
    saveUserSetting('finances_display_currency', cur);
  };

  /* ── export ── */
  const exportData = () => {
    const data = {
      exported_at: new Date().toISOString(),
      accounts,
      snapshots,
      exchange_rates: Object.entries(dateRates).map(([date, r]) => ({ date, rates: r })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `finances-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast?.('Exported');
  };

  /* ── export CSV ── */
  const exportCSV = () => {
    const lines = [];
    // accounts
    lines.push('SECTION,accounts');
    lines.push('id,bank,account_name,account_number,currency,category,sort_order,is_active,metadata');
    for (const a of accounts) {
      const meta = JSON.stringify(a.metadata || {}).replace(/"/g, '""');
      lines.push([a.id, a.bank, a.account_name, a.account_number || '', a.currency, a.category, a.sort_order, a.is_active, `"${meta}"`].join(','));
    }
    // snapshots
    lines.push('', 'SECTION,snapshots', 'account_id,snapshot_date,balance');
    for (const s of [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)))
      lines.push([s.account_id, s.snapshot_date, s.balance].join(','));
    // exchange rates
    const rateEntries = Object.entries(dateRates).sort(([a], [b]) => a.localeCompare(b));
    if (rateEntries.length) {
      const allCurs = [...new Set(rateEntries.flatMap(([, r]) => Object.keys(r)))].sort();
      lines.push('', 'SECTION,exchange_rates', ['snapshot_date', ...allCurs].join(','));
      for (const [date, r] of rateEntries)
        lines.push([date, ...allCurs.map(c => r[c] != null ? r[c] : '')].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `finances-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast?.('Exported CSV');
  };

  /* ── clear data ── */
  const clearAllData = async () => {
    await sb.from('financial_date_rates').delete().eq('user_id', user.id);
    await sb.from('financial_accounts').delete().eq('user_id', user.id);
    setConfirmClearData(false);
    await loadAll();
    showToast?.('All financial data cleared');
  };

  /* ══════════════════════════════════════════════════════════════
     RENDER SECTIONS
  ══════════════════════════════════════════════════════════════ */

  const TopBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px' }}>
      <div style={{ ...S.label, fontSize: 13, color: '#1a1a1a' }}>Finances</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => fileRef.current?.click()} disabled={extracting}
          style={{ ...S.btnGhost, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          {extracting ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
          <span style={{ fontSize: 11 }}>Scan</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleExtractFile} />
        <input ref={importCsvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCsvFile} />
        <input ref={importJsonRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJsonFile} />
      </div>
    </div>
  );

  const CurrencyPills = (
    <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', overflowX: 'auto' }}>
      <span style={{ ...S.label, lineHeight: '26px', flexShrink: 0 }}>View in</span>
      {ALL_CUR.map(c => (
        <button key={c} style={S.pill(c === displayCurrency)} onClick={() => changeDisplayCurrency(c)}>{c}</button>
      ))}
    </div>
  );

  const DatePills = (
    <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', overflowX: 'auto' }}>
      <button
        style={{ ...S.pill(false), background: '#f0fdf4', color: '#16a34a', border: '1.5px dashed #86efac', flexShrink: 0 }}
        onClick={() => {
          const today = new Date().toISOString().slice(0, 10);
          setEntryDate(today);
          setSelDate('');
          setEntryValues({});
          setView('table');
        }}>
        + New
      </button>
      {dates.map(d => (
        <button key={d} style={S.pill(d === selDate)} onClick={() => { setSelDate(d); setEntryDate(d); }}>{fmtDate(d)}</button>
      ))}
    </div>
  );

  // Collapsible rates bar for selected date
  const RatesBar = selDate && dateRates[selDate] ? (
    <div style={{ padding: '0 16px 8px' }}>
      <button onClick={() => setShowRatesFor(v => !v)}
        style={{ ...S.btnGhost, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
        <ChevronDown size={11} style={{ transform: showRatesFor ? 'none' : 'rotate(-90deg)', transition: '0.15s' }} />
        Rates for {fmtDate(selDate)} (historical)
      </button>
      {showRatesFor && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 2px 4px' }}>
          {Object.entries(dateRates[selDate]).filter(([c]) => c !== 'HKD').map(([cur, rate]) => (
            <span key={cur} style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 6 }}>
              1 {cur} = {rate.toFixed(2)} HKD
            </span>
          ))}
        </div>
      )}
    </div>
  ) : null;

  const ViewToggle = (
    <div style={{ display: 'flex', gap: 0, margin: '0 16px 12px', background: '#f3f4f6', borderRadius: 12, padding: 3 }}>
      {[
        { id: 'table',   icon: Table2,       label: 'Table'   },
        { id: 'summary', icon: TrendingUp,   label: 'Summary' },
        { id: 'chat',    icon: MessageSquare,label: 'Chat'    },
        { id: 'settings',icon: Settings2,    label: 'Settings'},
      ].map(v => (
        <button key={v.id} onClick={() => setView(v.id)} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          padding: '7px 2px', border: 'none', cursor: 'pointer', borderRadius: 10,
          background: view === v.id ? '#fff' : 'none',
          color: view === v.id ? '#1a1a1a' : '#9ca3af',
          fontFamily: MONO, fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
          boxShadow: view === v.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s',
        }}>
          <v.icon size={13} /><span>{v.label}</span>
        </button>
      ))}
    </div>
  );

  /* ── TABLE VIEW ── */
  const TableView = (() => {
    const histRates = selDate ? dateRates[selDate] : null;
    const isHistorical = !!histRates;
    const activeRates = histRates || appToHKD();
    const usedCurrencies = [...new Set(
      accounts
        .filter(a => (entryValues[a.id] != null ? true : bal(a.id, selDate) != null) && a.currency !== displayCurrency && a.currency !== 'PTS')
        .map(a => a.currency)
    )].sort();

    return (
    <div style={{ padding: '0 16px' }}>
      {/* Date selector + helpers */}
      <div style={{ ...S.card, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ ...S.label, flexShrink: 0, fontSize: 10 }}>Date</div>
          <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={{ ...S.input, flex: 1 }} />
        </div>
        {/* Live rates */}
        {(() => {
          const liveRates = appToHKD();
          const entryCurrencies = [...new Set(accounts.filter(a => a.currency !== 'HKD' && a.currency !== 'PTS').map(a => a.currency))].sort();
          if (!entryCurrencies.length) return null;
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10, alignItems: 'center' }}>
              <span style={{ ...S.label, fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>Live rates</span>
              {entryCurrencies.map(cur => (
                <span key={cur} style={{ fontFamily: MONO, fontSize: 10, color: '#374151', background: '#f3f4f6', padding: '2px 7px', borderRadius: 6 }}>
                  1 {cur} = HKD {cvtHKD(1, cur, 'HKD', liveRates).toFixed(2)}
                </span>
              ))}
            </div>
          );
        })()}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyFromLatest} style={{ ...S.btnGhost, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11 }}>
            <Copy size={12} /> Copy from latest
          </button>
          <button onClick={fetchExpenseSuggestion} disabled={loadingExpenses}
            style={{ ...S.btnGhost, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11 }}>
            {loadingExpenses ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />}
            Load Expenses
          </button>
        </div>
        {expenseSuggest && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: '#991b1b', fontWeight: 700 }}>Expenses from "{homeListName}"{expenseSuggest.person ? ` · ${expenseSuggest.person}` : ''}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280', marginTop: 2 }}>
              {fmtDate(expenseSuggest.fromDate)} → {fmtDate(expenseSuggest.toDate)}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: '#dc2626', marginTop: 4 }}>
              {fmtNum(expenseSuggest.total, expenseSuggest.currency)}
            </div>
          </div>
        )}
      </div>

      {/* Exchange rates for selected snapshot */}
      {usedCurrencies.length > 0 && selDate && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          <span style={{ ...S.label, fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>
            Rates ({isHistorical ? 'hist.' : 'live'})
          </span>
          {usedCurrencies.map(cur => {
            const rate = cvtHKD(1, cur, displayCurrency, activeRates);
            return (
              <span key={cur} style={{
                fontFamily: MONO, fontSize: 10, color: '#374151',
                background: isHistorical ? '#eff6ff' : '#f3f4f6',
                border: isHistorical ? '1px solid #bfdbfe' : 'none',
                padding: '2px 8px', borderRadius: 6,
              }}>
                1 {cur} = {displayCurrency} {rate.toFixed(2)}
              </span>
            );
          })}
        </div>
      )}

      {/* Account rows grouped by bank */}
      {[...new Set(accounts.map(a => a.bank))].sort().map(bank => {
        const bankAccs = accounts.filter(a => a.bank === bank).sort((a, b) => a.sort_order - b.sort_order || a.account_name.localeCompare(b.account_name));
        return (
          <div key={bank} style={{ marginBottom: 14 }}>
            <div style={{ ...S.label, marginBottom: 5, paddingLeft: 2 }}>{bank}</div>
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              {bankAccs.map((acc, i) => {
                const savedBal = selDate ? bal(acc.id, selDate) : null;
                const miles = acc.category === 'Points/Miles' && savedBal != null && acc.metadata?.miles_ratio
                  ? Math.round(savedBal / acc.metadata.miles_ratio * 1000) : null;
                return (
                  <div key={acc.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto 120px',
                    padding: '10px 14px', gap: 8, alignItems: 'center',
                    borderBottom: i < bankAccs.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: '#111' }}>
                        {acc.account_name}{acc.account_number ? ` ···${acc.account_number}` : ''}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={S.catBadge(acc.category)}>{acc.category}</span>
                        {miles != null && <span style={{ color: '#06b6d4' }}>≈ {miles.toLocaleString()} mi</span>}
                      </div>
                    </div>
                    <span style={{ ...S.label, color: '#9ca3af', fontSize: 10 }}>{acc.currency === 'PTS' ? 'PTS' : acc.currency}</span>
                    <input
                      type="number"
                      value={entryValues[acc.id] ?? ''}
                      onChange={e => setEntryValues(prev => ({ ...prev, [acc.id]: e.target.value }))}
                      placeholder={savedBal != null ? String(savedBal) : '—'}
                      style={{ ...S.inputSm, color: entryValues[acc.id] != null && entryValues[acc.id] !== '' ? '#1a1a1a' : '#9ca3af' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {accounts.length > 0 && (
        <button onClick={saveBulkEntry} disabled={savingEntry}
          style={{ ...S.btnDark, width: '100%', padding: '14px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
          {savingEntry ? <RefreshCw size={15} /> : <Check size={15} />}
          {savingEntry ? 'Saving…' : `Save — ${fmtDate(entryDate)}`}
        </button>
      )}
      <button onClick={() => setShowAddAcc(true)} style={{ ...S.btnGhost, width: '100%', marginTop: 10, marginBottom: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={14} /> Add Account
      </button>

      {/* Delete snapshot — bottom */}
      {selDate && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -60, marginBottom: 90 }}>
          <button onClick={() => setConfirmDeleteSnap(true)}
            style={{ ...S.btnGhost, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af' }}>
            <Trash2 size={12} /> Delete snapshot ({fmtDate(selDate)})
          </button>
        </div>
      )}
    </div>
    );
  })();

  /* ── SUMMARY VIEW ── */
  const SummaryView = (() => {
    const Delta = ({ cur, prev }) => {
      if (prev == null || prev === 0) return null;
      const diff = cur - prev;
      const pct = (diff / Math.abs(prev)) * 100;
      const up = diff >= 0;
      return (
        <span style={{ fontFamily: MONO, fontSize: 10, color: up ? '#16a34a' : '#dc2626', display: 'flex', alignItems: 'center', gap: 2 }}>
          {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{fmtPct(pct)}
        </span>
      );
    };

    const cash    = catTotalOnDate('Cash',        selDate);
    const sec     = catTotalOnDate('Securities',  selDate);
    const cc      = catTotalOnDate('Credit Card', selDate);
    const income  = catTotalOnDate('Income',      selDate);
    const expense = catTotalOnDate('Expense',     selDate);
    const prop    = catTotalOnDate('Property',    selDate);
    const netWorth  = cash + sec - cc;
    const netIncome = income - expense;
    const prevCash    = prevDate ? catTotalOnDate('Cash',        prevDate) : null;
    const prevSec     = prevDate ? catTotalOnDate('Securities',  prevDate) : null;
    const prevCC      = prevDate ? catTotalOnDate('Credit Card', prevDate) : null;
    const prevIncome  = prevDate ? catTotalOnDate('Income',      prevDate) : null;
    const prevExpense = prevDate ? catTotalOnDate('Expense',     prevDate) : null;
    const prevProp    = prevDate ? catTotalOnDate('Property',    prevDate) : null;
    const prevNetWorth  = prevDate ? (prevCash + prevSec - prevCC) : null;
    const prevNetIncome = prevDate ? (prevIncome - prevExpense) : null;

    return (
      <div style={{ padding: '0 16px 80px' }}>
        {/* Dark summary card — at top */}
        <div style={{ ...S.card, background: '#1a1a1a', color: '#fff', padding: '16px 18px' }}>
          <div style={{ ...S.label, color: '#6b7280', marginBottom: 12 }}>Summary ({displayCurrency})</div>
          {[
            { label: 'Cash',          value: cash,    prev: prevCash    },
            { label: 'Securities',    value: sec,     prev: prevSec     },
            { label: '− Credit Card', value: cc,      prev: prevCC,     negate: true },
          ].map((row, ri) => {
            const diff = row.prev != null ? (row.negate ? row.prev - row.value : row.value - row.prev) : null;
            return (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
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
          {/* Net Worth = Cash + Securities - CC */}
          <div style={{ borderTop: '1px solid #374151', paddingTop: 8, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: '#fff' }}>Net Worth</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {prevNetWorth != null && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: (netWorth - prevNetWorth) >= 0 ? '#4ade80' : '#f87171' }}>
                  {(netWorth - prevNetWorth) >= 0 ? '+' : ''}{fmtNum(netWorth - prevNetWorth, displayCurrency)}
                  {' '}({fmtPct(((netWorth - prevNetWorth) / Math.abs(prevNetWorth)) * 100)})
                </span>
              )}
              <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: netWorth >= 0 ? '#4ade80' : '#f87171' }}>
                {fmtNum(netWorth, displayCurrency)}
              </span>
            </div>
          </div>
          {/* Income / Expense / Net Income */}
          <div style={{ borderTop: '1px solid #374151', paddingTop: 8 }}>
          {[
            { label: 'Income',    value: income,  prev: prevIncome  },
            { label: '− Expense', value: expense, prev: prevExpense, negate: true },
          ].map(row => {
            const diff = row.prev != null ? (row.negate ? row.prev - row.value : row.value - row.prev) : null;
            return (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
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
          <div style={{ borderTop: '1px solid #374151', paddingTop: 8, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#d1d5db' }}>Net Income</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {prevNetIncome != null && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: (netIncome - prevNetIncome) >= 0 ? '#4ade80' : '#f87171' }}>
                  {(netIncome - prevNetIncome) >= 0 ? '+' : ''}{fmtNum(netIncome - prevNetIncome, displayCurrency)}
                </span>
              )}
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: netIncome >= 0 ? '#4ade80' : '#f87171' }}>
                {fmtNum(netIncome, displayCurrency)}
              </span>
            </div>
          </div>
          </div>
        </div>

        {CATS.filter(cat => cat !== 'Others').map(cat => {
          const byCur     = catByCurrency(cat, selDate);
          const prevByCur = prevDate ? catByCurrency(cat, prevDate) : {};
          const curCurs   = Object.keys(byCur);
          if (!curCurs.length) return null;
          const totalDisp     = catTotalOnDate(cat, selDate);
          const prevTotalDisp = prevDate ? catTotalOnDate(cat, prevDate) : null;

          return (
            <div key={cat} style={{ ...S.card, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={S.catBadge(cat)}>{cat}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700,
                    color: (cat === 'Credit Card' || cat === 'Expense') ? '#ef4444' : cat === 'Income' ? '#22c55e' : '#1a1a1a' }}>
                    {fmtNum(totalDisp, displayCurrency)}
                  </span>
                  <Delta cur={totalDisp} prev={prevTotalDisp} />
                </div>
              </div>

              {curCurs.map(cur => {
                const native     = byCur[cur];
                const prevNative = prevByCur[cur] ?? null;
                const diff       = prevNative != null ? native - prevNative : null;
                // Miles summary for Points/Miles
                const milesAccs = cat === 'Points/Miles'
                  ? accounts.filter(a => a.category === 'Points/Miles' && a.currency === cur && a.metadata?.miles_ratio)
                  : [];
                const totalMiles = milesAccs.reduce((s, a) => {
                  const b = bal(a.id, selDate);
                  return b != null ? s + (b / a.metadata.miles_ratio * 1000) : s;
                }, 0);

                return (
                  <div key={cur} style={{ padding: '5px 0', borderTop: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ ...S.label, fontSize: 9, color: '#9ca3af', minWidth: 32 }}>{cur}</span>
                        {diff != null && (
                          <span style={{ fontFamily: MONO, fontSize: 9, color: diff >= 0 ? '#16a34a' : '#dc2626' }}>
                            {diff >= 0 ? '+' : ''}{fmtNum(diff, cur)}
                          </span>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{fmtNum(native, cur)}</div>
                        {prevNative != null && (
                          <div style={{ fontFamily: MONO, fontSize: 9, color: '#9ca3af' }}>prev: {fmtNum(prevNative, cur)}</div>
                        )}
                      </div>
                    </div>
                    {totalMiles > 0 && (
                      <div style={{ fontFamily: MONO, fontSize: 10, color: '#06b6d4', marginTop: 2 }}>
                        ≈ {Math.round(totalMiles).toLocaleString()} miles
                      </div>
                    )}
                  </div>
                );
              })}

              {(curCurs.length > 1 || curCurs[0] !== displayCurrency) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, marginTop: 4, borderTop: '1px dashed #e5e7eb' }}>
                  <span style={{ ...S.label, fontSize: 9 }}>Total in {displayCurrency}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {prevTotalDisp != null && (
                      <span style={{ fontFamily: MONO, fontSize: 9, color: '#9ca3af' }}>prev: {fmtNum(prevTotalDisp, displayCurrency)}</span>
                    )}
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{fmtNum(totalDisp, displayCurrency)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </div>
    );
  })();


  /* ── CHAT VIEW ── */
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
            }}>{msg.content}</div>
          </div>
        ))}
        {chatLoading && (
          <div style={{ display: 'flex' }}>
            <div style={{ padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 4, background: '#f3f4f6', fontFamily: MONO, fontSize: 12, color: '#9ca3af' }}>Thinking…</div>
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

  /* ── SETTINGS VIEW ── */
  const SettingsView = (
    <div style={{ padding: '0 16px 80px' }}>
      {/* xAI key */}
      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 12 }}>xAI API Key</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input type={showXaiKey ? 'text' : 'password'} value={xaiApiKey}
            onChange={e => setXaiApiKey(e.target.value)} placeholder="xai-…" style={{ ...S.input, flex: 1 }} />
          <button onClick={() => setShowXaiKey(v => !v)} style={{ ...S.btnGhost, padding: '8px 10px' }}>
            {showXaiKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button onClick={saveApiKey} disabled={savingKey} style={{ ...S.btnDark, padding: '8px 14px' }}>
            {savingKey ? <RefreshCw size={14} /> : <Check size={14} />}
          </button>
        </div>
        <div style={{ ...S.label, marginBottom: 8, marginTop: 12 }}>Model</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={xaiModel} onChange={e => changeXaiModel(e.target.value)}
            style={{ ...S.select, flex: 1, fontSize: 12 }}>
            {xaiModels.length === 0
              ? <option value={xaiModel}>{xaiModel}</option>
              : xaiModels.map(m => <option key={m} value={m}>{m}</option>)
            }
          </select>
          <button onClick={() => fetchModels()} disabled={loadingModels}
            style={{ ...S.btnGhost, padding: '8px 10px', flexShrink: 0 }} title="Fetch available models">
            <RefreshCw size={14} style={loadingModels ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
        <div style={{ ...S.label, marginBottom: 8, marginTop: 14 }}>Vision Model (for PDF/Image scan)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={visionModel} onChange={e => { setVisionModel(e.target.value); saveUserSetting('vision_model', e.target.value); }}
            style={{ ...S.select, flex: 1, fontSize: 12 }}>
            {xaiModels.length === 0
              ? <option value={visionModel}>{visionModel}</option>
              : xaiModels.map(m => <option key={m} value={m}>{m}</option>)
            }
          </select>
        </div>
        <div style={{ ...S.label, fontSize: 9, opacity: 0.6, marginTop: 6 }}>Used for AI chat and statement scanning. Tap refresh to load models from xAI.</div>
      </div>

      {/* Expense list setting */}
      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 8 }}>Load Expenses Settings</div>
        <div style={{ ...S.label, fontSize: 9, marginBottom: 4 }}>List Name</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={homeListName} onChange={e => setHomeListName(e.target.value)}
            placeholder="Home" style={{ ...S.input, flex: 1 }} />
          <button onClick={() => saveUserSetting('home_list_name', homeListName).then(() => showToast?.('Saved'))}
            style={{ ...S.btnDark, padding: '8px 14px' }}><Check size={14} /></button>
        </div>
        <div style={{ ...S.label, fontSize: 9, marginBottom: 4 }}>Person (display name in expense list)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={expensePerson} onChange={e => setExpensePerson(e.target.value)}
            placeholder="e.g. Renee" style={{ ...S.input, flex: 1 }} />
          <button onClick={() => saveUserSetting('expense_person', expensePerson).then(() => showToast?.('Saved'))}
            style={{ ...S.btnDark, padding: '8px 14px' }}><Check size={14} /></button>
        </div>
        <div style={{ ...S.label, fontSize: 9, opacity: 0.6, marginTop: 6 }}>Leave blank to use your own membership display name in that list.</div>
      </div>

      {/* Account mappings */}
      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 6 }}>Account Mappings ({accounts.length})</div>
        <div style={{ ...S.label, fontSize: 9, opacity: 0.6, marginBottom: 12, textTransform: 'none', letterSpacing: 0 }}>
          Set account number (for PDF/image matching), currency, category. For Points/Miles accounts, set miles ratio (e.g. 48 → balance ÷ 48 × 1000 = miles).
        </div>

        {[...accounts].sort((a, b) => a.bank.localeCompare(b.bank) || a.account_name.localeCompare(b.account_name)).map((acc, i, arr) => (
          <div key={acc.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none', paddingBottom: 10, marginBottom: 10 }}>
            {editingAccId === acc.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ ...S.label, marginBottom: 4 }}>Bank</div>
                    <input value={editingAccData.bank || ''} onChange={e => setEditingAccData(d => ({ ...d, bank: e.target.value }))} style={S.input} />
                  </div>
                  <div>
                    <div style={{ ...S.label, marginBottom: 4 }}>Account Name</div>
                    <input value={editingAccData.account_name || ''} onChange={e => setEditingAccData(d => ({ ...d, account_name: e.target.value }))} style={S.input} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ ...S.label, marginBottom: 4 }}>Acct # (last 4)</div>
                    <input value={editingAccData.account_number || ''} placeholder="1234"
                      onChange={e => setEditingAccData(d => ({ ...d, account_number: e.target.value }))} style={S.input} />
                  </div>
                  <div>
                    <div style={{ ...S.label, marginBottom: 4 }}>Currency</div>
                    <select value={editingAccData.currency || 'HKD'} onChange={e => setEditingAccData(d => ({ ...d, currency: e.target.value }))} style={S.select}>
                      {ALL_CUR.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ ...S.label, marginBottom: 4 }}>Category</div>
                    <select value={editingAccData.category || 'Cash'} onChange={e => setEditingAccData(d => ({ ...d, category: e.target.value }))} style={S.select}>
                      {CATS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                {editingAccData.category === 'Points/Miles' && (
                  <div>
                    <div style={{ ...S.label, marginBottom: 4 }}>Miles Ratio (pts per 1000 miles)</div>
                    <input type="number" placeholder="48"
                      value={editingAccData.metadata?.miles_ratio || ''}
                      onChange={e => setEditingAccData(d => ({ ...d, metadata: { ...(d.metadata || {}), miles_ratio: parseFloat(e.target.value) || null } }))}
                      style={S.input} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={updateAccount} style={{ ...S.btnDark, flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <Check size={13} /> Save
                  </button>
                  <button onClick={() => { setEditingAccId(null); setEditingAccData({}); }} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
                  <button onClick={() => setConfirmDeleteAcc(acc)} style={{ ...S.btnRed, padding: '8px 12px' }}><Trash2 size={13} /></button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>
                    {acc.bank} / {acc.account_name}
                    {acc.account_number && <span style={{ fontFamily: MONO, fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>···{acc.account_number}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <span style={S.catBadge(acc.category)}>{acc.category}</span>
                    <span style={{ ...S.catBadge('Others'), background: '#f3f4f6', color: '#6b7280' }}>{acc.currency}</span>
                    {acc.metadata?.miles_ratio && (
                      <span style={{ fontFamily: MONO, fontSize: 9, color: '#06b6d4', alignSelf: 'center' }}>÷{acc.metadata.miles_ratio}×1000 mi</span>
                    )}
                  </div>
                </div>
                <button onClick={() => { setEditingAccId(acc.id); setEditingAccData({ ...acc }); }}
                  style={{ ...S.btnGhost, padding: '6px 10px' }}>
                  <Pencil size={13} />
                </button>
              </div>
            )}
          </div>
        ))}

        <button onClick={() => setShowAddAcc(true)} style={{ ...S.btnGhost, width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={14} /> Add Account
        </button>
      </div>

      {/* Data management */}
      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 12 }}>Data Management</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={exportData} style={{ ...S.btnGhost, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Download size={14} /> Export JSON
            </button>
            <button onClick={exportCSV} style={{ ...S.btnGhost, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Download size={14} /> Export CSV
            </button>
            <button onClick={() => importCsvRef.current?.click()} style={{ ...S.btnGhost, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Upload size={14} /> Import CSV
            </button>
            <button onClick={() => importJsonRef.current?.click()} style={{ ...S.btnGhost, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Upload size={14} /> Import JSON
            </button>
          </div>
          <button onClick={() => setConfirmClearData(true)} style={{ ...S.btnRed, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> Clear All Financial Data
          </button>
        </div>
      </div>
    </div>
  );

  /* ── MODALS ── */
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
                style={S.select}>
                <option value="">— Select account —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.bank} / {a.account_name}{a.account_number ? ` ···${a.account_number}` : ''}</option>
                ))}
              </select>
              {pendingExtraction.detected_account_number && (
                <div style={{ fontFamily: MONO, fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                  Detected account: ···{pendingExtraction.detected_account_number}
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
              style={{ ...S.btnGhost, width: '100%', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <ChevronDown size={11} style={{ transform: showRaw ? 'none' : 'rotate(-90deg)' }} />
              Raw Grok response
            </button>
            {showRaw && (
              <pre style={{ fontFamily: MONO, fontSize: 9, background: '#f3f4f6', borderRadius: 8, padding: 10, maxHeight: 120, overflow: 'auto', marginBottom: 12, whiteSpace: 'pre-wrap' }}>
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

      {/* Import preview */}
      {importPreview && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ ...S.label, fontSize: 13, color: '#1a1a1a' }}>Import Preview</div>
              <button onClick={() => setImportPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#374151', marginBottom: 8 }}>
              {importPreview.accounts?.length || 0} accounts
              · {importPreview.snapshots?.length || 0} snapshots
              {Object.keys(importPreview.dateRates || {}).length > 0 && (
                <span style={{ color: '#06b6d4', marginLeft: 8 }}>
                  · {Object.keys(importPreview.dateRates).length} exchange rate dates
                </span>
              )}
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, fontFamily: MONO, fontSize: 11, color: '#6b7280' }}>
              {importPreview.accounts?.slice(0, 10).map((a, i) => (
                <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                  {a.bank} / {a.account_name} ({a.currency}, {a.category})
                </div>
              ))}
              {(importPreview.accounts?.length || 0) > 10 && (
                <div style={{ color: '#9ca3af' }}>…and {importPreview.accounts.length - 10} more</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setImportPreview(null)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={saveImport} disabled={importing}
                style={{ ...S.btnDark, flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {importing ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                {importing ? 'Importing…' : 'Import All'}
              </button>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ ...S.label, marginBottom: 5 }}>Bank</div>
                  <input value={newAcc.bank} onChange={e => setNewAcc(a => ({ ...a, bank: e.target.value }))} style={S.input} placeholder="HSBC" />
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom: 5 }}>Account Name</div>
                  <input value={newAcc.account_name} onChange={e => setNewAcc(a => ({ ...a, account_name: e.target.value }))} style={S.input} placeholder="Savings" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ ...S.label, marginBottom: 5 }}>Acct # (last 4)</div>
                  <input value={newAcc.account_number} onChange={e => setNewAcc(a => ({ ...a, account_number: e.target.value }))} style={S.input} placeholder="1234" />
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom: 5 }}>Currency</div>
                  <select value={newAcc.currency} onChange={e => setNewAcc(a => ({ ...a, currency: e.target.value }))} style={S.select}>
                    {ALL_CUR.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom: 5 }}>Category</div>
                  <select value={newAcc.category} onChange={e => setNewAcc(a => ({ ...a, category: e.target.value }))} style={S.select}>
                    {CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {newAcc.category === 'Points/Miles' && (
                <div>
                  <div style={{ ...S.label, marginBottom: 5 }}>Miles Ratio (pts per 1000 miles, e.g. 48)</div>
                  <input type="number" value={newAcc.metadata?.miles_ratio || ''} placeholder="48"
                    onChange={e => setNewAcc(a => ({ ...a, metadata: { miles_ratio: parseFloat(e.target.value) || null } }))}
                    style={S.input} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAddAcc(false)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={addAccount} style={{ ...S.btnDark, flex: 2 }}>Add Account</button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Confirm delete account */}
      {confirmDeleteAcc && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            style={{ background: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380 }}>
            <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Delete Account?</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
              {confirmDeleteAcc.bank} / {confirmDeleteAcc.account_name} and all its snapshots will be deleted.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDeleteAcc(null)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={() => deleteAccount(confirmDeleteAcc)} style={{ ...S.btnRed, flex: 1 }}>Delete</button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Confirm delete snapshot */}
      {confirmDeleteSnap && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            style={{ background: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <AlertTriangle size={20} color="#dc2626" />
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700 }}>Delete Snapshot?</div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
              All balances for <strong>{fmtDate(selDate)}</strong> will be deleted, including the exchange rates for that date.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDeleteSnap(false)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={deleteSnapshot} style={{ ...S.btnRed, flex: 1 }}>Delete</button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Confirm clear all data */}
      {confirmClearData && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            style={{ background: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <AlertTriangle size={20} color="#dc2626" />
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700 }}>Clear All Data?</div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
              All accounts, snapshots, and exchange rates will be deleted. Your xAI API key will be preserved.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmClearData(false)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={clearAllData} style={{ ...S.btnRed, flex: 1 }}>Clear All</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  /* ── main render ── */
  return (
    <div className="se" style={{ fontFamily: MONO, maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8f9fa' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {TopBar}
      {CurrencyPills}
      {(view === 'table' || view === 'summary') && DatePills}
      {(view === 'table' || view === 'summary') && RatesBar}
      {ViewToggle}
      <div style={{ overflowY: 'auto' }}>
        {view === 'table'   && TableView}
        {view === 'summary' && SummaryView}
        {view === 'chat'    && ChatView}
        {view === 'settings'&& SettingsView}
      </div>
      {Modals}
    </div>
  );
}
