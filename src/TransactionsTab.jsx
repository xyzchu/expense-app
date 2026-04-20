import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Upload, RefreshCw, X, Download } from 'lucide-react';

const MONO = '"IBM Plex Mono", monospace';
const TYPE_ORDER = ['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'OTHER'];
const CASH_TYPES = new Set(['DEPOSIT', 'WITHDRAWAL']);
const SECURITY_TYPES = new Set(['BUY', 'SELL', 'DIVIDEND']);
const FUTU_BRIDGE_URL = 'http://127.0.0.1:8765';
const FUTU_PRICE_MODE_META = {
  live: { label: 'last prices', source: 'Futu last price' },
  market_close: { label: 'market close prices', source: 'Futu market close' },
  pre_price: { label: 'pre-market prices', source: 'Futu pre-market price' },
  after_price: { label: 'after-hours prices', source: 'Futu after-hours price' },
  overnight_price: { label: 'overnight prices', source: 'Futu overnight price' },
};
const FUTU_REQUEST_TYPES = {
  transactions: 'transactions',
  prices: 'prices',
  summary: 'summary',
  fullSync: 'full_sync',
};

const TYPE_COLORS = {
  BUY: { bg: '#dcfce7', text: '#16a34a' },
  SELL: { bg: '#fee2e2', text: '#dc2626' },
  DIVIDEND: { bg: '#dbeafe', text: '#2563eb' },
  DEPOSIT: { bg: '#fef3c7', text: '#b45309' },
  WITHDRAWAL: { bg: '#fde68a', text: '#92400e' },
  OTHER: { bg: '#f3f4f6', text: '#6b7280' },
};

const EMPTY_TXN = {
  transaction_date: new Date().toISOString().slice(0, 10),
  type: 'BUY',
  ticker: '',
  name: '',
  quantity: '',
  original_quantity: '',
  stock_split: '1',
  price: '',
  currency: 'USD',
  amount: '',
  tax_withheld: '',
  account: 'HSBC',
  order_ref: '',
  notes: '',
};

const fmt = (v, dec = 2) =>
  v == null || Number.isNaN(Number(v))
    ? '—'
    : Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtSigned = (v, dec = 2) =>
  v == null || Number.isNaN(Number(v))
    ? '—'
    : `${Number(v) >= 0 ? '+' : '-'}${fmt(Math.abs(Number(v)), dec)}`;

const fmtPct = (v, dec = 2) =>
  v == null || Number.isNaN(Number(v))
    ? '—'
    : `${Number(v) >= 0 ? '+' : '-'}${fmt(Math.abs(Number(v)), dec)}%`;

const adjustedQtyFromRow = (row) => Number(row.quantity || 0);
const originalQtyFromRow = (row) => Number(row.original_quantity ?? row.quantity ?? 0);
const splitFromRow = (row) => {
  const parsed = Number(row.stock_split || 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

function compareTxnOrder(a, b) {
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
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function parseMoney(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const neg = raw.includes('(') && raw.includes(')');
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return null;
  return neg ? -Math.abs(parsed) : parsed;
}

function parseNumber(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ''));
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function normalizeAccount(account) {
  const raw = String(account || '').trim();
  if (!raw) return '';
  if (/futu/i.test(raw)) return 'Futu HK';
  if (/hsbc/i.test(raw)) return 'HSBC';
  return raw;
}

function normalizeBankLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Other';
  if (/futu/i.test(raw)) return 'Futubull';
  if (/hsbc/i.test(raw)) return 'HSBC';
  return raw;
}

function deriveOpenPositions(rows) {
  const positions = new Map();
  rows
    .filter((t) => t.ticker && (t.type === 'BUY' || t.type === 'SELL' || t.type === 'DIVIDEND'))
    .slice()
    .sort(compareTxnOrder)
    .forEach((txn) => {
      const ticker = txn.ticker.toUpperCase();
      if (!positions.has(ticker)) positions.set(ticker, 0);
      const current = positions.get(ticker) || 0;
      if (txn.type === 'BUY') positions.set(ticker, current + Number(txn.quantity || 0));
      if (txn.type === 'SELL') positions.set(ticker, Math.max(0, current - Number(txn.quantity || 0)));
    });
  return [...positions.entries()].filter(([, shares]) => shares > 0).map(([ticker]) => ticker);
}

function deriveQuoteTickers(rows) {
  return [...new Set(
    rows
      .filter((t) => t.ticker)
      .map((t) => String(t.ticker || '').trim().toUpperCase())
      .filter(Boolean)
  )].sort();
}

function computeFifoRealized(txns) {
  const lots = [];
  let realized = 0;

  for (const txn of txns) {
    const qty = Number(txn.quantity || 0);
    const amount = Number(txn.amount || 0);
    if (txn.type === 'BUY' && qty > 0) {
      lots.push({ shares: qty, pricePerShare: amount / qty });
    } else if (txn.type === 'SELL' && qty > 0) {
      let remaining = qty;
      const sellPricePerShare = amount / qty;
      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const matched = Math.min(remaining, lot.shares);
        realized += matched * (sellPricePerShare - lot.pricePerShare);
        lot.shares -= matched;
        remaining -= matched;
        if (lot.shares <= 0.000001) lots.shift();
      }
    }
  }

  return realized;
}

function parseSpreadsheetCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  if (lines.length < 3) return [];

  const rows = [];
  let sortOrder = 1;
  for (const line of lines.slice(2)) {
    const cols = parseCSVLine(line);

    const cashDate = parseDate(cols[0]);
    const cashAccount = normalizeAccount(cols[1]);
    const cashCurrency = String(cols[2] || '').trim() || 'USD';
    const cashAmount = parseMoney(cols[3]);
    const cashRemark = String(cols[4] || '').trim();
    if (cashDate && cashAccount && cashAmount != null) {
      const isWithdrawal = cashAmount < 0 || /withdraw/i.test(cashRemark);
      rows.push({
        transaction_date: cashDate,
        sort_order: sortOrder,
        type: isWithdrawal ? 'WITHDRAWAL' : 'DEPOSIT',
        ticker: '',
        name: isWithdrawal ? 'Cash withdrawal' : 'Cash deposit',
        quantity: null,
        original_quantity: null,
        stock_split: 1,
        price: null,
        currency: cashCurrency,
        amount: Math.abs(cashAmount),
        tax_withheld: null,
        account: cashAccount,
        order_ref: '',
        notes: cashRemark,
        source: 'csv-import',
      });
      sortOrder += 1;
    }

    const secDate = parseDate(cols[6]);
    const secAccount = normalizeAccount(cols[7]);
    const ticker = String(cols[8] || '').trim().toUpperCase();
    const rawPrice = parseMoney(cols[9]);
    const rawUnits = parseNumber(cols[10]);
    const split = parseNumber(cols[11]) || 1;
    const adjustedUnits = parseNumber(cols[12]) ?? (rawUnits != null ? rawUnits * split : null);
    const rawTotal = parseMoney(cols[13]);
    const secRemark = String(cols[14] || '').trim();
    if (secDate && secAccount && ticker && adjustedUnits != null) {
      const isSell = adjustedUnits < 0 || (rawTotal != null && rawTotal < 0);
      const originalQuantity = Math.abs(rawUnits ?? adjustedUnits);
      const quantity = Math.abs(adjustedUnits);
      const total = Math.abs(rawTotal ?? ((rawPrice ?? 0) * originalQuantity));
      const price = quantity > 0 ? total / quantity : Math.abs(rawPrice ?? 0);
      rows.push({
        transaction_date: secDate,
        sort_order: sortOrder,
        type: isSell ? 'SELL' : 'BUY',
        ticker,
        name: ticker,
        quantity,
        original_quantity: originalQuantity,
        stock_split: split,
        price,
        currency: 'USD',
        amount: total,
        tax_withheld: null,
        account: secAccount,
        order_ref: '',
        notes: secRemark || (split !== 1 ? `Imported with stock split x${split}` : ''),
        source: 'csv-import',
      });
      sortOrder += 1;
    }
  }

  rows.sort(compareTxnOrder);
  return rows;
}

function csvEscape(value) {
  if (value == null || value === '') return '';
  const stringified = String(value);
  if (!/[",\n]/.test(stringified)) return stringified;
  return `"${stringified.replace(/"/g, '""')}"`;
}

function exportSpreadsheetCsv(rows) {
  const ordered = rows.slice().sort(compareTxnOrder);
  const cashRows = ordered
    .filter((txn) => CASH_TYPES.has(txn.type))
    .map((txn) => [
      txn.transaction_date || '',
      txn.account || '',
      txn.currency || 'USD',
      txn.type === 'WITHDRAWAL' ? -Math.abs(Number(txn.amount || 0)) : Math.abs(Number(txn.amount || 0)),
      txn.notes || '',
    ]);
  const securityRows = ordered
    .filter((txn) => SECURITY_TYPES.has(txn.type) && txn.ticker)
    .map((txn) => {
      const originalQty = originalQtyFromRow(txn);
      const adjustedQty = adjustedQtyFromRow(txn);
      const signedOriginalQty = txn.type === 'SELL' ? -originalQty : originalQty;
      const signedAdjustedQty = txn.type === 'SELL' ? -adjustedQty : adjustedQty;
      const signedAmount = txn.type === 'SELL' ? -Math.abs(Number(txn.amount || 0)) : Math.abs(Number(txn.amount || 0));
      return [
        txn.transaction_date || '',
        txn.account || '',
        txn.ticker || '',
        txn.price ?? '',
        signedOriginalQty,
        splitFromRow(txn),
        signedAdjustedQty,
        signedAmount,
        txn.notes || '',
      ];
    });

  const headerRow1 = [
    'Cash Deposit / Withdrawal', '', '', '', '',
    '',
    'Securities Buy / Sell', '', '', '', '', '', '', '', '',
  ];
  const headerRow2 = [
    'Date', 'Account', 'Currency', 'Amount', 'Remark',
    '',
    'Date', 'Account', 'Stock', 'Price', 'Stock Unit', 'Stock Split', 'Total Stock Unit', 'Total', 'Remark',
  ];

  const lineCount = Math.max(cashRows.length, securityRows.length, 1);
  const lines = [headerRow1, headerRow2];
  for (let i = 0; i < lineCount; i += 1) {
    const cash = cashRows[i] || ['', '', '', '', ''];
    const security = securityRows[i] || ['', '', '', '', '', '', '', '', ''];
    lines.push([...cash, '', ...security]);
  }

  return `${lines.map((line) => line.map(csvEscape).join(',')).join('\n')}\n`;
}

const RAW_TRANSACTION_COLUMN_ORDER = [
  'id',
  'user_id',
  'transaction_date',
  'sort_order',
  'created_at',
  'account',
  'ticker',
  'type',
  'name',
  'quantity',
  'original_quantity',
  'stock_split',
  'price',
  'currency',
  'amount',
  'tax_withheld',
  'order_ref',
  'notes',
  'source',
];

const RAW_TRANSACTION_NUMERIC_COLUMNS = new Set([
  'sort_order',
  'quantity',
  'original_quantity',
  'stock_split',
  'price',
  'amount',
  'tax_withheld',
]);

function getRawTransactionColumns(rows) {
  const extra = [...new Set(rows.flatMap((row) => Object.keys(row || {})))].filter(
    (key) => !RAW_TRANSACTION_COLUMN_ORDER.includes(key)
  );
  return [...RAW_TRANSACTION_COLUMN_ORDER.filter((key) => extra.includes(key) || rows.some((row) => key in (row || {}))), ...extra];
}

function normalizeRawTransactionValue(column, value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (RAW_TRANSACTION_NUMERIC_COLUMNS.has(column)) {
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isNaN(parsed) ? null : parsed;
  }
  return raw;
}

function parseRawTransactionsCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((header) => String(header || '').trim());
  if (!headers.length) return [];

  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const row = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = normalizeRawTransactionValue(header, cols[index]);
    });
    return row;
  });
}

function exportRawTransactionsCsv(rows) {
  const ordered = rows.slice().sort(compareTxnOrder);
  const columns = getRawTransactionColumns(ordered);
  const lines = [
    columns,
    ...ordered.map((row) => columns.map((column) => csvEscape(row?.[column]))),
  ];
  return `${lines.map((line) => line.join(',')).join('\n')}\n`;
}

function exportPortfolioSnapshotCsv(rows) {
  const columns = [
    'snapshot_at',
    'ticker',
    'accounts',
    'shares',
    'current_price',
    'average_cost',
    'open_cost_basis',
    'market_value',
    'unrealized_pnl',
    'unrealized_pct_of_cost_basis',
    'realized_pnl',
    'dividends',
    'total_pnl',
    'total_pnl_pct_of_cost_basis',
    'portfolio_pct',
    'latest_trade_price',
    'latest_trade_date',
    'price_source',
  ];

  const snapshotAt = new Date().toISOString();
  const lines = [
    columns,
    ...rows.map((row) =>
      columns.map((column) => {
        const valueMap = {
          snapshot_at: snapshotAt,
          ticker: row.ticker,
          accounts: row.account,
          shares: row.shares,
          current_price: row.currentPrice,
          average_cost: row.avgCost,
          open_cost_basis: row.investedCost,
          market_value: row.marketValue,
          unrealized_pnl: row.unrealizedPnl,
          unrealized_pct_of_cost_basis: row.unrealizedPct,
          realized_pnl: row.realizedPnl,
          dividends: row.dividends,
          total_pnl: row.totalPnl,
          total_pnl_pct_of_cost_basis: row.totalPnlPct,
          portfolio_pct: row.portfolioPct,
          latest_trade_price: row.latestTradePrice,
          latest_trade_date: row.latestTradeDate,
          price_source: row.priceSource,
        };
        return csvEscape(valueMap[column]);
      })
    ),
  ];
  return `${lines.map((line) => line.join(',')).join('\n')}\n`;
}

function sanitizeImportedTransactionRow(row, userId, index) {
  const sanitized = {
    ...row,
    user_id: userId,
  };

  if (!sanitized.transaction_date) {
    throw new Error(`Row ${index + 2} is missing transaction_date`);
  }
  if (!sanitized.type) {
    throw new Error(`Row ${index + 2} is missing type`);
  }

  if (sanitized.id == null || sanitized.id === '') delete sanitized.id;
  if (sanitized.created_at == null || sanitized.created_at === '') delete sanitized.created_at;
  if (sanitized.sort_order == null) sanitized.sort_order = index + 1;

  return sanitized;
}

export default function TransactionsTab({
  user,
  sb,
  showToast,
  forcedView = null,
  showViewToggle = true,
  embedded = false,
}) {
  const [txns, setTxns] = useState([]);
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [financialSnapshots, setFinancialSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accountFilter, setAccountFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [view, setView] = useState('pnl');
  const [showAdd, setShowAdd] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pendingParsed, setPendingParsed] = useState(null);
  const [xaiKey, setXaiKey] = useState('');
  const [xaiModel, setXaiModel] = useState('grok-4-1-fast-reasoning');
  const [newTxn, setNewTxn] = useState(EMPTY_TXN);
  const [importing, setImporting] = useState(false);
  const [futuImporting, setFutuImporting] = useState(false);
  const [priceMap, setPriceMap] = useState({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [hasRefreshedPrices, setHasRefreshedPrices] = useState(false);
  const [lastPriceRefreshAt, setLastPriceRefreshAt] = useState('');
  const [lastFutuPriceRefreshAt, setLastFutuPriceRefreshAt] = useState('');
  const [lastGrokPriceRefreshAt, setLastGrokPriceRefreshAt] = useState('');
  const [lastFutuTransactionsRefreshAt, setLastFutuTransactionsRefreshAt] = useState('');
  const [futuPriceMode, setFutuPriceMode] = useState('live');
  const [priceStatus, setPriceStatus] = useState('');
  const [priceRequestStartedAt, setPriceRequestStartedAt] = useState(null);
  const [manualPriceDrafts, setManualPriceDrafts] = useState({});
  const [oldPortfolioPnlByBank, setOldPortfolioPnlByBank] = useState({});
  const [futuAccountSummary, setFutuAccountSummary] = useState(null);
  const [futuSummaryLoading, setFutuSummaryLoading] = useState(false);
  const [futuRemoteRequests, setFutuRemoteRequests] = useState([]);
  const [localFutuBridgeAvailable, setLocalFutuBridgeAvailable] = useState(null);
  const [expandedPnlBanks, setExpandedPnlBanks] = useState({});
  const [expandedPnlTicker, setExpandedPnlTicker] = useState(null);
  const [pnlSort, setPnlSort] = useState({ key: 'portfolioPct', direction: 'desc' });
  const [autoUpdateFutuOnStartup, setAutoUpdateFutuOnStartup] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const importRef = useRef(null);
  const pnlTableScrollRef = useRef(null);
  const startupAutoRefreshRanRef = useRef(false);
  const latestRemoteRequestStatusRef = useRef({});
  const activeView = forcedView ?? view;

  const futuRows = useMemo(
    () => txns.filter((txn) => txn.source === 'futu-opend'),
    [txns]
  );

  const latestFutuTradeDate = useMemo(
    () => futuRows.map((txn) => txn.transaction_date).filter(Boolean).sort().slice(-1)[0] || null,
    [futuRows]
  );

  const latestFutuDividendDate = useMemo(
    () =>
      futuRows
        .filter((txn) => txn.type === 'DIVIDEND')
        .map((txn) => txn.transaction_date)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || null,
    [futuRows]
  );

  const dedupeKeyForTxn = (txn) => [
    txn.source || '',
    txn.notes || '',
    txn.order_ref || '',
    txn.transaction_date || '',
    txn.account || '',
    txn.ticker || '',
    Number(txn.quantity || 0),
    Number(txn.price || 0),
    Number(txn.amount || 0),
    Number(txn.tax_withheld || 0),
    txn.type || '',
  ].join('|');

  const replaceTransactions = async (rows, successMessage) => {
    const { error: deleteError } = await sb
      .from('securities_transactions')
      .delete()
      .eq('user_id', user.id);
    if (deleteError) {
      throw new Error(`Clear failed: ${deleteError.message}`);
    }

    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await sb.from('securities_transactions').insert(rows.slice(i, i + 100));
      if (error) {
        throw new Error(`Import failed: ${error.message}`);
      }
    }

    showToast(successMessage);
    await load();
    setView('pnl');
    setPriceMap({});
  };

  const load = async () => {
    setLoading(true);
    const [{ data: txnData }, { data: accData }, { data: snapData }] = await Promise.all([
      sb
        .from('securities_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false }),
      sb
        .from('financial_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order'),
      sb
        .from('financial_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .order('snapshot_date', { ascending: false }),
    ]);
    setTxns(txnData || []);
    setFinancialAccounts(accData || []);
    setFinancialSnapshots(snapData || []);
    setLoading(false);
  };

  const loadSettings = async () => {
    const { data } = await sb
      .from('user_settings')
      .select('key,value')
      .eq('user_id', user.id);

    const keyRow = (data || []).find((row) => row.key === 'xai_api_key');
    const modelRow = (data || []).find((row) => row.key === 'xai_model');
    if (keyRow?.value) setXaiKey(keyRow.value);
    if (modelRow?.value) setXaiModel(modelRow.value);
    const savedPrices = {};
    (data || [])
      .filter((row) => String(row.key || '').startsWith('latest_stock_price:'))
      .forEach((row) => {
        try {
          const ticker = String(row.key).split(':')[1]?.toUpperCase();
          const parsed = JSON.parse(row.value);
          if (ticker && parsed?.price != null) {
            const savedSource = parsed.source || 'Saved price';
            savedPrices[ticker] = {
              price: Number(parsed.price),
              source: savedSource,
              updatedAt: parsed.updated_at || '',
              originalSource: savedSource,
            };
          }
        } catch {}
      });
    if (Object.keys(savedPrices).length > 0) setPriceMap(savedPrices);
    const savedOldPortfolio = {};
    (data || [])
      .filter((row) => String(row.key || '').startsWith('old_portfolio_pnl:'))
      .forEach((row) => {
        const bank = normalizeBankLabel(String(row.key).split(':')[1] || '');
        const value = Number(row.value);
        if (bank && Number.isFinite(value)) savedOldPortfolio[bank] = value;
      });
    if (Object.keys(savedOldPortfolio).length > 0) setOldPortfolioPnlByBank(savedOldPortfolio);
    const futuPriceRefreshRow = (data || []).find((row) => row.key === 'futu_prices_refreshed_at');
    const grokPriceRefreshRow = (data || []).find((row) => row.key === 'grok_prices_refreshed_at');
    const futuTransactionsRefreshRow = (data || []).find((row) => row.key === 'futu_transactions_refreshed_at');
    const autoUpdateFutuStartupRow = (data || []).find((row) => row.key === 'futu_auto_update_on_startup');
    const futuAccountSummaryRow = (data || []).find((row) => row.key === 'futu_account_summary');
    const futuPriceModeRow = (data || []).find((row) => row.key === 'futu_price_mode');
    if (futuPriceRefreshRow?.value) setLastFutuPriceRefreshAt(futuPriceRefreshRow.value);
    if (grokPriceRefreshRow?.value) setLastGrokPriceRefreshAt(grokPriceRefreshRow.value);
    if (futuTransactionsRefreshRow?.value) setLastFutuTransactionsRefreshAt(futuTransactionsRefreshRow.value);
    if (autoUpdateFutuStartupRow?.value != null) {
      setAutoUpdateFutuOnStartup(String(autoUpdateFutuStartupRow.value) === 'true');
    }
    if (futuPriceModeRow?.value) setFutuPriceMode(futuPriceModeRow.value);
    if (futuAccountSummaryRow?.value) {
      try {
        setFutuAccountSummary(JSON.parse(futuAccountSummaryRow.value));
      } catch {}
    }
    setSettingsLoaded(true);
  };

  const loadFutuRemoteRequests = async () => {
    try {
      const { data, error } = await sb
        .from('futu_refresh_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setFutuRemoteRequests(data || []);
    } catch {
      setFutuRemoteRequests([]);
    }
  };

  useEffect(() => {
    load();
    loadSettings();
    loadFutuRemoteRequests();
  }, [user]);

  const knownAccounts = useMemo(
    () => [...new Set(txns.map((t) => t.account).filter(Boolean))].sort(),
    [txns]
  );

  const filterAccounts = useMemo(
    () => ['All', ...knownAccounts],
    [knownAccounts]
  );

  const typeOptions = useMemo(
    () => ['All', ...TYPE_ORDER.filter((type) => txns.some((t) => t.type === type))],
    [txns]
  );

  const filtered = useMemo(
    () =>
      txns.filter((t) => {
        if (accountFilter !== 'All' && t.account !== accountFilter) return false;
        if (typeFilter !== 'All' && t.type !== typeFilter) return false;
        return true;
      }),
    [txns, accountFilter, typeFilter]
  );

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((t) => {
      const month = t.transaction_date?.slice(0, 7) || 'Unknown';
      if (!map[month]) map[month] = [];
      map[month].push(t);
    });
    return map;
  }, [filtered]);

  const months = useMemo(() => Object.keys(grouped).sort().reverse(), [grouped]);

  const buys = filtered.filter((t) => t.type === 'BUY').reduce((sum, t) => sum + (t.amount || 0), 0);
  const sells = filtered.filter((t) => t.type === 'SELL').reduce((sum, t) => sum + (t.amount || 0), 0);
  const divs = filtered
    .filter((t) => t.type === 'DIVIDEND')
    .reduce((sum, t) => sum + (t.amount || 0) + (t.tax_withheld || 0), 0);
  const deposits = txns.filter((t) => t.type === 'DEPOSIT').reduce((sum, t) => sum + (t.amount || 0), 0);
  const withdrawals = txns.filter((t) => t.type === 'WITHDRAWAL').reduce((sum, t) => sum + (t.amount || 0), 0);

  const positionRows = useMemo(() => {
    const securityTxns = txns
      .filter((t) => t.ticker && (t.type === 'BUY' || t.type === 'SELL' || t.type === 'DIVIDEND'))
      .slice()
      .sort(compareTxnOrder);

    const map = new Map();
    const groupedByPosition = new Map();
    securityTxns.forEach((txn) => {
      const ticker = txn.ticker.toUpperCase();
      const account = txn.account || 'Unknown';
      const positionKey = `${account}::${ticker}`;
      if (!groupedByPosition.has(positionKey)) groupedByPosition.set(positionKey, []);
      groupedByPosition.get(positionKey).push(txn);
      if (!map.has(positionKey)) {
        map.set(positionKey, {
          key: positionKey,
          ticker,
          account,
          shares: 0,
          avgCost: 0,
          realizedPnl: 0,
          dividends: 0,
          investedCost: 0,
          buyAmount: 0,
          sellAmount: 0,
          latestTradePrice: null,
          latestTradeDate: null,
        });
      }

      const row = map.get(positionKey);
      const qty = Number(txn.quantity || 0);
      const amount = Number(txn.amount || 0);

      if (txn.type === 'BUY' && qty > 0) {
        row.buyAmount += amount;
        const currentCost = row.shares * row.avgCost;
        row.shares += qty;
        row.avgCost = row.shares > 0 ? (currentCost + amount) / row.shares : 0;
        row.investedCost = row.shares * row.avgCost;
      } else if (txn.type === 'SELL' && qty > 0) {
        row.sellAmount += amount;
        const costBasis = row.avgCost * qty;
        row.realizedPnl += amount - costBasis;
        row.shares = Math.max(0, row.shares - qty);
        row.investedCost = row.shares * row.avgCost;
        if (row.shares === 0) row.avgCost = 0;
      } else if (txn.type === 'DIVIDEND') {
        row.dividends += amount + Number(txn.tax_withheld || 0);
      }

      if (txn.type === 'BUY' || txn.type === 'SELL') {
        row.latestTradePrice = Number(txn.price || 0) || row.latestTradePrice;
        row.latestTradeDate = txn.transaction_date || row.latestTradeDate;
      }
    });

    return [...map.values()]
      .map((row) => {
        const livePrice = priceMap[row.ticker];
        const currentPrice = livePrice?.price ?? row.latestTradePrice ?? null;
        const marketValue = currentPrice != null ? row.shares * currentPrice : null;
        const unrealizedPnl = currentPrice != null ? row.shares * (currentPrice - row.avgCost) : null;
        const netInvested = row.buyAmount - row.sellAmount;
        const spreadsheetAvg = row.shares > 0 ? netInvested / row.shares : null;
        const fifoRealizedPnl = computeFifoRealized(groupedByPosition.get(row.key) || []);
        const fifoTotalPnl = (unrealizedPnl ?? 0) + fifoRealizedPnl + row.dividends;
        const usingManualPrice = livePrice?.source === 'Manual';
        const usingSavedFallback = livePrice?.source === 'Saved fallback';
        const usingLiveSource = !!livePrice && !usingManualPrice && !usingSavedFallback;
        const usingTradeFallback = !livePrice && row.latestTradePrice != null;
        const isFallbackPriceUsed = usingSavedFallback || usingTradeFallback;
        const fallbackPrice = usingSavedFallback ? livePrice?.price : usingTradeFallback ? row.latestTradePrice : null;
        const fallbackUpdatedAt = usingSavedFallback
          ? (livePrice?.updatedAt ? new Date(livePrice.updatedAt).toLocaleString() : '')
          : row.latestTradeDate || '';
        return {
          ...row,
          currentPrice,
          marketValue,
          unrealizedPnl,
          netInvested,
          spreadsheetAvg,
          fifoRealizedPnl,
          fifoTotalPnl,
          totalPnl: (unrealizedPnl ?? 0) + row.realizedPnl + row.dividends,
          priceSource: usingManualPrice
            ? 'Manual'
            : usingSavedFallback
            ? 'Fallback saved price'
            : usingLiveSource
            ? livePrice?.source
            : row.latestTradePrice != null
            ? 'Last trade'
            : 'Missing',
          priceSourceDetail: usingManualPrice
            ? 'Using your manual override'
            : usingSavedFallback
            ? `Live price unavailable, using saved price from ${livePrice?.updatedAt ? new Date(livePrice.updatedAt).toLocaleString() : 'a previous refresh'}`
            : livePrice?.source?.includes('Grok')
            ? 'Using Grok live search price'
            : livePrice?.source?.includes('Futu')
            ? 'Using Futu live quote'
            : row.latestTradePrice != null
            ? `Using latest trade price from ${row.latestTradeDate || 'your history'}`
            : 'No current price available',
          isFallbackPriceUsed,
          fallbackPrice,
          fallbackUpdatedAt,
        };
      })
      .sort((a, b) => a.account.localeCompare(b.account) || a.ticker.localeCompare(b.ticker));
  }, [txns, priceMap]);

  const pnlRows = useMemo(() => {
    const grouped = new Map();
    positionRows.forEach((row) => {
      if (!grouped.has(row.ticker)) {
        grouped.set(row.ticker, {
          ticker: row.ticker,
          accounts: new Set(),
          shares: 0,
          avgCost: 0,
          investedCost: 0,
          realizedPnl: 0,
          dividends: 0,
          buyAmount: 0,
          sellAmount: 0,
          latestTradePrice: null,
          latestTradeDate: null,
          currentPrice: row.currentPrice,
          marketValue: 0,
          unrealizedPnl: 0,
          netInvested: 0,
          fifoRealizedPnl: 0,
          fifoTotalPnl: 0,
          totalPnl: 0,
          priceSource: row.priceSource,
          priceSourceDetail: row.priceSourceDetail,
        });
      }
      const agg = grouped.get(row.ticker);
      agg.accounts.add(row.account);
      agg.shares += row.shares || 0;
      agg.investedCost += row.investedCost || 0;
      agg.realizedPnl += row.realizedPnl || 0;
      agg.dividends += row.dividends || 0;
      agg.buyAmount += row.buyAmount || 0;
      agg.sellAmount += row.sellAmount || 0;
      agg.marketValue += row.marketValue || 0;
      agg.unrealizedPnl += row.unrealizedPnl || 0;
      agg.netInvested += row.netInvested || 0;
      agg.fifoRealizedPnl += row.fifoRealizedPnl || 0;
      agg.fifoTotalPnl += row.fifoTotalPnl || 0;
      agg.totalPnl += row.totalPnl || 0;
      if (
        row.latestTradeDate &&
        (!agg.latestTradeDate || row.latestTradeDate > agg.latestTradeDate)
      ) {
        agg.latestTradeDate = row.latestTradeDate;
        agg.latestTradePrice = row.latestTradePrice;
      }
    });

    return [...grouped.values()]
      .map((row) => ({
        ...row,
        account: [...row.accounts].sort().join(' + '),
        avgCost: row.shares > 0 ? row.investedCost / row.shares : 0,
        spreadsheetAvg: row.shares > 0 ? row.netInvested / row.shares : null,
      }))
      .filter((row) => row.shares > 0 || row.realizedPnl !== 0 || row.dividends !== 0)
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [positionRows]);

  const openPnlRows = useMemo(
    () => pnlRows.filter((row) => (row.shares || 0) > 0 || Math.abs(Number(row.realizedPnl || 0)) > 0.000001),
    [pnlRows]
  );

  const pnlBreakdownByTicker = useMemo(() => {
    const grouped = new Map();
    positionRows.forEach((row) => {
      if (!grouped.has(row.ticker)) grouped.set(row.ticker, []);
      grouped.get(row.ticker).push({
        ...row,
        totalPnlPct: row.investedCost > 0 ? (row.totalPnl / row.investedCost) * 100 : null,
        unrealizedPct: row.investedCost > 0 ? ((row.unrealizedPnl || 0) / row.investedCost) * 100 : null,
      });
    });
    grouped.forEach((rows, ticker) => {
      grouped.set(
        ticker,
        rows
          .filter((row) => (row.shares || 0) > 0 || Math.abs(Number(row.realizedPnl || 0)) > 0.000001)
          .sort((a, b) => a.account.localeCompare(b.account))
      );
    });
    return grouped;
  }, [positionRows]);

  const totalOpenMarketValue = useMemo(
    () => openPnlRows.reduce((sum, row) => sum + Number(row.marketValue || 0), 0),
    [openPnlRows]
  );

  const sortedPnlRows = useMemo(() => {
    const rowsWithMetrics = openPnlRows.map((row) => ({
      ...row,
      totalPnlPct: row.investedCost > 0 ? (row.totalPnl / row.investedCost) * 100 : null,
      unrealizedPct: row.investedCost > 0 ? ((row.unrealizedPnl || 0) / row.investedCost) * 100 : null,
      portfolioPct: totalOpenMarketValue > 0 ? ((row.marketValue || 0) / totalOpenMarketValue) * 100 : null,
    }));

    const compareValues = (a, b) => {
      const directionFactor = pnlSort.direction === 'asc' ? 1 : -1;
      const valueA = a?.[pnlSort.key];
      const valueB = b?.[pnlSort.key];

      if (pnlSort.key === 'ticker') {
        return directionFactor * String(valueA || '').localeCompare(String(valueB || ''));
      }

      const numA = valueA == null || Number.isNaN(Number(valueA)) ? null : Number(valueA);
      const numB = valueB == null || Number.isNaN(Number(valueB)) ? null : Number(valueB);

      if (numA == null && numB == null) return String(a.ticker || '').localeCompare(String(b.ticker || ''));
      if (numA == null) return 1;
      if (numB == null) return -1;
      if (numA === numB) return String(a.ticker || '').localeCompare(String(b.ticker || ''));
      return directionFactor * (numA - numB);
    };

    return rowsWithMetrics.slice().sort(compareValues);
  }, [openPnlRows, pnlSort, totalOpenMarketValue]);

  const togglePnlSort = (key) => {
    setPnlSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: 'desc' }
    );
  };

  const togglePnlTickerBreakdown = (ticker) => {
    setExpandedPnlTicker((current) => (current === ticker ? null : ticker));
  };

  const scrollPnlTable = (direction) => {
    const container = pnlTableScrollRef.current;
    if (!container) return;
    container.scrollBy({
      left: direction * 260,
      behavior: 'smooth',
    });
  };

  const financeSecuritiesByBank = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 45);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const grouped = new Map();
    financialAccounts
      .filter((acc) => acc.category === 'Securities')
      .forEach((acc) => {
        const recent = financialSnapshots
          .filter((s) => s.account_id === acc.id && s.snapshot_date >= cutoffStr)
          .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
        const bank = normalizeBankLabel(acc.bank);
        const value = Number(recent?.balance || 0);
        if (!grouped.has(bank)) {
          grouped.set(bank, {
            bank,
            value: 0,
            currency: acc.currency || 'USD',
          });
        }
        const row = grouped.get(bank);
        row.value += value;
        row.currency = acc.currency || row.currency || 'USD';
      });
    return [...grouped.values()]
      .filter((row) => row.value > 0)
      .sort((a, b) => a.bank.localeCompare(b.bank));
  }, [financialAccounts, financialSnapshots]);

  const financeCashByBank = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 45);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const grouped = new Map();
    financialAccounts
      .filter((acc) => acc.category === 'Cash')
      .forEach((acc) => {
        const bank = normalizeBankLabel(acc.bank);
        const accountName = String(acc.account_name || '').trim().toUpperCase();
        if (bank === 'HSBC' && accountName !== 'USD') return;
        const recent = financialSnapshots
          .filter((s) => s.account_id === acc.id && s.snapshot_date >= cutoffStr)
          .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
        const value = Number(recent?.balance || 0);
        if (!grouped.has(bank)) {
          grouped.set(bank, {
            bank,
            value: 0,
            currency: acc.currency || 'USD',
          });
        }
        const row = grouped.get(bank);
        row.value += value;
        row.currency = acc.currency || row.currency || 'USD';
      });
    return [...grouped.values()].sort((a, b) => a.bank.localeCompare(b.bank));
  }, [financialAccounts, financialSnapshots]);

  const bankPnlRows = useMemo(() => {
    const grouped = new Map([
      ['Futubull', { bank: 'Futubull', cashIn: 0, cashOut: 0, openPositions: 0, openCost: 0, marketValue: 0, unrealized: 0, realized: 0, dividends: 0, totalPnl: 0, oldPortfolioPnl: 0, revisedTotalPnl: 0, financeValue: 0, financeCurrency: 'USD', financeCash: 0, financeCashCurrency: 'USD', futuApiMarketValue: null, futuApiTotalPositionPnl: null, futuApiCash: null, futuApiTotalAssets: null, futuApiCurrency: 'USD', futuApiOpenPositions: null, futuApiUpdatedAt: null }],
      ['HSBC', { bank: 'HSBC', cashIn: 0, cashOut: 0, openPositions: 0, openCost: 0, marketValue: 0, unrealized: 0, realized: 0, dividends: 0, totalPnl: 0, oldPortfolioPnl: 0, revisedTotalPnl: 0, financeValue: 0, financeCurrency: 'USD', financeCash: 0, financeCashCurrency: 'USD', futuApiMarketValue: null, futuApiTotalPositionPnl: null, futuApiCash: null, futuApiTotalAssets: null, futuApiCurrency: 'USD', futuApiOpenPositions: null, futuApiUpdatedAt: null }],
    ]);

    txns.forEach((txn) => {
      if (!CASH_TYPES.has(txn.type)) return;
      const bank = normalizeBankLabel(txn.account);
      if (!grouped.has(bank)) {
        grouped.set(bank, { bank, cashIn: 0, cashOut: 0, openPositions: 0, openCost: 0, marketValue: 0, unrealized: 0, realized: 0, dividends: 0, totalPnl: 0, oldPortfolioPnl: 0, revisedTotalPnl: 0, financeValue: 0, financeCurrency: txn.currency || 'USD', financeCash: 0, financeCashCurrency: txn.currency || 'USD', futuApiMarketValue: null, futuApiTotalPositionPnl: null, futuApiCash: null, futuApiTotalAssets: null, futuApiCurrency: 'USD', futuApiOpenPositions: null, futuApiUpdatedAt: null });
      }
      const row = grouped.get(bank);
      if (txn.type === 'DEPOSIT') row.cashIn += Number(txn.amount || 0);
      if (txn.type === 'WITHDRAWAL') row.cashOut += Number(txn.amount || 0);
    });

    positionRows.forEach((row) => {
      const bank = normalizeBankLabel(row.account);
      if (!grouped.has(bank)) {
        grouped.set(bank, {
          bank,
          cashIn: 0,
          cashOut: 0,
          openPositions: 0,
          openCost: 0,
          marketValue: 0,
          unrealized: 0,
          realized: 0,
          dividends: 0,
          totalPnl: 0,
          oldPortfolioPnl: 0,
          revisedTotalPnl: 0,
          financeValue: 0,
          financeCurrency: 'USD',
          financeCash: 0,
          financeCashCurrency: 'USD',
          futuApiMarketValue: null,
          futuApiTotalPositionPnl: null,
          futuApiCash: null,
          futuApiTotalAssets: null,
          futuApiCurrency: 'USD',
          futuApiOpenPositions: null,
          futuApiUpdatedAt: null,
        });
      }
      const agg = grouped.get(bank);
      if ((row.shares || 0) > 0) agg.openPositions += 1;
      agg.marketValue += row.marketValue || 0;
      agg.openCost += row.investedCost || 0;
      agg.unrealized += row.unrealizedPnl || 0;
      agg.realized += row.realizedPnl || 0;
      agg.dividends += row.dividends || 0;
      agg.totalPnl += row.totalPnl || 0;
    });
    financeSecuritiesByBank.forEach((financeRow) => {
      const bank = normalizeBankLabel(financeRow.bank);
      if (!grouped.has(bank)) {
        grouped.set(bank, {
          bank,
          cashIn: 0,
          cashOut: 0,
          openPositions: 0,
          openCost: 0,
          marketValue: 0,
          unrealized: 0,
          realized: 0,
          dividends: 0,
          totalPnl: 0,
          oldPortfolioPnl: 0,
          revisedTotalPnl: 0,
          financeValue: 0,
          financeCurrency: financeRow.currency || 'USD',
          financeCash: 0,
          financeCashCurrency: financeRow.currency || 'USD',
          futuApiMarketValue: null,
          futuApiTotalPositionPnl: null,
          futuApiCash: null,
          futuApiTotalAssets: null,
          futuApiCurrency: financeRow.currency || 'USD',
          futuApiOpenPositions: null,
          futuApiUpdatedAt: null,
        });
      }
      const row = grouped.get(bank);
      row.financeValue += financeRow.value || 0;
      row.financeCurrency = financeRow.currency || row.financeCurrency || 'USD';
    });
    financeCashByBank.forEach((cashRow) => {
      const bank = normalizeBankLabel(cashRow.bank);
      if (!grouped.has(bank)) {
        grouped.set(bank, {
          bank,
          cashIn: 0,
          cashOut: 0,
          openPositions: 0,
          openCost: 0,
          marketValue: 0,
          unrealized: 0,
          realized: 0,
          dividends: 0,
          totalPnl: 0,
          oldPortfolioPnl: 0,
          revisedTotalPnl: 0,
          financeValue: 0,
          financeCurrency: cashRow.currency || 'USD',
          financeCash: 0,
          financeCashCurrency: cashRow.currency || 'USD',
          futuApiMarketValue: null,
          futuApiTotalPositionPnl: null,
          futuApiCash: null,
          futuApiTotalAssets: null,
          futuApiCurrency: 'USD',
          futuApiOpenPositions: null,
          futuApiUpdatedAt: null,
        });
      }
      const row = grouped.get(bank);
      row.financeCash += cashRow.value || 0;
      row.financeCashCurrency = cashRow.currency || row.financeCashCurrency || 'USD';
    });
    if (futuAccountSummary) {
      const bank = normalizeBankLabel(futuAccountSummary.account_label || 'Futubull');
      if (!grouped.has(bank)) {
        grouped.set(bank, {
          bank,
          cashIn: 0,
          cashOut: 0,
          openPositions: 0,
          openCost: 0,
          marketValue: 0,
          unrealized: 0,
          realized: 0,
          dividends: 0,
          totalPnl: 0,
          oldPortfolioPnl: 0,
          revisedTotalPnl: 0,
          financeValue: 0,
          financeCurrency: 'USD',
          futuApiMarketValue: null,
          futuApiTotalPositionPnl: null,
          futuApiCash: null,
          futuApiTotalAssets: null,
          futuApiCurrency: 'USD',
          futuApiOpenPositions: null,
          futuApiUpdatedAt: null,
        });
      }
      const row = grouped.get(bank);
      row.futuApiMarketValue = Number(futuAccountSummary.market_value || 0);
      row.futuApiTotalPositionPnl = Number(futuAccountSummary.total_position_pnl || 0);
      row.futuApiCash = Number(futuAccountSummary.cash || 0);
      row.futuApiTotalAssets = Number(futuAccountSummary.total_assets || 0);
      row.futuApiCurrency = futuAccountSummary.currency || row.futuApiCurrency || 'USD';
      row.futuApiOpenPositions = Number(futuAccountSummary.open_positions || 0);
      row.futuApiUpdatedAt = futuAccountSummary.updated_at || null;
    }
    return [...grouped.values()]
      .map((row) => {
        const oldPortfolioPnl = Number(oldPortfolioPnlByBank[row.bank] || 0);
        const futuRowsForBank = positionRows.filter((position) => normalizeBankLabel(position.account) === row.bank);
        const dilutedOpenCostBasis = futuRowsForBank.reduce((sum, position) => {
          const netOpenCost = (position.buyAmount || 0) - (position.sellAmount || 0);
          return sum + Math.max(0, netOpenCost);
        }, 0);
        const futuUnrealizedPnl = futuRowsForBank.reduce((sum, position) => {
          const marketValue = position.marketValue || 0;
          const netOpenCost = Math.max(0, (position.buyAmount || 0) - (position.sellAmount || 0));
          return sum + (marketValue - netOpenCost);
        }, 0);
        return {
          ...row,
          oldPortfolioPnl,
          revisedTotalPnl: row.totalPnl + oldPortfolioPnl,
          futuDilutedOpenCostBasis: dilutedOpenCostBasis,
          futuUnrealizedPnl,
        };
      })
      .filter((row) =>
        row.bank === 'Futubull' ||
        row.bank === 'HSBC' ||
        row.cashIn !== 0 ||
        row.cashOut !== 0 ||
        row.openPositions > 0 ||
        row.financeValue > 0
      )
      .sort((a, b) => {
        const order = { Futubull: 0, HSBC: 1 };
        return (order[a.bank] ?? 99) - (order[b.bank] ?? 99) || a.bank.localeCompare(b.bank);
      });
  }, [txns, positionRows, financeSecuritiesByBank, financeCashByBank, oldPortfolioPnlByBank, futuAccountSummary]);

  const totalPnlSummary = useMemo(() => {
    return bankPnlRows.reduce((acc, row) => {
      acc.marketValue += row.marketValue || 0;
      acc.cash += row.bank === 'Futubull'
        ? (row.futuApiCash || 0)
        : row.bank === 'HSBC'
        ? (row.financeCash || 0)
        : 0;
      acc.unrealized += row.unrealized || 0;
      acc.realized += row.realized || 0;
      acc.dividends += row.dividends || 0;
      if (row.bank === 'Futubull') acc.futuDividends += row.dividends || 0;
      acc.totalPnl += row.totalPnl || 0;
      acc.revisedTotalPnl += row.revisedTotalPnl || 0;
      return acc;
    }, {
      marketValue: 0,
      cash: 0,
      unrealized: 0,
      realized: 0,
      dividends: 0,
      futuDividends: 0,
      totalPnl: 0,
      revisedTotalPnl: 0,
    });
  }, [bankPnlRows]);

  const saveOldPortfolioPnl = async (bank, value) => {
    const numeric = Number(value || 0);
    await sb.from('user_settings').upsert(
      [{
        user_id: user.id,
        key: `old_portfolio_pnl:${bank}`,
        value: String(Number.isFinite(numeric) ? numeric : 0),
      }],
      { onConflict: 'user_id,key' }
    );
  };

  const saveSettingValue = async (key, value) => {
    await sb.from('user_settings').upsert(
      [{
        user_id: user.id,
        key,
        value,
      }],
      { onConflict: 'user_id,key' }
    );
  };

  const checkLocalFutuBridge = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${FUTU_BRIDGE_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      setLocalFutuBridgeAvailable(res.ok);
      return res.ok;
    } catch {
      setLocalFutuBridgeAvailable(false);
      return false;
    }
  };

  const enqueueFutuRefreshRequest = async (requestType, payload = {}) => {
    const pendingTypes = requestType === FUTU_REQUEST_TYPES.fullSync
      ? [FUTU_REQUEST_TYPES.fullSync]
      : [requestType, FUTU_REQUEST_TYPES.fullSync];
    const { data: existing, error: existingError } = await sb
      .from('futu_refresh_requests')
      .select('*')
      .eq('user_id', user.id)
      .in('request_type', pendingTypes)
      .in('status', ['pending', 'running'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError && !String(existingError.message || '').includes('futu_refresh_requests')) {
      throw existingError;
    }
    if (existing) {
      await loadFutuRemoteRequests();
      return existing;
    }

    const { data, error } = await sb
      .from('futu_refresh_requests')
      .insert([{
        user_id: user.id,
        request_type: requestType,
        payload,
      }])
      .select('*')
      .single();
    if (error) throw error;
    await loadFutuRemoteRequests();
    return data;
  };

  const runFutuRefreshAction = async ({ requestType, payload, localRunner, queuedStatus, queuedToast }) => {
    const hasLocalBridge = await checkLocalFutuBridge();
    if (hasLocalBridge) {
      return localRunner();
    }

    try {
      const queuedRequest = await enqueueFutuRefreshRequest(requestType, payload);
      if (queuedStatus) setPriceStatus(queuedStatus);
      if (queuedToast) showToast(queuedToast);
      return queuedRequest;
    } catch (error) {
      showToast(`Remote Futu request failed: ${error.message}`);
      throw error;
    }
  };

  const loadFutuAccountSummary = async () => {
    setFutuSummaryLoading(true);
    try {
      const res = await fetch(`${FUTU_BRIDGE_URL}/account-summary?market=US&trd_env=REAL`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Futu account summary request failed');
      setFutuAccountSummary(json);
      await saveSettingValue('futu_account_summary', JSON.stringify(json));
      return json;
    } catch {
      // Keep the last saved snapshot visible if the live bridge is unavailable.
      return null;
    } finally {
      setFutuSummaryLoading(false);
    }
  };

  const persistManualPrice = async (ticker, rawValue) => {
    const trimmed = String(rawValue ?? '').trim();
    const settingKey = `latest_stock_price:${ticker}`;

    if (!trimmed) {
      setPriceMap((prev) => {
        const next = { ...prev };
        delete next[ticker];
        return next;
      });
      await sb
        .from('user_settings')
        .delete()
        .eq('user_id', user.id)
        .eq('key', settingKey);
      return;
    }

    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) return;

    const payload = {
      price: numeric,
      updated_at: new Date().toISOString(),
      source: 'Manual',
    };

    setPriceMap((prev) => ({
      ...prev,
      [ticker]: { price: numeric, source: 'Manual', updatedAt: payload.updated_at, originalSource: 'Manual' },
    }));

    await sb.from('user_settings').upsert(
      [{
        user_id: user.id,
        key: settingKey,
        value: JSON.stringify(payload),
      }],
      { onConflict: 'user_id,key' }
    );
  };

  const persistQuotes = async (quotes, sourceLabel, successPrefix, emptyMessage, failurePrefix) => {
    const tickers = deriveQuoteTickers(txns);
    if (tickers.length === 0) return;
    setPriceLoading(true);
    setHasRefreshedPrices(true);
    setPriceRequestStartedAt(Date.now());
    try {
      const refreshedAt = new Date().toISOString();
      setPriceMap((prev) => {
        const next = { ...prev };
        Object.entries(quotes).forEach(([ticker, quote]) => {
          if (quote?.price != null) {
            next[ticker] = {
              price: Number(quote.price),
              source: quote.source || sourceLabel,
              updatedAt: quote.updatedAt || refreshedAt,
              originalSource: quote.source || sourceLabel,
            };
          }
        });
        return next;
      });
      const updatedRows = Object.entries(quotes)
        .filter(([, quote]) => quote?.price != null)
        .map(([ticker, quote]) => ({
          user_id: user.id,
          ticker,
          latest_price: Number(quote.price),
          latest_price_updated_at: quote.updatedAt || refreshedAt,
          latest_price_source: quote.source || sourceLabel,
        }));
      if (updatedRows.length > 0) {
        await sb.from('user_settings').upsert(
          updatedRows.map((row) => ({
            user_id: row.user_id,
            key: `latest_stock_price:${row.ticker}`,
            value: JSON.stringify({
              price: row.latest_price,
              updated_at: row.latest_price_updated_at,
              source: row.latest_price_source,
            }),
          })),
          { onConflict: 'user_id,key' }
        );
      }
      const loaded = Object.keys(quotes).length;
      const completedAt = new Date();
      setLastPriceRefreshAt(completedAt.toISOString());
      setPriceStatus(
        loaded > 0
          ? `${successPrefix} completed at ${completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : emptyMessage
      );
      showToast(
        loaded > 0
          ? `Loaded ${loaded} live price${loaded === 1 ? '' : 's'}`
          : 'Live prices unavailable — you can still type prices manually'
      );
    } catch (err) {
      setPriceStatus(`${failurePrefix}: ${err.message}`);
      showToast('Live price fetch failed — using fallback trade prices');
    }
    setPriceRequestStartedAt(null);
    setPriceLoading(false);
  };

  const refreshPrices = async () => {
    const tickers = deriveQuoteTickers(txns);
    if (tickers.length === 0) return;
    const modeMeta = FUTU_PRICE_MODE_META[futuPriceMode] || FUTU_PRICE_MODE_META.live;
    const modeLabel = modeMeta.label;
    setPriceStatus(`Requesting ${modeLabel} from Futu OpenD…`);
    await runFutuRefreshAction({
      requestType: FUTU_REQUEST_TYPES.prices,
      payload: { price_mode: futuPriceMode },
      queuedStatus: `Queued remote ${modeLabel} refresh for your Windows listener…`,
      queuedToast: 'Queued Futu price refresh. Your Windows machine will update prices when the listener is online.',
      localRunner: async () => {
        try {
          const res = await fetch(`${FUTU_BRIDGE_URL}/quotes?market=US&mode=${encodeURIComponent(futuPriceMode)}&tickers=${encodeURIComponent(tickers.join(','))}`);
          const json = await res.json();
          if (!res.ok) {
            throw new Error(json?.error || 'Futu request failed');
          }
          await persistQuotes(
            json?.quotes || {},
            modeMeta.source,
            'Last Futu refresh',
            'Futu returned no verified prices, using fallback trade prices',
            'Last Futu refresh failed'
          );
          const refreshedAt = new Date().toISOString();
          setLastFutuPriceRefreshAt(refreshedAt);
          await saveSettingValue('futu_prices_refreshed_at', refreshedAt);
          await loadFutuAccountSummary();
        } catch (err) {
          setPriceRequestStartedAt(null);
          setPriceLoading(false);
          setPriceStatus(`Last Futu refresh failed: ${err.message}`);
          showToast('Futu live price fetch failed — using fallback trade prices');
        }
      },
    });
  };

  const refreshPricesWithGrok = async () => {
    const tickers = deriveQuoteTickers(txns);
    if (tickers.length === 0) return;
    if (!xaiKey) {
      showToast('Set xAI API key in Finances tab settings first');
      return;
    }
    setPriceStatus('Requesting live prices from Grok…');
    setPriceLoading(true);
    setHasRefreshedPrices(true);
    setPriceRequestStartedAt(Date.now());
    try {
      const res = await fetch('/api/grok-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xaiApiKey: xaiKey,
          model: xaiModel,
          tickers,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Grok request failed');
      }
      await persistQuotes(
        json?.quotes || {},
        'Grok live search',
        'Last Grok refresh',
        'Grok returned no verified prices, using fallback trade prices',
        'Last Grok refresh failed'
      );
      const refreshedAt = new Date().toISOString();
      setLastGrokPriceRefreshAt(refreshedAt);
      await saveSettingValue('grok_prices_refreshed_at', refreshedAt);
    } catch (err) {
      setPriceRequestStartedAt(null);
      setPriceLoading(false);
      setPriceStatus(`Last Grok refresh failed: ${err.message}`);
      showToast('Grok live price fetch failed — using fallback trade prices');
    }
  };

  useEffect(() => {
    if (!priceLoading || !priceRequestStartedAt) return undefined;
    const interval = setInterval(() => {
      const seconds = Math.round((Date.now() - priceRequestStartedAt) / 1000);
      setPriceStatus(
        seconds < 10
          ? 'Request in progress…'
          : `Still fetching live prices… ${seconds}s elapsed`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [priceLoading, priceRequestStartedAt]);

  useEffect(() => {
    if (!settingsLoaded || loading || startupAutoRefreshRanRef.current) return undefined;
    startupAutoRefreshRanRef.current = true;
    if (!autoUpdateFutuOnStartup) return undefined;

    const runStartupRefresh = async () => {
      const hasLocalBridge = await checkLocalFutuBridge();
      if (hasLocalBridge) {
        await importFromFutu();
        await refreshPrices();
        await loadFutuAccountSummary();
        return;
      }
      await enqueueFutuRefreshRequest(FUTU_REQUEST_TYPES.fullSync, { price_mode: futuPriceMode, trigger: 'startup' });
      showToast('Queued remote Futu startup refresh. Your Windows machine will process it when online.');
    };

    runStartupRefresh();
    return undefined;
  }, [settingsLoaded, loading, autoUpdateFutuOnStartup, futuPriceMode]);

  useEffect(() => {
    checkLocalFutuBridge();
  }, []);

  useEffect(() => {
    const channel = sb
      .channel(`futu-refresh-requests-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'futu_refresh_requests',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const nextRow = payload.new || payload.old;
          if (!nextRow) return;
          await loadFutuRemoteRequests();

          const previousStatus = payload.old?.status || latestRemoteRequestStatusRef.current[nextRow.id];
          latestRemoteRequestStatusRef.current[nextRow.id] = nextRow.status;

          if ((nextRow.status === 'completed' || nextRow.status === 'failed') && previousStatus !== nextRow.status) {
            await Promise.all([load(), loadSettings()]);
            if (nextRow.status === 'completed') {
              if (nextRow.request_type === FUTU_REQUEST_TYPES.prices || nextRow.request_type === FUTU_REQUEST_TYPES.fullSync) {
                setPriceStatus(`Remote Futu refresh completed at ${new Date(nextRow.completed_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
              }
              showToast(`Remote Futu ${String(nextRow.request_type || '').replace('_', ' ')} completed`);
            } else {
              showToast(`Remote Futu ${String(nextRow.request_type || '').replace('_', ' ')} failed: ${nextRow.error || 'Unknown error'}`);
            }
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [user.id]);

  const latestRemoteRequestsByType = useMemo(() => {
    const next = {};
    futuRemoteRequests.forEach((request) => {
      if (!next[request.request_type]) next[request.request_type] = request;
    });
    return next;
  }, [futuRemoteRequests]);

  const formatRemoteRequestMeta = (requestType, refreshedAt, fallbackText) => {
    const request = latestRemoteRequestsByType[requestType];
    if (!request) return fallbackText;
    if (request.status === 'pending') return `Queued remotely ${new Date(request.requested_at).toLocaleString()}`;
    if (request.status === 'running') return `Running on Windows ${request.started_at ? new Date(request.started_at).toLocaleString() : ''}`.trim();
    if (request.status === 'failed') return `Last remote failure ${request.completed_at ? new Date(request.completed_at).toLocaleString() : ''}`.trim();
    if (request.completed_at) {
      const remoteCompletedAt = new Date(request.completed_at).getTime();
      const localCompletedAt = refreshedAt ? new Date(refreshedAt).getTime() : NaN;
      if (Number.isFinite(localCompletedAt) && localCompletedAt >= remoteCompletedAt) return fallbackText;
      return `Last remote run ${new Date(request.completed_at).toLocaleString()}`;
    }
    return fallbackText;
  };

  const saveTxn = async () => {
    const originalQty = newTxn.original_quantity ? Number(newTxn.original_quantity) : (newTxn.quantity ? Number(newTxn.quantity) : null);
    const split = newTxn.stock_split ? Number(newTxn.stock_split) : 1;
    const qty = originalQty != null ? originalQty * split : null;
    const px = newTxn.price ? Number(newTxn.price) : null;
    const type = newTxn.type;
    const row = {
      ...newTxn,
      user_id: user.id,
      sort_order: Date.now(),
      ticker: type === 'DEPOSIT' || type === 'WITHDRAWAL' ? '' : newTxn.ticker.trim().toUpperCase(),
      name:
        type === 'DEPOSIT'
          ? 'Cash deposit'
          : type === 'WITHDRAWAL'
          ? 'Cash withdrawal'
          : newTxn.name,
      quantity: type === 'DEPOSIT' || type === 'WITHDRAWAL' ? null : qty,
      original_quantity: type === 'DEPOSIT' || type === 'WITHDRAWAL' ? null : originalQty,
      stock_split: type === 'DEPOSIT' || type === 'WITHDRAWAL' ? 1 : split,
      price: type === 'DEPOSIT' || type === 'WITHDRAWAL' ? null : px,
      amount: newTxn.amount ? Number(newTxn.amount) : originalQty && px ? originalQty * px : null,
      tax_withheld: type === 'DIVIDEND' && newTxn.tax_withheld ? Number(newTxn.tax_withheld) : null,
      source: 'manual',
    };

    const { error } = await sb.from('securities_transactions').insert(row);
    if (error) {
      showToast('Error: ' + error.message);
      return;
    }
    showToast('Saved');
    setShowAdd(false);
    setNewTxn(EMPTY_TXN);
    load();
  };

  const deleteTxn = async (id) => {
    await sb.from('securities_transactions').delete().eq('id', id);
    setTxns((curr) => curr.filter((x) => x.id !== id));
    showToast('Deleted');
  };

  const parsePaste = async () => {
    if (!pasteText.trim()) return;
    if (!xaiKey) {
      showToast('xAI key not set — add it in Finances tab settings');
      return;
    }

    setPasteLoading(true);
    try {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${xaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [{
            role: 'user',
            content:
              `Parse this brokerage email or statement text and extract all securities transactions. ` +
              `Return a JSON array of objects with fields: transaction_date (YYYY-MM-DD), type (BUY|SELL|DIVIDEND), ` +
              `ticker, name, quantity (number or null), price (number or null), currency, amount (total number or null), ` +
              `tax_withheld (negative number or null for dividends only), account, order_ref. ` +
              `Only return the raw JSON array, no markdown.\n\n${pasteText}`,
          }],
          temperature: 0,
        }),
      });
      const json = await res.json();
      const raw = json.choices?.[0]?.message?.content || '[]';
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        parsed = match ? JSON.parse(match[1]) : [];
      }
      setPendingParsed(Array.isArray(parsed) ? parsed : [parsed]);
    } catch (e) {
      showToast('Parse error: ' + e.message);
    }
    setPasteLoading(false);
  };

  const saveParsed = async () => {
    const baseSortOrder = Date.now();
    const rows = pendingParsed.map((t, index) => ({
      ...t,
      user_id: user.id,
      sort_order: baseSortOrder + index,
      source: 'email',
      stock_split: t.stock_split ?? 1,
      original_quantity: t.original_quantity ?? t.quantity ?? null,
    }));
    const { error } = await sb.from('securities_transactions').insert(rows);
    if (error) {
      showToast('Error: ' + error.message);
      return;
    }
    showToast(`Saved ${rows.length} transaction${rows.length !== 1 ? 's' : ''}`);
    setPendingParsed(null);
    setPasteText('');
    setShowPaste(false);
    load();
  };

  const importFromFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseRawTransactionsCsv(text).map((row, index) => sanitizeImportedTransactionRow(row, user.id, index));
      if (rows.length === 0) {
        showToast('No raw transaction rows found in that CSV');
        setImporting(false);
        event.target.value = '';
        return;
      }
      await replaceTransactions(rows, `Imported ${rows.length} stored transaction row${rows.length === 1 ? '' : 's'} and replaced old data`);
    } catch (err) {
      showToast('Import error: ' + err.message);
    }

    setImporting(false);
    event.target.value = '';
  };

  const importFromFutu = async () => {
    setFutuImporting(true);
    await runFutuRefreshAction({
      requestType: FUTU_REQUEST_TYPES.transactions,
      payload: { trigger: 'manual' },
      queuedToast: 'Queued Futu transaction refresh. Your Windows machine will import new trades and dividends when the listener is online.',
      localRunner: async () => {
        try {
          const end = new Date().toISOString().slice(0, 10);
          const tradeStartDate = latestFutuTradeDate
            ? new Date(new Date(`${latestFutuTradeDate}T00:00:00`).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            : '2022-01-01';
          const dividendStartDate = latestFutuDividendDate
            ? new Date(new Date(`${latestFutuDividendDate}T00:00:00`).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            : latestFutuTradeDate
            ? new Date(new Date(`${latestFutuTradeDate}T00:00:00`).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            : new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

          const [tradeRes, dividendRes] = await Promise.all([
            fetch(`${FUTU_BRIDGE_URL}/history?start=${tradeStartDate}&end=${end}&market=US&trd_env=REAL`),
            fetch(`${FUTU_BRIDGE_URL}/dividends?start=${dividendStartDate}&end=${end}&market=US&trd_env=REAL`),
          ]);

          if (!tradeRes.ok) {
            const text = await tradeRes.text();
            throw new Error(text || 'Local Futu trade request failed');
          }
          if (!dividendRes.ok) {
            const text = await dividendRes.text();
            throw new Error(text || 'Local Futu dividend request failed');
          }

          const tradeJson = await tradeRes.json();
          const dividendJson = await dividendRes.json();
          const incomingRows = [...(tradeJson?.rows || []), ...(dividendJson?.rows || [])].map((row) => ({
            ...row,
            user_id: user.id,
          }));
          if (incomingRows.length === 0) {
            const refreshedAt = new Date().toISOString();
            setLastFutuTransactionsRefreshAt(refreshedAt);
            await saveSettingValue('futu_transactions_refreshed_at', refreshedAt);
            showToast('Futu bridge returned no new trades or dividends');
            setFutuImporting(false);
            return;
          }
          const existingKeys = new Set(txns.map(dedupeKeyForTxn));
          const newRows = incomingRows.filter((row) => !existingKeys.has(dedupeKeyForTxn(row)));
          if (newRows.length === 0) {
            const refreshedAt = new Date().toISOString();
            setLastFutuTransactionsRefreshAt(refreshedAt);
            await saveSettingValue('futu_transactions_refreshed_at', refreshedAt);
            showToast(`Futu sync is up to date through ${end}`);
            setFutuImporting(false);
            return;
          }
          for (let i = 0; i < newRows.length; i += 100) {
            const { error } = await sb.from('securities_transactions').insert(newRows.slice(i, i + 100));
            if (error) throw new Error(`Sync failed: ${error.message}`);
          }
          showToast(
            `Synced ${newRows.length} new Futu row${newRows.length === 1 ? '' : 's'} including trades/dividends (${tradeStartDate} to ${end})`
          );
          const refreshedAt = new Date().toISOString();
          setLastFutuTransactionsRefreshAt(refreshedAt);
          await saveSettingValue('futu_transactions_refreshed_at', refreshedAt);
          await load();
          setView('pnl');
          setPriceMap({});
          await loadFutuAccountSummary();
        } catch (err) {
          showToast(
            `Futu sync unavailable: ${err.message}. Start the local bridge with python scripts\\futu_bridge.py`
          );
        }
      },
    });
    setFutuImporting(false);
  };

  const exportToFile = () => {
    if (txns.length === 0) {
      showToast('No transactions to export');
      return;
    }
    const csv = exportRawTransactionsCsv(txns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions-raw-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported raw transactions CSV');
  };

  const exportPortfolioToFile = () => {
    const rows = sortedPnlRows.filter((row) => Number(row.shares || 0) > 0);
    if (rows.length === 0) {
      showToast('No open portfolio rows to export');
      return;
    }
    const csv = exportPortfolioSnapshotCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `portfolio-snapshot-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported portfolio snapshot CSV');
  };

  const s = {
    card: { background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', marginBottom: 10 },
    pill: (on) => ({
      padding: '4px 10px',
      borderRadius: 20,
      border: 'none',
      cursor: 'pointer',
      fontSize: 10,
      fontFamily: MONO,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      background: on ? '#1a1a1a' : '#f0f0ea',
      color: on ? '#fff' : '#1a1a1a',
    }),
    label: { fontSize: 10, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.4 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontFamily: MONO, fontSize: 12, background: '#fafaf8', outline: 'none' },
    btn: (primary) => ({
      padding: '8px 16px',
      borderRadius: 8,
      border: 'none',
      cursor: 'pointer',
      fontFamily: MONO,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: '0.04em',
      background: primary ? '#1a1a1a' : '#f0f0ea',
      color: primary ? '#fff' : '#1a1a1a',
      opacity: importing || priceLoading ? 0.8 : 1,
    }),
  };

  return (
    <div style={{ padding: `${embedded ? 8 : 16}px 16px 140px`, fontFamily: MONO }}>
      <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importFromFile} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: embedded ? 'flex-end' : 'space-between', marginBottom: showViewToggle ? 14 : 12, gap: 8 }}>
        {!embedded && (
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {activeView === 'pnl' ? 'P&L' : activeView === 'settings' ? 'Settings' : 'Transactions'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {activeView === 'settings' && (
            <button onClick={exportPortfolioToFile} style={s.btn(false)} disabled={sortedPnlRows.filter((row) => Number(row.shares || 0) > 0).length === 0}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Download size={12} />
                Export Portfolio CSV
              </span>
            </button>
          )}
          {activeView !== 'pnl' && activeView !== 'settings' && (
            <>
              <button onClick={() => setShowPaste(true)} style={s.btn(false)}>Paste</button>
              <button onClick={() => setShowAdd(true)} style={{ ...s.btn(true), display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={12} />
                Add
              </button>
            </>
          )}
        </div>
      </div>

      {showViewToggle && (
        <div style={{ marginBottom: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {[{ id: 'ledger', label: 'Transactions' }, { id: 'pnl', label: 'P&L' }, { id: 'settings', label: 'Settings' }].map((item) => (
            <button key={item.id} onClick={() => setView(item.id)} style={s.pill(activeView === item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      {activeView === 'settings' && (
        <>
          <div style={s.card}>
            <div style={{ ...s.label, marginBottom: 10 }}>Futu Tools</div>
            <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 10, lineHeight: 1.6 }}>
              Syncs with your local OpenD bridge on <strong>127.0.0.1:8765</strong>. On this Windows machine the actions run immediately; on Android or another device they queue a remote request for your Windows listener through Supabase Realtime.
            </div>
            <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 10 }}>
              {localFutuBridgeAvailable == null
                ? 'Checking whether the local Futu bridge is reachable from this device…'
                : localFutuBridgeAvailable
                ? 'Local bridge reachable on this device.'
                : 'Local bridge not reachable here. Refresh buttons will queue a remote request instead.'}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoUpdateFutuOnStartup}
                onChange={async (e) => {
                  const nextValue = e.target.checked;
                  setAutoUpdateFutuOnStartup(nextValue);
                  await saveSettingValue('futu_auto_update_on_startup', String(nextValue));
                }}
              />
              <span>Auto update Futu at startup</span>
            </label>
            <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 10 }}>
              When enabled, the app refreshes Futu transactions, Futu prices, and the Futu P&amp;L summary once after startup.
            </div>
            <div style={{ ...s.label, marginBottom: 4 }}>Latest Futu Trade In App</div>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}>{latestFutuTradeDate || 'No Futu transactions imported yet'}</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...s.label, marginBottom: 4 }}>Futu Price Mode</div>
              <select
                style={{ ...s.input, maxWidth: 220 }}
                value={futuPriceMode}
                onChange={async (e) => {
                  const nextValue = e.target.value;
                  setFutuPriceMode(nextValue);
                  await saveSettingValue('futu_price_mode', nextValue);
                }}
              >
                <option value="live">Live</option>
                <option value="market_close">Market Close</option>
                <option value="pre_price">Pre-Market</option>
                <option value="after_price">After-Hours</option>
                <option value="overnight_price">Overnight</option>
              </select>
              <div style={{ fontSize: 10, opacity: 0.45, marginTop: 4, lineHeight: 1.5 }}>
                `Live` uses `last_price`. `Market Close` uses daily K-line `close`. `Pre-Market`, `After-Hours`, and `Overnight` use the matching Futu quote fields.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <button onClick={importFromFutu} style={s.btn(false)} disabled={futuImporting || importing}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Upload size={12} />
                    {futuImporting ? 'Refreshing Transactions…' : 'Refresh Transactions'}
                  </span>
                </button>
                <div style={{ fontSize: 10, opacity: 0.45 }}>
                  {formatRemoteRequestMeta(
                    FUTU_REQUEST_TYPES.transactions,
                    lastFutuTransactionsRefreshAt,
                    lastFutuTransactionsRefreshAt ? `Last updated ${new Date(lastFutuTransactionsRefreshAt).toLocaleString()}` : 'Not refreshed yet'
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <button onClick={refreshPrices} style={s.btn(false)} disabled={priceLoading}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RefreshCw size={12} />
                    {priceLoading ? 'Refreshing…' : 'Refresh Futu Prices'}
                  </span>
                </button>
                <div style={{ fontSize: 10, opacity: 0.45 }}>
                  {formatRemoteRequestMeta(
                    FUTU_REQUEST_TYPES.prices,
                    lastFutuPriceRefreshAt,
                    lastFutuPriceRefreshAt ? `Last updated ${new Date(lastFutuPriceRefreshAt).toLocaleString()}` : 'Not refreshed yet'
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <button
                  onClick={() =>
                    runFutuRefreshAction({
                      requestType: FUTU_REQUEST_TYPES.summary,
                      payload: { trigger: 'manual' },
                      queuedToast: 'Queued Futu account summary refresh. Your Windows machine will update the broker snapshot when the listener is online.',
                      localRunner: loadFutuAccountSummary,
                    })
                  }
                  style={s.btn(false)}
                  disabled={futuSummaryLoading}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RefreshCw size={12} />
                    {futuSummaryLoading ? 'Refreshing Summary…' : 'Refresh Futu P&L'}
                  </span>
                </button>
                <div style={{ fontSize: 10, opacity: 0.45 }}>
                  {formatRemoteRequestMeta(
                    FUTU_REQUEST_TYPES.summary,
                    futuAccountSummary?.updated_at,
                    futuAccountSummary?.updated_at ? `Last updated ${new Date(futuAccountSummary.updated_at).toLocaleString()} · ${fmt(futuAccountSummary.open_positions, 0)} open positions` : 'Not refreshed yet'
                  )}
                </div>
                <div style={{ fontSize: 10, opacity: 0.45, maxWidth: 300, lineHeight: 1.5 }}>
                  Uses Futu account snapshot values from the local bridge (`market_val` and `pl_val` from positions). These may stay on market-close or broker reference pricing after hours even when live quotes refresh later.
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#fff7ed', color: '#9a3412', fontSize: 12, lineHeight: 1.6, fontWeight: 700 }}>
              Start `start_futu_bridge.bat` on your Windows computer first. That now launches both the local Futu bridge and the remote listener that processes queued Android refresh requests.
            </div>
          </div>

          <div style={s.card}>
            <div style={{ ...s.label, marginBottom: 10 }}>CSV Tools</div>
            <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 10, lineHeight: 1.6 }}>
              Use these when you want to manually edit data in a spreadsheet and import it back. These are separate from the Futu sync.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={exportToFile} style={s.btn(false)} disabled={txns.length === 0}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Download size={12} />
                  Export CSV
                </span>
              </button>
              <button onClick={() => importRef.current?.click()} style={s.btn(false)} disabled={importing}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Upload size={12} />
                  {importing ? 'Importing…' : 'Replace from CSV'}
                </span>
              </button>
            </div>
          </div>

          <div style={s.card}>
            <div style={{ ...s.label, marginBottom: 10 }}>Price Tools</div>
            <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 10, lineHeight: 1.6 }}>
              Refresh current prices for open positions on the P&amp;L page using Grok.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <button onClick={refreshPricesWithGrok} style={s.btn(false)} disabled={priceLoading || !xaiKey}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RefreshCw size={12} />
                    {priceLoading ? 'Refreshing…' : 'Refresh via Grok'}
                  </span>
                </button>
                <div style={{ fontSize: 10, opacity: 0.45 }}>
                  {lastGrokPriceRefreshAt ? `Last updated ${new Date(lastGrokPriceRefreshAt).toLocaleString()}` : 'Not refreshed yet'}
                </div>
              </div>
            </div>
          </div>

          <div style={s.card}>
            <div style={{ ...s.label, marginBottom: 10 }}>Formula Notes</div>
            <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.8 }}>
              <div>`Total Open Cost Basis = Sum of current open-position cost bases`</div>
              <div>`Total Market Value = Sum of current open-position market values`</div>
              <div>`Total Unrealised P&L = Total Market Value - Total Open Cost Basis`</div>
              <div>`Total P&L = Total Market Value + Total Realised P&L - Total Open Cost Basis`</div>
              <div>`Revised Total P&L = Total P&L + P&L From Old Stock Portfolio`</div>
              <div style={{ marginTop: 8 }}>`Futu Diluted Open Cost Basis = Buy Amount - Sell Amount` for the current open positions</div>
              <div>`Futu Unrealised P&L = Futu Market Value - Futu Diluted Open Cost Basis`</div>
            </div>
          </div>
        </>
      )}

      {activeView !== 'pnl' && activeView !== 'settings' && (
        <>
          <div style={{ ...s.card, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
            <div>
              <div style={{ ...s.label, marginBottom: 2 }}>Bought</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#16a34a', fontFamily: MONO }}>{fmt(buys)}</div>
            </div>
            <div>
              <div style={{ ...s.label, marginBottom: 2 }}>Sold</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#dc2626', fontFamily: MONO }}>{fmt(sells)}</div>
            </div>
            <div>
              <div style={{ ...s.label, marginBottom: 2 }}>Dividends</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#2563eb', fontFamily: MONO }}>{fmt(divs)}</div>
            </div>
            <div>
              <div style={{ ...s.label, marginBottom: 2 }}>Net Cash</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a', fontFamily: MONO }}>{fmt(deposits - withdrawals)}</div>
            </div>
          </div>

          <div style={{ marginBottom: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {filterAccounts.map((account) => (
              <button key={account} onClick={() => setAccountFilter(account)} style={s.pill(accountFilter === account)}>
                {account}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 14, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {typeOptions.map((type) => (
              <button key={type} onClick={() => setTypeFilter(type)} style={s.pill(typeFilter === type)}>
                {type}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', opacity: 0.35, padding: 40, fontSize: 12 }}>Loading…</div>
          ) : months.length === 0 ? (
            <div style={{ textAlign: 'center', opacity: 0.35, padding: 40, fontSize: 12 }}>No transactions</div>
          ) : months.map((month) => (
            <div key={month} style={s.card}>
              <div style={{ ...s.label, marginBottom: 10 }}>{month}</div>
              {grouped[month].map((t) => {
                const tc = TYPE_COLORS[t.type] || TYPE_COLORS.OTHER;
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid #f5f5f0' }}>
                    <div style={{ width: 72, flexShrink: 0 }}>
                      <div style={{ fontSize: 9, opacity: 0.4, fontFamily: MONO, letterSpacing: '0.02em' }}>{t.transaction_date?.slice(5)}</div>
                      <div style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: tc.bg, color: tc.text, fontFamily: MONO, fontWeight: 700, display: 'inline-block', marginTop: 2, letterSpacing: '0.04em' }}>
                        {t.type}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12 }}>{t.ticker || t.name || '—'}</span>
                        {t.ticker && t.name && t.name !== t.ticker && (
                          <span style={{ fontSize: 10, opacity: 0.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                        )}
                      </div>
                      {SECURITY_TYPES.has(t.type) && t.type !== 'DIVIDEND' && t.quantity != null && (
                        <div style={{ fontSize: 10, opacity: 0.45, fontFamily: MONO }}>
                          {splitFromRow(t) !== 1
                            ? `${fmt(originalQtyFromRow(t), 0)} x ${fmt(splitFromRow(t), 2)} = ${fmt(adjustedQtyFromRow(t), 0)} @ ${fmt(t.price, 2)}`
                            : `${fmt(adjustedQtyFromRow(t), 0)} @ ${fmt(t.price, 2)}`}
                        </div>
                      )}
                      {t.type === 'DIVIDEND' && t.tax_withheld != null && (
                        <div style={{ fontSize: 10, opacity: 0.45, fontFamily: MONO }}>tax {fmt(t.tax_withheld, 2)} {t.currency}</div>
                      )}
                      {CASH_TYPES.has(t.type) && t.notes && (
                        <div style={{ fontSize: 10, opacity: 0.45, fontFamily: MONO }}>{t.notes}</div>
                      )}
                      <div style={{ fontSize: 9, opacity: 0.3 }}>{t.account}{t.order_ref ? ` · ${t.order_ref}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12 }}>{t.currency} {fmt(Math.abs(t.amount || 0), 2)}</div>
                      <button onClick={() => deleteTxn(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.2, padding: '2px', marginTop: 2, display: 'block', marginLeft: 'auto' }}>
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}

      {activeView === 'pnl' && (
        <>
          {bankPnlRows.length > 0 && (
            <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
              <div style={{ ...s.card, padding: '14px 16px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Total</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                    <div>
                      <div style={{ ...s.label, marginBottom: 2 }}>Total Market Value</div>
                      <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: totalPnlSummary.marketValue >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.marketValue)}</div>
                    </div>
                    <div>
                      <div style={{ ...s.label, marginBottom: 2 }}>Total Cash</div>
                      <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: totalPnlSummary.cash >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.cash)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                    <div>
                      <div style={{ ...s.label, marginBottom: 2 }}>Total Unrealised P&amp;L</div>
                      <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: totalPnlSummary.unrealized >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.unrealized)}</div>
                    </div>
                    <div>
                      <div style={{ ...s.label, marginBottom: 2 }}>Total Realised P&amp;L</div>
                      <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: totalPnlSummary.realized >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.realized)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                    <div>
                      <div style={{ ...s.label, marginBottom: 2 }}>Total Futu Dividends</div>
                      <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: totalPnlSummary.futuDividends >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.futuDividends)}</div>
                    </div>
                    <div>
                      <div style={{ ...s.label, marginBottom: 2 }}>Total P&amp;L</div>
                      <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: totalPnlSummary.totalPnl >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.totalPnl)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                    <div />
                    <div>
                      <div style={{ ...s.label, marginBottom: 2 }}>Revised Total P&amp;L</div>
                      <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: totalPnlSummary.revisedTotalPnl >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.revisedTotalPnl)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {bankPnlRows.map((row) => (
                <div key={row.bank} style={{ ...s.card, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{row.bank}</span>
                    <span style={{ fontSize: 10, opacity: 0.45 }}>{fmt(row.openPositions, 0)} open position{row.openPositions === 1 ? '' : 's'}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {row.bank === 'Futubull' ? (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Total Market Value</div>
                            <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: row.marketValue >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.marketValue)}</div>
                          </div>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Futu API Market Value</div>
                            <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: (row.futuApiMarketValue ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                              {row.futuApiMarketValue == null ? '—' : `${row.futuApiCurrency} ${fmt(row.futuApiMarketValue, 2)}`}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '0 12px' }}>
                        <div style={{ ...s.label, marginBottom: 2 }}>Total Market Value</div>
                        <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: row.marketValue >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.marketValue)}</div>
                      </div>
                    )}

                    {row.bank === 'Futubull' && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Futu API Cash</div>
                            <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2 }}>
                              {row.futuApiCash == null ? '—' : `${row.futuApiCurrency} ${fmt(row.futuApiCash, 2)}`}
                            </div>
                          </div>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Futu API Total Assets</div>
                            <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2 }}>
                              {row.futuApiTotalAssets == null ? '—' : `${row.futuApiCurrency} ${fmt(row.futuApiTotalAssets, 2)}`}
                            </div>
                          </div>
                        </div>

                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <div style={{ ...s.label, marginBottom: 2 }}>Futu Derived Unrealised P&amp;L</div>
                              <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: row.futuUnrealizedPnl >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.futuUnrealizedPnl)}</div>
                            </div>
                            <div>
                              <div style={{ ...s.label, marginBottom: 2 }}>Futu API Total Position P&amp;L</div>
                              <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: (row.futuApiTotalPositionPnl ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                                {row.futuApiTotalPositionPnl == null ? '—' : `${row.futuApiCurrency} ${fmtSigned(row.futuApiTotalPositionPnl, 2)}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {row.bank === 'HSBC' && (
                      <div style={{ padding: '0 12px' }}>
                        <div style={{ ...s.label, marginBottom: 2 }}>USD</div>
                        <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2 }}>
                          {row.financeCashCurrency} {fmt(row.financeCash, 2)}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                      <div>
                        <div style={{ ...s.label, marginBottom: 2 }}>Total Unrealised P&amp;L</div>
                        <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: row.unrealized >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.unrealized)}</div>
                      </div>
                        <div>
                          <div style={{ ...s.label, marginBottom: 2 }}>Total Realised P&amp;L</div>
                          <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: row.realized >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.realized)}</div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                      <div>
                        <div style={{ ...s.label, marginBottom: 2 }}>Total Dividends</div>
                        <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: row.dividends >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.dividends)}</div>
                      </div>
                      <div>
                        <div style={{ ...s.label, marginBottom: 2 }}>Total P&amp;L</div>
                        <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.2, color: row.totalPnl >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.totalPnl)}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => setExpandedPnlBanks((curr) => ({ ...curr, [row.bank]: !curr[row.bank] }))}
                      style={{ ...s.btn(false), padding: '7px 12px', width: 'fit-content', marginLeft: 12 }}
                    >
                      {expandedPnlBanks[row.bank] ? 'Hide Details' : 'Show Details'}
                    </button>

                    {expandedPnlBanks[row.bank] && (
                      <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, display: 'grid', gap: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Cash In</div>
                            <div style={{ fontWeight: 700, fontSize: 12, color: '#2563eb' }}>{fmtSigned(row.cashIn)}</div>
                          </div>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Cash Out</div>
                            <div style={{ fontWeight: 700, fontSize: 12, color: '#b45309' }}>{fmtSigned(row.cashOut)}</div>
                          </div>
                        </div>

                        {row.bank === 'Futubull' ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <div style={{ ...s.label, marginBottom: 2 }}>Total Open Cost Basis</div>
                              <div style={{ fontWeight: 700, fontSize: 12, color: '#2563eb' }}>{fmtSigned(row.openCost)}</div>
                            </div>
                            <div>
                              <div style={{ ...s.label, marginBottom: 2 }}>Futu Derived Diluted Open Cost Basis</div>
                              <div style={{ fontWeight: 700, fontSize: 12, color: '#2563eb' }}>{fmtSigned(row.futuDilutedOpenCostBasis)}</div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Total Open Cost Basis</div>
                            <div style={{ fontWeight: 700, fontSize: 12, color: '#2563eb' }}>{fmtSigned(row.openCost)}</div>
                          </div>
                        )}

                        <div>
                          <div style={{ ...s.label, marginBottom: 4 }}>P&amp;L From Old Stock Portfolio</div>
                          <input
                            type="number"
                            value={oldPortfolioPnlByBank[row.bank] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setOldPortfolioPnlByBank((curr) => ({
                                ...curr,
                                [row.bank]: value === '' ? '' : Number(value),
                              }));
                            }}
                            onBlur={(e) => saveOldPortfolioPnl(row.bank, e.target.value)}
                            style={s.input}
                            placeholder="0"
                          />
                        </div>

                        <div>
                          <div style={{ ...s.label, marginBottom: 2 }}>Revised Total P&amp;L</div>
                          <div style={{ fontWeight: 700, fontSize: 12, color: row.revisedTotalPnl >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.revisedTotalPnl)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {priceStatus && (priceLoading || /failed/i.test(priceStatus)) && (
            <div style={{ ...s.card, background: '#f8fafc', color: '#334155', fontSize: 12, lineHeight: 1.6 }}>
              <div><strong>Status:</strong> {priceStatus || 'Idle'}</div>
            </div>
          )}

          {openPnlRows.length === 0 ? (
            <div style={{ textAlign: 'center', opacity: 0.35, padding: 40, fontSize: 12 }}>No securities to calculate</div>
          ) : (
            <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 12px 0' }}>
                <button onClick={() => scrollPnlTable(-1)} style={{ ...s.btn(false), padding: '5px 10px', minWidth: 0 }}>
                  ←
                </button>
                <button onClick={() => scrollPnlTable(1)} style={{ ...s.btn(false), padding: '5px 10px', minWidth: 0 }}>
                  →
                </button>
              </div>
              <div ref={pnlTableScrollRef} style={{ overflowX: 'auto', paddingTop: 8 }}>
                <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: 'max-content', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 58 }} />
                    <col style={{ width: 57 }} />
                    <col style={{ width: 46 }} />
                    <col style={{ width: 47 }} />
                    <col style={{ width: 44 }} />
                    <col style={{ width: 40 }} />
                    <col style={{ width: 44 }} />
                    <col style={{ width: 50 }} />
                    <col style={{ width: 36 }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: '#fafaf8' }}>
                      {[
                        { top: 'Stock', bottom: '', sortKey: 'ticker' },
                        { top: 'Market Value', bottom: 'Shares', sortKey: 'marketValue' },
                        { top: 'Price', bottom: 'Cost', sortKey: 'currentPrice' },
                        { top: 'Unrealised', bottom: '%', sortKey: 'unrealizedPnl' },
                        { top: 'Realised', bottom: '', sortKey: 'realizedPnl' },
                        { top: 'Total P&L', bottom: '%', sortKey: 'totalPnl' },
                        { top: 'Dividend', bottom: '', sortKey: 'dividends' },
                        { top: 'Cost', bottom: 'Basis', sortKey: 'investedCost' },
                        { top: '%', bottom: '', sortKey: 'portfolioPct' },
                      ].map((label, index) => (
                        <th
                          key={`${label.top}-${label.bottom}`}
                          style={{
                            ...s.label,
                            textAlign: 'left',
                            padding: '5px 4px',
                            borderBottom: '1px solid #ece7df',
                            fontSize: 10,
                            lineHeight: 1.2,
                            opacity: 1,
                            color: '#111827',
                            position: index === 0 ? 'sticky' : 'static',
                            left: index === 0 ? 0 : 'auto',
                            zIndex: index === 0 ? 3 : 1,
                            background: '#fafaf8',
                          }}
                        >
                          <button
                            onClick={() => togglePnlSort(label.sortKey)}
                            style={{
                              all: 'unset',
                              cursor: 'pointer',
                              display: 'grid',
                              gap: 2,
                              width: '100%',
                            }}
                          >
                            {label.bottom ? (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                  <span>{label.top}</span>
                                  <span style={{ opacity: pnlSort.key === label.sortKey ? 1 : 0.28 }}>
                                    {pnlSort.key === label.sortKey ? (pnlSort.direction === 'desc' ? '▼' : '▲') : '↕'}
                                  </span>
                                </div>
                                <div style={{ height: 1, background: '#d6d3d1', width: '100%' }} />
                                <div>{label.bottom}</div>
                              </>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                <span>{label.top}</span>
                                <span style={{ opacity: pnlSort.key === label.sortKey ? 1 : 0.28 }}>
                                  {pnlSort.key === label.sortKey ? (pnlSort.direction === 'desc' ? '▼' : '▲') : '↕'}
                                </span>
                              </div>
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPnlRows.map((row) => {
                      const totalPnlPct = row.totalPnlPct;
                      const unrealizedPct = row.unrealizedPct;
                      const portfolioPct = row.portfolioPct;
                      const totalPnlColor = row.totalPnl >= 0 ? '#16a34a' : '#dc2626';
                      const unrealizedColor = (row.unrealizedPnl || 0) >= 0 ? '#16a34a' : '#dc2626';
                      const realizedColor = row.realizedPnl >= 0 ? '#16a34a' : '#dc2626';
                      const isExpanded = expandedPnlTicker === row.ticker;
                      const bankBreakdownRows = pnlBreakdownByTicker.get(row.ticker) || [];
                      return (
                        <React.Fragment key={row.ticker}>
                          <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #f1ede5' }}>
                            <td
                              style={{
                                padding: '5px 4px',
                                verticalAlign: 'middle',
                                position: 'sticky',
                                left: 0,
                                background: '#fff',
                                zIndex: 2,
                                boxShadow: '8px 0 14px -12px rgba(15,23,42,0.22)',
                              }}
                            >
                              <button
                                onClick={() => togglePnlTickerBreakdown(row.ticker)}
                                style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 700, fontSize: 10, lineHeight: 1.15 }}>{row.ticker}</span>
                                  <span style={{ fontSize: 9, opacity: 0.4 }}>{isExpanded ? '▾' : '▸'}</span>
                                </div>
                                <div style={{ fontSize: 10, opacity: 0.45, marginTop: 2, lineHeight: 1.1, whiteSpace: 'pre-line' }}>
                                  {String(row.account || '')
                                    .replace(/Futu HK/g, 'Futu')
                                    .replace(/\s*\+\s*/g, '\n')
                                    .replace(/Futu\n/g, 'Futu ')}
                                </div>
                              </button>
                            </td>
                            <td style={{ padding: '5px 4px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 700, color: '#111827', lineHeight: 1.2, fontSize: 10, whiteSpace: 'nowrap' }}>{fmt(row.marketValue, 0)}</div>
                              <div style={{ marginTop: 2, fontSize: 10, opacity: 0.55, lineHeight: 1.1 }}>{fmt(row.shares, 0)}</div>
                            </td>
                            <td style={{ padding: '5px 4px', verticalAlign: 'middle' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={Object.prototype.hasOwnProperty.call(manualPriceDrafts, row.ticker) ? manualPriceDrafts[row.ticker] : (row.currentPrice ?? '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setManualPriceDrafts((prev) => ({
                                    ...prev,
                                    [row.ticker]: val,
                                  }));
                                }}
                                onBlur={async () => {
                                  const draftValue = Object.prototype.hasOwnProperty.call(manualPriceDrafts, row.ticker)
                                    ? manualPriceDrafts[row.ticker]
                                    : String(row.currentPrice ?? '');
                                  await persistManualPrice(row.ticker, draftValue);
                                  setManualPriceDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[row.ticker];
                                    return next;
                                  });
                                }}
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                  if (e.key === 'Escape') {
                                    setManualPriceDrafts((prev) => {
                                      const next = { ...prev };
                                      delete next[row.ticker];
                                      return next;
                                    });
                                    e.currentTarget.blur();
                                  }
                                }}
                                style={{ ...s.input, width: '40%', minWidth: 40, maxWidth: 54, padding: '3px 5px', height: 'auto', fontSize: 10 }}
                              />
                              <div style={{ marginTop: 2, fontSize: 10, opacity: 0.55, lineHeight: 1.1 }}>{fmt(row.avgCost, 2)}</div>
                            </td>
                            <td style={{ padding: '5px 4px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 700, color: unrealizedColor, lineHeight: 1.1, fontSize: 10 }}>{fmtSigned(row.unrealizedPnl, 0)}</div>
                              <div style={{ marginTop: 2, fontSize: 10, color: unrealizedColor, lineHeight: 1.1 }}>{fmtPct(unrealizedPct, 2)}</div>
                            </td>
                            <td style={{ padding: '5px 4px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 700, color: realizedColor, lineHeight: 1.1, fontSize: 10 }}>{fmtSigned(row.realizedPnl, 0)}</div>
                            </td>
                            <td style={{ padding: '5px 4px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 700, color: totalPnlColor, lineHeight: 1.1, fontSize: 10 }}>{fmtSigned(row.totalPnl, 0)}</div>
                              <div style={{ marginTop: 2, fontSize: 10, color: totalPnlColor, lineHeight: 1.1 }}>{fmtPct(totalPnlPct, 2)}</div>
                            </td>
                            <td style={{ padding: '5px 4px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 700, color: (row.dividends || 0) >= 0 ? '#16a34a' : '#dc2626', lineHeight: 1.1, fontSize: 10 }}>
                                {fmtSigned(row.dividends, 0)}
                              </div>
                            </td>
                            <td style={{ padding: '5px 4px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 700, color: '#111827', lineHeight: 1.1, fontSize: 10, whiteSpace: 'nowrap' }}>
                                {fmt(row.investedCost, 0)}
                              </div>
                            </td>
                            <td style={{ padding: '5px 4px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 700, lineHeight: 1.1, fontSize: 10 }}>{fmtPct(portfolioPct, 2)}</div>
                            </td>
                          </tr>
                          {isExpanded && bankBreakdownRows.length > 0 && (
                            <tr style={{ borderBottom: '1px solid #f1ede5', background: '#fcfbf7' }}>
                              <td colSpan={9} style={{ padding: '8px 10px 10px' }}>
                                <div style={{ display: 'grid', gap: 6 }}>
                                  {bankBreakdownRows.map((bankRow) => {
                                    const bankTotalPnlColor = bankRow.totalPnl >= 0 ? '#16a34a' : '#dc2626';
                                    const bankUnrealizedColor = (bankRow.unrealizedPnl || 0) >= 0 ? '#16a34a' : '#dc2626';
                                    const bankRealizedColor = bankRow.realizedPnl >= 0 ? '#16a34a' : '#dc2626';
                                    return (
                                      <div
                                        key={bankRow.key}
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: 'minmax(84px, 1.2fr) repeat(6, minmax(0, 1fr))',
                                          gap: 8,
                                          alignItems: 'center',
                                          padding: '8px 10px',
                                          borderRadius: 10,
                                          background: '#fff',
                                          border: '1px solid #ece7df',
                                        }}
                                      >
                                        <div>
                                          <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 2 }}>Bank</div>
                                          <div style={{ fontSize: 10, fontWeight: 700 }}>{String(bankRow.account || '').replace(/Futu HK/g, 'Futu')}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 2 }}>Mkt / Shares</div>
                                          <div style={{ fontSize: 10 }}>{fmt(bankRow.marketValue, 0)}</div>
                                          <div style={{ fontSize: 10, opacity: 0.55 }}>{fmt(bankRow.shares, 0)}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 2 }}>Price / Cost</div>
                                          <div style={{ fontSize: 10 }}>{fmt(bankRow.currentPrice, 2)}</div>
                                          <div style={{ fontSize: 10, opacity: 0.55 }}>{fmt(bankRow.avgCost, 2)}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 2 }}>Unreal.</div>
                                          <div style={{ fontSize: 10, color: bankUnrealizedColor }}>{fmtSigned(bankRow.unrealizedPnl, 0)}</div>
                                          <div style={{ fontSize: 10, color: bankUnrealizedColor, opacity: 0.75 }}>{fmtPct(bankRow.unrealizedPct, 2)}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 2 }}>Realised</div>
                                          <div style={{ fontSize: 10, color: bankRealizedColor }}>{fmtSigned(bankRow.realizedPnl, 0)}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 2 }}>Total P&L</div>
                                          <div style={{ fontSize: 10, color: bankTotalPnlColor }}>{fmtSigned(bankRow.totalPnl, 0)}</div>
                                          <div style={{ fontSize: 10, color: bankTotalPnlColor, opacity: 0.75 }}>{fmtPct(bankRow.totalPnlPct, 2)}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 2 }}>Div / Cost</div>
                                          <div style={{ fontSize: 10 }}>{fmtSigned(bankRow.dividends, 0)}</div>
                                          <div style={{ fontSize: 10, opacity: 0.55 }}>{fmt(bankRow.investedCost, 0)}</div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Add Transaction</div>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ ...s.label, marginBottom: 4 }}>Date</div>
                <input type="date" style={s.input} value={newTxn.transaction_date} onChange={(e) => setNewTxn((prev) => ({ ...prev, transaction_date: e.target.value }))} />
              </div>
              <div>
                <div style={{ ...s.label, marginBottom: 4 }}>Type</div>
                <select style={s.input} value={newTxn.type} onChange={(e) => setNewTxn((prev) => ({ ...prev, type: e.target.value }))}>
                  {TYPE_ORDER.map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <div style={{ ...s.label, marginBottom: 4 }}>Account</div>
                <input style={s.input} value={newTxn.account} onChange={(e) => setNewTxn((prev) => ({ ...prev, account: e.target.value }))} placeholder="HSBC" />
              </div>
              {!CASH_TYPES.has(newTxn.type) && (
                <>
                  <div>
                    <div style={{ ...s.label, marginBottom: 4 }}>Ticker</div>
                    <input style={s.input} value={newTxn.ticker} onChange={(e) => setNewTxn((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))} placeholder="NVDA" />
                  </div>
                  <div>
                    <div style={{ ...s.label, marginBottom: 4 }}>Currency</div>
                    <select style={s.input} value={newTxn.currency} onChange={(e) => setNewTxn((prev) => ({ ...prev, currency: e.target.value }))}>
                      {['USD', 'HKD', 'AUD', 'CNY', 'THB'].map((currency) => <option key={currency}>{currency}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <div style={{ ...s.label, marginBottom: 4 }}>Name</div>
                    <input style={s.input} value={newTxn.name} onChange={(e) => setNewTxn((prev) => ({ ...prev, name: e.target.value }))} placeholder="NVIDIA CORP" />
                  </div>
                </>
              )}
              {(newTxn.type === 'BUY' || newTxn.type === 'SELL' || newTxn.type === 'OTHER') && (
                <>
                  <div>
                    <div style={{ ...s.label, marginBottom: 4 }}>Stock Unit</div>
                    <input type="number" style={s.input} value={newTxn.original_quantity} onChange={(e) => setNewTxn((prev) => ({ ...prev, original_quantity: e.target.value, quantity: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ ...s.label, marginBottom: 4 }}>Stock Split</div>
                    <input type="number" step="0.01" style={s.input} value={newTxn.stock_split} onChange={(e) => setNewTxn((prev) => ({ ...prev, stock_split: e.target.value || '1' }))} />
                  </div>
                  <div>
                    <div style={{ ...s.label, marginBottom: 4 }}>Price</div>
                    <input type="number" step="0.01" style={s.input} value={newTxn.price} onChange={(e) => setNewTxn((prev) => ({ ...prev, price: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ ...s.label, marginBottom: 4 }}>Adjusted Unit</div>
                    <div style={{ ...s.input, display: 'flex', alignItems: 'center' }}>
                      {fmt((Number(newTxn.original_quantity || 0) || 0) * (Number(newTxn.stock_split || 1) || 1), 2)}
                    </div>
                  </div>
                </>
              )}
              <div style={{ gridColumn: newTxn.type === 'DIVIDEND' ? '1' : '1/-1' }}>
                <div style={{ ...s.label, marginBottom: 4 }}>
                  {newTxn.type === 'DIVIDEND' ? 'Dividend Amount' : newTxn.type === 'DEPOSIT' ? 'Deposit Amount' : newTxn.type === 'WITHDRAWAL' ? 'Withdrawal Amount' : 'Total Amount'}
                </div>
                <input type="number" step="0.01" style={s.input} value={newTxn.amount} onChange={(e) => setNewTxn((prev) => ({ ...prev, amount: e.target.value }))} />
              </div>
              {newTxn.type === 'DIVIDEND' && (
                <div>
                  <div style={{ ...s.label, marginBottom: 4 }}>Tax Withheld</div>
                  <input type="number" step="0.01" style={s.input} value={newTxn.tax_withheld} onChange={(e) => setNewTxn((prev) => ({ ...prev, tax_withheld: e.target.value }))} placeholder="-43.68" />
                </div>
              )}
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ ...s.label, marginBottom: 4 }}>Notes</div>
                <input style={s.input} value={newTxn.notes} onChange={(e) => setNewTxn((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional note" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowAdd(false)} style={{ ...s.btn(false), flex: 1 }}>Cancel</button>
              <button onClick={saveTxn} style={{ ...s.btn(true), flex: 1 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showPaste && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Paste Email / Statement</div>
              <button
                onClick={() => {
                  setShowPaste(false);
                  setPendingParsed(null);
                  setPasteText('');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {!pendingParsed ? (
              <>
                <textarea style={{ ...s.input, height: 180, resize: 'vertical' }} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste brokerage email or statement text here…" />
                <div style={{ fontSize: 10, opacity: 0.4, marginTop: 4, marginBottom: 12 }}>
                  Grok AI will extract transaction details automatically.
                  {!xaiKey && ' Set your xAI key in Finances tab first.'}
                </div>
                <button onClick={parsePaste} disabled={pasteLoading || !pasteText.trim()} style={{ ...s.btn(true), width: '100%', opacity: !pasteText.trim() || pasteLoading ? 0.5 : 1 }}>
                  {pasteLoading ? 'Parsing…' : 'Parse with AI'}
                </button>
              </>
            ) : (
              <>
                <div style={{ ...s.label, marginBottom: 8 }}>Review — {pendingParsed.length} transaction{pendingParsed.length !== 1 ? 's' : ''} found</div>
                {pendingParsed.map((t, i) => {
                  const tc = TYPE_COLORS[t.type] || TYPE_COLORS.OTHER;
                  return (
                    <div key={i} style={{ background: '#fafaf8', borderRadius: 8, padding: '8px 10px', marginBottom: 6, fontSize: 12, fontFamily: MONO }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ padding: '1px 5px', borderRadius: 4, background: tc.bg, color: tc.text, fontSize: 9, fontWeight: 700 }}>{t.type}</span>
                        <strong>{t.ticker}</strong>
                        <span style={{ opacity: 0.5, fontSize: 10 }}>{t.name}</span>
                      </div>
                      <div style={{ opacity: 0.5, fontSize: 10 }}>
                        {t.transaction_date}
                        {t.quantity != null ? ` · ${fmt(t.quantity, 0)} @ ${fmt(t.price, 2)}` : ''}
                        {` · ${t.currency} ${fmt(t.amount)}`}
                        {t.account ? ` · ${t.account}` : ''}
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setPendingParsed(null)} style={{ ...s.btn(false), flex: 1 }}>Back</button>
                  <button onClick={saveParsed} style={{ ...s.btn(true), flex: 1 }}>Save {pendingParsed.length} Txn{pendingParsed.length !== 1 ? 's' : ''}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
