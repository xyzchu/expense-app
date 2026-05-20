import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Eye, EyeOff, Upload, ChevronDown,
  MessageSquare, Table2, Settings2, Send, RefreshCw, Check, ClipboardList,
  TrendingUp, TrendingDown, Copy, Download, Pencil, AlertTriangle
} from 'lucide-react';
import { MONO, FS, FW, CLAY } from './theme';
import { useIsWide } from './hooks';
import {
  DataTableHeaderLabel, ModalHeader, SegmentedTabs, UI, modalBackdropStyle, modalSurfaceStyle,
  tableCellStyle, tableHeaderCellStyle, tableHeaderRowStyle, tableRowStyle, tableStyle
} from './ui';

/* ─── constants ─────────────────────────────────────────────────── */
const CATS = ['Cash', 'Securities', 'Credit Card', 'Loan', 'Income', 'Expense', 'Points/Miles', 'Property', 'Others'];
const CAT_COLOR = {
  Cash: '#3b82f6', Securities: '#8b5cf6', 'Credit Card': '#ef4444', Loan: '#b91c1c',
  Income: '#22c55e', Expense: '#f97316', 'Points/Miles': '#06b6d4', Property: '#f59e0b', Others: '#6b7280',
};
// Categories excluded from net worth / summary totals / Grok context
const CATS_EXCLUDED = new Set(['Others']);
const ALL_CUR = ['HKD', 'AUD', 'USD', 'CNY', 'THB', 'EUR', 'SGD'];
// Fallback HKD-based rates (1 unit of currency = X HKD)
const FALLBACK_HKD = { HKD: 1, AUD: 4.95, USD: 7.78, CNY: 1.07, THB: 0.22, EUR: 8.55, SGD: 5.80 };
const DEFAULT_EXPECTED_NET_ASSET_BASE_MONTH = '2026-04';
const DEFAULT_EXPECTED_NET_ASSET_BASE_VALUE = 19000000;

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

const compareTxnOrder = (a, b) => {
  const byDate = (a.transaction_date || '').localeCompare(b.transaction_date || '');
  if (byDate !== 0) return byDate;

  const sortA = Number(a.sort_order);
  const sortB = Number(b.sort_order);
  const hasSortA = Number.isFinite(sortA);
  const hasSortB = Number.isFinite(sortB);
  if (hasSortA && hasSortB && sortA !== sortB) return sortA - sortB;
  if (hasSortA && !hasSortB) return -1;
  if (!hasSortA && hasSortB) return 1;

  const byCreated = (a.created_at || '').localeCompare(b.created_at || '');
  if (byCreated !== 0) return byCreated;

  return String(a.id || '').localeCompare(String(b.id || ''));
};

const normalizeBroker = (account) => {
  const raw = String(account || '').trim();
  if (/futu/i.test(raw)) return 'Futubull';
  if (/hsbc/i.test(raw)) return 'HSBC';
  return raw || 'Other';
};

/* ─── styles ─────────────────────────────────────────────────────── */
const S = {
  card:    { background: CLAY.surface, borderRadius: UI.cardRadius, padding: 20, boxShadow: CLAY.shadow, marginBottom: UI.sectionGap },
  input:   { border: 'none', borderRadius: UI.controlRadius, padding: '12px 14px', fontSize: FS.lg, fontFamily: MONO, outline: 'none', background: CLAY.surf2, color: CLAY.text, width: '100%', boxSizing: 'border-box' },
  inputSm: { border: 'none', borderRadius: UI.controlRadius, padding: '8px 10px', fontSize: FS.lg, fontFamily: MONO, outline: 'none', background: CLAY.surf2, color: CLAY.text, width: '100%', boxSizing: 'border-box', textAlign: 'right' },
  btnDark: { background: CLAY.text, color: CLAY.surface, border: 'none', borderRadius: UI.controlRadius, padding: '10px 14px', fontSize: FS.lg, fontFamily: MONO, fontWeight: FW.semibold, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '4px 4px 12px rgba(44,36,32,0.28)' },
  btnGhost:{ background: CLAY.surf2, border: 'none', boxShadow: CLAY.btn, borderRadius: UI.controlRadius, padding: '8px 14px', fontSize: FS.lg, fontFamily: MONO, fontWeight: FW.semibold, cursor: 'pointer', color: CLAY.textMid },
  btnRed:  { background: `${CLAY.red}15`, color: CLAY.red, border: 'none', borderRadius: UI.controlRadius, padding: '9px 16px', fontSize: FS.lg, fontFamily: MONO, fontWeight: FW.semibold, cursor: 'pointer' },
  label:   { fontSize: FS.lg, fontFamily: MONO, fontWeight: FW.semibold, letterSpacing: '0.08em', color: CLAY.textMid },
  pill: (active) => ({
    display: 'inline-block', padding: '5px 12px', borderRadius: 9999, fontSize: FS.lg,
    fontFamily: MONO, fontWeight: FW.semibold, cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? CLAY.text : CLAY.surf2, color: active ? CLAY.surface : CLAY.textMid,
    border: 'none', letterSpacing: '0.04em', boxShadow: active ? UI.activeShadow : 'none',
  }),
  catBadge: (cat) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: FS.lg,
    fontFamily: MONO, fontWeight: FW.semibold, background: (CAT_COLOR[cat] || '#6b7280') + '20', color: CAT_COLOR[cat] || '#6b7280',
  }),
  select: { border: 'none', borderRadius: UI.controlRadius, padding: '12px 14px', fontSize: FS.lg, fontFamily: MONO, outline: 'none', background: CLAY.surf2, color: CLAY.text, width: '100%' },
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function FinancesTab({
  user,
  sb,
  showToast,
  sendNotification,
  rates,
  balanceTxns,
  balanceCurrency,
  expenseEntries = [],
  expenseListName = '',
  expenseListCurrency = 'AUD',
  forcedView = null,
  showViewToggle = true,
  viewOptions = null,
  initialView = 'table',
  embedded = false,
  title = 'Finances',
}) {
  const isWide = useIsWide();

  /* ── state ── */
  const [accounts,  setAccounts]  = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [securityTxns, setSecurityTxns] = useState([]);
  const [savedStockPrices, setSavedStockPrices] = useState({});
  const [dateRates, setDateRates] = useState({});  // { "2026-03-12": { HKD:1, AUD:5.12, ... } }
  const [dates,            setDates]           = useState([]);
  const [selDate,          setSelDate]         = useState('');
  const [summaryMonths,    setSummaryMonths]   = useState([]);
  const [selSummaryMonth,  setSelSummaryMonth] = useState('');
  const [view,             setView]            = useState(initialView);
  const [displayCurrency, setDisplayCurrency] = useState('HKD');

  // account management
  const [showAddAcc,    setShowAddAcc]    = useState(false);
  const [newAcc,        setNewAcc]        = useState({ bank: '', account_name: '', account_number: '', currency: 'HKD', category: 'Cash', metadata: {} });
  const [editingAccId,  setEditingAccId]  = useState(null);
  const [editingAccData,setEditingAccData]= useState({});

  const TODAY = new Date().toISOString().slice(0, 10);
  const [newSnapDate,      setNewSnapDate]      = useState(TODAY);
  const [showNewSnapModal, setShowNewSnapModal] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState({}); // { [accId]: 'saving' | 'saved' }
  const autoSaveTimers = useRef({});
  const [expenseSuggest,   setExpenseSuggest]   = useState(null);
  const [loadingExpenses,  setLoadingExpenses]  = useState(false);
  const [homeMonthlyStats, setHomeMonthlyStats] = useState({}); // { [month]: { income, expense, currency } }
  const [homeExpenses,     setHomeExpenses]     = useState([]); // all expenses from Home list for chat context
  const [homeExpensesLoaded, setHomeExpensesLoaded] = useState(false);

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
    { role: 'assistant', content: 'Hi! Ask me anything about your finances — e.g. "What is my net worth in HKD?", "Average cash balance in 2025?", or "What is MSFT trading at right now?"' }
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
  const [expectedNetAssetBaseMonth, setExpectedNetAssetBaseMonth] = useState(DEFAULT_EXPECTED_NET_ASSET_BASE_MONTH);
  const [expectedNetAssetBaseValue, setExpectedNetAssetBaseValue] = useState(String(DEFAULT_EXPECTED_NET_ASSET_BASE_VALUE));
  const [usInflationRates, setUsInflationRates] = useState({});

  // confirm delete
  const [confirmDeleteAcc,  setConfirmDeleteAcc]  = useState(null);
  const [confirmDeleteSnap, setConfirmDeleteSnap] = useState(false);

  // show/hide edit controls in table view
  const [showEdits, setShowEdits] = useState(false);
  const [expandedDormantBanks, setExpandedDormantBanks] = useState(new Set());

  // expanded categories in summary view
  const [expandedCats, setExpandedCats] = useState(new Set());

  // inline balance editing
  const [editingBalance, setEditingBalance] = useState(null); // { accId, value }
  const [showTableSettings, setShowTableSettings] = useState(false);
  const [showStatSettings,  setShowStatSettings]  = useState(false);
  const [analysisSort, setAnalysisSort] = useState({ key: 'month', direction: 'desc' });
  const activeView = forcedView ?? view;
  const resolvedViewOptions = viewOptions || [
    { id: 'table', icon: Table2, label: 'Table' },
    { id: 'summary', icon: TrendingUp, label: 'Summary' },
    { id: 'statistics', icon: ClipboardList, label: 'Statistics' },
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'settings', icon: Settings2, label: 'Settings' },
  ];
  const isMonthBasedView = activeView === 'summary' || activeView === 'statistics' || activeView === 'summary_analytics';
  const showPortfolioControls = activeView === 'table' || isMonthBasedView;

  /* ── derived dates ── */
  useEffect(() => {
    const unique = [...new Set(snapshots.map(s => s.snapshot_date))].sort().reverse();
    setDates(unique);
    if (!selDate && unique.length) setSelDate(unique[0]);
    const months = [...new Set(snapshots.map(s => s.snapshot_date.slice(0, 7)))].sort().reverse();
    setSummaryMonths(months);
    if (!selSummaryMonth && months.length) setSelSummaryMonth(months[0]);
  }, [snapshots]);

  /* ── clear expense suggestion when date changes ── */
  useEffect(() => { setExpenseSuggest(null); }, [selDate]);

  /* ── scroll chat ── */
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  /* ── load from DB ── */
  const loadAll = useCallback(async () => {
    if (!user || !sb) return;
    const [{ data: accs }, { data: snaps }, { data: settings }, { data: dRates }, { data: txns }] = await Promise.all([
      sb.from('financial_accounts').select('*').eq('user_id', user.id).order('sort_order'),
      sb.from('financial_snapshots').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
      sb.from('user_settings').select('*').eq('user_id', user.id),
      sb.from('financial_date_rates').select('*').eq('user_id', user.id),
      sb.from('securities_transactions').select('*').eq('user_id', user.id),
    ]);
    if (accs) setAccounts(accs);
    if (snaps) setSnapshots(snaps);
    if (txns) setSecurityTxns(txns);
    if (dRates) {
      const rmap = {};
      for (const r of dRates) rmap[r.snapshot_date] = r.rates;
      setDateRates(rmap);
    }
    if (settings) {
      const savedPrices = {};
      settings
        .filter(r => String(r.key).startsWith('latest_stock_price:'))
        .forEach((r) => {
          try {
            const ticker = String(r.key).split(':')[1]?.toUpperCase();
            const parsed = JSON.parse(r.value);
            if (ticker && parsed?.price != null) savedPrices[ticker] = Number(parsed.price);
          } catch {}
        });
      setSavedStockPrices(savedPrices);
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
      const enabm = settings.find(r => r.key === 'expected_net_asset_base_month');
      if (enabm?.value) setExpectedNetAssetBaseMonth(enabm.value);
      const enabv = settings.find(r => r.key === 'expected_net_asset_base_value');
      if (enabv?.value != null) setExpectedNetAssetBaseValue(String(enabv.value));
    }
  }, [user, sb]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/us-cpi')
      .then((res) => {
        if (!res.ok) throw new Error(`U.S. CPI request failed: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled && json?.monthlyRates) {
          setUsInflationRates(json.monthlyRates);
        }
      })
      .catch(() => {
        if (!cancelled) setUsInflationRates({});
      });
    return () => { cancelled = true; };
  }, []);

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
  const bal = (accId, date) => {
    if (date === 'current') {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 45);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const recent = snapshots.filter(s => s.account_id === accId && s.snapshot_date >= cutoffStr)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
      return recent ? recent.balance : 0; // 0 if no snapshot in last 30 days
    }
    return snapshots.find(s => s.account_id === accId && s.snapshot_date === date)?.balance;
  };

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

  const prevDate = selDate === 'current' ? (dates[0] || null) : (dates[dates.indexOf(selDate) + 1] || null);
  const dormantCutoffDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  }, []);

  const recentNonZeroAccountIds = useMemo(() => {
    const activeIds = new Set();
    snapshots.forEach((snap) => {
      if (!snap?.account_id || !snap?.snapshot_date) return;
      if (snap.snapshot_date < dormantCutoffDate) return;
      if (Math.abs(Number(snap.balance || 0)) > 0.000001) activeIds.add(snap.account_id);
    });
    return activeIds;
  }, [snapshots, dormantCutoffDate]);
  const isAccountDormant = useCallback((acc) => !recentNonZeroAccountIds.has(acc.id), [recentNonZeroAccountIds]);
  const tableRateCurrencies = useMemo(() => (
    [...new Set(
      accounts
        .filter((acc) => {
          if (isAccountDormant(acc) && !expandedDormantBanks.has(acc.bank)) return false;
          const balance = bal(acc.id, selDate);
          return balance != null && acc.currency !== displayCurrency && acc.currency !== 'PTS';
        })
        .map((acc) => acc.currency)
    )].sort()
  ), [accounts, expandedDormantBanks, isAccountDormant, selDate, displayCurrency, snapshots]);

  /* ── month-based helpers for Summary view ── */
  // Latest balance for an account within a given month (YYYY-MM)
  const balForMonth = useCallback((accId, month) => {
    const snap = snapshots
      .filter(s => s.account_id === accId && s.snapshot_date.startsWith(month))
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
    return snap?.balance ?? null;
  }, [snapshots]);

  const latestSnapshotDateForMonth = useCallback((month) => {
    const snap = snapshots
      .filter(s => s.snapshot_date.startsWith(month))
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
    return snap?.snapshot_date || null;
  }, [snapshots]);

  // Month views use the exchange rates saved with that month's latest snapshot.
  const getRatesForMonth = useCallback((month) => {
    const snapshotDate = latestSnapshotDateForMonth(month);
    return (snapshotDate && dateRates[snapshotDate]) ? dateRates[snapshotDate] : appToHKD();
  }, [dateRates, latestSnapshotDateForMonth, appToHKD]);

  const toDisplayForMonth = useCallback((amount, fromCur, month) =>
    cvtHKD(amount, fromCur, displayCurrency, getRatesForMonth(month)),
  [displayCurrency, getRatesForMonth]);

  const catTotalForMonth = useCallback((cat, month) =>
    accounts.filter(a => a.category === cat).reduce((sum, a) => {
      if (a.currency === 'PTS') return sum;
      const b = balForMonth(a.id, month);
      return b != null ? sum + toDisplayForMonth(b, a.currency, month) : sum;
    }, 0),
  [accounts, balForMonth, toDisplayForMonth]);

  const catByCurrencyForMonth = useCallback((cat, month) => {
    const byCur = {};
    for (const acc of accounts.filter(a => a.category === cat)) {
      const b = balForMonth(acc.id, month);
      if (b != null) byCur[acc.currency] = (byCur[acc.currency] || 0) + b;
    }
    return byCur;
  }, [accounts, balForMonth]);

  const brokerSecurityPositions = useMemo(() => {
    const rows = securityTxns
      .filter((t) => t.ticker && (t.type === 'BUY' || t.type === 'SELL' || t.type === 'DIVIDEND'))
      .slice()
      .sort(compareTxnOrder);

    const positions = new Map();
    rows.forEach((txn) => {
      const broker = normalizeBroker(txn.account);
      const ticker = String(txn.ticker || '').toUpperCase();
      const key = `${broker}::${ticker}`;
      if (!positions.has(key)) {
        positions.set(key, {
          broker,
          ticker,
          shares: 0,
          latestTradePrice: null,
        });
      }
      const row = positions.get(key);
      const qty = Number(txn.quantity || 0);
      if (txn.type === 'BUY' && qty > 0) row.shares += qty;
      if (txn.type === 'SELL' && qty > 0) row.shares = Math.max(0, row.shares - qty);
      if ((txn.type === 'BUY' || txn.type === 'SELL') && Number(txn.price || 0) > 0) {
        row.latestTradePrice = Number(txn.price);
      }
    });

    const hkdRates = appToHKD();
    const brokerTotals = new Map();
    [...positions.values()]
      .filter((row) => row.shares > 0)
      .forEach((row) => {
        const currentPrice = savedStockPrices[row.ticker] ?? row.latestTradePrice ?? 0;
        const usdValue = row.shares * currentPrice;
        const displayValue = cvtHKD(usdValue, 'USD', displayCurrency, hkdRates);
        brokerTotals.set(row.broker, (brokerTotals.get(row.broker) || 0) + displayValue);
      });

    return ['HSBC', 'Futubull']
      .map((broker) => ({
        broker,
        value: brokerTotals.get(broker) || 0,
      }))
      .filter((row) => row.value > 0);
  }, [securityTxns, savedStockPrices, displayCurrency, appToHKD]);

  const prevSummaryMonth = selSummaryMonth
    ? (summaryMonths[summaryMonths.indexOf(selSummaryMonth) + 1] || null)
    : null;

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
      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const prompt = 'Extract ALL accounts from this bank statement. For each account return: account_number (last 4 digits), currency (3-letter code), balance (number, positive for assets, negative for liabilities), and type (e.g. "HKD Savings", "USD Savings", "Securities", "Credit Card"). Also return the statement_date. Credit card balances should be 0 if no amount owing. Return ONLY valid JSON with no markdown: {"date":"YYYY-MM-DD","accounts":[{"account_number":"1234","currency":"HKD","balance":12345.67,"type":"HKD Savings"}]}';

      let contentParts;
      if (isPDF) {
        // Step 1: upload PDF via Supabase edge function proxy (avoids CORS on xAI /v1/files)
        showToast?.('Uploading PDF…');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('purpose', 'assistants');
        const { data: { session } } = await sb.auth.getSession();
        const jwt = session?.access_token || '';
        const uploadResp = await fetch('https://datppieeeobzzmaighwt.supabase.co/functions/v1/xai-file-upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'x-xai-key': xaiApiKey,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: formData,
        });
        const uploadJson = await uploadResp.json();
        if (uploadJson.error) throw new Error('Upload error: ' + (uploadJson.error.message || JSON.stringify(uploadJson.error)));
        const fileId = uploadJson.id;
        if (!fileId) throw new Error('No file_id returned from upload');

        // Step 2: reference file_id in /v1/responses request
        contentParts = [
          { type: 'input_text', text: prompt },
          { type: 'input_file', file_id: fileId },
        ];
      } else {
        // Images: base64 inline
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result.split(',')[1]);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        const mediaType = file.type || 'image/jpeg';
        contentParts = [
          { type: 'input_image', image_url: `data:${mediaType};base64,${base64}` },
          { type: 'input_text', text: prompt },
        ];
      }

      const resp = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${xaiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: visionModel,
          input: [{ role: 'user', content: contentParts }],
        }),
      });
      const json = await resp.json();
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
      // output array may contain tool calls before the final message — find the message item
      let raw = '';
      for (const item of json.output || []) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          const t = item.content.find(c => c.type === 'output_text');
          if (t?.text) { raw = t.text; break; }
        }
      }
      if (!raw) raw = json.choices?.[0]?.message?.content || '';
      if (!raw) throw new Error('Empty response. API returned: ' + JSON.stringify(json).slice(0, 400));
      let parsed = {};
      try { parsed = JSON.parse(raw); }
      catch {
        const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
        if (m) try { parsed = JSON.parse(m[1]); } catch { }
      }
      if (!parsed.date && !Array.isArray(parsed.accounts)) throw new Error('Grok said: ' + raw.slice(0, 300));
      const items = (parsed.accounts || []).map(acc => {
        const matched = accounts.find(a =>
          a.currency === acc.currency &&
          a.account_number && acc.account_number &&
          a.account_number.replace(/\D/g, '').endsWith(acc.account_number.replace(/\D/g, ''))
        ) || accounts.find(a =>
          a.account_number && acc.account_number &&
          a.account_number.replace(/\D/g, '').endsWith(acc.account_number.replace(/\D/g, ''))
        );
        return { ...acc, matched_account_id: matched?.id || '' };
      });
      setPendingExtraction({ date: parsed.date || new Date().toISOString().slice(0, 10), items, raw });
    } catch (err) { showToast?.('Extraction failed: ' + err.message); }
    setExtracting(false);
  };

  const confirmExtraction = async () => {
    const { date, items } = pendingExtraction;
    const toSave = items.filter(i => i.matched_account_id && i.balance != null && i.balance !== '');
    if (!toSave.length) { showToast?.('Map at least one account'); return; }
    await sb.from('financial_snapshots').upsert(
      toSave.map(i => ({ account_id: i.matched_account_id, user_id: user.id, snapshot_date: date, balance: Number(i.balance) })),
      { onConflict: 'account_id,snapshot_date' }
    );
    await sb.from('financial_date_rates').upsert(
      { user_id: user.id, snapshot_date: date, rates: appToHKD() },
      { onConflict: 'user_id,snapshot_date' }
    );
    await loadAll();
    setPendingExtraction(null);
    showToast?.(`Saved ${toSave.length} account${toSave.length > 1 ? 's' : ''}`);
  };

  /* ── auto-save single field on blur ── */
  const autoSaveField = useCallback(async (accId, value, date) => {
    if (!date || !sb || !user) return;
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setAutoSaveStatus(p => ({ ...p, [accId]: 'saving' }));
    await sb.from('financial_snapshots').upsert(
      { account_id: accId, user_id: user.id, snapshot_date: date, balance: num },
      { onConflict: 'account_id,snapshot_date' }
    );
    await sb.from('financial_date_rates').upsert(
      { user_id: user.id, snapshot_date: date, rates: appToHKD() },
      { onConflict: 'user_id,snapshot_date' }
    );
    await loadAll();
    // If we were in "new" mode, switch the pill to the actual saved date
    if (selDate === '__new__') setSelDate(date);
    setAutoSaveStatus(p => ({ ...p, [accId]: 'saved' }));
    if (autoSaveTimers.current[accId]) clearTimeout(autoSaveTimers.current[accId]);
    autoSaveTimers.current[accId] = setTimeout(() => setAutoSaveStatus(p => { const n = {...p}; delete n[accId]; return n; }), 2000);
  }, [sb, user, selDate]);

  /* ── copy from latest → save all to DB immediately ── */
  const copyFromLatest = useCallback(async (targetDate) => {
    const date = targetDate || selDate;
    if (!date || date === '__new__' || !sb || !user) return;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 45);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const rows = [];
    for (const acc of accounts) {
      const recent = snapshots
        .filter(s => s.account_id === acc.id && s.snapshot_date >= cutoffStr)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
      if (recent?.balance != null) rows.push({ account_id: acc.id, user_id: user.id, snapshot_date: date, balance: recent.balance });
    }
    if (!rows.length) { showToast?.('No data within last 45 days'); return; }
    await sb.from('financial_snapshots').upsert(rows, { onConflict: 'account_id,snapshot_date' });
    await sb.from('financial_date_rates').upsert(
      { user_id: user.id, snapshot_date: date, rates: appToHKD() },
      { onConflict: 'user_id,snapshot_date' }
    );
    await loadAll();
    setSelDate(date);
    showToast?.(`Copied ${rows.length} accounts to ${fmtDate(date)}`);
  }, [selDate, sb, user, accounts, snapshots]);

  /* ── expense suggestion from Home tab ── */
  const fetchExpenseSuggestion = useCallback(async () => {
    if (!sb || !user || !selDate || selDate === 'current') return;
    const expenseAccIds = new Set(accounts.filter(a => a.category === 'Expense').map(a => a.id));
    const prevSnapDate = dates.find(d => d < selDate &&
      snapshots.some(s => expenseAccIds.has(s.account_id) && s.snapshot_date === d)
    );
    if (!prevSnapDate) { showToast?.('No previous snapshot with expense data found'); return; }
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

      const hkdRates = getRatesForDate(selDate);
      let total = 0;
      let listDefaultCur = homeLists[0].default_currency || 'HKD';
      const myName = memberships.find(m => homeListIds.has(m.list_id))?.display_name || '';
      const targetName = expensePerson || myName || '';

      const allListIds = [...homeListIds];
      // Expense + Income totals: filtered by date range
      const { data: rangeExps } = await sb.from('expenses')
        .select('total_amount, shares, original_currency, split_type, list_id, paid_by, category')
        .in('list_id', allListIds).neq('split_type', 'settlement')
        .gte('date', prevSnapDate).lte('date', selDate);
      // shares are always in the list's default currency — do NOT use original_currency here
      let incomeTotal = 0;
      for (const exp of rangeExps || []) {
        if (targetName) {
          const userShare = exp.shares?.[targetName];
          if (userShare != null) {
            if (exp.category === 'Income') incomeTotal += userShare;
            else total += userShare;
          }
        }
      }

      // Use balances already computed by home tab (same logic, always correct)
      const balances = (balanceTxns || []).map(t => ({
        from: t.from, to: t.to, amount: t.amount
      }));

      setExpenseSuggest({ total, incomeTotal, currency: listDefaultCur, fromDate: prevSnapDate, toDate: selDate, person: targetName, balances });
    } catch (err) { console.error('Expense suggestion error:', err); }
    setLoadingExpenses(false);
  }, [sb, user, selDate, dates, snapshots, accounts, getRatesForDate, homeListName, expensePerson]);

  /* ── load Home list income/expense totals for a given month ── */
  const loadedMonthsRef = useRef(new Set());
  // Clear cache when homeListName or expensePerson changes so stats reload with correct person
  useEffect(() => { loadedMonthsRef.current = new Set(); setHomeMonthlyStats({}); }, [homeListName, expensePerson]);
  const loadHomeStatsForMonth = useCallback(async (month) => {
    if (!sb || !user || !month) return;
    if (loadedMonthsRef.current.has(month)) return;
    loadedMonthsRef.current.add(month);
    try {
      const { data: memberships } = await sb.from('list_members').select('list_id, display_name').eq('user_id', user.id);
      if (!memberships?.length) return;
      const listIds = [...new Set(memberships.map(m => m.list_id))];
      const { data: listData } = await sb.from('expense_lists').select('id, name, default_currency').in('id', listIds);
      const homeLists = (listData || []).filter(l => l.name === homeListName);
      if (!homeLists.length) return;
      const homeListIds = new Set(homeLists.map(l => l.id));
      const listCur = {};
      for (const l of listData || []) listCur[l.id] = l.default_currency || 'HKD';
      const listDefaultCur = homeLists[0].default_currency || 'HKD';
      const myName = memberships.find(m => homeListIds.has(m.list_id))?.display_name || '';
      const targetName = expensePerson || myName || '';
      const hkdRates = getRatesForMonth(month);

      const [y, mo] = month.split('-').map(Number);
      const nextMonth = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;

      const { data: exps } = await sb.from('expenses')
        .select('shares, original_currency, split_type, list_id, category')
        .in('list_id', [...homeListIds]).neq('split_type', 'settlement')
        .gte('date', `${month}-01`).lt('date', nextMonth);

      // shares are always stored in the list's default currency — do NOT use original_currency here
      let income = 0, expense = 0;
      for (const exp of exps || []) {
        const share = exp.shares?.[targetName];
        if (share != null) {
          if (exp.category === 'Income') income += share;
          else expense += share;
        }
      }
      setHomeMonthlyStats(prev => ({ ...prev, [month]: { income, expense, currency: listDefaultCur } }));
    } catch (err) {
      console.error('loadHomeStatsForMonth error:', err);
      loadedMonthsRef.current.delete(month); // allow retry on error
    }
  }, [sb, user, homeListName, expensePerson, getRatesForMonth]);

  // Auto-load home stats when summary month changes
  useEffect(() => {
    if ((activeView === 'summary' || activeView === 'summary_analytics') && selSummaryMonth) loadHomeStatsForMonth(selSummaryMonth);
  }, [activeView, selSummaryMonth, loadHomeStatsForMonth]);

  useEffect(() => {
    if (activeView !== 'summary' && activeView !== 'summary_analytics') return;
    summaryMonths.forEach((month) => {
      loadHomeStatsForMonth(month);
    });
  }, [activeView, summaryMonths, loadHomeStatsForMonth]);

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

  /* ── reorder account within its bank group ── */
  const reorderAcc = async (bank, accId, dir) => {
    const bankAccs = [...accounts.filter(a => a.bank === bank)]
      .sort((a, b) => a.sort_order - b.sort_order || a.account_name.localeCompare(b.account_name));
    const idx = bankAccs.findIndex(a => a.id === accId);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= bankAccs.length) return;
    // Swap positions in the array then renumber the whole group
    [bankAccs[idx], bankAccs[swapIdx]] = [bankAccs[swapIdx], bankAccs[idx]];
    for (let i = 0; i < bankAccs.length; i++) {
      await sb.from('financial_accounts').update({ sort_order: i }).eq('id', bankAccs[i].id);
    }
    await loadAll();
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
  const loadHomeExpenses = useCallback(async () => {
    if (!sb || !user || homeExpensesLoaded) return;
    setHomeExpensesLoaded(true);
    try {
      const { data: memberships } = await sb.from('list_members').select('list_id, display_name').eq('user_id', user.id);
      if (!memberships?.length) return;
      const listIds = [...new Set(memberships.map(m => m.list_id))];
      const { data: listData } = await sb.from('expense_lists').select('id, name, default_currency').in('id', listIds);
      const homeLists = (listData || []).filter(l => l.name === homeListName);
      if (!homeLists.length) return;
      const homeListIds = homeLists.map(l => l.id);
      const listDefaultCur = homeLists[0].default_currency || 'AUD';
      const { data: exps } = await sb.from('expenses')
        .select('item, category, date, total_amount, paid_by, shares, split_type, original_currency')
        .in('list_id', homeListIds).neq('split_type', 'settlement')
        .order('date', { ascending: false });
      setHomeExpenses((exps || []).map(e => ({ ...e, listCurrency: listDefaultCur })));
    } catch (err) { console.error('loadHomeExpenses error:', err); setHomeExpensesLoaded(false); }
  }, [sb, user, homeListName, homeExpensesLoaded]);

  // Load Home list expenses when chat view opens
  useEffect(() => {
    if (activeView === 'chat') loadHomeExpenses();
  }, [activeView, loadHomeExpenses]);

  const buildContext = () => {
    const recentDates = dates.slice(0, 24);
    let ctx = `Financial data. All HKD equivalents use the historical exchange rates recorded for each date.\n`;
    ctx += `Note: "Others" category is excluded from net worth. Property and Loan are separate (Net Property = Property - Loan).\n`;
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
      const netPropertyHKD = (totals['Property'] || 0) - (totals['Loan'] || 0);
      ctx += `  NET WORTH (Cash+Securities-CC): HKD ${netWorthHKD}\n`;
      if (totals['Property'] || totals['Loan']) ctx += `  NET PROPERTY (Property-Loan): HKD ${netPropertyHKD}\n`;
      ctx += '\n';
    }

    if (securityTxns.length) {
      ctx += `\n--- INVESTING SECURITY TRANSACTIONS ---\n`;
      const byMonth = {};
      securityTxns
        .slice()
        .sort(compareTxnOrder)
        .forEach((txn) => {
          const month = txn.transaction_date?.slice(0, 7) || 'Unknown';
          if (!byMonth[month]) byMonth[month] = { buy: 0, sell: 0, dividend: 0, count: 0, items: [] };
          const amount = Number(txn.amount || 0);
          if (txn.type === 'BUY') byMonth[month].buy += amount;
          if (txn.type === 'SELL') byMonth[month].sell += amount;
          if (txn.type === 'DIVIDEND') byMonth[month].dividend += amount;
          byMonth[month].count += 1;
          if (byMonth[month].items.length < 20) {
            const qty = Number(txn.quantity || 0);
            byMonth[month].items.push(
              `    ${txn.transaction_date} [${txn.type}] ${txn.account || '—'} ${txn.ticker || txn.name || '—'} qty=${qty || 0} ${txn.currency || 'USD'} ${amount.toFixed(2)}`
            );
          }
        });
      for (const [month, data] of Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 18)) {
        ctx += `\n${month}: Buys=${data.buy.toFixed(2)}, Sells=${data.sell.toFixed(2)}, Dividends=${data.dividend.toFixed(2)}, Count=${data.count}\n`;
        ctx += data.items.join('\n') + '\n';
      }
    }

    if (expenseEntries.length) {
      const listName = expenseListName || 'Current expense list';
      const cur = expenseListCurrency || balanceCurrency || 'AUD';
      ctx += `\n--- INCOME / EXPENSE LEDGER (${listName}, currency: ${cur}) ---\n`;
      const byMonth = {};
      for (const entry of expenseEntries) {
        const month = entry.date?.slice(0, 7);
        if (!month) continue;
        if (!byMonth[month]) byMonth[month] = { income: 0, expense: 0, settlement: 0, count: 0, items: [] };
        const amount = Number(entry.total_amount || 0);
        if (entry.category === 'Income') byMonth[month].income += amount;
        else if (entry.split_type === 'settlement' || entry.category === 'Settlement') byMonth[month].settlement += amount;
        else byMonth[month].expense += amount;
        byMonth[month].count += 1;
        if (byMonth[month].items.length < 25) {
          byMonth[month].items.push(
            `    ${entry.date} [${entry.category}] ${entry.item}: ${cur} ${amount.toFixed(2)} (paid by ${entry.paid_by || '—'})`
          );
        }
      }
      for (const [month, data] of Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 24)) {
        ctx += `\n${month}: Income=${cur} ${data.income.toFixed(2)}, Expense=${cur} ${data.expense.toFixed(2)}, Settlements=${cur} ${data.settlement.toFixed(2)}, Net=${cur} ${(data.income - data.expense).toFixed(2)}, Count=${data.count}\n`;
        ctx += data.items.join('\n') + '\n';
      }
    }

    // Home list expenses
    if (homeExpenses.length) {
      const cur = homeExpenses[0].listCurrency;
      ctx += `\n--- HOME LIST EXPENSES (list currency: ${cur}) ---\n`;
      // Group by month
      const byMonth = {};
      for (const e of homeExpenses) {
        const m = e.date?.slice(0, 7);
        if (!m) continue;
        if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0, items: [] };
        const amount = e.total_amount;
        if (e.category === 'Income') byMonth[m].income += amount;
        else byMonth[m].expense += amount;
        byMonth[m].items.push(`    ${e.date} [${e.category}] ${e.item}: ${cur} ${amount} (paid by ${e.paid_by})`);
      }
      for (const [m, data] of Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 24)) {
        ctx += `\n${m}: Income=${cur} ${data.income.toFixed(2)}, Expense=${cur} ${data.expense.toFixed(2)}, Net=${cur} ${(data.income - data.expense).toFixed(2)}\n`;
        ctx += data.items.join('\n') + '\n';
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
      const res = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${xaiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: xaiModel,
          input: [
            { role: 'system', content: `You are a personal financial assistant. Answer concisely.\n\n${buildContext()}` },
            ...chatMessages.filter(m => m.role !== 'system'),
            { role: 'user', content: userMsg }
          ],
          tools: [
            { type: 'web_search' },
          ],
        })
      });
      const json = await res.json();
      const text =
        json.output_text ||
        json.output?.find(item => item.type === 'message')?.content?.find(c => c.type === 'output_text')?.text ||
        json.error?.message ||
        'No response';
      setChatMessages(m => [...m, { role: 'assistant', content: text }]);
      sendNotification?.('AI response ready', text.slice(0, 140), 'ai', user.id);
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
    <div style={{ padding: embedded ? '0 16px 0' : '16px 16px 0' }}>
      <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleExtractFile} />
      <input ref={importCsvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCsvFile} />
      <input ref={importJsonRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJsonFile} />
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showViewToggle ? 10 : 12 }}>
          <div style={{ fontFamily: MONO, fontSize: FS.heading, fontWeight: FW.black, color: CLAY.text, lineHeight: 1, marginBottom: 24 }}>{title}</div>
          <div />
        </div>
      )}
      {showViewToggle && (
        <SegmentedTabs
          tabs={resolvedViewOptions}
          value={activeView}
          onChange={setView}
          compact={!embedded}
          style={{ padding: 0 }}
        />
      )}
    </div>
  );

  const DatePills = isMonthBasedView ? (
    <div className="se-noscroll" style={{ display: 'flex', gap: 6, padding: '0 16px 8px', overflowX: 'auto' }}>
      {summaryMonths.map(m => (
        <button key={m} style={S.pill(m === selSummaryMonth)} onClick={() => setSelSummaryMonth(m)}>
          {new Date(m + '-02').toLocaleDateString('en', { month: 'short', year: 'numeric' })}
        </button>
      ))}
    </div>
  ) : (
    <div className="se-noscroll" style={{ display: 'flex', gap: 6, padding: '0 16px 8px', overflowX: 'auto' }}>
      {activeView === 'table' && (
        <button
          style={{ ...S.pill(false), background: '#f0fdf4', color: '#16a34a', border: '1.5px dashed #86efac', flexShrink: 0 }}
          onClick={() => {
            setNewSnapDate(TODAY);
            setShowNewSnapModal(true);
          }}>
          + New
        </button>
      )}
      <button style={S.pill(selDate === 'current')} onClick={() => setSelDate('current')}>Current</button>
      {dates.map(d => (
        <button key={d} style={S.pill(d === selDate)} onClick={() => setSelDate(d)}>{fmtDate(d)}</button>
      ))}
    </div>
  );

  // Collapsible rates bar
  const ratesMonthSnapshotDate = isMonthBasedView ? latestSnapshotDateForMonth(selSummaryMonth) : null;
  const ratesForBar = isMonthBasedView ? getRatesForMonth(selSummaryMonth) : (selDate ? dateRates[selDate] : null);
  const ratesBarEntries = ratesForBar
    ? Object.entries(ratesForBar).filter(([cur]) => (
        isMonthBasedView
          ? cur !== 'HKD'
          : tableRateCurrencies.includes(cur)
      ))
    : [];
  const ratesBarLabel = isMonthBasedView
    ? `Rates for ${ratesMonthSnapshotDate ? fmtDate(ratesMonthSnapshotDate) : (selSummaryMonth ? fmtDate(selSummaryMonth + '-01') : '')}`
    : `Rates for ${fmtDate(selDate)}`;
  const RatesBar = ratesForBar && ratesBarEntries.length > 0 ? (
    <div style={{ padding: '0 16px 8px' }}>
      <button onClick={() => setShowRatesFor(v => !v)}
        style={{ ...S.btnGhost, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: FS.lg }}>
        <ChevronDown size={11} style={{ transform: showRatesFor ? 'none' : 'rotate(-90deg)', transition: '0.15s' }} />
        {ratesBarLabel}
      </button>
      {showRatesFor && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 2px 4px' }}>
          {ratesBarEntries.map(([cur, rate]) => (
            <span key={cur} style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 6 }}>
              1 {cur} = {rate.toFixed(2)} HKD
            </span>
          ))}
        </div>
      )}
    </div>
  ) : null;



  /* ── TABLE VIEW ── */
  const TableView = (() => {
    const isCurrent = selDate === 'current';
    const isNew = selDate === '__new__';
    const isToday = selDate === TODAY;
    const effectiveDate = isNew ? newSnapDate : selDate;
    const histRates = (!isCurrent && !isNew && !isToday && selDate) ? dateRates[selDate] : null;
    const isHistorical = isCurrent || (!!selDate && !isToday && !isNew);
    const activeRates = histRates || appToHKD();
    const usedCurrencies = tableRateCurrencies;

    return (
    <div style={{ padding: '0 16px' }}>
      {/* Edit mode toggle + settings gear */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button onClick={() => setShowEdits(v => !v)} style={{
          ...S.btnGhost, padding: '5px 12px', fontSize: FS.lg, display: 'flex', alignItems: 'center', gap: 4,
          background: showEdits ? '#eff6ff' : undefined, borderColor: showEdits ? '#93c5fd' : undefined, color: showEdits ? '#1d4ed8' : undefined,
        }}>
          <Pencil size={11} /> {showEdits ? 'Hide edits' : 'Edit accounts'}
        </button>
        <button onClick={() => setShowTableSettings(v => !v)} style={{
          ...S.btnGhost, padding: '5px 10px', fontSize: FS.lg, display: 'flex', alignItems: 'center', gap: 4,
          background: showTableSettings ? '#f0fdf4' : undefined, borderColor: showTableSettings ? '#86efac' : undefined, color: showTableSettings ? '#16a34a' : undefined,
        }}>
          <Settings2 size={13} />
        </button>
      </div>
      {showTableSettings && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ ...S.label, marginBottom: 8 }}>Load Expenses Settings</div>
          <div style={{ ...S.label, fontSize: FS.lg, marginBottom: 4 }}>List Name</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={homeListName} onChange={e => setHomeListName(e.target.value)}
              placeholder="Home" style={{ ...S.input, flex: 1 }} />
            <button onClick={() => saveUserSetting('home_list_name', homeListName).then(() => showToast?.('Saved'))}
              style={{ ...S.btnDark, padding: '8px 14px' }}><Check size={14} /></button>
          </div>
          <div style={{ ...S.label, fontSize: FS.lg, marginBottom: 4 }}>Person (display name in expense list)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={expensePerson} onChange={e => setExpensePerson(e.target.value)}
              placeholder="e.g. Renee" style={{ ...S.input, flex: 1 }} />
            <button onClick={() => saveUserSetting('expense_person', expensePerson).then(() => showToast?.('Saved'))}
              style={{ ...S.btnDark, padding: '8px 14px' }}><Check size={14} /></button>
          </div>
          <div style={{ ...S.label, fontSize: FS.lg, opacity: 0.6, marginTop: 6 }}>Leave blank to use your own membership display name in that list.</div>
        </div>
      )}


      {/* Account rows grouped by bank */}
      {[...new Set(accounts.map(a => a.bank))].sort().map(bank => {
        const bankAccs = accounts.filter(a => a.bank === bank).sort((a, b) => a.sort_order - b.sort_order || a.account_name.localeCompare(b.account_name));
        const showDormantForBank = expandedDormantBanks.has(bank);
        const visibleBankAccs = bankAccs.filter((acc) => !isAccountDormant(acc) || showDormantForBank);
        const hiddenCount = bankAccs.filter((acc) => isAccountDormant(acc)).length;
        return (
          <div key={bank} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, paddingLeft: 2 }}>
              <div style={{ ...S.label, marginBottom: 0 }}>{bank}</div>
              {hiddenCount > 0 && (
                <button
                  onClick={() => setExpandedDormantBanks((curr) => {
                    const next = new Set(curr);
                    if (next.has(bank)) next.delete(bank);
                    else next.add(bank);
                    return next;
                  })}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: FS.lg, color: '#9ca3af' }}
                >
                  {showDormantForBank ? `hide ${hiddenCount}` : `${hiddenCount} hidden`}
                </button>
              )}
            </div>
            {visibleBankAccs.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              {visibleBankAccs.map((acc, i) => {
                const savedBal = effectiveDate ? bal(acc.id, effectiveDate) : null;
                const miles = acc.category === 'Points/Miles' && savedBal != null && acc.metadata?.miles_ratio
                  ? Math.round(savedBal / acc.metadata.miles_ratio * 1000) : null;
                const latestSnap = snapshots.filter(s => s.account_id === acc.id).sort((a,b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
                const displayDate = autoSaveStatus[acc.id] === 'saved' ? effectiveDate : latestSnap?.snapshot_date;
                const isEditing = editingAccId === acc.id;
                return (
                  <div key={acc.id} style={{ borderBottom: i < visibleBankAccs.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    {/* Normal row */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: showEdits ? '44px 1fr auto 110px' : '1fr auto 110px',
                      padding: '10px 14px', gap: 8, alignItems: 'center',
                    }}>
                      {/* Edit + reorder column (left-aligned, only when showEdits) */}
                      {showEdits && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <button onClick={() => isEditing ? (setEditingAccId(null), setEditingAccData({})) : (setEditingAccId(acc.id), setEditingAccData({ ...acc }))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: isEditing ? '#3b82f6' : '#9ca3af' }}>
                            <Pencil size={12} />
                          </button>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            <button onClick={() => reorderAcc(bank, acc.id, -1)} disabled={i === 0}
                              style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', padding: '1px 2px', color: i === 0 ? '#d1d5db' : '#9ca3af', lineHeight: 1, fontSize: FS.lg }}>
                              ▲
                            </button>
                            <button onClick={() => reorderAcc(bank, acc.id, 1)} disabled={i === visibleBankAccs.length - 1}
                              style={{ background: 'none', border: 'none', cursor: i === visibleBankAccs.length - 1 ? 'default' : 'pointer', padding: '1px 2px', color: i === visibleBankAccs.length - 1 ? '#d1d5db' : '#9ca3af', lineHeight: 1, fontSize: FS.lg }}>
                              ▼
                            </button>
                          </div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 600, color: '#111', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {acc.account_name}{acc.account_number ? ` ···${acc.account_number}` : ''}
                          <span style={S.catBadge(acc.category)}>{acc.category}</span>
                        </div>
                        {miles != null && <div style={{ fontFamily: MONO, fontSize: FS.lg, color: '#06b6d4', marginTop: 2 }}>≈ {miles.toLocaleString()} mi</div>}
                      </div>
                      {/* Save indicator */}
                      <AnimatePresence>
                        {autoSaveStatus[acc.id] && (
                          <motion.div key={autoSaveStatus[acc.id]} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ color: autoSaveStatus[acc.id] === 'saving' ? '#9ca3af' : '#16a34a', display: 'flex', alignItems: 'center' }}>
                            {autoSaveStatus[acc.id] === 'saving'
                              ? <RefreshCw size={9} style={{ animation: 'spin 1s linear infinite' }} />
                              : <Check size={9} />}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <span style={{ ...S.label, color: '#9ca3af', fontSize: FS.lg }}>{acc.currency === 'PTS' ? 'PTS' : acc.currency}</span>
                      <input
                        type="number"
                        defaultValue={savedBal != null ? String(savedBal) : ''}
                        key={`${acc.id}-${effectiveDate}`}
                        onBlur={e => { if (e.target.value !== '') autoSaveField(acc.id, e.target.value, effectiveDate); }}
                        placeholder={savedBal != null ? String(savedBal) : '—'}
                        style={{ ...S.inputSm, color: savedBal != null ? '#1a1a1a' : '#9ca3af' }}
                      />
                    </div>
                    {/* Inline edit form */}
                    {isEditing && showEdits && (
                      <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc', borderTop: '1px solid #f3f4f6' }}>
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
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        );
      })}

      <button onClick={() => setShowAddAcc(true)} style={{ ...S.btnGhost, width: '100%', marginTop: 10, marginBottom: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={14} /> Add Account
      </button>

      {/* Delete snapshot — bottom */}
      {selDate && selDate !== 'current' && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -60, marginBottom: 90 }}>
          <button onClick={() => setConfirmDeleteSnap(true)}
            style={{ ...S.btnGhost, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, fontSize: FS.lg, color: '#9ca3af' }}>
            <Trash2 size={12} /> Delete snapshot ({fmtDate(selDate)})
          </button>
        </div>
      )}
    </div>
    );
  })();

  /* ── SUMMARY VIEW ── */
  const analysisRows = useMemo(() => {
    const ascMonths = [...summaryMonths].slice().sort();
    const expectedByMonth = new Map();
    const expectedBaseMonth = expectedNetAssetBaseMonth || DEFAULT_EXPECTED_NET_ASSET_BASE_MONTH;
    const parsedExpectedBaseValue = Number(expectedNetAssetBaseValue);
    const expectedBaseValue = Number.isFinite(parsedExpectedBaseValue)
      ? parsedExpectedBaseValue
      : DEFAULT_EXPECTED_NET_ASSET_BASE_VALUE;
    let rollingExpected = null;
    for (const month of ascMonths) {
      const monthCash = catTotalForMonth('Cash', month);
      const monthSec = catTotalForMonth('Securities', month);
      const monthCC = catTotalForMonth('Credit Card', month);
      const monthLoan = catTotalForMonth('Loan', month);
      const monthIncomeOld = catTotalForMonth('Income', month);
      const monthExpenseOld = catTotalForMonth('Expense', month);
      const monthProp = catTotalForMonth('Property', month);
      const hs = homeMonthlyStats[month];
      const hsCur = hs?.currency || displayCurrency;
      const homeIncome = hs ? cvtHKD(hs.income, hsCur, displayCurrency, getRatesForMonth(month)) : 0;
      const homeExpense = hs ? cvtHKD(hs.expense, hsCur, displayCurrency, getRatesForMonth(month)) : 0;
      const monthIncome = monthIncomeOld + homeIncome;
      const monthExpense = monthExpenseOld + homeExpense;
      const monthNetIncome = monthIncome - monthExpense;
      const monthNetWorth = monthCash + monthSec - monthCC;
      const monthNetProperty = monthProp - monthLoan;
      const monthNetAsset = monthNetWorth + monthNetProperty;

      if (month < expectedBaseMonth) {
        expectedByMonth.set(month, null);
      } else if (month === expectedBaseMonth) {
        rollingExpected = expectedBaseValue;
        expectedByMonth.set(month, rollingExpected);
      } else if (rollingExpected != null) {
        rollingExpected += monthNetIncome;
        expectedByMonth.set(month, rollingExpected);
      } else {
        expectedByMonth.set(month, null);
      }
    }

    return summaryMonths.map((month) => {
      const monthCash = catTotalForMonth('Cash', month);
      const monthSec = catTotalForMonth('Securities', month);
      const monthCC = catTotalForMonth('Credit Card', month);
      const monthLoan = catTotalForMonth('Loan', month);
      const monthIncomeOld = catTotalForMonth('Income', month);
      const monthExpenseOld = catTotalForMonth('Expense', month);
      const monthProp = catTotalForMonth('Property', month);
      const hs = homeMonthlyStats[month];
      const hsCur = hs?.currency || displayCurrency;
      const homeIncome = hs ? cvtHKD(hs.income, hsCur, displayCurrency, getRatesForMonth(month)) : 0;
      const homeExpense = hs ? cvtHKD(hs.expense, hsCur, displayCurrency, getRatesForMonth(month)) : 0;
      const monthIncome = monthIncomeOld + homeIncome;
      const monthExpense = monthExpenseOld + homeExpense;
      const monthNetIncome = monthIncome - monthExpense;
      const monthNetWorth = monthCash + monthSec - monthCC;
      const monthNetProperty = monthProp - monthLoan;
      const monthNetAsset = monthNetWorth + monthNetProperty;
      return {
        month,
        netAsset: monthNetAsset,
        netWorth: monthNetWorth,
        netProperty: monthNetProperty,
        netIncome: monthNetIncome,
        cash: monthCash,
        securities: monthSec,
        creditCard: monthCC,
        income: monthIncome,
        expense: monthExpense,
        inflationRate: usInflationRates[month] ?? null,
        expectedNetAsset: expectedByMonth.get(month),
      };
    });
  }, [
    summaryMonths,
    expectedNetAssetBaseMonth,
    expectedNetAssetBaseValue,
    catTotalForMonth,
    homeMonthlyStats,
    displayCurrency,
    getRatesForMonth,
    usInflationRates,
  ]);

  const toggleAnalysisSort = (key) => {
    setAnalysisSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: key === 'month' ? 'desc' : 'desc' }
    );
  };

  const sortedAnalysisRows = useMemo(() => {
    const direction = analysisSort.direction === 'asc' ? 1 : -1;
    return [...analysisRows].sort((a, b) => {
      if (analysisSort.key === 'month') {
        return direction * String(a.month || '').localeCompare(String(b.month || ''));
      }
      const aValue = a[analysisSort.key];
      const bValue = b[analysisSort.key];
      const aMissing = aValue == null || Number.isNaN(Number(aValue));
      const bMissing = bValue == null || Number.isNaN(Number(bValue));
      if (aMissing && bMissing) return String(b.month || '').localeCompare(String(a.month || ''));
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (Number(aValue) === Number(bValue)) return String(b.month || '').localeCompare(String(a.month || ''));
      return direction * (Number(aValue) - Number(bValue));
    });
  }, [analysisRows, analysisSort]);

  const SummaryView = (() => {
    const Delta = ({ cur, prev }) => {
      if (prev == null || prev === 0) return null;
      const diff = cur - prev;
      const pct = (diff / Math.abs(prev)) * 100;
      const up = diff >= 0;
      return (
        <span style={{ fontFamily: MONO, fontSize: FS.lg, color: up ? '#16a34a' : '#dc2626', display: 'flex', alignItems: 'center', gap: 2 }}>
          {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{fmtPct(pct)}
        </span>
      );
    };

    const sm  = selSummaryMonth;
    const pm  = prevSummaryMonth;
    const cash    = catTotalForMonth('Cash',        sm);
    const sec     = catTotalForMonth('Securities',  sm);
    const cc      = catTotalForMonth('Credit Card', sm);
    const loan    = catTotalForMonth('Loan',        sm);
    const income  = catTotalForMonth('Income',      sm);
    const expense = catTotalForMonth('Expense',     sm);
    const prop    = catTotalForMonth('Property',    sm);
    const netWorth    = cash + sec - cc;
    const netProperty = prop - loan;
    const netAsset    = netWorth + netProperty;
    const netIncome   = income - expense;
    const prevCash    = pm ? catTotalForMonth('Cash',        pm) : null;
    const prevSec     = pm ? catTotalForMonth('Securities',  pm) : null;
    const prevCC      = pm ? catTotalForMonth('Credit Card', pm) : null;
    const prevLoan    = pm ? catTotalForMonth('Loan',        pm) : null;
    const prevIncome  = pm ? catTotalForMonth('Income',      pm) : null;
    const prevExpense = pm ? catTotalForMonth('Expense',     pm) : null;
    const prevProp    = pm ? catTotalForMonth('Property',    pm) : null;
    const prevNetWorth    = pm ? (prevCash + prevSec - prevCC) : null;
    const prevNetProperty = pm ? (prevProp - prevLoan) : null;
    const prevNetAsset    = pm ? (prevNetWorth + prevNetProperty) : null;
    const prevNetIncome   = pm ? (prevIncome - prevExpense) : null;

    return (
      <div style={{ padding: '0 16px 80px' }}>
        {/* Summary card */}
        <div style={{ ...S.card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ ...S.label, color: CLAY.textLt }}>Summary</div>
            <select value={displayCurrency} onChange={e => changeDisplayCurrency(e.target.value)}
              style={{ ...S.select, width: 'auto', padding: '5px 8px', fontWeight: FW.semibold, cursor: 'pointer' }}>
              {ALL_CUR.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {[
            { label: 'Cash',          value: cash,    prev: prevCash    },
            { label: 'Securities',    value: sec,     prev: prevSec     },
            { label: '− Credit Card', value: cc,      prev: prevCC,     negate: true },
          ].map((row) => {
            const diff = row.prev != null ? (row.negate ? row.prev - row.value : row.value - row.prev) : null;
            const pct = diff != null && row.prev !== 0 ? fmtPct(diff / Math.abs(row.prev) * 100) : null;
            return (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: FS.lg, color: CLAY.textMid }}>{row.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {pct && (
                    <span style={{ fontFamily: MONO, fontSize: FS.lg, color: diff >= 0 ? '#16a34a' : '#dc2626' }}>
                      {pct}
                    </span>
                  )}
                  <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, color: '#1a1a1a' }}>
                    {fmtNum(row.value, displayCurrency)}
                  </span>
                </div>
              </div>
            );
          })}
          {/* Portfolio Value = Cash + Securities - CC */}
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, color: '#1a1a1a' }}>Portfolio Value</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {prevNetWorth != null && prevNetWorth !== 0 && (
                <span style={{ fontFamily: MONO, fontSize: FS.lg, color: (netWorth - prevNetWorth) >= 0 ? '#16a34a' : '#dc2626' }}>
                  {fmtPct(((netWorth - prevNetWorth) / Math.abs(prevNetWorth)) * 100)}
                </span>
              )}
              <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: netWorth >= 0 ? '#16a34a' : '#dc2626' }}>
                {fmtNum(netWorth, displayCurrency)}
              </span>
            </div>
          </div>
          {/* Property / Loan / Property Value / Total Wealth */}
          {(prop > 0 || loan > 0) && (
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8, marginBottom: 10 }}>
              {[
                { label: 'Property', value: prop, prev: prevProp },
                { label: '− Loan',   value: loan, prev: prevLoan, negate: true },
              ].map((row) => {
                const diff = row.prev != null ? (row.negate ? row.prev - row.value : row.value - row.prev) : null;
                const pct = diff != null && row.prev !== 0 ? fmtPct(diff / Math.abs(row.prev) * 100) : null;
                return (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280' }}>{row.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {pct && (
                        <span style={{ fontFamily: MONO, fontSize: FS.lg, color: diff >= 0 ? '#16a34a' : '#dc2626' }}>
                          {pct}
                        </span>
                      )}
                      <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, color: '#1a1a1a' }}>
                        {fmtNum(row.value, displayCurrency)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, color: '#374151' }}>Property Value</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {prevNetProperty != null && prevNetProperty !== 0 && (
                    <span style={{ fontFamily: MONO, fontSize: FS.lg, color: (netProperty - prevNetProperty) >= 0 ? '#16a34a' : '#dc2626' }}>
                      {fmtPct(((netProperty - prevNetProperty) / Math.abs(prevNetProperty)) * 100)}
                    </span>
                  )}
                  <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, color: netProperty >= 0 ? '#16a34a' : '#dc2626' }}>
                    {fmtNum(netProperty, displayCurrency)}
                  </span>
                </div>
              </div>
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, color: '#1a1a1a' }}>Total Wealth</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {prevNetAsset != null && prevNetAsset !== 0 && (
                    <span style={{ fontFamily: MONO, fontSize: FS.lg, color: (netAsset - prevNetAsset) >= 0 ? '#16a34a' : '#dc2626' }}>
                      {fmtPct(((netAsset - prevNetAsset) / Math.abs(prevNetAsset)) * 100)}
                    </span>
                  )}
                  <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: netAsset >= 0 ? '#16a34a' : '#dc2626' }}>
                    {fmtNum(netAsset, displayCurrency)}
                  </span>
                </div>
              </div>
            </div>
          )}
          {/* Income / Expense / Combined Net Income */}
          {(() => {
            const hs = homeMonthlyStats[sm];
            const hsCur = hs?.currency || displayCurrency;
            const combinedIncome  = income  + (hs ? cvtHKD(hs.income,  hsCur, displayCurrency, getRatesForMonth(sm)) : 0);
            const combinedExpense = expense + (hs ? cvtHKD(hs.expense, hsCur, displayCurrency, getRatesForMonth(sm)) : 0);
            const combinedNet = combinedIncome - combinedExpense;
            const rows = [
              income > 0 ? { label: 'Income (Old)', value: income, prev: prevIncome, color: '#16a34a', cur: displayCurrency } : null,
              hs && hs.income  > 0 ? { label: `Income (${homeListName})`,   value: cvtHKD(hs.income, hsCur, displayCurrency, getRatesForMonth(sm)), color: '#16a34a', cur: displayCurrency } : null,
              expense > 0 ? { label: '− Expense (Old)', value: expense, prev: prevExpense, color: '#dc2626', cur: displayCurrency, negate: true } : null,
              hs && hs.expense > 0 ? { label: `− Expense (${homeListName})`, value: cvtHKD(hs.expense, hsCur, displayCurrency, getRatesForMonth(sm)), color: '#dc2626', cur: displayCurrency } : null,
            ].filter(Boolean);
            if (rows.length === 0) return null;
            return (
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                {rows.map(row => {
                  const diff = row.prev != null ? (row.negate ? row.prev - row.value : row.value - row.prev) : null;
                  const pct = diff != null && row.prev !== 0 ? fmtPct(diff / Math.abs(row.prev) * 100) : null;
                  return (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280' }}>{row.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {pct && (
                          <span style={{ fontFamily: MONO, fontSize: FS.lg, color: diff >= 0 ? '#16a34a' : '#dc2626' }}>
                            {pct}
                          </span>
                        )}
                        <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, color: row.color }}>
                          {fmtNum(row.value, row.cur)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, color: '#374151' }}>Net Income</span>
                  <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, color: combinedNet >= 0 ? '#16a34a' : '#dc2626' }}>
                    {fmtNum(combinedNet, displayCurrency)}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {CATS.map(cat => {
          const isInfoOnly = cat === 'Others';
          const byCur     = catByCurrencyForMonth(cat, sm);
          const prevByCur = pm ? catByCurrencyForMonth(cat, pm) : {};
          const curCurs   = Object.keys(byCur);
          if (!curCurs.length) return null;
          const totalDisp     = catTotalForMonth(cat, sm);
          const prevTotalDisp = pm ? catTotalForMonth(cat, pm) : null;
          const isExpanded = expandedCats.has(cat);
          const toggleExpand = () => setExpandedCats(prev => {
            const next = new Set(prev);
            next.has(cat) ? next.delete(cat) : next.add(cat);
            return next;
          });

          return (
            <div key={cat} style={{ ...S.card, padding: '12px 16px' }}>
              {/* Category header row — always visible, click to expand */}
              <button onClick={toggleExpand} style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ChevronDown size={13} style={{ color: '#9ca3af', transform: isExpanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
                  <span style={S.catBadge(cat)}>{cat}</span>
                  {isInfoOnly && <span style={{ fontFamily: MONO, fontSize: FS.lg, color: '#9ca3af', letterSpacing: '0.05em' }}>info only</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {prevTotalDisp != null && (
                    <span style={{ fontFamily: MONO, fontSize: FS.lg, color: (totalDisp - prevTotalDisp) >= 0 ? '#16a34a' : '#dc2626' }}>
                      {(totalDisp - prevTotalDisp) >= 0 ? '+' : ''}{fmtNum(totalDisp - prevTotalDisp, displayCurrency)}
                    </span>
                  )}
                  <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700,
                    color: (cat === 'Credit Card' || cat === 'Expense' || cat === 'Loan') ? '#ef4444' : cat === 'Income' ? '#22c55e' : '#1a1a1a' }}>
                    {fmtNum(totalDisp, displayCurrency)}
                  </span>
                  {!['Cash', 'Securities', 'Credit Card', 'Loan', 'Property', 'Others'].includes(cat) && <Delta cur={totalDisp} prev={prevTotalDisp} />}
                </div>
              </button>

              {/* Expanded: currency groups + individual accounts */}
              {isExpanded && (
                <div style={{ marginTop: 10 }}>
                  {curCurs.map(cur => {
                    const native     = byCur[cur];
                    const prevNative = prevByCur[cur] ?? null;
                    const diff       = prevNative != null ? native - prevNative : null;
                    const accsInCur  = accounts.filter(a => a.category === cat && a.currency === cur);
                    const milesAccs  = cat === 'Points/Miles'
                      ? accounts.filter(a => a.category === 'Points/Miles' && a.currency === cur && a.metadata?.miles_ratio)
                      : [];
                    const totalMiles = milesAccs.reduce((s, a) => {
                      const b = balForMonth(a.id, sm);
                      return b != null ? s + (b / a.metadata.miles_ratio * 1000) : s;
                    }, 0);

                    return (
                      <div key={cur} style={{ borderTop: '1px solid #f3f4f6', paddingTop: 6, marginTop: 4 }}>
                        {/* Currency subtotal */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ ...S.label, fontSize: FS.lg, color: '#9ca3af', minWidth: 32 }}>{cur}</span>
                            {diff != null && (
                              <span style={{ fontFamily: MONO, fontSize: FS.lg, color: diff >= 0 ? '#16a34a' : '#dc2626' }}>
                                {diff >= 0 ? '+' : ''}{fmtNum(diff, cur)}
                              </span>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 600 }}>{fmtNum(native, cur)}</div>
                            {cur !== displayCurrency && (
                              <div style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280' }}>= {fmtNum(toDisplayForMonth(native, cur, sm), displayCurrency)}</div>
                            )}
                            {prevNative != null && (
                              <div style={{ fontFamily: MONO, fontSize: FS.lg, color: '#9ca3af' }}>prev: {fmtNum(prevNative, cur)}</div>
                            )}
                          </div>
                        </div>
                        {/* Individual accounts in this currency */}
                        {accsInCur.map(acc => {
                          const b = balForMonth(acc.id, sm);
                          if (b == null) return null;
                          const miles = acc.metadata?.miles_ratio ? Math.round(b / acc.metadata.miles_ratio * 1000) : null;
                          return (
                            <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0 2px 8px', borderLeft: `2px solid ${(CAT_COLOR[cat] || '#9ca3af')}30` }}>
                              <span style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280' }}>{acc.bank} · {acc.account_name}</span>
                              <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 600, color: '#374151' }}>
                                {fmtNum(b, cur)}{miles ? ` · ${miles.toLocaleString()}mi` : ''}
                              </span>
                            </div>
                          );
                        })}
                        {totalMiles > 0 && (
                          <div style={{ fontFamily: MONO, fontSize: FS.lg, color: '#06b6d4', marginTop: 2, paddingLeft: 8 }}>
                            ≈ {Math.round(totalMiles).toLocaleString()} miles total
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(curCurs.length > 1 || curCurs[0] !== displayCurrency) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, marginTop: 4, borderTop: '1px dashed #e5e7eb' }}>
                      <span style={{ ...S.label, fontSize: FS.lg }}>Total in {displayCurrency}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {prevTotalDisp != null && (
                          <span style={{ fontFamily: MONO, fontSize: FS.lg, color: '#9ca3af' }}>prev: {fmtNum(prevTotalDisp, displayCurrency)}</span>
                        )}
                        <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700 }}>{fmtNum(totalDisp, displayCurrency)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

      </div>
    );
  })();

  const StatisticsView = (
    <div style={{ padding: '0 16px 80px' }}>
      {showStatSettings && (
        <div style={S.card}>
          <div style={{ ...S.label, marginBottom: 8 }}>Expected Net Asset</div>
          <div style={{ ...S.label, fontSize: FS.lg, marginBottom: 4 }}>Base Month</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input type="month" value={expectedNetAssetBaseMonth}
              onChange={e => setExpectedNetAssetBaseMonth(e.target.value)}
              style={{ ...S.input, flex: 1 }} />
            <button onClick={() => saveUserSetting('expected_net_asset_base_month', expectedNetAssetBaseMonth).then(() => showToast?.('Saved'))}
              style={{ ...S.btnDark, padding: '8px 14px' }}><Check size={14} /></button>
          </div>
          <div style={{ ...S.label, fontSize: FS.lg, marginBottom: 4 }}>Base Value</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" value={expectedNetAssetBaseValue}
              onChange={e => setExpectedNetAssetBaseValue(e.target.value)}
              placeholder="19000000" style={{ ...S.input, flex: 1 }} />
            <button onClick={() => saveUserSetting('expected_net_asset_base_value', String(expectedNetAssetBaseValue || DEFAULT_EXPECTED_NET_ASSET_BASE_VALUE)).then(() => showToast?.('Saved'))}
              style={{ ...S.btnDark, padding: '8px 14px' }}><Check size={14} /></button>
          </div>
          <div style={{ ...S.label, fontSize: FS.lg, opacity: 0.6, marginTop: 6 }}>
            Future months calculate automatically from this starting month and add each month&apos;s Net Income after that.
          </div>
        </div>
      )}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0' }}>
          <div style={{ ...S.label, color: '#9ca3af' }}>Analysis</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setShowStatSettings(v => !v)} style={{
              ...S.btnGhost, padding: '5px 8px', minWidth: 0, display: 'flex', alignItems: 'center',
              background: showStatSettings ? '#f0fdf4' : undefined, borderColor: showStatSettings ? '#86efac' : undefined, color: showStatSettings ? '#16a34a' : undefined,
            }}><Settings2 size={13} /></button>
            <button
              onClick={() => { const el = document.getElementById('portfolio-analysis-table'); el?.scrollBy({ left: -240, behavior: 'smooth' }); }}
              style={{ ...S.btnGhost, padding: '5px 8px', minWidth: 0 }}>←</button>
            <button
              onClick={() => { const el = document.getElementById('portfolio-analysis-table'); el?.scrollBy({ left: 240, behavior: 'smooth' }); }}
              style={{ ...S.btnGhost, padding: '5px 8px', minWidth: 0 }}>→</button>
            <select value={displayCurrency} onChange={e => changeDisplayCurrency(e.target.value)}
              style={{ ...S.select, width: 'auto', padding: '5px 8px', fontWeight: FW.semibold, cursor: 'pointer' }}>
              {ALL_CUR.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div id="portfolio-analysis-table" style={{ overflowX: 'auto', paddingTop: 8 }}>
          <table style={tableStyle}>
            <colgroup>
              <col style={{ width: 90 }} />
              <col style={{ width: 72 }} />
              <col style={{ width: 72 }} />
              <col style={{ width: 72 }} />
              <col style={{ width: 72 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr style={tableHeaderRowStyle}>
                {[
                  { top: 'Month', bottom: '', sortKey: 'month' },
                  { top: 'Total', bottom: 'Wealth', sortKey: 'netAsset' },
                  { top: 'Portfolio', bottom: 'Value', sortKey: 'netWorth' },
                  { top: 'Property', bottom: 'Value', sortKey: 'netProperty' },
                  { top: 'Net', bottom: 'Income', sortKey: 'netIncome' },
                  { top: 'Cash', bottom: '', sortKey: 'cash' },
                  { top: 'Securities', bottom: '', sortKey: 'securities' },
                  { top: 'Credit', bottom: 'Card', sortKey: 'creditCard' },
                  { top: 'Income', bottom: '', sortKey: 'income' },
                  { top: 'Expense', bottom: '', sortKey: 'expense' },
                  { top: 'Inflation', bottom: '', sortKey: 'inflationRate' },
                  { top: 'Expected', bottom: 'Net Asset', sortKey: 'expectedNetAsset' },
                ].map((label, index) => (
                  <th
                    key={`${label.top}-${label.bottom}`}
                    style={{
                      ...tableHeaderCellStyle({
                        sticky: index === 0,
                        align: 'left',
                        padding: index === 0 ? '5px 4px 5px 12px' : '5px 4px',
                      }),
                      lineHeight: 1.2,
                      whiteSpace: 'normal',
                    }}
                  >
                    <DataTableHeaderLabel
                      top={label.top}
                      bottom={label.bottom}
                      sortKey={label.sortKey}
                      sort={analysisSort}
                      onSort={toggleAnalysisSort}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedAnalysisRows.map((row) => (
                <tr key={row.month} style={tableRowStyle}>
                  <td style={tableCellStyle({ sticky: true, padding: '5px 4px 5px 12px', emphasis: true })}>
                    <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.15 }}>
                      {new Date(`${row.month}-02`).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
                    </div>
                  </td>
                  {[
                    { value: row.netAsset, color: row.netAsset >= 0 ? CLAY.green : CLAY.red },
                    { value: row.netWorth, color: row.netWorth >= 0 ? CLAY.green : CLAY.red },
                    { value: row.netProperty, color: row.netProperty >= 0 ? CLAY.green : CLAY.red },
                    { value: row.netIncome, color: row.netIncome >= 0 ? CLAY.green : CLAY.red },
                    { value: row.cash, color: CLAY.text },
                    { value: row.securities, color: CLAY.text },
                    { value: row.creditCard, color: CLAY.red },
                    { value: row.income, color: CLAY.green },
                    { value: row.expense, color: CLAY.red },
                    { value: row.inflationRate, color: CLAY.text, format: 'pct' },
                    { value: row.expectedNetAsset, color: CLAY.text },
                  ].map((cell, index) => (
                    <td key={`${row.month}-${index}`} style={tableCellStyle({ padding: '5px 4px' })}>
                      <div style={{ fontWeight: 700, color: cell.color, lineHeight: 1.1, fontSize: FS.lg }}>
                        {cell.value == null ? '—' : cell.format === 'pct' ? fmtPct(cell.value * 100) : fmtNum(cell.value, displayCurrency)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 12px 12px', borderTop: `1px solid ${CLAY.surf2}`, fontSize: FS.lg, lineHeight: 1.55, color: CLAY.textMid }}>
          <div>Net Asset = Net Worth + Net Property</div>
          <div>Expected Net Asset starts at {fmtNum(Number(expectedNetAssetBaseValue || DEFAULT_EXPECTED_NET_ASSET_BASE_VALUE), displayCurrency)} in {expectedNetAssetBaseMonth || DEFAULT_EXPECTED_NET_ASSET_BASE_MONTH} and adds each month&apos;s Net Income after that.</div>
          <div>Inflation uses U.S. CPI monthly change from the U.S. Bureau of Labor Statistics; unreleased months stay blank.</div>
        </div>
      </div>
    </div>
  );

  const SummaryAnalyticsView = (
    <div>
      {SummaryView}
      {StatisticsView}
    </div>
  );


  /* ── CHAT VIEW ── */
  const ChatView = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 210px)', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center', paddingBottom: 12 }}>
        <select value={displayCurrency} onChange={e => changeDisplayCurrency(e.target.value)}
          style={{ fontFamily: MONO, fontSize: FS.lg, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 10, padding: '7px 10px', color: '#1a1a1a', cursor: 'pointer', outline: 'none' }}>
          {ALL_CUR.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 148 }}>
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: 14,
              background: msg.role === 'user' ? '#1a1a1a' : '#f3f4f6',
              color: msg.role === 'user' ? '#fff' : '#1a1a1a',
              fontFamily: MONO, fontSize: FS.lg, lineHeight: 1.5,
              borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
              borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 14,
            }}>{msg.content}</div>
          </div>
        ))}
        {chatLoading && (
          <div style={{ display: 'flex' }}>
            <div style={{ padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 4, background: '#f3f4f6', fontFamily: MONO, fontSize: FS.lg, color: '#9ca3af' }}>Thinking…</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
        width: 'min(448px, calc(100vw - 32px))',
        padding: '10px 16px 0',
        background: `linear-gradient(to top, ${CLAY.bg} 78%, rgba(245,245,245,0.0))`,
        zIndex: 35,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
            placeholder="Ask about finances or a live stock price…" style={{ ...S.input, flex: 1, padding: '12px 16px', boxShadow: CLAY.shadowSm }} />
          <button onClick={sendChat} disabled={chatLoading} style={{ ...S.btnDark, width: 'auto', minWidth: 54, padding: '12px 14px' }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  /* ── SETTINGS VIEW ── */
  const SettingsView = (
    <div style={{ padding: embedded ? '0 0 80px' : '0 16px 80px' }}>
      {/* xAI key */}
      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 12 }}>xAI API Key</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input type={showXaiKey ? 'text' : 'password'} value={xaiApiKey}
            onChange={e => setXaiApiKey(e.target.value)} placeholder="xai-…" autoComplete="new-password" style={{ ...S.input, flex: 1 }} />
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
            style={{ ...S.select, flex: 1, fontSize: FS.lg }}>
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
            style={{ ...S.select, flex: 1, fontSize: FS.lg }}>
            {xaiModels.length === 0
              ? <option value={visionModel}>{visionModel}</option>
              : xaiModels.map(m => <option key={m} value={m}>{m}</option>)
            }
          </select>
        </div>
        <div style={{ ...S.label, fontSize: FS.lg, opacity: 0.6, marginTop: 6 }}>Used for AI chat and statement scanning. Tap refresh to load models from xAI.</div>
      </div>

      {/* Data management */}
      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 12 }}>Data Management</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280', lineHeight: 1.5 }}>
            Use Settings &gt; Full App Backup to import or export finance data together with expenses, securities, watchlists, news, travel, and app settings.
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
          style={modalBackdropStyle({ align: 'sheet', zIndex: 100 })}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            style={modalSurfaceStyle({ sheet: true, maxWidth: 520, maxHeight: '90vh' })}>
            <ModalHeader title="Statement Extraction Review" onClose={() => setPendingExtraction(null)} />
            {/* Date */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Statement Date</div>
              <input type="date" value={pendingExtraction.date}
                onChange={e => setPendingExtraction(p => ({ ...p, date: e.target.value }))} style={{ ...S.input, maxWidth: 180 }} />
            </div>
            {/* Per-account rows */}
            <div style={{ ...S.label, marginBottom: 8 }}>
              Extracted accounts — map each to your account (unmapped rows are skipped)
            </div>
            {pendingExtraction.items.map((item, idx) => (
              <div key={idx} style={{ background: item.matched_account_id ? '#f0fdf4' : '#fafafa', border: `1px solid ${item.matched_account_id ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280', minWidth: 80 }}>{item.type}</span>
                  <span style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 600 }}>{item.currency} {Number(item.balance).toLocaleString()}</span>
                  {item.account_number && <span style={{ fontFamily: MONO, fontSize: FS.lg, color: '#9ca3af' }}>···{item.account_number}</span>}
                </div>
                <select value={item.matched_account_id}
                  onChange={e => setPendingExtraction(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, matched_account_id: e.target.value } : it) }))}
                  style={{ ...S.select, fontSize: FS.lg }}>
                  <option value="">— Skip this account —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.bank} / {a.account_name} ({a.currency}){a.account_number ? ` ···${a.account_number}` : ''}</option>
                  ))}
                </select>
                <input type="number" value={item.balance}
                  onChange={e => setPendingExtraction(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, balance: e.target.value } : it) }))}
                  style={{ ...S.inputSm, marginTop: 6, textAlign: 'left' }} placeholder="Balance" />
              </div>
            ))}
            <button onClick={() => setShowRaw(v => !v)}
              style={{ ...S.btnGhost, width: '100%', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: FS.lg }}>
              <ChevronDown size={11} style={{ transform: showRaw ? 'none' : 'rotate(-90deg)' }} />
              Raw Grok response
            </button>
            {showRaw && (
              <pre style={{ fontFamily: MONO, fontSize: FS.lg, background: '#f3f4f6', borderRadius: 8, padding: 10, maxHeight: 120, overflow: 'auto', marginBottom: 12, whiteSpace: 'pre-wrap' }}>
                {pendingExtraction.raw}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPendingExtraction(null)} style={{ ...S.btnGhost, flex: 1 }}>Discard</button>
              <button onClick={confirmExtraction} style={{ ...S.btnDark, flex: 2 }}>
                Confirm & Save ({pendingExtraction.items.filter(i => i.matched_account_id).length} accounts)
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Import preview */}
      {importPreview && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={modalBackdropStyle({ align: 'sheet', zIndex: 100 })}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            style={modalSurfaceStyle({ sheet: true, maxWidth: 480 })}>
            <ModalHeader title="Import Preview" onClose={() => setImportPreview(null)} />
            <div style={{ fontFamily: MONO, fontSize: FS.lg, color: '#374151', marginBottom: 8 }}>
              {importPreview.accounts?.length || 0} accounts
              · {importPreview.snapshots?.length || 0} snapshots
              {Object.keys(importPreview.dateRates || {}).length > 0 && (
                <span style={{ color: '#06b6d4', marginLeft: 8 }}>
                  · {Object.keys(importPreview.dateRates).length} exchange rate dates
                </span>
              )}
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, fontFamily: MONO, fontSize: FS.lg, color: '#6b7280' }}>
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
          style={modalBackdropStyle({ align: 'sheet', zIndex: 100 })}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            style={modalSurfaceStyle({ sheet: true, maxWidth: 480 })}>
            <ModalHeader title="Add Account" onClose={() => setShowAddAcc(false)} style={{ marginBottom: 20 }} />
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

      {/* New snapshot date confirmation modal */}
      {showNewSnapModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={modalBackdropStyle({ zIndex: 110 })}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            style={modalSurfaceStyle({ maxWidth: 380 })}>
            <div style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, marginBottom: 8 }}>New Snapshot</div>
            <div style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280', marginBottom: 16 }}>
              Confirm the snapshot date. Balances will be copied from the most recent data.
            </div>
            <input type="date" value={newSnapDate} max={TODAY}
              onChange={e => setNewSnapDate(e.target.value)}
              style={{ ...S.input, width: '100%', fontSize: FS.lg, marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowNewSnapModal(false)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={async () => {
                setShowNewSnapModal(false);
                await copyFromLatest(newSnapDate);
              }} style={{ ...S.btnDark, flex: 2 }}>Create Snapshot</button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Confirm delete account */}
      {confirmDeleteAcc && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={modalBackdropStyle({ zIndex: 110 })}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            style={modalSurfaceStyle({ maxWidth: 380 })}>
            <div style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700, marginBottom: 8 }}>Delete Account?</div>
            <div style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280', marginBottom: 20 }}>
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
          style={modalBackdropStyle({ zIndex: 110 })}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            style={modalSurfaceStyle({ maxWidth: 380 })}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <AlertTriangle size={20} color="#dc2626" />
              <div style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700 }}>Delete Snapshot?</div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280', marginBottom: 20 }}>
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
          style={modalBackdropStyle({ zIndex: 110 })}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            style={modalSurfaceStyle({ maxWidth: 380 })}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <AlertTriangle size={20} color="#dc2626" />
              <div style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: 700 }}>Clear All Data?</div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: FS.lg, color: '#6b7280', marginBottom: 20 }}>
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
    <div className="se" style={{ fontFamily: MONO, minHeight: embedded ? 'auto' : '100vh', background: embedded ? 'transparent' : CLAY.bg, ...(embedded && isWide ? {} : { maxWidth: 480, margin: '0 auto' }) }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {TopBar}
      {showPortfolioControls && DatePills}
      {showPortfolioControls && RatesBar}
      <div style={{ overflowY: 'auto' }}>
        {activeView === 'table'   && TableView}
        {activeView === 'summary' && SummaryView}
        {activeView === 'statistics' && StatisticsView}
        {activeView === 'summary_analytics' && SummaryAnalyticsView}
        {activeView === 'chat'    && ChatView}
        {activeView === 'settings'&& SettingsView}
      </div>
      {Modals}
    </div>
  );
}
