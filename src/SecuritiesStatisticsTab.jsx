import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { MONO, FS, FW, CLAY } from './theme';
import {
  UI,
  UnifiedDataTable,
} from './ui';
const DEFAULT_START_MONTH = '2025-08';
const TOTAL_BANK = 'TOTAL';
const ALL_STOCKS = 'ALL_STOCKS';

const fmt = (value, dec = 0) =>
  value == null || Number.isNaN(Number(value))
    ? '—'
    : Number(value).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtSigned = (value, dec = 0) =>
  value == null || Number.isNaN(Number(value))
    ? '—'
    : `${Number(value) >= 0 ? '+' : '-'}${fmt(Math.abs(Number(value)), dec)}`;

const fmtPct = (value, dec = 2) =>
  value == null || Number.isNaN(Number(value))
    ? '—'
    : `${Number(value) >= 0 ? '+' : '-'}${Math.abs(Number(value)).toFixed(dec)}%`;

const monthLabel = (row) => {
  if (!row?.month_key) return '—';
  return new Date(`${row.month_key}-02T00:00:00`).toLocaleDateString('en', { month: 'short', year: 'numeric' });
};

const pctOfCost = (value, costBasis) => (costBasis ? (Number(value || 0) / Number(costBasis || 0)) * 100 : null);

const normalizeBankLabel = (value) => {
  const raw = String(value || '').trim();
  if (/futu/i.test(raw)) return 'Futubull';
  if (/hsbc/i.test(raw)) return 'HSBC';
  return raw || 'Unknown';
};

const compareTxnOrder = (a, b) => {
  const dateCompare = String(a.transaction_date || '').localeCompare(String(b.transaction_date || ''));
  if (dateCompare !== 0) return dateCompare;
  const sortA = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 0;
  const sortB = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0;
  if (sortA !== sortB) return sortA - sortB;
  return String(a.created_at || '').localeCompare(String(b.created_at || ''));
};

const isoDate = (date) => new Date(date).toISOString().slice(0, 10);

const monthKeyFromDate = (dateString) => String(dateString || '').slice(0, 7);

const getMonthEndDate = (monthKey) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return '';
  return isoDate(new Date(Date.UTC(year, month, 0)));
};

const enumerateMonthKeys = (startMonth, endMonth) => {
  if (!startMonth || !endMonth || startMonth > endMonth) return [];
  const result = [];
  let cursor = new Date(`${startMonth}-01T00:00:00Z`);
  const endDate = new Date(`${endMonth}-01T00:00:00Z`);
  while (cursor <= endDate) {
    result.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return result;
};

function buildFilteredRow(transactions, snapshotDate, monthKey, quoteMap, bankFilter, stockFilter) {
  const cashTransactions = transactions
    .filter((txn) => ['DEPOSIT', 'WITHDRAWAL'].includes(txn.type))
    .filter((txn) => String(txn.transaction_date || '') <= snapshotDate)
    .filter((txn) => {
      const bank = normalizeBankLabel(txn.account);
      return bankFilter === TOTAL_BANK ? true : bank === bankFilter;
    });

  const securityTxns = transactions
    .filter((txn) => txn.ticker && ['BUY', 'SELL', 'DIVIDEND'].includes(txn.type))
    .filter((txn) => String(txn.transaction_date || '') <= snapshotDate)
    .slice()
    .sort(compareTxnOrder);

  const positions = new Map();
  for (const txn of securityTxns) {
    const ticker = String(txn.ticker || '').trim().toUpperCase();
    const bank = normalizeBankLabel(txn.account);
    if (bankFilter !== TOTAL_BANK && bank !== bankFilter) continue;
    if (stockFilter !== ALL_STOCKS && ticker !== stockFilter) continue;
    const key = `${bank}::${ticker}`;
    if (!positions.has(key)) {
      positions.set(key, {
        bank,
        ticker,
        shares: 0,
        avgCost: 0,
        realizedPnl: 0,
        dividends: 0,
      });
    }
    const row = positions.get(key);
    const qty = Number(txn.quantity || 0);
    const amount = Number(txn.amount || 0);
    if (txn.type === 'BUY' && qty > 0) {
      const currentCost = row.shares * row.avgCost;
      row.shares += qty;
      row.avgCost = row.shares > 0 ? (currentCost + amount) / row.shares : 0;
    } else if (txn.type === 'SELL' && qty > 0) {
      const soldCost = row.avgCost * qty;
      row.realizedPnl += amount - soldCost;
      row.shares = Math.max(0, row.shares - qty);
      if (row.shares === 0) row.avgCost = 0;
    } else if (txn.type === 'DIVIDEND') {
      row.dividends += amount + Number(txn.tax_withheld || 0);
    }
  }

  const aggregate = {
    month_key: monthKey,
    snapshot_date: snapshotDate,
    cash_invested: 0,
    market_value: 0,
    cost_basis: 0,
    unrealized_pnl: 0,
    realized_pnl: 0,
    dividends: 0,
    total_pnl: 0,
  };

  for (const txn of cashTransactions) {
    const amount = Math.abs(Number(txn.amount || 0));
    if (txn.type === 'DEPOSIT') aggregate.cash_invested += amount;
    if (txn.type === 'WITHDRAWAL') aggregate.cash_invested -= amount;
  }

  for (const position of positions.values()) {
    const price = Number(quoteMap[position.ticker] || 0);
    const costBasis = position.shares * position.avgCost;
    const marketValue = position.shares * price;
    const unrealizedPnl = position.shares * (price - position.avgCost);
    aggregate.market_value += marketValue;
    aggregate.cost_basis += costBasis;
    aggregate.unrealized_pnl += unrealizedPnl;
    aggregate.realized_pnl += position.realizedPnl;
    aggregate.dividends += position.dividends;
  }

  aggregate.total_pnl = aggregate.unrealized_pnl + aggregate.realized_pnl + aggregate.dividends;
  return aggregate;
}

export default function SecuritiesStatisticsTab({ user, sb, showToast }) {
  const [transactions, setTransactions] = useState([]);
  const [monthlyQuotes, setMonthlyQuotes] = useState([]);
  const [latestPriceRows, setLatestPriceRows] = useState([]);
  const [requestRows, setRequestRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bankFilter, setBankFilter] = useState(TOTAL_BANK);
  const [stockFilter, setStockFilter] = useState(ALL_STOCKS);
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [futuPriceMode, setFutuPriceMode] = useState('live');
  const [statsSort, setStatsSort] = useState({ key: 'snapshot_date', direction: 'desc' });

  const s = {
    card: { background: CLAY.surface, borderRadius: UI.cardRadius, padding: '12px 14px', boxShadow: CLAY.shadow, marginBottom: UI.sectionGap },
    label: { fontSize: FS.lg, fontFamily: MONO, letterSpacing: '0.08em', color: CLAY.textMid, fontWeight: FW.semibold },
    btn: (active = false) => ({
      border: 'none',
      borderRadius: UI.controlRadius,
      padding: '8px 12px',
      cursor: 'pointer',
      fontFamily: MONO,
      fontSize: FS.lg,
      letterSpacing: '0.04em',
      background: active ? CLAY.text : CLAY.surf2,
      color: active ? CLAY.surface : CLAY.textMid,
      boxShadow: active ? UI.activeShadow : CLAY.btn,
      fontWeight: active ? FW.semibold : FW.normal,
    }),
  };
  const isAllStocksView = stockFilter === ALL_STOCKS;

  const loadAll = async () => {
    setLoading(true);
    const [
      { data: txnData },
      { data: quoteData },
      { data: settingsData },
      { data: requestData },
      { data: latestPricesData },
    ] = await Promise.all([
      sb
        .from('securities_transactions')
        .select('id,transaction_date,created_at,sort_order,account,ticker,type,quantity,amount,tax_withheld')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: true })
        .order('sort_order', { ascending: true, nullsFirst: false }),
      sb
        .from('securities_monthly_quotes')
        .select('month_key,ticker,price')
        .eq('user_id', user.id)
        .order('month_key', { ascending: false }),
      sb
        .from('user_settings')
        .select('key,value')
        .eq('user_id', user.id)
        .in('key', ['futu_statistics_refreshed_at', 'futu_price_mode']),
      sb
        .from('futu_refresh_requests')
        .select('*')
        .eq('user_id', user.id)
        .eq('request_type', 'statistics')
        .order('requested_at', { ascending: false })
        .limit(10),
      sb
        .from('user_settings')
        .select('key,value')
        .eq('user_id', user.id)
        .ilike('key', 'latest_stock_price:%'),
    ]);

    setTransactions(txnData || []);
    setMonthlyQuotes(quoteData || []);
    setRequestRows(requestData || []);
    setLatestPriceRows(latestPricesData || []);
    const refreshedRow = (settingsData || []).find((row) => row.key === 'futu_statistics_refreshed_at');
    const modeRow = (settingsData || []).find((row) => row.key === 'futu_price_mode');
    setLastRefreshedAt(refreshedRow?.value || '');
    setFutuPriceMode(modeRow?.value || 'live');
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [user.id]);

  useEffect(() => {
    const channel = sb
      .channel(`futu-statistics-${user.id}`)
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
          if (!nextRow || nextRow.request_type !== 'statistics') return;
          await loadAll();
          if (nextRow.status === 'completed') {
            setRefreshing(false);
            showToast('Securities statistics refreshed');
          } else if (nextRow.status === 'failed') {
            setRefreshing(false);
            showToast(`Statistics refresh failed: ${nextRow.error || 'Unknown error'}`);
          }
        }
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [sb, user.id, showToast]);

  const bankOptions = useMemo(() => {
    const banks = [...new Set(transactions.map((row) => normalizeBankLabel(row.account)).filter(Boolean))].sort();
    return [TOTAL_BANK, ...banks];
  }, [transactions]);

  const stockOptions = useMemo(() => {
    const tickers = [...new Set(transactions.map((row) => String(row.ticker || '').trim().toUpperCase()).filter(Boolean))].sort();
    return [ALL_STOCKS, ...tickers];
  }, [transactions]);

  useEffect(() => {
    if (!bankOptions.includes(bankFilter)) setBankFilter(TOTAL_BANK);
  }, [bankOptions, bankFilter]);

  useEffect(() => {
    if (!stockOptions.includes(stockFilter)) setStockFilter(ALL_STOCKS);
  }, [stockOptions, stockFilter]);

  const currentQuoteMap = useMemo(() => {
    const map = {};
    for (const row of latestPriceRows) {
      const ticker = String(row.key || '').split(':')[1];
      if (!ticker) continue;
      try {
        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        if (parsed?.price != null) map[ticker.toUpperCase()] = Number(parsed.price);
      } catch {
        // ignore malformed saved price rows
      }
    }
    return map;
  }, [latestPriceRows]);

  const monthlyQuoteMaps = useMemo(() => {
    const map = new Map();
    for (const row of monthlyQuotes) {
      if (!map.has(row.month_key)) map.set(row.month_key, {});
      map.get(row.month_key)[String(row.ticker || '').trim().toUpperCase()] = Number(row.price || 0);
    }
    return map;
  }, [monthlyQuotes]);

  const monthlyTableRows = useMemo(() => {
    const currentMonth = monthKeyFromDate(isoDate(new Date()));
    const historicalMonths = [...new Set(monthlyQuotes.map((row) => row.month_key).filter(Boolean))].sort();
    const monthKeys = historicalMonths.length > 0
      ? [...historicalMonths, currentMonth].filter((value, index, arr) => arr.indexOf(value) === index)
      : [currentMonth];

    return monthKeys
      .map((monthKey) => {
        const isCurrent = monthKey === currentMonth;
        const snapshotDate = isCurrent ? isoDate(new Date()) : getMonthEndDate(monthKey);
        const quoteMap = isCurrent ? currentQuoteMap : (monthlyQuoteMaps.get(monthKey) || {});
        const row = buildFilteredRow(transactions, snapshotDate, monthKey, quoteMap, bankFilter, stockFilter);
        return {
          ...row,
          unrealizedPct: pctOfCost(row.unrealized_pnl, row.cost_basis),
          totalPnlPct: pctOfCost(row.total_pnl, row.cash_invested),
        };
      })
      .filter((row) =>
        row.cash_invested !== 0 ||
        row.market_value !== 0 ||
        row.cost_basis !== 0 ||
        row.unrealized_pnl !== 0 ||
        row.realized_pnl !== 0 ||
        row.dividends !== 0 ||
        row.total_pnl !== 0
      )
      .sort((a, b) => String(b.snapshot_date || '').localeCompare(String(a.snapshot_date || '')));
  }, [monthlyQuoteMaps, monthlyQuotes, currentQuoteMap, transactions, bankFilter, stockFilter]);

  const toggleStatsSort = (key) => {
    setStatsSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: key === 'snapshot_date' ? 'desc' : 'asc' }
    );
  };

  const sortedMonthlyTableRows = useMemo(() => {
    const direction = statsSort.direction === 'desc' ? -1 : 1;
    return monthlyTableRows.slice().sort((a, b) => {
      const av = statsSort.key === 'month' ? a.snapshot_date : a[statsSort.key];
      const bv = statsSort.key === 'month' ? b.snapshot_date : b[statsSort.key];
      if (typeof av === 'number' || typeof bv === 'number') {
        return (Number(av || 0) - Number(bv || 0)) * direction;
      }
      return String(av || '').localeCompare(String(bv || '')) * direction;
    });
  }, [monthlyTableRows, statsSort]);

  const latestRequest = requestRows[0] || null;
  const requestMeta = (() => {
    if (!latestRequest) return lastRefreshedAt ? `Last updated ${new Date(lastRefreshedAt).toLocaleString()}` : 'Not refreshed yet';
    if (latestRequest.status === 'pending') return `Queued remotely ${new Date(latestRequest.requested_at).toLocaleString()}`;
    if (latestRequest.status === 'running') return `Running on Windows ${latestRequest.started_at ? new Date(latestRequest.started_at).toLocaleString() : ''}`.trim();
    if (latestRequest.status === 'failed') return `Last refresh failed ${latestRequest.completed_at ? new Date(latestRequest.completed_at).toLocaleString() : ''}`.trim();
    if (lastRefreshedAt && new Date(lastRefreshedAt).getTime() >= new Date(latestRequest.completed_at || 0).getTime()) {
      return `Last updated ${new Date(lastRefreshedAt).toLocaleString()}`;
    }
    return latestRequest.completed_at ? `Last remote run ${new Date(latestRequest.completed_at).toLocaleString()}` : 'Not refreshed yet';
  })();

  const handleRefresh = async () => {
    setRefreshing(true);
    const { data: existing } = await sb
      .from('futu_refresh_requests')
      .select('id,status')
      .eq('user_id', user.id)
      .in('request_type', ['statistics', 'full_sync'])
      .in('status', ['pending', 'running'])
      .limit(1)
      .maybeSingle();
    if (existing) {
      setRefreshing(false);
      showToast('A statistics refresh is already queued or running');
      return;
    }
    const { error } = await sb.from('futu_refresh_requests').insert([{
      user_id: user.id,
      request_type: 'statistics',
      payload: { price_mode: futuPriceMode, start_month: DEFAULT_START_MONTH },
    }]);
    if (error) {
      setRefreshing(false);
      showToast(`Unable to queue statistics refresh: ${error.message}`);
      return;
    }
    showToast('Queued securities statistics refresh');
    await loadAll();
  };

  const statisticsColumns = [
    {
      key: 'snapshot_date',
      top: 'Month',
      sticky: true,
      width: 98,
      min: 86,
      maxVw: 25,
      emphasis: true,
      render: (row) => <div style={{ fontWeight: 700, fontSize: FS.lg, lineHeight: 1.15 }}>{monthLabel(row)}</div>,
    },
    {
      key: 'unrealized_pnl',
      top: 'Unrealised',
      bottom: '%',
      width: 92,
      min: 80,
      maxVw: 24,
      render: (row) => {
        const color = (row.unrealized_pnl || 0) >= 0 ? CLAY.green : CLAY.red;
        return (
          <>
            <div style={{ fontWeight: 700, color, lineHeight: 1.1, fontSize: FS.lg }}>{fmtSigned(row.unrealized_pnl, 0)}</div>
            <div style={{ marginTop: 2, fontSize: FS.lg, color, lineHeight: 1.1 }}>{fmtPct(row.unrealizedPct, 2)}</div>
          </>
        );
      },
    },
    {
      key: 'realized_pnl',
      top: 'Realised',
      width: 78,
      min: 70,
      maxVw: 20,
      render: (row) => <div style={{ fontWeight: 700, color: (row.realized_pnl || 0) >= 0 ? CLAY.green : CLAY.red, lineHeight: 1.1, fontSize: FS.lg }}>{fmtSigned(row.realized_pnl, 0)}</div>,
    },
    {
      key: 'dividends',
      top: 'Dividend',
      width: 80,
      min: 70,
      maxVw: 20,
      render: (row) => <div style={{ fontWeight: 700, color: (row.dividends || 0) >= 0 ? CLAY.green : CLAY.red, lineHeight: 1.1, fontSize: FS.lg }}>{fmtSigned(row.dividends, 0)}</div>,
    },
    {
      key: 'total_pnl',
      top: 'Total P&L',
      bottom: isAllStocksView ? '%' : '',
      width: 86,
      min: 76,
      maxVw: 22,
      render: (row) => {
        const color = (row.total_pnl || 0) >= 0 ? CLAY.green : CLAY.red;
        return (
          <>
            <div style={{ fontWeight: 700, color, lineHeight: 1.1, fontSize: FS.lg }}>{fmtSigned(row.total_pnl, 0)}</div>
            {isAllStocksView && <div style={{ marginTop: 2, fontSize: FS.lg, color, lineHeight: 1.1 }}>{fmtPct(row.totalPnlPct, 2)}</div>}
          </>
        );
      },
    },
    ...(isAllStocksView ? [{
      key: 'cash_invested',
      top: 'Cash',
      bottom: 'Invested',
      width: 88,
      min: 78,
      maxVw: 22,
      render: (row) => <div style={{ fontWeight: 700, color: CLAY.text, lineHeight: 1.1, fontSize: FS.lg }}>{fmtSigned(row.cash_invested, 0)}</div>,
    }] : []),
    {
      key: 'market_value',
      top: 'Market',
      bottom: 'Value',
      width: 84,
      min: 74,
      maxVw: 22,
      render: (row) => <div style={{ fontWeight: 700, color: CLAY.text, lineHeight: 1.1, fontSize: FS.lg }}>{fmt(row.market_value, 0)}</div>,
    },
    {
      key: 'cost_basis',
      top: 'Cost',
      bottom: 'Basis',
      width: 76,
      min: 68,
      maxVw: 20,
      render: (row) => <div style={{ fontWeight: 700, color: CLAY.text, lineHeight: 1.1, fontSize: FS.lg }}>{fmt(row.cost_basis, 0)}</div>,
    },
  ];

  const statisticsFooter = (
    <div style={{ fontSize: FS.lg, lineHeight: 1.55, color: CLAY.textMid }}>
      <div>Unrealised % = Unrealised P&amp;L / Cost Basis</div>
      {isAllStocksView && (
        <>
          <div>Cash Invested = Accumulated Deposit - Withdrawal</div>
          <div>Total P&amp;L % = (Unrealised P&amp;L + Realised P&amp;L + Dividend) / Cash Invested</div>
        </>
      )}
    </div>
  );

  return (
    <div style={{ padding: '8px 16px 140px', fontFamily: MONO }}>
      <div style={{ ...s.card, paddingBottom: 10 }}>
        <div style={{ ...s.label, marginBottom: 6 }}>Accounts</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {bankOptions.map((bank) => (
            <button key={bank} onClick={() => setBankFilter(bank)} style={s.btn(bankFilter === bank)}>
              {bank === TOTAL_BANK ? 'All Accounts' : bank}
            </button>
          ))}
        </div>
        <div style={{ ...s.label, marginBottom: 6 }}>Stocks</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {stockOptions.map((ticker) => (
            <button key={ticker} onClick={() => setStockFilter(ticker)} style={s.btn(stockFilter === ticker)}>
              {ticker === ALL_STOCKS ? 'All Stocks' : ticker}
            </button>
          ))}
        </div>
      </div>

      <UnifiedDataTable
        title="Statistics"
        subtitle={`${monthlyTableRows.length} month${monthlyTableRows.length === 1 ? '' : 's'} · ${bankFilter === TOTAL_BANK ? 'All accounts' : bankFilter} · ${stockFilter === ALL_STOCKS ? 'All stocks' : stockFilter}`}
        columns={statisticsColumns}
        rows={sortedMonthlyTableRows}
        rowKey={(row) => `${bankFilter}-${stockFilter}-${row.snapshot_date}`}
        sort={statsSort}
        onSort={toggleStatsSort}
        loading={loading}
        empty="Refresh statistics to pull month-end securities prices from Futu and save monthly comparison rows."
        footer={statisticsFooter}
        onSettings={() => showToast?.('Table settings coming soon')}
      />
    </div>
  );
}
