import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { Scheduler, isInTimeWindow, isInCooldown, parseScheduleTimes, hasScheduledTimePassed, wasRunSuccessfullyToday } from './scheduler.mjs';

const ENV_PATH = path.resolve(process.cwd(), '.env');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(ENV_PATH);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BRIDGE_BASE_URL = (process.env.FUTU_BRIDGE_URL || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const DEFAULT_MARKET = process.env.FUTU_MARKET || 'US';
const DEFAULT_TRD_ENV = process.env.FUTU_TRD_ENV || 'REAL';
const PNL_REFRESH_TIMEZONE = process.env.FUTU_PNL_REFRESH_TIMEZONE || 'America/New_York';
const TRANSACTION_LOOKBACK_START = process.env.FUTU_HISTORY_START || '2022-01-01';
const DIVIDEND_FALLBACK_DAYS = Number(process.env.FUTU_DIVIDEND_LOOKBACK_DAYS || 120);
const PRICE_MODE_SOURCE = {
  live: 'Futu last price',
  market_close: 'Futu market close',
  pre_price: 'Futu pre-market price',
  after_price: 'Futu after-hours price',
  overnight_price: 'Futu overnight price',
};
const DEFAULT_STATISTICS_START_MONTH = process.env.FUTU_STATISTICS_START_MONTH || '2025-08';
const TOTAL_BANK = 'TOTAL';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendPushNotification({ userId, title, body, tag }) {
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        target_user_id: userId,
        title,
        body,
        tag,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn(`[${new Date().toLocaleString()}] Push notification failed: ${response.status} ${text}`);
    } else {
      const result = await response.json().catch(() => null);
      const sent = Number(result?.sent || 0);
      if (sent > 0) {
        console.log(`[${new Date().toLocaleString()}] Push notification sent (${tag}): ${sent}`);
      } else {
        console.warn(`[${new Date().toLocaleString()}] Push notification sent to 0 devices (${tag})`);
      }
    }
  } catch (error) {
    console.warn(`[${new Date().toLocaleString()}] Push notification failed: ${error.message}`);
  }
}

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
  txn.type || '',
].join('|');

const isoDate = (date) => new Date(date).toISOString().slice(0, 10);

function zonedIsoDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function isTimeOnlyMarketClose(value) {
  return /^16:00(?::00)?/.test(String(value || ''));
}

function samePrice(a, b) {
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) < 0.005;
}

async function fetchBridgeJson(path) {
  const response = await fetch(`${BRIDGE_BASE_URL}${path}`);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || 'Invalid JSON from local bridge' };
  }
  if (!response.ok) {
    throw new Error(payload?.error || text || `Bridge request failed for ${path}`);
  }
  return payload;
}

async function upsertSetting(userId, key, value) {
  const { error } = await supabase
    .from('user_settings')
    .upsert([{ user_id: userId, key, value }], { onConflict: 'user_id,key' });
  if (error) throw new Error(`Saving setting ${key} failed: ${error.message}`);
}

async function loadUserTransactions(userId) {
  const { data, error } = await supabase
    .from('securities_transactions')
    .select('id,transaction_date,created_at,sort_order,account,ticker,type,quantity,original_quantity,stock_split,price,amount,tax_withheld,order_ref,notes,source')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: true })
    .order('sort_order', { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Loading transactions failed: ${error.message}`);
  return data || [];
}

async function insertTransactions(rows) {
  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100);
    const { error } = await supabase.from('securities_transactions').insert(chunk);
    if (error) throw new Error(`Inserting transactions failed: ${error.message}`);
  }
}

function deriveQuoteTickers(rows) {
  return [...new Set(
    rows
      .filter((row) => row.ticker)
      .map((row) => String(row.ticker || '').trim().toUpperCase())
      .filter(Boolean)
  )].sort();
}

function normalizeBankLabel(value) {
  const raw = String(value || '').trim();
  if (/futu/i.test(raw)) return 'Futubull';
  if (/hsbc/i.test(raw)) return 'HSBC';
  return raw || 'Other';
}

function compareTxnOrder(a, b) {
  const byDate = String(a.transaction_date || '').localeCompare(String(b.transaction_date || ''));
  if (byDate !== 0) return byDate;
  const sortA = Number(a.sort_order);
  const sortB = Number(b.sort_order);
  const hasSortA = Number.isFinite(sortA);
  const hasSortB = Number.isFinite(sortB);
  if (hasSortA && hasSortB && sortA !== sortB) return sortA - sortB;
  if (hasSortA && !hasSortB) return -1;
  if (!hasSortA && hasSortB) return 1;
  const byCreated = String(a.created_at || '').localeCompare(String(b.created_at || ''));
  if (byCreated !== 0) return byCreated;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function monthKeyFromDate(value) {
  return String(value || '').slice(0, 7);
}

function getMonthEndDate(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function getPreviousMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function enumerateMonthKeys(startMonth, endMonth) {
  const result = [];
  let current = `${startMonth}-01`;
  const end = `${endMonth}-01`;
  let cursor = new Date(`${current}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  while (cursor <= endDate) {
    result.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return result;
}

function buildSnapshotRows(transactions, snapshotDate, monthKey, quoteMap, snapshotKind, refreshedAt) {
  const securityTxns = transactions
    .filter((txn) => txn.ticker && ['BUY', 'SELL', 'DIVIDEND'].includes(txn.type))
    .filter((txn) => String(txn.transaction_date || '') <= snapshotDate)
    .slice()
    .sort(compareTxnOrder);

  const positions = new Map();
  for (const txn of securityTxns) {
    const ticker = String(txn.ticker || '').trim().toUpperCase();
    const bank = normalizeBankLabel(txn.account);
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
      const costBasis = row.avgCost * qty;
      row.realizedPnl += amount - costBasis;
      row.shares = Math.max(0, row.shares - qty);
      if (row.shares === 0) row.avgCost = 0;
    } else if (txn.type === 'DIVIDEND') {
      row.dividends += amount; // tax_withheld is stored negative; use gross Cash Dividend only
    }
  }

  const grouped = new Map();
  const ensureBank = (bank) => {
    if (!grouped.has(bank)) {
      grouped.set(bank, {
        user_id: null,
        snapshot_date: snapshotDate,
        month_key: monthKey,
        snapshot_kind: snapshotKind,
        bank,
        market_value: 0,
        cost_basis: 0,
        unrealized_pnl: 0,
        realized_pnl: 0,
        dividends: 0,
        total_pnl: 0,
        open_positions: 0,
        refreshed_at: refreshedAt,
        source: snapshotKind === 'month_end' ? 'Futu month-end close' : 'Futu refreshed snapshot',
      });
    }
    return grouped.get(bank);
  };

  for (const position of positions.values()) {
    const price = Number(quoteMap[position.ticker] || 0);
    const costBasis = position.shares * position.avgCost;
    const marketValue = position.shares * price;
    const unrealizedPnl = position.shares * (price - position.avgCost);
    const bankRow = ensureBank(position.bank);
    bankRow.market_value += marketValue;
    bankRow.cost_basis += costBasis;
    bankRow.unrealized_pnl += unrealizedPnl;
    bankRow.realized_pnl += position.realizedPnl;
    bankRow.dividends += position.dividends;
    if (position.shares > 0) bankRow.open_positions += 1;
  }

  for (const position of positions.values()) {
    const bankRow = ensureBank(position.bank);
    bankRow.total_pnl = bankRow.unrealized_pnl + bankRow.realized_pnl + bankRow.dividends;
  }

  const totalRow = {
    user_id: null,
    snapshot_date: snapshotDate,
    month_key: monthKey,
    snapshot_kind: snapshotKind,
    bank: TOTAL_BANK,
    market_value: 0,
    cost_basis: 0,
    unrealized_pnl: 0,
    realized_pnl: 0,
    dividends: 0,
    total_pnl: 0,
    open_positions: 0,
    refreshed_at: refreshedAt,
    source: snapshotKind === 'month_end' ? 'Futu month-end close' : 'Futu refreshed snapshot',
  };

  for (const row of grouped.values()) {
    totalRow.market_value += row.market_value;
    totalRow.cost_basis += row.cost_basis;
    totalRow.unrealized_pnl += row.unrealized_pnl;
    totalRow.realized_pnl += row.realized_pnl;
    totalRow.dividends += row.dividends;
    totalRow.total_pnl += row.total_pnl;
    totalRow.open_positions += row.open_positions;
  }

  return [...grouped.values(), totalRow];
}

async function loadSettingValue(userId, key) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`Loading setting ${key} failed: ${error.message}`);
  return data?.value ?? null;
}

async function saveMonthlyQuotes(userId, rows) {
  if (rows.length === 0) return;
  for (let index = 0; index < rows.length; index += 200) {
    const chunk = rows.slice(index, index + 200);
    const { error } = await supabase
      .from('securities_monthly_quotes')
      .upsert(chunk, { onConflict: 'user_id,month_key,ticker' });
    if (error) throw new Error(`Saving monthly quotes failed: ${error.message}`);
  }
}

async function saveDailyQuotes(userId, rows) {
  if (rows.length === 0) return;
  for (let index = 0; index < rows.length; index += 200) {
    const chunk = rows.slice(index, index + 200);
    const { error } = await supabase
      .from('securities_daily_quotes')
      .upsert(chunk, { onConflict: 'user_id,quote_date,ticker' });
    if (error) throw new Error(`Saving daily quotes failed: ${error.message}`);
  }
}

async function savePerformanceSnapshots(rows) {
  if (rows.length === 0) return;
  for (let index = 0; index < rows.length; index += 200) {
    const chunk = rows.slice(index, index + 200);
    const { error } = await supabase
      .from('securities_performance_snapshots')
      .upsert(chunk, { onConflict: 'user_id,snapshot_date,bank' });
    if (error) throw new Error(`Saving performance snapshots failed: ${error.message}`);
  }
}

async function syncTransactions(userId) {
  const existingTransactions = await loadUserTransactions(userId);
  const futuRows = existingTransactions.filter((row) => row.source === 'futu-opend');
  const latestTradeDate = futuRows
    .filter((row) => row.type === 'BUY' || row.type === 'SELL')
    .map((row) => row.transaction_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  const latestDividendDate = futuRows
    .filter((row) => row.type === 'DIVIDEND')
    .map((row) => row.transaction_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  const end = isoDate(new Date());
  const tradeStartDate = latestTradeDate
    ? isoDate(new Date(new Date(`${latestTradeDate}T00:00:00`).getTime() + 24 * 60 * 60 * 1000))
    : TRANSACTION_LOOKBACK_START;
  const fallbackDividendStart = isoDate(new Date(Date.now() - DIVIDEND_FALLBACK_DAYS * 24 * 60 * 60 * 1000));
  const dividendStartDate = latestDividendDate
    ? isoDate(new Date(new Date(`${latestDividendDate}T00:00:00`).getTime() + 24 * 60 * 60 * 1000))
    : latestTradeDate
    ? isoDate(new Date(new Date(`${latestTradeDate}T00:00:00`).getTime() + 24 * 60 * 60 * 1000))
    : fallbackDividendStart;

  const [tradeJson, dividendJson] = await Promise.all([
    fetchBridgeJson(`/history?start=${tradeStartDate}&end=${end}&market=${encodeURIComponent(DEFAULT_MARKET)}&trd_env=${encodeURIComponent(DEFAULT_TRD_ENV)}`),
    fetchBridgeJson(`/dividends?start=${dividendStartDate}&end=${end}&market=${encodeURIComponent(DEFAULT_MARKET)}&trd_env=${encodeURIComponent(DEFAULT_TRD_ENV)}`),
  ]);

  const incomingRows = [...(tradeJson?.rows || []), ...(dividendJson?.rows || [])].map((row) => ({
    ...row,
    user_id: userId,
  }));
  const existingKeys = new Set(existingTransactions.map(dedupeKeyForTxn));
  const newRows = incomingRows.filter((row) => !existingKeys.has(dedupeKeyForTxn(row)));

  if (newRows.length > 0) {
    await insertTransactions(newRows);
  }

  const refreshedAt = new Date().toISOString();
  await upsertSetting(userId, 'futu_transactions_refreshed_at', refreshedAt);

  return {
    inserted_rows: newRows.length,
    fetched_rows: incomingRows.length,
    trade_start_date: tradeStartDate,
    dividend_start_date: dividendStartDate,
    end_date: end,
    refreshed_at: refreshedAt,
  };
}

async function refreshPrices(userId, mode = 'live', overrideTickers = null) {
  let tickers;
  if (overrideTickers && overrideTickers.length > 0) {
    tickers = overrideTickers;
  } else {
    const transactions = await loadUserTransactions(userId);
    tickers = deriveQuoteTickers(transactions);
  }
  const refreshedAt = new Date().toISOString();
  if (tickers.length === 0) {
    await upsertSetting(userId, 'futu_prices_refreshed_at', refreshedAt);
    return { tickers: [], updated_count: 0, refreshed_at: refreshedAt, mode };
  }

  const quoteJson = await fetchBridgeJson(
    `/quotes?market=${encodeURIComponent(DEFAULT_MARKET)}&mode=${encodeURIComponent(mode)}&tickers=${encodeURIComponent(tickers.join(','))}`
  );
  const quotes = quoteJson?.quotes || {};
  const previousCloseByTicker = {};
  if (String(mode || 'live').toLowerCase() === 'live') {
    const pnlToday = zonedIsoDate(new Date(), PNL_REFRESH_TIMEZONE);
    const { data: dailyRows, error: dailyError } = await supabase
      .from('securities_daily_quotes')
      .select('ticker,quote_date,price')
      .eq('user_id', userId)
      .in('ticker', tickers)
      .lt('quote_date', pnlToday)
      .order('quote_date', { ascending: false });
    if (dailyError) {
      console.warn(`[${new Date().toLocaleString()}] Loading previous daily closes failed: ${dailyError.message}`);
    } else {
      for (const row of dailyRows || []) {
        const ticker = String(row.ticker || '').toUpperCase();
        if (ticker && previousCloseByTicker[ticker] == null) previousCloseByTicker[ticker] = Number(row.price || 0);
      }
    }
  }
  const skippedStaleCloseTickers = [];
  const updates = Object.entries(quotes)
    .filter(([, quote]) => quote?.price != null)
    .map(([ticker, quote]) => {
      const normalizedTicker = String(ticker || '').toUpperCase();
      const updatedAt = quote.updatedAt || quote.data_time || refreshedAt;
      const source = quote.source || PRICE_MODE_SOURCE[mode] || PRICE_MODE_SOURCE.live;
      const looksLikePreviousClose =
        String(mode || 'live').toLowerCase() === 'live'
        && isTimeOnlyMarketClose(updatedAt)
        && samePrice(quote.price, previousCloseByTicker[normalizedTicker]);
      if (looksLikePreviousClose) {
        skippedStaleCloseTickers.push(normalizedTicker);
        return null;
      }
      return {
        user_id: userId,
        key: `latest_stock_price:${normalizedTicker}`,
        value: JSON.stringify({
          price: Number(quote.price),
          updated_at: updatedAt,
          source,
        }),
      };
    })
    .filter(Boolean);

  if (updates.length > 0) {
    const { error } = await supabase.from('user_settings').upsert(updates, { onConflict: 'user_id,key' });
    if (error) throw new Error(`Saving prices failed: ${error.message}`);
  }
  if (skippedStaleCloseTickers.length > 0) {
    console.log(`[${new Date().toLocaleString()}] Skipped stale close-like live prices for ${skippedStaleCloseTickers.join(', ')}`);
  }
  const skippedStaleCloseSet = new Set(skippedStaleCloseTickers);
  const savedQuotes = Object.fromEntries(
    Object.entries(quotes).filter(([ticker]) => !skippedStaleCloseSet.has(String(ticker || '').toUpperCase()))
  );

  let dailyQuoteCount = 0;
  try {
    const today = isoDate(new Date());
    const start = addDays(today, -10);
    const dailyJson = await fetchBridgeJson(
      `/historical-daily-quotes?market=${encodeURIComponent(DEFAULT_MARKET)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(today)}&tickers=${encodeURIComponent(tickers.join(','))}`
    );
    const dailyQuotes = dailyJson?.quotes || [];
    dailyQuoteCount = dailyQuotes.length;
    await saveDailyQuotes(userId, dailyQuotes.map(row => ({
      user_id: userId,
      quote_date: row.quote_date,
      ticker: row.ticker,
      market: DEFAULT_MARKET,
      price: Number(row.price || 0),
      source: row.source || 'Futu daily close',
      data_time: row.data_time || '',
      refreshed_at: refreshedAt,
    })));
  } catch (error) {
    console.warn(`[${new Date().toLocaleString()}] Saving daily quote cache failed: ${error.message}`);
  }

  let monthlyAnchorCount = 0;
  try {
    const today = isoDate(new Date());
    const currentMonth = monthKeyFromDate(today);
    const startMonth = `${Number(currentMonth.slice(0, 4)) - 1}-12`;
    const endMonth = getPreviousMonthKey(currentMonth);
    if (startMonth <= endMonth) {
      const monthEndJson = await fetchBridgeJson(
        `/month-end-quotes?market=${encodeURIComponent(DEFAULT_MARKET)}&start_month=${encodeURIComponent(startMonth)}&end_month=${encodeURIComponent(endMonth)}&tickers=${encodeURIComponent(tickers.join(','))}`
      );
      const monthEndQuotes = monthEndJson?.quotes || [];
      monthlyAnchorCount = monthEndQuotes.length;
      await saveMonthlyQuotes(userId, monthEndQuotes.map(row => ({
        user_id: userId,
        month_key: row.month_key,
        ticker: row.ticker,
        market: DEFAULT_MARKET,
        quote_date: row.quote_date,
        price: Number(row.price || 0),
        source: row.source || 'Futu month-end close',
        data_time: row.data_time || '',
        refreshed_at: refreshedAt,
      })));
    }
  } catch (error) {
    console.warn(`[${new Date().toLocaleString()}] Saving month-end anchors failed: ${error.message}`);
  }

  // Also store 52-week high if the bridge returns it (Futu get_market_snapshot provides highest_52weeks_price)
  const athUpdates = Object.entries(quotes)
    .map(([ticker, quote]) => {
      const high52w = quote?.high52w ?? quote?.highest_52weeks_price ?? quote?.high_52weeks ?? null;
      if (high52w == null || Number(high52w) <= 0) return null;
      return { user_id: userId, key: `latest_stock_ath:${ticker}`, value: JSON.stringify({ high52w: Number(high52w), updated_at: refreshedAt }) };
    })
    .filter(Boolean);

  if (athUpdates.length > 0) {
    await supabase.from('user_settings').upsert(athUpdates, { onConflict: 'user_id,key' });
  }

  await upsertSetting(userId, 'futu_prices_refreshed_at', refreshedAt);

  return {
    tickers,
    updated_count: updates.length,
    skipped_stale_close_count: skippedStaleCloseTickers.length,
    daily_quote_count: dailyQuoteCount,
    monthly_anchor_count: monthlyAnchorCount,
    refreshed_at: refreshedAt,
    mode,
    quotes: savedQuotes,
  };
}

async function refreshSummary(userId) {
  const summary = await fetchBridgeJson(`/account-summary?market=${encodeURIComponent(DEFAULT_MARKET)}&trd_env=${encodeURIComponent(DEFAULT_TRD_ENV)}`);
  await upsertSetting(userId, 'futu_account_summary', JSON.stringify(summary));
  return summary;
}

async function refreshStatistics(userId, mode = 'live', startMonth = DEFAULT_STATISTICS_START_MONTH) {
  const transactions = await loadUserTransactions(userId);
  const tickers = deriveQuoteTickers(transactions);
  const refreshedAt = new Date().toISOString();
  const today = isoDate(new Date());
  const currentMonth = monthKeyFromDate(today);
  const lastCompletedMonth = getPreviousMonthKey(currentMonth);

  if (tickers.length === 0) {
    await upsertSetting(userId, 'futu_statistics_refreshed_at', refreshedAt);
    return { start_month: startMonth, end_month: lastCompletedMonth, quote_count: 0, snapshot_count: 0, refreshed_at: refreshedAt };
  }

  const pricesResult = await refreshPrices(userId, mode);
  const currentQuoteMap = Object.fromEntries(
    Object.entries(pricesResult.quotes || {})
      .filter(([, quote]) => quote?.price != null)
      .map(([ticker, quote]) => [ticker, Number(quote.price)])
  );

  let monthEndQuotes = [];
  if (lastCompletedMonth >= startMonth) {
    const monthEndJson = await fetchBridgeJson(
      `/month-end-quotes?market=${encodeURIComponent(DEFAULT_MARKET)}&start_month=${encodeURIComponent(startMonth)}&end_month=${encodeURIComponent(lastCompletedMonth)}&tickers=${encodeURIComponent(tickers.join(','))}`
    );
    monthEndQuotes = monthEndJson?.quotes || [];
    await saveMonthlyQuotes(userId, monthEndQuotes.map((row) => ({
      user_id: userId,
      month_key: row.month_key,
      ticker: row.ticker,
      market: DEFAULT_MARKET,
      quote_date: row.quote_date,
      price: Number(row.price || 0),
      source: row.source || 'Futu month-end close',
      data_time: row.data_time || '',
      refreshed_at: refreshedAt,
    })));
  }

  const quotesByMonth = new Map();
  for (const row of monthEndQuotes) {
    if (!quotesByMonth.has(row.month_key)) quotesByMonth.set(row.month_key, {});
    quotesByMonth.get(row.month_key)[row.ticker] = Number(row.price || 0);
  }

  const snapshotRows = [];
  for (const monthKey of enumerateMonthKeys(startMonth, lastCompletedMonth)) {
    const quoteMap = quotesByMonth.get(monthKey) || {};
    const rows = buildSnapshotRows(transactions, getMonthEndDate(monthKey), monthKey, quoteMap, 'month_end', refreshedAt)
      .map((row) => ({ ...row, user_id: userId }));
    snapshotRows.push(...rows);
  }

  snapshotRows.push(
    ...buildSnapshotRows(transactions, today, currentMonth, currentQuoteMap, 'current', refreshedAt)
      .map((row) => ({ ...row, user_id: userId }))
  );

  await savePerformanceSnapshots(snapshotRows);
  await upsertSetting(userId, 'futu_statistics_refreshed_at', refreshedAt);

  return {
    start_month: startMonth,
    end_month: lastCompletedMonth,
    quote_count: monthEndQuotes.length,
    snapshot_count: snapshotRows.length,
    refreshed_at: refreshedAt,
    price_mode: mode,
  };
}

// ── News fetching ───────────────────────────────────────────────────────────

const XAI_API_BASE = 'https://api.x.ai/v1/responses';

async function grokRequest(prompt, apiKey, model, timeoutMs = 5 * 60 * 1000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(XAI_API_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: [{ role: 'user', content: prompt }], tools: [{ type: 'web_search' }] }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`xAI API ${resp.status}`);
    const data = await resp.json();
    return (
      data.output_text ||
      data.output?.find(i => i.type === 'message')?.content?.find(c => c.type === 'output_text')?.text ||
      ''
    ).trim();
  } finally {
    clearTimeout(timer);
  }
}

function cleanGrokJson(raw) {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function validTickerNews(item) {
  if (typeof item?.ticker === 'string' && typeof item.headline === 'string' && item.headline) {
    return {
      ticker: item.ticker.toUpperCase(),
      headline: item.headline,
      summary: item.summary || '',
      price: item.price,
      price_change_pct: item.price_change_pct,
    };
  }
  return null;
}

function validCustomNews(item) {
  if (typeof item?.query_id === 'string' && typeof item.headline === 'string' && item.headline) {
    return { query_id: item.query_id, headline: item.headline, summary: item.summary || '' };
  }
  return null;
}

const MARKET_BRIEF_TICKER = 'MARKET_BRIEF';
const DEFAULT_NEWS_XAI_PROMPT =
  `Use web search once. Write one article from the requested stocks and custom topics, but keep unrelated themes separate.\n` +
  `Structure the article with short section headings when topics differ, e.g. Markets, Australia/Hong Kong, K-pop. Only combine topics in the same paragraph if they are directly related.\n` +
  `For ticker/finance sections, include only material current market news from roughly the last 24 hours: earnings/guidance, M&A, regulation, analyst action, major product/news events, or >3% price moves.\n` +
  `For non-finance custom topics, summarise them independently and do not force a finance angle unless the story clearly affects markets or a requested security.\n` +
  `Mention ticker symbols and custom topics naturally inside the article; do not make one card/list item per ticker.\n` +
  `If a section has no material/current news, say that briefly inside that section.`;

function validBriefNews(item) {
  const headline = item?.headline ?? item?.h;
  const summary = item?.summary ?? item?.m ?? item?.body ?? item?.article;
  if (typeof headline === 'string' && headline && typeof summary === 'string' && summary) {
    return { headline, summary: summary.trim() };
  }
  return null;
}

async function fetchNewsBatch(tickers, queries, apiKey, model, today, customPrompt = '') {
  const instructions = customPrompt.trim() || DEFAULT_NEWS_XAI_PROMPT;
  const prompt =
    `D=${today}\n` +
    `T=${tickers.length ? tickers.join(',') : '-'}\n` +
    `Q=${queries.length ? queries.map(q => `${q.id}:${q.query_text}`).join(' | ') : '-'}\n\n` +
    `${instructions}\n\n` +
    `JSON only. No markdown.\n` +
    `{"brief":{"h":"Headline max 14 words","m":"4-8 paragraph market brief, 250-600 words"}}`;
  try {
    const raw = await grokRequest(prompt, apiKey, model);
    const parsed = JSON.parse(cleanGrokJson(raw));
    const tickerNews = new Map();
    const customNews = new Map();
    const briefNews = validBriefNews(parsed?.brief ?? parsed?.article ?? parsed);
    for (const item of Array.isArray(parsed?.tickers) ? parsed.tickers : []) {
      const news = validTickerNews(item);
      if (news) tickerNews.set(news.ticker, news);
    }
    for (const item of Array.isArray(parsed?.queries) ? parsed.queries : []) {
      const news = validCustomNews(item);
      if (news) customNews.set(news.query_id, news);
    }
    return { tickerNews, customNews, briefNews };
  } catch {
    return { tickerNews: new Map(), customNews: new Map(), briefNews: null };
  }
}


async function fetchNewsForUser(userId, { apiKey, model, includeHoldings, includeWatchlist, excluded, today, newsPrompt = '' }) {
  const fetchedAt = new Date().toISOString();

  const saveResult = (value) =>
    supabase.from('user_settings').upsert(
      [{ user_id: userId, key: 'news_last_auto_fetch_result', value: JSON.stringify(value) }],
      { onConflict: 'user_id,key' }
    );

  // Save date upfront so a crash won't cause a retry loop
  await Promise.all([
    supabase.from('user_settings').upsert(
      [{ user_id: userId, key: 'news_last_auto_fetch_date', value: today }],
      { onConflict: 'user_id,key' }
    ),
    saveResult({ status: 'running', date: today, time: fetchedAt }),
  ]);

  // Collect tickers
  const tickerSet = new Set();
  if (includeHoldings) {
    const { data } = await supabase.from('securities_transactions').select('ticker').eq('user_id', userId).not('ticker', 'is', null);
    for (const r of data || []) if (r.ticker) tickerSet.add(r.ticker.toUpperCase().trim());
  }
  if (includeWatchlist) {
    const { data } = await supabase.from('watchlist_items').select('ticker').eq('user_id', userId);
    for (const r of data || []) if (r.ticker) tickerSet.add(r.ticker.toUpperCase().trim());
  }
  const tickers = [...tickerSet].filter(t => !excluded.has(t)).sort();

  const { data: customQueries } = await supabase.from('news_custom_queries').select('id,query_text').eq('user_id', userId);
  const queries = customQueries || [];

  const { tickerNews, customNews, briefNews } = await fetchNewsBatch(tickers, queries, apiKey, model, today, newsPrompt);

  await Promise.allSettled([
    supabase.from('stock_news_items').delete().eq('user_id', userId).eq('fetch_date', today).neq('ticker', MARKET_BRIEF_TICKER),
    supabase.from('custom_news_items').delete().eq('user_id', userId).eq('fetch_date', today),
  ]);

  if (briefNews) {
    await supabase.from('stock_news_items').upsert({
      user_id: userId,
      ticker: MARKET_BRIEF_TICKER,
      fetch_date: today,
      headline: briefNews.headline,
      summary: briefNews.summary,
      price: null,
      price_change_pct: null,
      is_read: false,
      fetched_at: fetchedAt,
    }, { onConflict: 'user_id,ticker,fetch_date', ignoreDuplicates: false });
    await saveResult({ status: 'success', date: today, time: new Date().toISOString(), items: 1 });
    console.log(`[${new Date().toLocaleString()}] News: market brief for ${tickers.length} tickers + ${queries.length} queries`);
    return { items: 1, tickers: 1, customItems: 0 };
  }

  let newsCount = 0;
  await Promise.allSettled(tickers.map(ticker => {
    const news = tickerNews.get(ticker);
    if (news?.headline) newsCount++;
    return supabase.from('stock_news_items').upsert({
      user_id: userId, ticker, fetch_date: today,
      headline: news?.headline || '',
      summary: news?.summary || '',
      price: news?.price ?? null,
      price_change_pct: news?.price_change_pct ?? null,
      is_read: false,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'user_id,ticker,fetch_date', ignoreDuplicates: false });
  }));

  let customCount = 0;
  await Promise.allSettled(queries.map(q => {
    const news = customNews.get(q.id);
    if (news?.headline) customCount++;
    return supabase.from('custom_news_items').upsert({
      user_id: userId, query_id: q.id, fetch_date: today,
      headline: news?.headline || '',
      summary: news?.summary || '',
      is_read: false,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'user_id,query_id,fetch_date', ignoreDuplicates: false });
  }));

  const total = newsCount + customCount;
  await saveResult({ status: 'success', date: today, time: new Date().toISOString(), items: total });
  console.log(`[${new Date().toLocaleString()}] News: ${tickers.length} tickers + ${queries.length} queries → ${total} with news`);
  return { items: total, tickers: newsCount, customItems: customCount };
}

// ─── Scheduled task: news_fetch ─────────────────────────────────────────────

async function getEligibleNewsUsers() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
  const [
    { data: ftData },
    { data: ftLegacy },
    { data: tzData },
    { data: apiKeyData },
    { data: lastRunData },
  ] = await Promise.all([
    supabase.from('user_settings').select('user_id,value').eq('key', 'news_fetch_times'),
    supabase.from('user_settings').select('user_id,value').eq('key', 'news_fetch_time'),
    supabase.from('user_settings').select('user_id,value').eq('key', 'news_fetch_timezone'),
    supabase.from('user_settings').select('user_id,value').eq('key', 'xai_api_key'),
    supabase.from('user_settings').select('user_id,value').eq('key', 'news_last_auto_fetch_result'),
  ]);

  const tzMap = Object.fromEntries((tzData || []).map(s => [s.user_id, s.value]));
  const apiKeyMap = Object.fromEntries((apiKeyData || []).map(s => [s.user_id, s.value]));
  const lastRunMap = {};
  for (const s of lastRunData || []) {
    try { lastRunMap[s.user_id] = JSON.parse(s.value); } catch {}
  }

  // Merge news_fetch_times (array) with legacy news_fetch_time (single)
  const timesMap = {};
  for (const s of ftData || []) timesMap[s.user_id] = parseScheduleTimes(s.value);
  for (const s of ftLegacy || []) {
    if (!timesMap[s.user_id]) timesMap[s.user_id] = parseScheduleTimes(s.value);
  }

  const eligible = [];
  for (const [userId, times] of Object.entries(timesMap)) {
    if (!times.length) continue;
    const tz = tzMap[userId] || 'Asia/Hong_Kong';
    if (!isInTimeWindow(times, tz)) continue;
    if (isInCooldown(lastRunMap[userId])) continue;
    const apiKey = apiKeyMap[userId];
    if (!apiKey) continue;
    eligible.push({ userId, apiKey, today });
  }
  return eligible;
}

async function runNewsFetchForUser({ userId, apiKey, today }) {
  const { data: moreSettings } = await supabase.from('user_settings').select('key,value')
    .eq('user_id', userId)
    .in('key', ['xai_model', 'news_excluded_tickers', 'news_include_holdings', 'news_include_watchlist', 'news_xai_prompt']);
  const sm = Object.fromEntries((moreSettings || []).map(s => [s.key, s.value]));
  let excludedArr = [];
  try { excludedArr = JSON.parse(sm['news_excluded_tickers'] || '[]'); } catch {}

  try {
    const result = await fetchNewsForUser(userId, {
      apiKey,
      model: sm['xai_model'] || 'grok-3-latest',
      includeHoldings: sm['news_include_holdings'] !== 'false',
      includeWatchlist: sm['news_include_watchlist'] !== 'false',
      excluded: new Set(excludedArr.map(t => t.toUpperCase())),
      today,
      newsPrompt: sm['news_xai_prompt'] || '',
    });
    if ((result?.items || 0) > 0) {
      await sendPushNotification({
        userId,
        title: 'Market news ready',
        body: `${result.items} news item${result.items === 1 ? '' : 's'} arrived`,
        tag: 'news',
      });
    }
  } catch (err) {
    console.error(`[${new Date().toLocaleString()}] News fetch failed for ${userId}: ${err.message}`);
    await supabase.from('user_settings').upsert(
      [{ user_id: userId, key: 'news_last_auto_fetch_result', value: JSON.stringify({ status: 'failed', date: today, time: new Date().toISOString(), error: err.message }) }],
      { onConflict: 'user_id,key' }
    ).catch(() => {});
    throw err;
  }
}

// ─── Scheduled task: pnl_refresh ────────────────────────────────────────────

async function getEligiblePnlUsers() {
  const [
    { data: refreshTimeData },
    { data: priceModeData },
    { data: lastRunData },
  ] = await Promise.all([
    supabase.from('user_settings').select('user_id,value').eq('key', 'pnl_auto_refresh_time'),
    supabase.from('user_settings').select('user_id,value').eq('key', 'futu_price_mode'),
    supabase.from('user_settings').select('user_id,value').eq('key', 'pnl_last_auto_run'),
  ]);

  const priceModeMap = Object.fromEntries((priceModeData || []).map(s => [s.user_id, s.value]));
  const lastRunMap = {};
  for (const s of lastRunData || []) {
    try { lastRunMap[s.user_id] = JSON.parse(s.value); } catch {}
  }

  const eligible = [];
  for (const s of refreshTimeData || []) {
    const userId = s.user_id;
    const times = parseScheduleTimes(s.value);
    if (!times.length) continue;
    if (!isInTimeWindow(times, PNL_REFRESH_TIMEZONE)) continue;
    if (wasRunSuccessfullyToday(lastRunMap[userId], PNL_REFRESH_TIMEZONE)) continue;
    eligible.push({ userId, priceMode: priceModeMap[userId] || 'live' });
  }
  return eligible;
}

async function runPnlRefreshForUser({ userId, priceMode }) {
  // Save optimistically so a crash doesn't trigger an immediate retry
  await supabase.from('user_settings').upsert(
    [{ user_id: userId, key: 'pnl_last_auto_run', value: JSON.stringify({ status: 'success', time: new Date().toISOString() }) }],
    { onConflict: 'user_id,key' }
  );
  await supabase.from('futu_refresh_requests').insert({
    user_id: userId,
    request_type: 'full_sync',
    status: 'pending',
    payload: { trigger: 'scheduled_pnl', price_mode: priceMode },
    requested_at: new Date().toISOString(),
  });
  console.log(`[${new Date().toLocaleString()}] PnL auto-refresh queued for user ${userId} (${priceMode})`);
}

// ─── Startup catch-up: queue any scheduled refreshes missed while listener was down ───

async function runMissedScheduledRefreshes() {
  const [
    { data: refreshTimeData },
    { data: priceModeData },
    { data: lastRunData },
  ] = await Promise.all([
    supabase.from('user_settings').select('user_id,value').eq('key', 'pnl_auto_refresh_time'),
    supabase.from('user_settings').select('user_id,value').eq('key', 'futu_price_mode'),
    supabase.from('user_settings').select('user_id,value').eq('key', 'pnl_last_auto_run'),
  ]);

  const priceModeMap = Object.fromEntries((priceModeData || []).map(s => [s.user_id, s.value]));
  const lastRunMap = {};
  for (const s of lastRunData || []) {
    try { lastRunMap[s.user_id] = JSON.parse(s.value); } catch {}
  }

  for (const s of refreshTimeData || []) {
    const userId = s.user_id;
    const times = parseScheduleTimes(s.value);
    if (!times.length) continue;
    if (!hasScheduledTimePassed(times, PNL_REFRESH_TIMEZONE)) continue;
    if (wasRunSuccessfullyToday(lastRunMap[userId], PNL_REFRESH_TIMEZONE)) continue;
    console.log(`[${new Date().toLocaleString()}] Startup catch-up: queuing missed PnL refresh for user ${userId} (scheduled ${times.join(', ')} ${PNL_REFRESH_TIMEZONE})`);
    await runPnlRefreshForUser({ userId, priceMode: priceModeMap[userId] || 'live' });
  }
}

// ─── Scheduler registration ──────────────────────────────────────────────────
// Add future scheduled tasks here — no changes needed in keepAlive or elsewhere.

const scheduler = new Scheduler();

scheduler.register({
  name: 'news_fetch',
  checkIntervalMs: 5 * 60 * 1000,
  getEligibleUsers: getEligibleNewsUsers,
  run: runNewsFetchForUser,
});

scheduler.register({
  name: 'pnl_refresh',
  checkIntervalMs: 5 * 60 * 1000,
  getEligibleUsers: getEligiblePnlUsers,
  run: runPnlRefreshForUser,
});

async function heartbeat(requestId) {
  await supabase
    .from('futu_refresh_requests')
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq('id', requestId);
}

async function claimRequest(requestId) {
  const startedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('futu_refresh_requests')
    .update({ status: 'running', started_at: startedAt, last_heartbeat_at: startedAt, error: null })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Claiming request failed: ${error.message}`);
  return data;
}

async function completeRequest(requestId, result) {
  const completedAt = new Date().toISOString();
  const { error } = await supabase
    .from('futu_refresh_requests')
    .update({
      status: 'completed',
      completed_at: completedAt,
      last_heartbeat_at: completedAt,
      error: null,
      result,
    })
    .eq('id', requestId);
  if (error) throw new Error(`Completing request failed: ${error.message}`);
}

async function failRequest(requestId, errorMessage) {
  const completedAt = new Date().toISOString();
  const { error } = await supabase
    .from('futu_refresh_requests')
    .update({
      status: 'failed',
      completed_at: completedAt,
      last_heartbeat_at: completedAt,
      error: errorMessage,
    })
    .eq('id', requestId);
  if (error) throw new Error(`Failing request failed: ${error.message}`);
}

async function fetchMonthlyQuotesForTickers(userId, payload) {
  const tickers = (payload.tickers || []).map(t => String(t).trim().toUpperCase()).filter(Boolean);
  const startMonth = String(payload.start_month || getPreviousMonthKey(monthKeyFromDate(isoDate(new Date()))));
  const endMonth   = String(payload.end_month   || startMonth);
  const refreshedAt = new Date().toISOString();

  if (tickers.length === 0) return { quote_count: 0, refreshed_at: refreshedAt };

  const monthEndJson = await fetchBridgeJson(
    `/month-end-quotes?market=${encodeURIComponent(DEFAULT_MARKET)}&start_month=${encodeURIComponent(startMonth)}&end_month=${encodeURIComponent(endMonth)}&tickers=${encodeURIComponent(tickers.join(','))}`
  );
  const quotes = monthEndJson?.quotes || [];

  await saveMonthlyQuotes(userId, quotes.map(row => ({
    user_id: userId,
    month_key: row.month_key,
    ticker: row.ticker,
    market: DEFAULT_MARKET,
    quote_date: row.quote_date,
    price: Number(row.price || 0),
    source: row.source || 'Futu month-end close',
    data_time: row.data_time || '',
    refreshed_at: refreshedAt,
  })));

  return { tickers, quote_count: quotes.length, start_month: startMonth, end_month: endMonth, refreshed_at: refreshedAt };
}

async function processRequest(requestRow) {
  const claimed = await claimRequest(requestRow.id);
  if (!claimed) return;

  const requestType = claimed.request_type;
  const userId = claimed.user_id;
  const payload = claimed.payload || {};
  const priceMode = String(payload.price_mode || 'live');
  const startMonth = String(payload.start_month || DEFAULT_STATISTICS_START_MONTH);

  console.log(`[${new Date().toLocaleString()}] Processing ${requestType} for ${userId}`);

  const heartbeatTimer = setInterval(() => {
    heartbeat(claimed.id).catch(() => {});
  }, 10000);

  try {
    const result = {};
    if (requestType === 'transactions' || requestType === 'full_sync') {
      result.transactions = await syncTransactions(userId);
    }
    if (requestType === 'prices' || requestType === 'full_sync') {
      const payloadTickers = (payload.tickers || []).map(t => String(t).trim().toUpperCase()).filter(Boolean);
      result.prices = await refreshPrices(userId, priceMode, payloadTickers.length > 0 ? payloadTickers : null);
    }
    if (requestType === 'summary' || requestType === 'full_sync') {
      result.summary = await refreshSummary(userId);
    }
    if (requestType === 'statistics') {
      result.statistics = await refreshStatistics(userId, priceMode, startMonth);
    }
    if (requestType === 'monthly_quotes') {
      result.monthly_quotes = await fetchMonthlyQuotesForTickers(userId, payload);
    }
    if (requestType === 'news_fetch') {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
      const { data: newsSettingsData } = await supabase.from('user_settings').select('key,value').eq('user_id', userId)
        .in('key', ['xai_api_key', 'xai_model', 'news_excluded_tickers', 'news_include_holdings', 'news_include_watchlist', 'news_xai_prompt']);
      const nsm = Object.fromEntries((newsSettingsData || []).map(s => [s.key, s.value]));
      const apiKey = nsm['xai_api_key'];
      if (!apiKey) throw new Error('No xAI API key configured');
      let excludedArr = [];
      try { excludedArr = JSON.parse(nsm['news_excluded_tickers'] || '[]'); } catch {}
      result.news = await fetchNewsForUser(userId, {
        apiKey,
        model: nsm['xai_model'] || 'grok-3-latest',
        includeHoldings: nsm['news_include_holdings'] !== 'false',
        includeWatchlist: nsm['news_include_watchlist'] !== 'false',
        excluded: new Set(excludedArr.map(t => t.toUpperCase())),
        today,
        newsPrompt: nsm['news_xai_prompt'] || '',
      });
    }

    await completeRequest(claimed.id, result);
    if (requestType === 'news_fetch' && (result.news?.items || 0) > 0) {
      await sendPushNotification({
        userId,
        title: 'Market news ready',
        body: `${result.news.items} news item${result.news.items === 1 ? '' : 's'} arrived`,
        tag: 'news',
      });
    }
    if (
      (requestType === 'summary' || requestType === 'full_sync') &&
      payload.trigger !== 'manual_pnl'
    ) {
      await sendPushNotification({
        userId,
        title: 'P&L refreshed',
        body: 'Remote Futu P&L data is ready',
        tag: 'pnl',
      });
    }
    console.log(`[${new Date().toLocaleString()}] Completed ${requestType} for ${userId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failRequest(claimed.id, message);
    console.error(`[${new Date().toLocaleString()}] Failed ${requestType} for ${userId}: ${message}`);
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function processPendingRequests() {
  const { data, error } = await supabase
    .from('futu_refresh_requests')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(20);
  if (error) throw new Error(`Loading pending requests failed: ${error.message}`);
  for (const request of data || []) {
    await processRequest(request);
  }
}

async function ensureBridgeAvailable() {
  for (;;) {
    try {
      await fetchBridgeJson('/health');
      return;
    } catch (error) {
      console.log(`[${new Date().toLocaleString()}] Waiting for local Futu bridge... ${error.message}`);
      await delay(5000);
    }
  }
}

async function resetStaleRunningRequests() {
  const { data, error } = await supabase
    .from('futu_refresh_requests')
    .update({ status: 'failed', error: 'Listener restarted — request was stuck in running state', completed_at: new Date().toISOString() })
    .eq('status', 'running')
    .select('id,request_type');
  if (error) {
    console.error(`[${new Date().toLocaleString()}] Failed to reset stale requests: ${error.message}`);
  } else if (data?.length > 0) {
    console.log(`[${new Date().toLocaleString()}] Reset ${data.length} stale running request(s): ${data.map(r => r.request_type).join(', ')}`);
  }
}

async function main() {
  await ensureBridgeAvailable();
  console.log(`Futu remote listener connected to ${SUPABASE_URL}`);
  console.log(`Watching refresh requests and forwarding to ${BRIDGE_BASE_URL}`);

  await resetStaleRunningRequests();
  await processPendingRequests();
  await runMissedScheduledRefreshes().catch(err =>
    console.error(`[${new Date().toLocaleString()}] Startup catch-up failed: ${err.message}`)
  );

  const channel = supabase
    .channel('futu-refresh-requests')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'futu_refresh_requests',
        filter: 'status=eq.pending',
      },
      async (payload) => {
        try {
          await processRequest(payload.new);
        } catch (error) {
          console.error(`[${new Date().toLocaleString()}] Listener error:`, error);
        }
      }
    )
    .subscribe((status) => {
      console.log(`[${new Date().toLocaleString()}] Realtime status: ${status}`);
      if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        console.log(`[${new Date().toLocaleString()}] Falling back to periodic polling until Realtime reconnects.`);
      }
    });

  const keepAlive = async () => {
    for (;;) {
      await delay(15000);
      await processPendingRequests().catch((error) => {
        console.error(`[${new Date().toLocaleString()}] Pending sweep failed:`, error);
      });
      await scheduler.tick().catch((error) => {
        console.error(`[${new Date().toLocaleString()}] Scheduler tick failed:`, error);
      });
    }
  };

  await keepAlive();
  await supabase.removeChannel(channel);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
