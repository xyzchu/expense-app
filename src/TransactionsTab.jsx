import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Upload, RefreshCw, X, Download, Settings } from 'lucide-react';

import { MONO, FS, FW, CLAY } from './theme';
import {
  DataTableCard,
  DataTableHeaderLabel,
  UI,
  UnifiedDataTable,
  tableCellStyle,
  tableColumnStyle,
  tableHeaderCellStyle,
  tableHeaderRowStyle,
  tableRowStyle,
  tableStyle,
} from './ui';
const TYPE_ORDER = ['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'OTHER'];
const CASH_TYPES = new Set(['DEPOSIT', 'WITHDRAWAL']);
const SECURITY_TYPES = new Set(['BUY', 'SELL', 'DIVIDEND']);
const FUTU_BRIDGE_URL = 'http://127.0.0.1:8765';
const FUTU_PNL_TIME_ZONE = 'America/New_York';
const FUTU_PNL_TIME_ZONE_LABEL = 'US/Eastern';
const LOCAL_REFERENCE_TIME_ZONE = 'Australia/Brisbane';
const LOCAL_REFERENCE_TIME_ZONE_LABEL = 'Brisbane';
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
const PNL_SORT_OPTIONS = [
  { key: 'portfolioPct', label: 'Portfolio %' },
  { key: 'marketValue', label: 'Market value' },
  { key: 'ticker', label: 'Stock' },
  { key: 'currentPrice', label: 'Price' },
  { key: 'unrealizedPnl', label: 'Unrealised P&L' },
  { key: 'realizedPnl', label: 'Realised P&L' },
  { key: 'totalPnl', label: 'Total P&L' },
  { key: 'dividends', label: 'Dividend' },
  { key: 'investedCost', label: 'Cost basis' },
];

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

const roundsToZero = (v, dec = 0) => Math.abs(Number(v) || 0) < (0.5 / Math.pow(10, dec));

const fmtSigned = (v, dec = 0) =>
  v == null || Number.isNaN(Number(v))
    ? '—'
    : roundsToZero(v, dec)
    ? fmt(0, dec)
    : `${Number(v) >= 0 ? '+' : '-'}${fmt(Math.abs(Number(v)), dec)}`;

const fmtPct = (v, dec = 2) =>
  v == null || Number.isNaN(Number(v))
    ? '—'
    : roundsToZero(v, dec)
    ? `${fmt(0, dec)}%`
    : `${Number(v) >= 0 ? '+' : '-'}${fmt(Math.abs(Number(v)), dec)}%`;

const fmtInputPrice = (v) =>
  v == null || Number.isNaN(Number(v))
    ? ''
    : Number(v).toFixed(2);

const isoDate = (date = new Date()) => {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
};
const padTimePart = (value) => String(value).padStart(2, '0');
const zonedParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
  };
};
const zonedIsoDate = (date = new Date(), timeZone = FUTU_PNL_TIME_ZONE) => {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${padTimePart(parts.month)}-${padTimePart(parts.day)}`;
};
const wallClockDeltaMinutes = (fromTimeZone, toTimeZone, date = new Date()) => {
  const from = zonedParts(date, fromTimeZone);
  const to = zonedParts(date, toTimeZone);
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day, from.hour, from.minute);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day, to.hour, to.minute);
  return Math.round((toUtc - fromUtc) / 60000);
};
const describeFutuPnlRefreshTime = (time) => {
  if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return '';
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + wallClockDeltaMinutes(FUTU_PNL_TIME_ZONE, LOCAL_REFERENCE_TIME_ZONE);
  const dayOffset = Math.floor(total / 1440);
  const localMinutes = ((total % 1440) + 1440) % 1440;
  const localTime = `${padTimePart(Math.floor(localMinutes / 60))}:${padTimePart(localMinutes % 60)}`;
  const dayText = dayOffset > 0 ? ' next day' : dayOffset < 0 ? ' previous day' : '';
  return `${time} ${FUTU_PNL_TIME_ZONE_LABEL} = ${localTime} ${LOCAL_REFERENCE_TIME_ZONE_LABEL}${dayText}`;
};
const monthKeyFromDate = (value) => String(value || '').slice(0, 7);
const previousMonthKey = (monthKey) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return '';
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
};
const previousYearEndMonthKey = (dateStr) => `${Number(String(dateStr || isoDate()).slice(0, 4)) - 1}-12`;

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

function buildTotalPnlSnapshot(transactions, snapshotDate, quoteMap) {
  if (!snapshotDate || !quoteMap) return null;
  const securityTxns = transactions
    .filter((txn) => txn.ticker && SECURITY_TYPES.has(txn.type))
    .filter((txn) => String(txn.transaction_date || '') <= snapshotDate)
    .slice()
    .sort(compareTxnOrder);

  const positions = new Map();
  for (const txn of securityTxns) {
    const ticker = String(txn.ticker || '').trim().toUpperCase();
    if (!positions.has(ticker)) {
      positions.set(ticker, { shares: 0, avgCost: 0, realizedPnl: 0, dividends: 0 });
    }
    const row = positions.get(ticker);
    const qty = Number(txn.quantity || 0);
    const amount = Number(txn.amount || 0);
    if (txn.type === 'BUY' && qty > 0) {
      const currentCost = row.shares * row.avgCost;
      row.shares += qty;
      row.avgCost = row.shares > 0 ? (currentCost + amount) / row.shares : 0;
    } else if (txn.type === 'SELL' && qty > 0) {
      const costBasis = row.avgCost * qty;
      row.realizedPnl += amount - costBasis;
      row.shares = Math.max(0, row.shares - qty);
      if (row.shares === 0) row.avgCost = 0;
    } else if (txn.type === 'DIVIDEND') {
      row.dividends += amount;
    }
  }

  return [...positions.entries()].reduce((acc, [ticker, row]) => {
    const price = Number(quoteMap[ticker] || 0);
    const unrealized = row.shares * (price - row.avgCost);
    acc.marketValue += row.shares * price;
    acc.unrealized += unrealized;
    acc.realized += row.realizedPnl;
    acc.dividends += row.dividends;
    acc.totalPnl += unrealized + row.realizedPnl + row.dividends;
    return acc;
  }, { marketValue: 0, unrealized: 0, realized: 0, dividends: 0, totalPnl: 0 });
}

function latestQuoteDateForRows(rows, fallbackDate) {
  return (rows || [])
    .map((row) => row.quote_date)
    .filter(Boolean)
    .sort()
    .at(-1) || fallbackDate;
}

function adjustedPeriodCapitalBase(transactions, snapshotDate, endDate, snapshotMarketValue) {
  if (!snapshotDate || !endDate) return Math.abs(Number(snapshotMarketValue || 0));

  const netSecurityFlows = transactions
    .filter((txn) => txn.type === 'BUY' || txn.type === 'SELL')
    .filter((txn) => {
      const date = String(txn.transaction_date || '');
      return date > snapshotDate && date <= endDate;
    })
    .reduce((sum, txn) => {
      const amount = Math.abs(Number(txn.amount || 0));
      return sum + (txn.type === 'BUY' ? amount : -amount);
    }, 0);

  return Math.abs(Number(snapshotMarketValue || 0)) + netSecurityFlows;
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
  sendNotification,
  forcedView = null,
  showViewToggle = true,
  embedded = false,
  hidePnlTable = false,
  pnlTableOnly = false,
}) {
  const [txns, setTxns] = useState([]);
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [financialSnapshots, setFinancialSnapshots] = useState([]);
  const [monthlyQuotes, setMonthlyQuotes] = useState([]);
  const [dailyQuotes, setDailyQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accountFilter, setAccountFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [tickerFilter, setTickerFilter] = useState('All');
  const [view, setView] = useState('pnl');
  const [showAdd, setShowAdd] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pendingParsed, setPendingParsed] = useState(null);
  const [xaiKey, setXaiKey] = useState('');
  const [xaiModel, setXaiModel] = useState('grok-4-1-fast-reasoning');
  const [newTxn, setNewTxn] = useState(EMPTY_TXN);
  const [editingTxnId, setEditingTxnId] = useState(null);
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
  const [showFutuUnrealisedBreakdown, setShowFutuUnrealisedBreakdown] = useState(false);
  const [expandedPnlTicker, setExpandedPnlTicker] = useState(null);
  const [pnlSort, setPnlSort] = useState({ key: 'portfolioPct', direction: 'desc' });
  const [txnSort, setTxnSort] = useState({ key: 'transaction_date', direction: 'desc' });
  const [showPnlSettings, setShowPnlSettings] = useState(false);
  const [autoUpdateFutuOnStartup, setAutoUpdateFutuOnStartup] = useState(false);
  const [pnlAutoRefreshTime, setPnlAutoRefreshTime] = useState('');
  const [pnlAutoRefreshTimeDraft, setPnlAutoRefreshTimeDraft] = useState('');
  const [pnlRefreshing, setPnlRefreshing] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const importRef = useRef(null);
  const startupAutoRefreshRanRef = useRef(false);
  const latestRemoteRequestStatusRef = useRef({});
  const manualPnlRequestIdsRef = useRef(new Set());
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
    const [{ data: txnData }, { data: accData }, { data: snapData }, { data: monthlyQuoteData }, { data: dailyQuoteData }] = await Promise.all([
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
      sb
        .from('securities_monthly_quotes')
        .select('*')
        .eq('user_id', user.id)
        .order('month_key', { ascending: false }),
      sb
        .from('securities_daily_quotes')
        .select('*')
        .eq('user_id', user.id)
        .order('quote_date', { ascending: false })
        .limit(1000),
    ]);
    setTxns(txnData || []);
    setFinancialAccounts(accData || []);
    setFinancialSnapshots(snapData || []);
    setMonthlyQuotes(monthlyQuoteData || []);
    setDailyQuotes(dailyQuoteData || []);
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
    const pnlAutoRefreshRow = (data || []).find((row) => row.key === 'pnl_auto_refresh_time');
    if (pnlAutoRefreshRow?.value) {
      setPnlAutoRefreshTime(pnlAutoRefreshRow.value);
      setPnlAutoRefreshTimeDraft(pnlAutoRefreshRow.value);
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

  const tickerOptions = useMemo(
    () => ['All', ...[...new Set(txns.map((t) => t.ticker).filter(Boolean))].sort()],
    [txns]
  );

  const filtered = useMemo(
    () =>
      txns.filter((t) => {
        if (accountFilter !== 'All' && t.account !== accountFilter) return false;
        if (typeFilter !== 'All' && t.type !== typeFilter) return false;
        if (tickerFilter !== 'All' && t.ticker !== tickerFilter) return false;
        return true;
      }),
    [txns, accountFilter, typeFilter, tickerFilter]
  );

  const toggleTxnSort = (key) => {
    setTxnSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: key === 'transaction_date' ? 'desc' : 'asc' }
    );
  };

  const sortedFiltered = useMemo(() => {
    const valueFor = (row, key) => {
      if (key === 'quantity') return adjustedQtyFromRow(row);
      if (key === 'amount') return Math.abs(Number(row.amount || 0));
      return row[key];
    };
    const direction = txnSort.direction === 'desc' ? -1 : 1;
    return filtered.slice().sort((a, b) => {
      const av = valueFor(a, txnSort.key);
      const bv = valueFor(b, txnSort.key);
      if (typeof av === 'number' || typeof bv === 'number') {
        return ((Number(av || 0) - Number(bv || 0)) * direction) || compareTxnOrder(a, b);
      }
      return String(av || '').localeCompare(String(bv || '')) * direction || compareTxnOrder(a, b);
    });
  }, [filtered, txnSort]);

  const grouped = useMemo(() => {
    const map = {};
    sortedFiltered.forEach((t) => {
      const month = t.transaction_date?.slice(0, 7) || 'Unknown';
      if (!map[month]) map[month] = [];
      map[month].push(t);
    });
    return map;
  }, [sortedFiltered]);

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
        row.dividends += amount; // tax_withheld is stored negative; use gross Cash Dividend only
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

  const pnlSortLabel = PNL_SORT_OPTIONS.find((option) => option.key === pnlSort.key)?.label || pnlSort.key;

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
          return sum + (position.investedCost || 0);
        }, 0);
        const futuUnrealizedPnl = futuRowsForBank.reduce((sum, position) => {
          const marketValue = position.marketValue || 0;
          const netOpenCost = position.investedCost || 0; // shares × avgCost = actual cost basis of remaining shares
          const dividends = position.dividends || 0;
          return sum + (marketValue - (netOpenCost - dividends));
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
      acc.cashInvested += (row.cashIn || 0) - (row.cashOut || 0);
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
      cashInvested: 0,
    });
  }, [bankPnlRows]);

  const periodPnlSummary = useMemo(() => {
    const todayStr = zonedIsoDate(new Date(), FUTU_PNL_TIME_ZONE);
    const currentTotal = totalPnlSummary.totalPnl || 0;

    const quoteMapForRows = (rows) => Object.fromEntries(
      (rows || [])
        .filter((row) => row.ticker && row.price != null)
        .map((row) => [String(row.ticker).toUpperCase(), Number(row.price)])
    );

    const dailyDates = [...new Set(
      dailyQuotes
        .map((row) => row.quote_date)
        .filter((date) => date && date < todayStr)
    )].sort().reverse();
    const previousDate = dailyDates[0] || '';
    const previousQuoteMap = previousDate
      ? quoteMapForRows(dailyQuotes.filter((row) => row.quote_date === previousDate))
      : {};
    const previousSnapshot = previousDate
      ? buildTotalPnlSnapshot(
        txns,
        previousDate,
        previousQuoteMap
      )
      : null;
    const priorDate = dailyDates.find((date) => date < previousDate) || '';
    const priorRows = priorDate ? dailyQuotes.filter((row) => row.quote_date === priorDate) : [];
    const priorSnapshot = priorRows.length
      ? buildTotalPnlSnapshot(txns, priorDate, quoteMapForRows(priorRows))
      : null;

    const currentMonth = monthKeyFromDate(todayStr);
    const mtdMonth = previousMonthKey(currentMonth);
    const mtdRows = monthlyQuotes.filter((row) => row.month_key === mtdMonth);
    const mtdSnapshotDate = latestQuoteDateForRows(mtdRows, `${mtdMonth}-28`);
    const mtdSnapshot = mtdRows.length
      ? buildTotalPnlSnapshot(txns, mtdSnapshotDate, quoteMapForRows(mtdRows))
      : null;

    const ytdMonth = previousYearEndMonthKey(todayStr);
    const ytdRows = monthlyQuotes.filter((row) => row.month_key === ytdMonth);
    const ytdSnapshotDate = latestQuoteDateForRows(ytdRows, `${ytdMonth}-31`);
    const ytdSnapshot = ytdRows.length
      ? buildTotalPnlSnapshot(txns, ytdSnapshotDate, quoteMapForRows(ytdRows))
      : null;

    const livePricesMatchPreviousClose = () => {
      const comparable = Object.entries(previousQuoteMap)
        .map(([ticker, previousPrice]) => {
          const current = priceMap[ticker];
          return {
            ticker,
            previousPrice: Number(previousPrice),
            currentPrice: Number(current?.price),
            updatedAt: String(current?.updatedAt || ''),
            source: String(current?.source || current?.originalSource || ''),
          };
        })
        .filter((row) => Number.isFinite(row.previousPrice) && Number.isFinite(row.currentPrice));
      if (comparable.length < 3) return false;
      const matching = comparable.filter((row) => Math.abs(row.currentPrice - row.previousPrice) < 0.005);
      const closeLike = matching.filter((row) => {
        const lowerSource = row.source.toLowerCase();
        const timeOnlyClose = /^16:00(?::00)?/.test(row.updatedAt);
        return lowerSource.includes('last price') && timeOnlyClose;
      });
      return matching.length === comparable.length && closeLike.length >= Math.max(3, Math.floor(comparable.length * 0.8));
    };

    const makeMetric = (label, anchorLabel, snapshot, snapshotDate, options = {}) => {
      const total = options.currentTotalOverride ?? currentTotal;
      const value = snapshot ? total - snapshot.totalPnl : null;
      const capitalBase = adjustedPeriodCapitalBase(txns, snapshotDate, todayStr, snapshot?.marketValue || 0);
      return {
        label,
        anchorLabel,
        value,
        pct: value != null && capitalBase > 0 ? (value / capitalBase) * 100 : null,
      };
    };

    const currentLooksLikeLatestClose = previousDate && livePricesMatchPreviousClose();
    const dailyMetric = currentLooksLikeLatestClose
      ? makeMetric('Daily P&L', priorDate ? `vs ${priorDate}` : 'prior close missing', priorSnapshot, priorDate, {
        currentTotalOverride: previousSnapshot?.totalPnl,
      })
      : makeMetric('Daily P&L', previousDate ? `vs ${previousDate}` : 'previous close missing', previousSnapshot, previousDate);

    return [
      dailyMetric,
      makeMetric('MTD P&L', mtdRows.length ? `vs ${mtdMonth}` : `${mtdMonth || 'prior month'} missing`, mtdSnapshot, mtdSnapshotDate),
      makeMetric('YTD P&L', ytdRows.length ? `vs ${ytdMonth}` : `${ytdMonth || 'prior year-end'} missing`, ytdSnapshot, ytdSnapshotDate),
    ];
  }, [dailyQuotes, monthlyQuotes, priceMap, totalPnlSummary.totalPnl, txns]);

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

  const runSequentialPnlRefresh = async () => {
    if (pnlRefreshing) return;
    setPnlRefreshing(true);
    try {
      const hasLocal = await checkLocalFutuBridge();
      if (hasLocal) {
        await importFromFutu();
        await refreshPrices();
        sendNotification?.('P&L refreshed', 'Transactions and prices are up to date', 'pnl', user.id);
        return;
      }
      const pollUntilDone = async (requestId) => {
        for (let i = 0; i < 90; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const { data } = await sb.from('futu_refresh_requests').select('status').eq('id', requestId).maybeSingle();
          if (data?.status === 'completed' || data?.status === 'failed') return;
        }
      };
      const txnReq = await enqueueFutuRefreshRequest(FUTU_REQUEST_TYPES.transactions, { trigger: 'manual_pnl' });
      if (txnReq?.id) manualPnlRequestIdsRef.current.add(txnReq.id);
      if (txnReq?.id) { showToast('Refreshing transactions…'); await pollUntilDone(txnReq.id); }
      const priceReq = await enqueueFutuRefreshRequest(FUTU_REQUEST_TYPES.prices, { price_mode: futuPriceMode });
      if (priceReq?.id) manualPnlRequestIdsRef.current.add(priceReq.id);
      if (priceReq?.id) { showToast('Refreshing prices…'); await pollUntilDone(priceReq.id); }
      const summaryReq = await enqueueFutuRefreshRequest(FUTU_REQUEST_TYPES.summary, { trigger: 'manual_pnl' });
      if (summaryReq?.id) manualPnlRequestIdsRef.current.add(summaryReq.id);
      if (summaryReq?.id) { showToast('Refreshing P&L summary…'); await pollUntilDone(summaryReq.id); }
      await Promise.all([load(), loadSettings()]);
      showToast('P&L refresh complete');
      sendNotification?.('P&L refreshed', 'Transactions, prices, and summary are up to date', 'pnl', user.id);
    } catch (err) {
      showToast(`P&L refresh failed: ${err.message}`);
    } finally {
      setPnlRefreshing(false);
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

  const closeTxnForm = () => {
    setShowAdd(false);
    setEditingTxnId(null);
    setNewTxn(EMPTY_TXN);
  };

  const openEditTxn = (txn) => {
    setEditingTxnId(txn.id);
    setNewTxn({
      ...EMPTY_TXN,
      ...txn,
      transaction_date: txn.transaction_date || EMPTY_TXN.transaction_date,
      type: txn.type || EMPTY_TXN.type,
      ticker: txn.ticker || '',
      name: txn.name || '',
      quantity: txn.quantity ?? '',
      original_quantity: txn.original_quantity ?? txn.quantity ?? '',
      stock_split: txn.stock_split ?? '1',
      price: txn.price ?? '',
      currency: txn.currency || 'USD',
      amount: txn.amount ?? '',
      tax_withheld: txn.tax_withheld ?? '',
      account: txn.account || 'HSBC',
      order_ref: txn.order_ref || '',
      notes: txn.notes || '',
    });
    setShowAdd(true);
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
      sort_order: editingTxnId ? (newTxn.sort_order ?? Date.now()) : Date.now(),
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
    delete row.id;
    delete row.created_at;

    const { error } = editingTxnId
      ? await sb.from('securities_transactions').update(row).eq('id', editingTxnId)
      : await sb.from('securities_transactions').insert(row);
    if (error) {
      showToast('Error: ' + error.message);
      return;
    }
    showToast(editingTxnId ? 'Updated' : 'Saved');
    closeTxnForm();
    load();
  };

  const deleteTxn = async (id) => {
    if (!window.confirm('Delete this securities transaction? This cannot be undone.')) return;
    const { error } = await sb.from('securities_transactions').delete().eq('id', id);
    if (error) {
      showToast('Error: ' + error.message);
      return;
    }
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
    card: { background: CLAY.surface, borderRadius: UI.cardRadius, padding: '12px 14px', boxShadow: CLAY.shadow, marginBottom: UI.sectionGap },
    pill: (on) => ({
      padding: '4px 10px',
      borderRadius: 9999,
      border: 'none',
      cursor: 'pointer',
      fontSize: FS.lg,
      fontFamily: MONO,
      fontWeight: on ? FW.semibold : FW.normal,
      letterSpacing: '0.04em', background: on ? CLAY.text : CLAY.surf2,
      color: on ? CLAY.surface : CLAY.textMid,
      boxShadow: on ? UI.activeShadow : CLAY.btn,
    }),
    label: { fontSize: FS.lg, fontFamily: MONO, fontWeight: FW.semibold, letterSpacing: '0.05em', color: CLAY.textMid },
    input: { width: '100%', padding: '12px 14px', borderRadius: UI.controlRadius, border: 'none', fontFamily: MONO, fontSize: FS.lg, background: CLAY.surf2, color: CLAY.text, outline: 'none' },
    btn: (primary) => ({
      padding: '8px 16px',
      borderRadius: UI.controlRadius,
      border: 'none',
      cursor: 'pointer',
      fontFamily: MONO,
      fontSize: FS.lg,
      fontWeight: FW.semibold,
      letterSpacing: '0.04em',
      background: primary ? CLAY.text : CLAY.surf2,
      color: primary ? CLAY.surface : CLAY.textMid,
      boxShadow: primary ? '4px 4px 12px rgba(44,36,32,0.28)' : CLAY.btn,
      opacity: importing || priceLoading ? 0.8 : 1,
    }),
  };

  const ledgerColumns = [
    {
      key: 'transaction_date',
      top: 'Date',
      width: 76,
      min: 68,
      sticky: true,
      align: 'center',
      render: (t) => <span style={{ color: CLAY.textMid }}>{t.transaction_date?.slice(5)}</span>,
    },
    {
      key: 'type',
      top: 'Type',
      width: 86,
      min: 76,
      render: (t) => {
        const tc = TYPE_COLORS[t.type] || TYPE_COLORS.OTHER;
        return (
          <span style={{ padding: '1px 6px', borderRadius: 9999, background: tc.bg, color: tc.text, fontWeight: FW.semibold, fontSize: FS.lg, whiteSpace: 'nowrap' }}>
            {t.type}
          </span>
        );
      },
    },
    {
      key: 'ticker',
      top: 'Ticker',
      width: 118,
      min: 96,
      emphasis: true,
      title: (t) => [t.ticker || t.name, t.ticker && t.name && t.name !== t.ticker ? t.name : '', CASH_TYPES.has(t.type) ? t.notes : ''].filter(Boolean).join(' · '),
      render: (t) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ overflowWrap: 'anywhere' }}>{t.ticker || t.name || '—'}</div>
          {t.ticker && t.name && t.name !== t.ticker && (
            <div style={{ fontWeight: FW.normal, color: CLAY.textMid, overflowWrap: 'anywhere' }}>{t.name}</div>
          )}
          {(CASH_TYPES.has(t.type) && t.notes) && (
            <div style={{ fontWeight: FW.normal, color: CLAY.textMid, overflowWrap: 'anywhere' }}>{t.notes}</div>
          )}
        </div>
      ),
    },
    {
      key: 'quantity',
      top: 'Qty',
      width: 64,
      min: 58,
      render: (t) => {
        const hasSplit = SECURITY_TYPES.has(t.type) && t.type !== 'DIVIDEND' && splitFromRow(t) !== 1;
        if (SECURITY_TYPES.has(t.type) && t.type !== 'DIVIDEND' && t.quantity != null) {
          return hasSplit
            ? <span title={`${fmt(originalQtyFromRow(t), 0)} × ${fmt(splitFromRow(t), 2)} split`}>{fmt(adjustedQtyFromRow(t), 0)}</span>
            : fmt(adjustedQtyFromRow(t), 0);
        }
        if (t.type === 'DIVIDEND' && t.tax_withheld != null) return <span style={{ color: CLAY.textLt }}>tax {fmt(t.tax_withheld, 0)}</span>;
        return '—';
      },
    },
    {
      key: 'price',
      top: 'Price',
      width: 104,
      min: 84,
      render: (t) => SECURITY_TYPES.has(t.type) && t.type !== 'DIVIDEND' && t.price != null ? fmt(t.price, 2) : '—',
    },
    {
      key: 'amount',
      top: 'Amount',
      width: 128,
      min: 106,
      emphasis: true,
      render: (t) => `${t.currency} ${fmt(Math.abs(t.amount || 0), 0)}`,
    },
    {
      key: 'account',
      top: 'Account',
      width: 180,
      min: 130,
      title: (t) => [t.account, t.order_ref].filter(Boolean).join(' · '),
      render: (t) => (
        <span style={{ color: CLAY.textLt, overflowWrap: 'anywhere' }}>
          {t.account}{t.order_ref ? <span> · {t.order_ref}</span> : ''}
        </span>
      ),
    },
    {
      key: 'actions',
      top: '',
      width: 96,
      min: 86,
      action: true,
      sortable: false,
      render: (t) => (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => openEditTxn(t)}
            style={{ border: 'none', borderRadius: 999, background: CLAY.surf2, color: CLAY.textMid, cursor: 'pointer', padding: '4px 8px', fontFamily: MONO, fontSize: FS.compact }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => deleteTxn(t.id)}
            style={{ border: 'none', borderRadius: 999, background: '#fee2e2', color: '#dc2626', cursor: 'pointer', padding: '4px 8px', fontFamily: MONO, fontSize: FS.compact }}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const ledgerSections = months.map((month) => ({
    id: month,
    label: month,
    rows: grouped[month] || [],
  }));

  const pnlTableColumns = [
    {
      key: 'ticker',
      top: 'Stock',
      sticky: true,
      width: 78,
      min: 68,
      maxVw: 25,
      emphasis: true,
      render: (row) => {
        const isExpanded = expandedPnlTicker === row.ticker;
        return (
          <button
            onClick={() => togglePnlTickerBreakdown(row.ticker)}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.15 }}>{row.ticker}</span>
              <span style={{ fontSize: FS.lg, opacity: 0.4 }}>{isExpanded ? '▾' : '▸'}</span>
            </div>
            <div style={{ fontSize: FS.lg, opacity: 0.45, marginTop: 2, lineHeight: 1.1, whiteSpace: 'pre-line', textAlign: 'center' }}>
              {String(row.account || '')
                .replace(/Futu HK/g, 'Futu')
                .replace(/\s*\+\s*/g, '\n')
                .replace(/Futu\n/g, 'Futu ')}
            </div>
          </button>
        );
      },
    },
    {
      key: 'marketValue',
      top: 'Market Value',
      bottom: 'Shares',
      width: 96,
      min: 82,
      maxVw: 24,
      render: (row) => (
        <>
          <div style={{ fontWeight: 700, color: CLAY.text, lineHeight: 1.2, fontSize: FS.lg, whiteSpace: 'nowrap', textAlign: 'center' }}>{fmt(row.marketValue, 0)}</div>
          <div style={{ marginTop: 2, fontSize: FS.lg, opacity: 0.55, lineHeight: 1.1, textAlign: 'center' }}>{fmt(row.shares, 0)}</div>
        </>
      ),
    },
    {
      key: 'currentPrice',
      top: 'Price',
      bottom: 'Cost',
      width: 74,
      min: 66,
      maxVw: 18,
      render: (row) => (
        <>
          <input
            type="number"
            step="0.01"
            value={Object.prototype.hasOwnProperty.call(manualPriceDrafts, row.ticker) ? manualPriceDrafts[row.ticker] : fmtInputPrice(row.currentPrice)}
            onChange={(e) => {
              const val = e.target.value;
              setManualPriceDrafts((prev) => ({ ...prev, [row.ticker]: val }));
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
            style={{ ...s.input, width: '100%', minWidth: 0, maxWidth: '100%', padding: '3px 5px', height: 'auto', fontSize: FS.lg, textAlign: 'center' }}
          />
          <div style={{ marginTop: 2, fontSize: FS.lg, opacity: 0.55, lineHeight: 1.1, textAlign: 'center' }}>{fmt(row.avgCost, 2)}</div>
        </>
      ),
    },
    {
      key: 'unrealizedPnl',
      top: 'Unrealised',
      bottom: '%',
      width: 108,
      min: 94,
      maxVw: 24,
      render: (row) => {
        const color = (row.unrealizedPnl || 0) >= 0 ? CLAY.green : CLAY.red;
        return (
          <>
            <div style={{ fontWeight: 700, color, lineHeight: 1.1, fontSize: FS.lg, textAlign: 'center' }}>{fmtSigned(row.unrealizedPnl, 0)}</div>
            <div style={{ marginTop: 2, fontSize: FS.lg, color, lineHeight: 1.1, textAlign: 'center' }}>{fmtPct(row.unrealizedPct, 2)}</div>
          </>
        );
      },
    },
    {
      key: 'realizedPnl',
      top: 'Realised',
      width: 82,
      min: 72,
      maxVw: 20,
      render: (row) => (
        <div style={{ fontWeight: 700, color: row.realizedPnl >= 0 ? CLAY.green : CLAY.red, lineHeight: 1.1, fontSize: FS.lg, textAlign: 'center' }}>{fmtSigned(row.realizedPnl, 0)}</div>
      ),
    },
    {
      key: 'totalPnl',
      top: 'Total P&L',
      bottom: '%',
      width: 88,
      min: 76,
      maxVw: 22,
      render: (row) => {
        const color = row.totalPnl >= 0 ? CLAY.green : CLAY.red;
        return (
          <>
            <div style={{ fontWeight: 700, color, lineHeight: 1.1, fontSize: FS.lg, textAlign: 'center' }}>{fmtSigned(row.totalPnl, 0)}</div>
            <div style={{ marginTop: 2, fontSize: FS.lg, color, lineHeight: 1.1, textAlign: 'center' }}>{fmtPct(row.totalPnlPct, 2)}</div>
          </>
        );
      },
    },
    {
      key: 'dividends',
      top: 'Dividend',
      width: 80,
      min: 70,
      maxVw: 20,
      render: (row) => (
        <div style={{ fontWeight: 700, color: (row.dividends || 0) >= 0 ? CLAY.green : CLAY.red, lineHeight: 1.1, fontSize: FS.lg, textAlign: 'center' }}>
          {fmtSigned(row.dividends, 0)}
        </div>
      ),
    },
    {
      key: 'investedCost',
      top: 'Cost',
      bottom: 'Basis',
      width: 78,
      min: 68,
      maxVw: 20,
      render: (row) => (
        <div style={{ fontWeight: 700, color: CLAY.text, lineHeight: 1.1, fontSize: FS.lg, whiteSpace: 'nowrap', textAlign: 'center' }}>
          {fmt(row.investedCost, 0)}
        </div>
      ),
    },
    {
      key: 'portfolioPct',
      top: '%',
      width: 48,
      min: 44,
      maxVw: 14,
      render: (row) => <div style={{ fontWeight: 700, lineHeight: 1.1, fontSize: FS.lg, textAlign: 'center' }}>{fmtPct(row.portfolioPct, 2)}</div>,
    },
  ];

  const renderPnlTableExtra = (row) => {
    const isExpanded = expandedPnlTicker === row.ticker;
    const bankBreakdownRows = pnlBreakdownByTicker.get(row.ticker) || [];
    if (!isExpanded || bankBreakdownRows.length === 0) return null;
    return (
      <tr style={{ ...tableRowStyle, background: CLAY.surf2 }}>
        <td colSpan={pnlTableColumns.length} style={{ padding: '8px 10px 10px' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            {bankBreakdownRows.map((bankRow) => {
              const bankTotalPnlColor = bankRow.totalPnl >= 0 ? CLAY.green : CLAY.red;
              const bankUnrealizedColor = (bankRow.unrealizedPnl || 0) >= 0 ? CLAY.green : CLAY.red;
              const bankRealizedColor = bankRow.realizedPnl >= 0 ? CLAY.green : CLAY.red;
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
                    background: CLAY.surface,
                    border: `1px solid ${CLAY.surf2}`,
                  }}
                >
                  <div><div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Bank</div><div style={{ fontSize: FS.lg, fontWeight: 700 }}>{String(bankRow.account || '').replace(/Futu HK/g, 'Futu')}</div></div>
                  <div><div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Mkt / Shares</div><div style={{ fontSize: FS.lg }}>{fmt(bankRow.marketValue, 0)}</div><div style={{ fontSize: FS.lg, opacity: 0.55 }}>{fmt(bankRow.shares, 0)}</div></div>
                  <div><div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Price / Cost</div><div style={{ fontSize: FS.lg }}>{fmt(bankRow.currentPrice, 2)}</div><div style={{ fontSize: FS.lg, opacity: 0.55 }}>{fmt(bankRow.avgCost, 2)}</div></div>
                  <div><div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Unreal.</div><div style={{ fontSize: FS.lg, color: bankUnrealizedColor }}>{fmtSigned(bankRow.unrealizedPnl, 0)}</div><div style={{ fontSize: FS.lg, color: bankUnrealizedColor, opacity: 0.75 }}>{fmtPct(bankRow.unrealizedPct, 2)}</div></div>
                  <div><div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Realised</div><div style={{ fontSize: FS.lg, color: bankRealizedColor }}>{fmtSigned(bankRow.realizedPnl, 0)}</div></div>
                  <div><div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Total P&L</div><div style={{ fontSize: FS.lg, color: bankTotalPnlColor }}>{fmtSigned(bankRow.totalPnl, 0)}</div><div style={{ fontSize: FS.lg, color: bankTotalPnlColor, opacity: 0.75 }}>{fmtPct(bankRow.totalPnlPct, 2)}</div></div>
                  <div><div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Div / Cost</div><div style={{ fontSize: FS.lg }}>{fmtSigned(bankRow.dividends, 0)}</div><div style={{ fontSize: FS.lg, opacity: 0.55 }}>{fmt(bankRow.investedCost, 0)}</div></div>
                </div>
              );
            })}
          </div>
        </td>
      </tr>
    );
  };

  const pnlTableSettingsPanel = (
    <div style={{ display: 'grid', gap: 10, fontSize: FS.lg, color: CLAY.textMid, lineHeight: 1.5 }}>
      <div style={s.label}>P&L Table Settings</div>
      <label style={{ display: 'grid', gap: 4, maxWidth: 220 }}>
        <span>Futu price mode</span>
        <select
          style={s.input}
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
      </label>
      <div>Tap any heading to sort. Tap a stock row to show its bank breakdown.</div>
    </div>
  );

  return (
    <div style={{ padding: `${embedded ? 8 : 16}px 16px ${embedded ? 8 : 140}px`, fontFamily: MONO }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importFromFile} />

      {!pnlTableOnly && (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: embedded ? 'flex-end' : 'space-between', marginBottom: showViewToggle ? 14 : 12, gap: 8 }}>
        {!embedded && (
          <div style={{ fontFamily: MONO, fontSize: FS.heading, fontWeight: FW.black, color: CLAY.text, lineHeight: 1, marginBottom: 8 }}>
            {activeView === 'pnl' ? 'P&L' : activeView === 'settings' ? 'Settings' : 'Transactions'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {activeView === 'pnl' && (
            <>
              {lastFutuPriceRefreshAt && (
                <span style={{ fontFamily: MONO, fontSize: FS.compact, color: CLAY.textLt, alignSelf: 'center', whiteSpace: 'nowrap' }}>
                  {(() => {
                    const d = new Date(lastFutuPriceRefreshAt);
                    const today = new Date();
                    const sameDay = d.toDateString() === today.toDateString();
                    return sameDay
                      ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                  })()}
                </span>
              )}
              <button onClick={runSequentialPnlRefresh} disabled={pnlRefreshing} style={{ ...s.btn(pnlRefreshing), padding: '6px 10px', minWidth: 0, opacity: pnlRefreshing ? 0.85 : 1 }}>
                <RefreshCw size={13} style={pnlRefreshing ? { animation: 'spin 1s linear infinite' } : {}} />
              </button>
              <button onClick={() => setShowPnlSettings(v => !v)} style={{ ...s.btn(showPnlSettings), padding: '6px 10px', minWidth: 0 }}>
                <Settings size={13} />
              </button>
            </>
          )}
          {activeView !== 'pnl' && activeView !== 'settings' && (
            <>
              <button
                onClick={() => {
                  setEditingTxnId(null);
                  setNewTxn(EMPTY_TXN);
                  setShowAdd(true);
                }}
                style={{ ...s.btn(true), display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Plus size={12} />
                Add
              </button>
            </>
          )}
        </div>
      </div>
      )}

      {!pnlTableOnly && showViewToggle && (
        <div style={{ marginBottom: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {[{ id: 'ledger', label: 'Transactions' }, { id: 'pnl', label: 'P&L' }].map((item) => (
            <button key={item.id} onClick={() => setView(item.id)} style={s.pill(activeView === item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      {!pnlTableOnly && (activeView === 'settings' || (activeView === 'pnl' && showPnlSettings)) && (
        <>
          <div style={s.card}>
            <div style={{ ...s.label, marginBottom: 10 }}>Futu Tools</div>
            <div style={{ fontSize: FS.lg, opacity: 0.55, marginBottom: 10, lineHeight: 1.6 }}>
              Syncs with your local OpenD bridge on <strong>127.0.0.1:8765</strong>. On this Windows machine the actions run immediately; on Android or another device they queue a remote request for your Windows listener through Supabase Realtime.
            </div>
            <div style={{ fontSize: FS.lg, opacity: 0.5, marginBottom: 10 }}>
              {localFutuBridgeAvailable == null
                ? 'Checking whether the local Futu bridge is reachable from this device…'
                : localFutuBridgeAvailable
                ? 'Local bridge reachable on this device.'
                : 'Local bridge not reachable here. Refresh buttons will queue a remote request instead.'}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: FS.lg, cursor: 'pointer' }}>
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
            <div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 10 }}>
              When enabled, the app refreshes Futu transactions, Futu prices, and the Futu P&amp;L summary once after startup.
            </div>
            <div style={{ ...s.label, marginBottom: 4 }}>Scheduled Auto Refresh ({FUTU_PNL_TIME_ZONE_LABEL})</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <input
                type="time"
                value={pnlAutoRefreshTimeDraft}
                onChange={e => setPnlAutoRefreshTimeDraft(e.target.value)}
                style={{ ...s.input, flex: 1, maxWidth: 140 }}
              />
              <button
                onClick={async () => {
                  setPnlAutoRefreshTime(pnlAutoRefreshTimeDraft);
                  await saveSettingValue('pnl_auto_refresh_time', pnlAutoRefreshTimeDraft);
                  showToast('Saved');
                }}
                style={{ ...s.btn(false), padding: '6px 14px' }}
              >Save</button>
              {pnlAutoRefreshTime && (
                <button
                  onClick={async () => {
                    setPnlAutoRefreshTime('');
                    setPnlAutoRefreshTimeDraft('');
                    await saveSettingValue('pnl_auto_refresh_time', '');
                    showToast('Cleared');
                  }}
                  style={{ ...s.btn(false), padding: '6px 10px' }}
                ><X size={13} /></button>
              )}
            </div>
            <div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 10 }}>
              {pnlAutoRefreshTime
                ? `Queues a full P&L sync daily at ${describeFutuPnlRefreshTime(pnlAutoRefreshTime)}. Your Windows Futu listener processes it in the background.`
                : `Set a US/Eastern time to auto-queue a full P&L sync once per day. The app will show the matching ${LOCAL_REFERENCE_TIME_ZONE_LABEL} time here.`}
            </div>
            <div style={{ ...s.label, marginBottom: 4 }}>Latest Futu Trade In App</div>
            <div style={{ fontWeight: 700, fontSize: FS.lg, marginBottom: 10 }}>{latestFutuTradeDate || 'No Futu transactions imported yet'}</div>
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
              <div style={{ fontSize: FS.lg, opacity: 0.45, marginTop: 4, lineHeight: 1.5 }}>
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
                <div style={{ fontSize: FS.lg, opacity: 0.45 }}>
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
                <div style={{ fontSize: FS.lg, opacity: 0.45 }}>
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
                <div style={{ fontSize: FS.lg, opacity: 0.45 }}>
                  {formatRemoteRequestMeta(
                    FUTU_REQUEST_TYPES.summary,
                    futuAccountSummary?.updated_at,
                    futuAccountSummary?.updated_at ? `Last updated ${new Date(futuAccountSummary.updated_at).toLocaleString()} · ${fmt(futuAccountSummary.open_positions, 0)} open positions` : 'Not refreshed yet'
                  )}
                </div>
                <div style={{ fontSize: FS.lg, opacity: 0.45, maxWidth: 300, lineHeight: 1.5 }}>
                  Uses Futu account snapshot values from the local bridge (`market_val` and `pl_val` from positions). These may stay on market-close or broker reference pricing after hours even when live quotes refresh later.
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#fff7ed', color: '#9a3412', fontSize: FS.lg, lineHeight: 1.6, fontWeight: 700 }}>
              Start `start_futu_bridge.bat` on your Windows computer first. That now launches both the local Futu bridge and the remote listener that processes queued Android refresh requests.
            </div>
          </div>

          <div style={s.card}>
            <div style={{ ...s.label, marginBottom: 10 }}>Price Tools</div>
            <div style={{ fontSize: FS.lg, opacity: 0.55, marginBottom: 10, lineHeight: 1.6 }}>
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
                <div style={{ fontSize: FS.lg, opacity: 0.45 }}>
                  {lastGrokPriceRefreshAt ? `Last updated ${new Date(lastGrokPriceRefreshAt).toLocaleString()}` : 'Not refreshed yet'}
                </div>
              </div>
            </div>
          </div>

          <div style={s.card}>
            <div style={{ ...s.label, marginBottom: 10 }}>Formula Notes</div>
            <div style={{ fontSize: FS.lg, opacity: 0.6, lineHeight: 1.8 }}>
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

          <div style={{ marginBottom: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {filterAccounts.map((account) => (
              <button key={account} onClick={() => setAccountFilter(account)} style={s.pill(accountFilter === account)}>
                {account}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {typeOptions.map((type) => (
              <button key={type} onClick={() => setTypeFilter(type)} style={s.pill(typeFilter === type)}>
                {type}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={tickerFilter}
              onChange={(e) => setTickerFilter(e.target.value)}
              style={{ ...s.input, width: 'auto', minWidth: 120, maxWidth: 200, padding: '6px 10px' }}
            >
              {tickerOptions.map((t) => (
                <option key={t} value={t}>{t === 'All' ? 'All stocks' : t}</option>
              ))}
            </select>
            {tickerFilter !== 'All' && (
              <button onClick={() => setTickerFilter('All')} style={s.pill(false)}>✕ Clear</button>
            )}
          </div>

          <UnifiedDataTable
            title="Transactions"
            subtitle={`${filtered.length} row${filtered.length === 1 ? '' : 's'} · Tap a heading to sort`}
            columns={ledgerColumns}
            sections={ledgerSections}
            rowKey={(row) => row.id}
            sort={txnSort}
            onSort={toggleTxnSort}
            loading={loading}
            empty="No transactions"
            onSettings={() => showToast?.('Table settings coming soon')}
          />
        </>
      )}

      {activeView === 'pnl' && (
        <>
          {!pnlTableOnly && bankPnlRows.length > 0 && (
            <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
              <div style={{ ...s.card, padding: '14px 16px' }}>
                <div style={{ fontSize: FS.lg, fontWeight: 700, marginBottom: 10 }}>Total</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
                  {periodPnlSummary.map((metric) => {
                    const color = metric.value == null || roundsToZero(metric.value, 0) ? CLAY.textLt : metric.value > 0 ? CLAY.green : CLAY.red;
                    return (
                      <div key={metric.label} style={{ background: CLAY.surf2, borderRadius: 12, padding: '9px 10px', minWidth: 0 }}>
                        <div style={{ ...s.label, marginBottom: 3 }}>{metric.label}</div>
                        <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.15, color }}>{metric.value == null ? '—' : fmtSigned(metric.value, 0)}</div>
                        <div style={{ fontWeight: 700, fontSize: FS.compact, lineHeight: 1.15, color }}>{fmtPct(metric.pct, 2)}</div>
                        <div style={{ fontSize: FS.compact, color: CLAY.textLt, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {metric.anchorLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...s.label, marginBottom: 2 }}>Unrealised P&amp;L</div>
                      <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: totalPnlSummary.unrealized >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.unrealized)}</div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...s.label, marginBottom: 2 }}>+ Realised P&amp;L</div>
                      <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: totalPnlSummary.realized >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.realized)}</div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...s.label, marginBottom: 2 }}>+ Dividend</div>
                      <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: totalPnlSummary.futuDividends >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.futuDividends)}</div>
                    </div>
                    <div style={{ height: 1, background: '#d6d3d1', marginBottom: 8 }} />
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...s.label, marginBottom: 2 }}>Total P&amp;L</div>
                      <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: totalPnlSummary.totalPnl >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.totalPnl)}</div>
                    </div>
                    <div>
                      <div style={{ ...s.label, marginBottom: 2 }}>Revised Total P&amp;L</div>
                      <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: totalPnlSummary.revisedTotalPnl >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.revisedTotalPnl)}</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...s.label, marginBottom: 2 }}>Market Value</div>
                      <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: totalPnlSummary.marketValue >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.marketValue)}</div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...s.label, marginBottom: 2 }}>Cash</div>
                      <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: totalPnlSummary.cash >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(totalPnlSummary.cash)}</div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...s.label, marginBottom: 2 }}>Cash Invested</div>
                      <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: CLAY.text }}>{fmtSigned(totalPnlSummary.cashInvested)}</div>
                    </div>
                    <div>
                      <div style={{ ...s.label, marginBottom: 2 }}>% Total P&amp;L</div>
                      <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: totalPnlSummary.totalPnl >= 0 ? '#16a34a' : '#dc2626' }}>
                        {totalPnlSummary.cashInvested !== 0 ? `${(totalPnlSummary.totalPnl / totalPnlSummary.cashInvested * 100).toFixed(2)}%` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {bankPnlRows.map((row) => (
                <div key={row.bank} style={{ ...s.card, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: FS.lg, fontWeight: 700 }}>{row.bank}</span>
                    <span style={{ fontSize: FS.lg, opacity: 0.45 }}>{fmt(row.openPositions, 0)} open position{row.openPositions === 1 ? '' : 's'}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {row.bank === 'Futubull' ? (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Total Market Value</div>
                            <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: row.marketValue >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.marketValue)}</div>
                          </div>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Futu API Market Value</div>
                            <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: (row.futuApiMarketValue ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                              {row.futuApiMarketValue == null ? '—' : `${row.futuApiCurrency} ${fmt(row.futuApiMarketValue, 0)}`}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '0 12px' }}>
                        <div style={{ ...s.label, marginBottom: 2 }}>Total Market Value</div>
                        <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: row.marketValue >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.marketValue)}</div>
                      </div>
                    )}

                    {row.bank === 'Futubull' && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Futu API Cash</div>
                            <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2 }}>
                              {row.futuApiCash == null ? '—' : `${row.futuApiCurrency} ${fmt(row.futuApiCash, 0)}`}
                            </div>
                          </div>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Futu API Total Assets</div>
                            <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2 }}>
                              {row.futuApiTotalAssets == null ? '—' : `${row.futuApiCurrency} ${fmt(row.futuApiTotalAssets, 0)}`}
                            </div>
                          </div>
                        </div>

                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 10 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <div style={{ ...s.label, marginBottom: 2 }}>Futu Derived Unrealised P&amp;L</div>
                              <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: row.futuUnrealizedPnl >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.futuUnrealizedPnl)}</div>
                            </div>
                            <div>
                              <div style={{ ...s.label, marginBottom: 2 }}>Futu API Total Position P&amp;L</div>
                              <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: (row.futuApiTotalPositionPnl ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                                {row.futuApiTotalPositionPnl == null ? '—' : `${row.futuApiCurrency} ${fmtSigned(row.futuApiTotalPositionPnl, 0)}`}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowFutuUnrealisedBreakdown(v => !v)}
                            style={{ ...s.btn(showFutuUnrealisedBreakdown), padding: '5px 10px', width: 'fit-content', fontSize: FS.compact }}
                          >
                            {showFutuUnrealisedBreakdown ? 'Hide breakdown' : 'Show breakdown'}
                          </button>
                          {showFutuUnrealisedBreakdown && (() => {
                            const breakdown = positionRows
                              .filter(p => normalizeBankLabel(p.account) === 'Futubull' && p.shares > 0)
                              .map(p => {
                                const mv = p.marketValue || 0;
                                const netCost = p.investedCost || 0; // shares × avgCost = actual cost basis of remaining shares
                                const divs = p.dividends || 0;
                                const adjCost = netCost - divs;
                                const futuAvgCost = p.shares > 0 ? adjCost / p.shares : 0;
                                return { ticker: p.ticker, shares: p.shares, futuAvgCost, currentPrice: p.currentPrice, marketValue: mv, netOpenCost: netCost, dividends: divs, adjCost, unrealisedPnl: mv - adjCost };
                              })
                              .sort((a, b) => b.marketValue - a.marketValue);
                            return (
                              <div style={{ overflowX: 'auto', marginTop: 4 }}>
                                <table style={{ ...tableStyle, width: '100%', minWidth: 'max-content' }}>
                                  <thead>
                                    <tr style={tableHeaderRowStyle}>
                                      {['Ticker', 'Shares', 'Futu Avg Cost', 'Price', 'Market Value', 'Net Open Cost', '− Dividends', 'Adj. Cost', 'Unrealised P&L'].map(h => (
                                        <th key={h} style={tableHeaderCellStyle({ align: h === 'Ticker' ? 'left' : 'right', padding: '4px 8px' })}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {breakdown.map(p => (
                                      <tr key={p.ticker} style={tableRowStyle}>
                                        <td style={tableCellStyle({ padding: '5px 8px', emphasis: true })}>{p.ticker}</td>
                                        <td style={tableCellStyle({ align: 'right', padding: '5px 8px' })}>{fmt(p.shares, 4).replace(/\.?0+$/, '')}</td>
                                        <td style={tableCellStyle({ align: 'right', padding: '5px 8px' })}>{fmt(p.futuAvgCost, 2)}</td>
                                        <td style={tableCellStyle({ align: 'right', padding: '5px 8px' })}>{p.currentPrice != null ? fmt(p.currentPrice, 2) : '—'}</td>
                                        <td style={tableCellStyle({ align: 'right', padding: '5px 8px' })}>{fmt(p.marketValue, 0)}</td>
                                        <td style={{ ...tableCellStyle({ align: 'right', padding: '5px 8px' }), color: CLAY.textMid }}>{fmt(p.netOpenCost, 0)}</td>
                                        <td style={{ ...tableCellStyle({ align: 'right', padding: '5px 8px' }), color: CLAY.green }}>{p.dividends > 0 ? fmt(p.dividends, 0) : '—'}</td>
                                        <td style={tableCellStyle({ align: 'right', padding: '5px 8px' })}>{fmt(p.adjCost, 0)}</td>
                                        <td style={{ ...tableCellStyle({ align: 'right', padding: '5px 8px', emphasis: true }), color: p.unrealisedPnl >= 0 ? CLAY.green : CLAY.red }}>{fmtSigned(p.unrealisedPnl)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ borderTop: `2px solid ${CLAY.surf2}` }}>
                                      <td colSpan={4} style={{ ...tableCellStyle({ padding: '5px 8px', emphasis: true }), color: CLAY.textMid }}>Total</td>
                                      <td style={tableCellStyle({ align: 'right', padding: '5px 8px', emphasis: true })}>{fmt(breakdown.reduce((s, p) => s + p.marketValue, 0), 0)}</td>
                                      <td style={{ ...tableCellStyle({ align: 'right', padding: '5px 8px', emphasis: true }), color: CLAY.textMid }}>{fmt(breakdown.reduce((s, p) => s + p.netOpenCost, 0), 0)}</td>
                                      <td style={{ ...tableCellStyle({ align: 'right', padding: '5px 8px', emphasis: true }), color: CLAY.green }}>{fmt(breakdown.reduce((s, p) => s + p.dividends, 0), 0)}</td>
                                      <td style={tableCellStyle({ align: 'right', padding: '5px 8px', emphasis: true })}>{fmt(breakdown.reduce((s, p) => s + p.adjCost, 0), 0)}</td>
                                      <td style={{ ...tableCellStyle({ align: 'right', padding: '5px 8px', emphasis: true }), color: row.futuUnrealizedPnl >= 0 ? CLAY.green : CLAY.red }}>{fmtSigned(row.futuUnrealizedPnl)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            );
                          })()}
                        </div>
                      </>
                    )}

                    {row.bank === 'HSBC' && (
                      <div style={{ padding: '0 12px' }}>
                        <div style={{ ...s.label, marginBottom: 2 }}>USD</div>
                        <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2 }}>
                          {row.financeCashCurrency} {fmt(row.financeCash, 0)}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                      <div>
                        <div style={{ ...s.label, marginBottom: 2 }}>Total Unrealised P&amp;L</div>
                        <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: row.unrealized >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.unrealized)}</div>
                      </div>
                        <div>
                          <div style={{ ...s.label, marginBottom: 2 }}>Total Realised P&amp;L</div>
                          <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: row.realized >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.realized)}</div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px' }}>
                      <div>
                        <div style={{ ...s.label, marginBottom: 2 }}>Total Dividends</div>
                        <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: row.dividends >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.dividends)}</div>
                      </div>
                      <div>
                        <div style={{ ...s.label, marginBottom: 2 }}>Total P&amp;L</div>
                        <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.2, color: row.totalPnl >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.totalPnl)}</div>
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
                            <div style={{ fontWeight: 700, fontSize: FS.lg, color: '#2563eb' }}>{fmtSigned(row.cashIn)}</div>
                          </div>
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Cash Out</div>
                            <div style={{ fontWeight: 700, fontSize: FS.lg, color: '#b45309' }}>{fmtSigned(row.cashOut)}</div>
                          </div>
                        </div>

                        {row.bank === 'Futubull' ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <div style={{ ...s.label, marginBottom: 2 }}>Total Open Cost Basis</div>
                              <div style={{ fontWeight: 700, fontSize: FS.lg, color: '#2563eb' }}>{fmtSigned(row.openCost)}</div>
                            </div>
                            <div>
                              <div style={{ ...s.label, marginBottom: 2 }}>Futu Derived Diluted Open Cost Basis</div>
                              <div style={{ fontWeight: 700, fontSize: FS.lg, color: '#2563eb' }}>{fmtSigned(row.futuDilutedOpenCostBasis)}</div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ ...s.label, marginBottom: 2 }}>Total Open Cost Basis</div>
                            <div style={{ fontWeight: 700, fontSize: FS.lg, color: '#2563eb' }}>{fmtSigned(row.openCost)}</div>
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
                          <div style={{ fontWeight: 700, fontSize: FS.lg, color: row.revisedTotalPnl >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSigned(row.revisedTotalPnl)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!pnlTableOnly && priceStatus && (priceLoading || /failed/i.test(priceStatus)) && (
            <div style={{ ...s.card, background: '#f8fafc', color: '#334155', fontSize: FS.lg, lineHeight: 1.6 }}>
              <div><strong>Status:</strong> {priceStatus || 'Idle'}</div>
            </div>
          )}

          {!hidePnlTable && (
            <UnifiedDataTable
              title="P&L"
              subtitle={`${sortedPnlRows.length} open position${sortedPnlRows.length === 1 ? '' : 's'} · Tap a heading to sort · ${pnlSortLabel} ${pnlSort.direction === 'desc' ? 'high to low' : 'low to high'}`}
              columns={pnlTableColumns}
              rows={sortedPnlRows}
              rowKey={(row) => row.ticker}
              sort={pnlSort}
              onSort={togglePnlSort}
              rowExtra={renderPnlTableExtra}
              loading={loading}
              empty="No securities to calculate"
              onSettings={() => setShowPnlSettings((value) => !value)}
              settingsOpen={pnlTableOnly && showPnlSettings}
              settingsPanel={pnlTableSettingsPanel}
            />
          )}

          {false && (openPnlRows.length === 0 ? (
            <div style={{ textAlign: 'center', opacity: 0.35, padding: 40, fontSize: FS.lg }}>No securities to calculate</div>
          ) : (
            <DataTableCard
              title="P&L"
              subtitle={`${sortedPnlRows.length} open position${sortedPnlRows.length === 1 ? '' : 's'} · Tap a heading to sort · ${pnlSortLabel} ${pnlSort.direction === 'desc' ? 'high to low' : 'low to high'}`}
              onSettings={() => setShowPnlSettings((value) => !value)}
            >
                <table style={tableStyle}>
                  <colgroup>
                    <col style={tableColumnStyle({ width: 78, min: 68, maxVw: 25 })} />
                    <col style={tableColumnStyle({ width: 96, min: 82, maxVw: 24 })} />
                    <col style={tableColumnStyle({ width: 74, min: 66, maxVw: 18 })} />
                    <col style={tableColumnStyle({ width: 108, min: 94, maxVw: 24 })} />
                    <col style={tableColumnStyle({ width: 82, min: 72, maxVw: 20 })} />
                    <col style={tableColumnStyle({ width: 88, min: 76, maxVw: 22 })} />
                    <col style={tableColumnStyle({ width: 80, min: 70, maxVw: 20 })} />
                    <col style={tableColumnStyle({ width: 78, min: 68, maxVw: 20 })} />
                    <col style={tableColumnStyle({ width: 48, min: 44, maxVw: 14 })} />
                  </colgroup>
                  <thead>
                    <tr style={tableHeaderRowStyle}>
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
                            ...tableHeaderCellStyle({ sticky: index === 0, align: 'center', padding: index === 0 ? '7px 4px 7px 10px' : '7px 6px' }),
                            lineHeight: 1.2,
                            whiteSpace: 'normal',
                          }}
                        >
                          <DataTableHeaderLabel
                            top={label.top}
                            bottom={label.bottom}
                            sortKey={label.sortKey}
                            sort={pnlSort}
                            onSort={togglePnlSort}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPnlRows.map((row) => {
                      const totalPnlPct = row.totalPnlPct;
                      const unrealizedPct = row.unrealizedPct;
                      const portfolioPct = row.portfolioPct;
                      const totalPnlColor = row.totalPnl >= 0 ? CLAY.green : CLAY.red;
                      const unrealizedColor = (row.unrealizedPnl || 0) >= 0 ? CLAY.green : CLAY.red;
                      const realizedColor = row.realizedPnl >= 0 ? CLAY.green : CLAY.red;
                      const isExpanded = expandedPnlTicker === row.ticker;
                      const bankBreakdownRows = pnlBreakdownByTicker.get(row.ticker) || [];
                      return (
                        <React.Fragment key={row.ticker}>
                          <tr style={isExpanded ? {} : tableRowStyle}>
                            <td
                              style={tableCellStyle({ sticky: true, padding: '7px 4px 7px 10px', emphasis: true, nowrap: false })}
                            >
                              <button
                                onClick={() => togglePnlTickerBreakdown(row.ticker)}
                                style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.15 }}>{row.ticker}</span>
                                  <span style={{ fontSize: FS.lg, opacity: 0.4 }}>{isExpanded ? '▾' : '▸'}</span>
                                </div>
                                <div style={{ fontSize: FS.lg, opacity: 0.45, marginTop: 2, lineHeight: 1.1, whiteSpace: 'pre-line', textAlign: 'center' }}>
                                  {String(row.account || '')
                                    .replace(/Futu HK/g, 'Futu')
                                    .replace(/\s*\+\s*/g, '\n')
                                    .replace(/Futu\n/g, 'Futu ')}
                                </div>
                              </button>
                            </td>
                            <td style={tableCellStyle({ align: 'center', padding: '7px 6px', nowrap: false })}>
                              <div style={{ fontWeight: 700, color: CLAY.text, lineHeight: 1.2, fontSize: FS.lg, whiteSpace: 'nowrap', textAlign: 'center' }}>{fmt(row.marketValue, 0)}</div>
                              <div style={{ marginTop: 2, fontSize: FS.lg, opacity: 0.55, lineHeight: 1.1, textAlign: 'center' }}>{fmt(row.shares, 0)}</div>
                            </td>
                            <td style={tableCellStyle({ align: 'center', padding: '7px 6px', nowrap: false })}>
                              <input
                                type="number"
                                step="0.01"
                                value={Object.prototype.hasOwnProperty.call(manualPriceDrafts, row.ticker) ? manualPriceDrafts[row.ticker] : fmtInputPrice(row.currentPrice)}
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
                                style={{ ...s.input, width: '100%', minWidth: 0, maxWidth: '100%', padding: '3px 5px', height: 'auto', fontSize: FS.lg, textAlign: 'center' }}
                              />
                              <div style={{ marginTop: 2, fontSize: FS.lg, opacity: 0.55, lineHeight: 1.1, textAlign: 'center' }}>{fmt(row.avgCost, 2)}</div>
                            </td>
                            <td style={tableCellStyle({ align: 'center', padding: '7px 6px', nowrap: false })}>
                              <div style={{ fontWeight: 700, color: unrealizedColor, lineHeight: 1.1, fontSize: FS.lg, textAlign: 'center' }}>{fmtSigned(row.unrealizedPnl, 0)}</div>
                              <div style={{ marginTop: 2, fontSize: FS.lg, color: unrealizedColor, lineHeight: 1.1, textAlign: 'center' }}>{fmtPct(unrealizedPct, 2)}</div>
                            </td>
                            <td style={tableCellStyle({ align: 'center', padding: '7px 6px', nowrap: false })}>
                              <div style={{ fontWeight: 700, color: realizedColor, lineHeight: 1.1, fontSize: FS.lg, textAlign: 'center' }}>{fmtSigned(row.realizedPnl, 0)}</div>
                            </td>
                            <td style={tableCellStyle({ align: 'center', padding: '7px 6px', nowrap: false })}>
                              <div style={{ fontWeight: 700, color: totalPnlColor, lineHeight: 1.1, fontSize: FS.lg, textAlign: 'center' }}>{fmtSigned(row.totalPnl, 0)}</div>
                              <div style={{ marginTop: 2, fontSize: FS.lg, color: totalPnlColor, lineHeight: 1.1, textAlign: 'center' }}>{fmtPct(totalPnlPct, 2)}</div>
                            </td>
                            <td style={tableCellStyle({ align: 'center', padding: '7px 6px', nowrap: false })}>
                              <div style={{ fontWeight: 700, color: (row.dividends || 0) >= 0 ? CLAY.green : CLAY.red, lineHeight: 1.1, fontSize: FS.lg, textAlign: 'center' }}>
                                {fmtSigned(row.dividends, 0)}
                              </div>
                            </td>
                            <td style={tableCellStyle({ align: 'center', padding: '7px 6px', nowrap: false })}>
                              <div style={{ fontWeight: 700, color: CLAY.text, lineHeight: 1.1, fontSize: FS.lg, whiteSpace: 'nowrap', textAlign: 'center' }}>
                                {fmt(row.investedCost, 0)}
                              </div>
                            </td>
                            <td style={tableCellStyle({ align: 'center', padding: '7px 6px', nowrap: false })}>
                              <div style={{ fontWeight: 700, lineHeight: 1.1, fontSize: FS.lg, textAlign: 'center' }}>{fmtPct(portfolioPct, 2)}</div>
                            </td>
                          </tr>
                          {isExpanded && bankBreakdownRows.length > 0 && (
                            <tr style={{ ...tableRowStyle, background: CLAY.surf2 }}>
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
                                          background: CLAY.surface,
                                          border: `1px solid ${CLAY.surf2}`,
                                        }}
                                      >
                                        <div>
                                          <div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Bank</div>
                                          <div style={{ fontSize: FS.lg, fontWeight: 700 }}>{String(bankRow.account || '').replace(/Futu HK/g, 'Futu')}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Mkt / Shares</div>
                                          <div style={{ fontSize: FS.lg }}>{fmt(bankRow.marketValue, 0)}</div>
                                          <div style={{ fontSize: FS.lg, opacity: 0.55 }}>{fmt(bankRow.shares, 0)}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Price / Cost</div>
                                          <div style={{ fontSize: FS.lg }}>{fmt(bankRow.currentPrice, 2)}</div>
                                          <div style={{ fontSize: FS.lg, opacity: 0.55 }}>{fmt(bankRow.avgCost, 2)}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Unreal.</div>
                                          <div style={{ fontSize: FS.lg, color: bankUnrealizedColor }}>{fmtSigned(bankRow.unrealizedPnl, 0)}</div>
                                          <div style={{ fontSize: FS.lg, color: bankUnrealizedColor, opacity: 0.75 }}>{fmtPct(bankRow.unrealizedPct, 2)}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Realised</div>
                                          <div style={{ fontSize: FS.lg, color: bankRealizedColor }}>{fmtSigned(bankRow.realizedPnl, 0)}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Total P&L</div>
                                          <div style={{ fontSize: FS.lg, color: bankTotalPnlColor }}>{fmtSigned(bankRow.totalPnl, 0)}</div>
                                          <div style={{ fontSize: FS.lg, color: bankTotalPnlColor, opacity: 0.75 }}>{fmtPct(bankRow.totalPnlPct, 2)}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: FS.lg, opacity: 0.45, marginBottom: 2 }}>Div / Cost</div>
                                          <div style={{ fontSize: FS.lg }}>{fmtSigned(bankRow.dividends, 0)}</div>
                                          <div style={{ fontSize: FS.lg, opacity: 0.55 }}>{fmt(bankRow.investedCost, 0)}</div>
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
            </DataTableCard>
          ))}
        </>
      )}

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: FS.lg }}>{editingTxnId ? 'Edit Transaction' : 'Add Transaction'}</div>
              <button onClick={closeTxnForm} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
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
                <div style={{ ...s.label, marginBottom: 4 }}>Order Ref</div>
                <input style={s.input} value={newTxn.order_ref} onChange={(e) => setNewTxn((prev) => ({ ...prev, order_ref: e.target.value }))} placeholder="Optional order reference" />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ ...s.label, marginBottom: 4 }}>Notes</div>
                <input style={s.input} value={newTxn.notes} onChange={(e) => setNewTxn((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional note" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={closeTxnForm} style={{ ...s.btn(false), flex: 1 }}>Cancel</button>
              <button onClick={saveTxn} style={{ ...s.btn(true), flex: 1 }}>{editingTxnId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {showPaste && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: FS.lg }}>Paste Email / Statement</div>
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
                <div style={{ fontSize: FS.lg, opacity: 0.4, marginTop: 4, marginBottom: 12 }}>
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
                    <div key={i} style={{ background: '#fafaf8', borderRadius: 8, padding: '8px 10px', marginBottom: 6, fontSize: FS.lg, fontFamily: MONO }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ padding: '1px 5px', borderRadius: 4, background: tc.bg, color: tc.text, fontSize: FS.lg, fontWeight: 700 }}>{t.type}</span>
                        <strong>{t.ticker}</strong>
                        <span style={{ opacity: 0.5, fontSize: FS.lg }}>{t.name}</span>
                      </div>
                      <div style={{ opacity: 0.5, fontSize: FS.lg }}>
                        {t.transaction_date}
                        {t.quantity != null ? ` · ${fmt(t.quantity, 0)} @ ${fmt(t.price, 2)}` : ''}
                        {` · ${t.currency} ${fmt(t.amount, 0)}`}
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
