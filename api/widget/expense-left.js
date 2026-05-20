import {
  createWidgetClient,
  findUserByWidgetToken,
  formatLocalDate,
  parseJsonObject,
  setWidgetHeaders,
  todayIso,
  zonedIsoDate,
} from './_shared.js';

const SECURITY_TYPES = new Set(['BUY', 'SELL', 'DIVIDEND']);
const FUTU_PNL_TIME_ZONE = 'America/New_York';
const FALLBACK_RATES_USD = {
  USD: 1,
  AUD: 1.54,
  HKD: 7.78,
  CNY: 7.12,
  EUR: 0.92,
  GBP: 0.78,
  JPY: 155,
  THB: 34.2,
};

const fmtCurrency = (value, currency = 'AUD') => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-AU')}`;
  }
};

const fmtAmount = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const rounded = Math.round(Number(value));
  if (Math.abs(rounded) === 0) return '0';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toLocaleString('en-AU')}`;
};

const fmtPercent = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const rounded = Number(value);
  if (Math.abs(rounded) < 0.005) return '0.00%';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(2)}%`;
};

const monthKeyFromDate = (value) => String(value || '').slice(0, 7);

const previousMonthKey = (monthKey) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return '';
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
};

const previousYearEndMonthKey = (dateStr) => `${Number(String(dateStr || todayIso()).slice(0, 4)) - 1}-12`;

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
  return String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id || '').localeCompare(String(b.id || ''));
}

function quoteMapForRows(rows) {
  return Object.fromEntries(
    (rows || [])
      .filter((row) => row.ticker && row.price != null)
      .map((row) => [String(row.ticker).toUpperCase(), Number(row.price)])
  );
}

function latestQuoteDateForRows(rows, fallbackDate) {
  return (rows || [])
    .map((row) => row.quote_date)
    .filter(Boolean)
    .sort()
    .at(-1) || fallbackDate;
}

function buildTotalPnlSnapshot(transactions, snapshotDate, quoteMap) {
  if (!snapshotDate || !quoteMap) return null;
  const positions = new Map();
  transactions
    .filter((txn) => txn.ticker && SECURITY_TYPES.has(txn.type))
    .filter((txn) => String(txn.transaction_date || '') <= snapshotDate)
    .slice()
    .sort(compareTxnOrder)
    .forEach((txn) => {
      const ticker = String(txn.ticker || '').trim().toUpperCase();
      if (!positions.has(ticker)) positions.set(ticker, { shares: 0, avgCost: 0, realizedPnl: 0, dividends: 0 });
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
    });

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

function adjustedPeriodCapitalBase(transactions, snapshotDate, endDate, snapshotMarketValue) {
  if (!snapshotDate || !endDate) return Math.abs(Number(snapshotMarketValue || 0));
  const netSecurityFlows = transactions
    .filter((txn) => txn.type === 'BUY' || txn.type === 'SELL')
    .filter((txn) => {
      const date = String(txn.transaction_date || '');
      return date > snapshotDate && date <= endDate;
    })
    .reduce((sum, txn) => sum + (txn.type === 'BUY' ? Math.abs(Number(txn.amount || 0)) : -Math.abs(Number(txn.amount || 0))), 0);
  return Math.abs(Number(snapshotMarketValue || 0)) + netSecurityFlows;
}

function currentQuoteMapFromSettings(settings, transactions) {
  const map = {};
  (settings || [])
    .filter((row) => String(row.key || '').startsWith('latest_stock_price:'))
    .forEach((row) => {
      const ticker = String(row.key).split(':')[1]?.toUpperCase();
      const parsed = parseJsonObject(row.value);
      if (ticker && parsed?.price != null) map[ticker] = Number(parsed.price);
    });

  transactions
    .filter((txn) => txn.ticker && (txn.type === 'BUY' || txn.type === 'SELL') && txn.price != null)
    .slice()
    .sort(compareTxnOrder)
    .forEach((txn) => {
      const ticker = String(txn.ticker || '').trim().toUpperCase();
      if (ticker && map[ticker] == null) map[ticker] = Number(txn.price || 0);
    });
  return map;
}

function currentQuoteDetailsFromSettings(settings) {
  const map = {};
  (settings || [])
    .filter((row) => String(row.key || '').startsWith('latest_stock_price:'))
    .forEach((row) => {
      const ticker = String(row.key).split(':')[1]?.toUpperCase();
      const parsed = parseJsonObject(row.value);
      if (ticker && parsed?.price != null) {
        map[ticker] = {
          price: Number(parsed.price),
          updatedAt: String(parsed.updated_at || ''),
          source: String(parsed.source || ''),
        };
      }
    });
  return map;
}

function livePricesMatchPreviousClose(currentDetails, previousRows) {
  const comparable = (previousRows || [])
    .map((row) => {
      const ticker = String(row.ticker || '').toUpperCase();
      const current = currentDetails[ticker];
      return {
        previousPrice: Number(row.price),
        currentPrice: Number(current?.price),
        updatedAt: String(current?.updatedAt || ''),
        source: String(current?.source || ''),
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
}

function buildPeriodPnl(transactions, dailyQuotes, monthlyQuotes, settings) {
  const todayStr = zonedIsoDate(new Date(), FUTU_PNL_TIME_ZONE);
  const currentSnapshot = buildTotalPnlSnapshot(transactions, todayStr, currentQuoteMapFromSettings(settings, transactions));
  const currentTotal = currentSnapshot?.totalPnl || 0;

  const dailyDates = [...new Set(
    (dailyQuotes || [])
      .map((row) => row.quote_date)
      .filter((date) => date && date < todayStr)
  )].sort().reverse();
  const previousDate = dailyDates[0] || '';
  const previousRows = previousDate ? dailyQuotes.filter((row) => row.quote_date === previousDate) : [];
  const previousSnapshot = previousDate ? buildTotalPnlSnapshot(transactions, previousDate, quoteMapForRows(previousRows)) : null;
  const priorDate = dailyDates.find((date) => date < previousDate) || '';
  const priorRows = priorDate ? dailyQuotes.filter((row) => row.quote_date === priorDate) : [];
  const priorSnapshot = priorDate ? buildTotalPnlSnapshot(transactions, priorDate, quoteMapForRows(priorRows)) : null;

  const currentMonth = monthKeyFromDate(todayStr);
  const mtdMonth = previousMonthKey(currentMonth);
  const mtdRows = (monthlyQuotes || []).filter((row) => row.month_key === mtdMonth);
  const mtdSnapshotDate = latestQuoteDateForRows(mtdRows, `${mtdMonth}-28`);
  const mtdSnapshot = mtdRows.length ? buildTotalPnlSnapshot(transactions, mtdSnapshotDate, quoteMapForRows(mtdRows)) : null;

  const ytdMonth = previousYearEndMonthKey(todayStr);
  const ytdRows = (monthlyQuotes || []).filter((row) => row.month_key === ytdMonth);
  const ytdSnapshotDate = latestQuoteDateForRows(ytdRows, `${ytdMonth}-31`);
  const ytdSnapshot = ytdRows.length ? buildTotalPnlSnapshot(transactions, ytdSnapshotDate, quoteMapForRows(ytdRows)) : null;

  const metric = (label, snapshot, snapshotDate, fallback, options = {}) => {
    const total = options.currentTotalOverride ?? currentTotal;
    const value = snapshot ? total - snapshot.totalPnl : null;
    const capitalBase = adjustedPeriodCapitalBase(transactions, snapshotDate, todayStr, snapshot?.marketValue || 0);
    return {
      label,
      value,
      pct: value != null && capitalBase > 0 ? (value / capitalBase) * 100 : null,
      anchor: snapshot ? `vs ${snapshotDate || fallback}` : fallback,
    };
  };

  const currentLooksLikeLatestClose = previousDate && livePricesMatchPreviousClose(currentQuoteDetailsFromSettings(settings), previousRows);
  const dailyMetric = currentLooksLikeLatestClose
    ? metric('Daily', priorSnapshot, priorDate, 'prior close missing', {
        currentTotalOverride: previousSnapshot?.totalPnl,
      })
    : metric('Daily', previousSnapshot, previousDate, 'prev missing');

  return {
    daily: dailyMetric,
    mtd: metric('MTD', mtdSnapshot, mtdSnapshotDate, `${mtdMonth || 'prior'} missing`),
    ytd: metric('YTD', ytdSnapshot, ytdSnapshotDate, `${ytdMonth || 'year-end'} missing`),
  };
}

const addRecurringInterval = (dateStr, count = 1, unit = 'months') => {
  const [year, month, day] = String(dateStr || todayIso()).split('-').map(Number);
  const date = new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
  const safeCount = Math.max(1, Math.min(999, parseInt(count, 10) || 1));
  if (unit === 'days') date.setDate(date.getDate() + safeCount);
  else if (unit === 'weeks') date.setDate(date.getDate() + (safeCount * 7));
  else date.setMonth(date.getMonth() + safeCount);
  return formatLocalDate(date);
};

const monthLabel = (monthKey) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return 'This month';
  return new Date(year, month - 1, 1).toLocaleString('en-AU', { month: 'short', year: 'numeric' });
};

const parseMonthKey = (value) => {
  const month = String(value || todayIso().slice(0, 7)).trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
};

const monthEndFor = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  return formatLocalDate(new Date(year, month, 0));
};

const normalizeRecurringTemplate = (template) => {
  if (!template || typeof template !== 'object') return null;
  const text = String(template.text || '').trim();
  if (!text) return null;
  return {
    text,
    category: template.category || null,
    intervalCount: Math.max(1, Math.min(999, parseInt(template.intervalCount, 10) || 1)),
    intervalUnit: ['days', 'weeks', 'months'].includes(template.intervalUnit) ? template.intervalUnit : 'months',
    nextDueDate: template.nextDueDate || todayIso(),
  };
};

const fetchRates = async (base = 'USD') => {
  try {
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(base)}`);
    if (response.ok) {
      const data = await response.json();
      if (data?.rates) return data.rates;
    }
  } catch {
    // The widget should still work with conservative fallback rates if the rate API is unavailable.
  }
  return FALLBACK_RATES_USD;
};

const convertCurrency = (amount, from, to, rates) => {
  if (!from || !to || from === to) return amount;
  const fromRate = Number(rates[from] || 1);
  const toRate = Number(rates[to] || 1);
  return (amount / fromRate) * toRate;
};

const detectCurrency = (text, defaultCurrency) => {
  const upper = String(text || '').toUpperCase();
  const match = upper.match(/\b(AUD|USD|HKD|CNY|EUR|GBP|JPY|THB)\b/);
  return match?.[1] || defaultCurrency;
};

const parseRecurringRow = (template, members, person, currency, rates) => {
  const amountMatch = String(template.text || '').match(/[-+]?\d+(?:,\d{3})*(?:\.\d+)?/);
  const rawAmount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
  const detectedCurrency = detectCurrency(template.text, currency);
  const amount = convertCurrency(rawAmount, detectedCurrency, currency, rates);
  const shares = {};
  if (amount <= 0) return { total_amount: 0, shares };

  const text = String(template.text || '');
  const exactPerson = members.find((member) => new RegExp(`\\b${member.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
  if (/\b(personal|me|mine)\b/i.test(text)) {
    shares[person] = amount;
  } else if (exactPerson) {
    shares[exactPerson] = amount;
  } else if (members.length > 0) {
    members.forEach((member) => { shares[member] = amount / members.length; });
  }
  return { total_amount: amount, shares };
};

function travelMapLocation(booking) {
  if (!booking) return '';
  const details = booking.details || {};
  if (booking.type === 'flight') {
    const code = details.dest_code || '';
    const city = details.dest || details.destination || '';
    return code ? `${code} Airport${city ? `, ${city}` : ''}` : city;
  }
  return [booking.title, booking.city, booking.country].filter(Boolean).join(', ');
}

function travelMapUrl(booking) {
  const location = travelMapLocation(booking);
  return location ? `https://www.google.com/maps/search/${encodeURIComponent(location)}` : '';
}

function travelTime(value) {
  return String(value || '').replace(/\s+/g, '').replace(/:00$/, '');
}

function travelWidgetValue(booking) {
  if (!booking) return '—';
  const details = booking.details || {};
  if (booking.type === 'flight') {
    const flight = details.flight_number || booking.title || 'Flight';
    const time = travelTime(details.departure_time || details.arrival_time);
    return [flight, time].filter(Boolean).join(' ');
  }
  if (booking.type === 'hotel') {
    return booking.title || [booking.city, booking.country].filter(Boolean).join(', ') || 'Hotel';
  }
  return booking.title || [booking.city, booking.country].filter(Boolean).join(', ') || 'Place';
}

function travelItemOnDate(booking, date) {
  const start = String(booking.start_date || '');
  const end = String(booking.end_date || '');
  if (booking.type === 'hotel') return start <= date && (!end || date <= end);
  return start === date || end === date;
}

function buildTravelToday(bookings, date) {
  const items = (bookings || [])
    .filter((booking) => travelItemOnDate(booking, date))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const primary = items.find((item) => item.type === 'flight')
    || items.find((item) => item.type === 'hotel')
    || items[0]
    || null;
  const mapTarget = items.find((item) => travelMapUrl(item)) || null;
  return {
    label: 'Travel',
    value: primary ? travelWidgetValue(primary) : '—',
    mapUrl: mapTarget ? travelMapUrl(mapTarget) : '',
    count: items.length,
    items: items.slice(0, 3).map((item) => ({
      type: item.type,
      title: item.title || '',
      value: travelWidgetValue(item),
      mapUrl: travelMapUrl(item),
    })),
  };
}

const addToBucket = (bucket, category, amount) => {
  if (category === 'Income') bucket.income += amount;
  else if (category === 'Investment') bucket.investment += amount;
  else if (category !== 'Settlement') bucket.expense += amount;
};

const toPnlItem = (key, label, metric) => {
  const value = fmtAmount(metric.value);
  const pct = fmtPercent(metric.pct);
  return {
    key,
    label,
    value,
    pct,
    display: pct,
    color: metric.value == null ? 'muted' : metric.value >= 0 ? 'green' : 'red',
    anchor: metric.anchor,
  };
};

export default async function handler(req, res) {
  setWidgetHeaders(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET,OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = String(req.query.token || '').trim();
  if (!token) return res.status(401).json({ error: 'Missing token' });
  const supabase = createWidgetClient();
  if (!supabase) return res.status(500).json({ error: 'Widget API is not configured' });

  let matched;
  try {
    matched = await findUserByWidgetToken(supabase, token);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!matched) return res.status(403).json({ error: 'Invalid token' });

  const listId = matched.config.list_id;
  const person = matched.config.person || String(req.query.person || '').trim();
  if (!listId || !person) return res.status(400).json({ error: 'Widget token is missing list/person config' });
  const month = parseMonthKey(req.query.month);
  if (!month) return res.status(400).json({ error: 'Invalid month. Use YYYY-MM.' });
  const monthStart = `${month}-01`;
  const monthEnd = monthEndFor(month);
  const todayStr = todayIso();

  const { data: travelMemberships, error: travelMembershipsError } = await supabase
    .from('travel_trip_members')
    .select('trip_id')
    .eq('user_id', matched.user_id);
  if (travelMembershipsError) return res.status(500).json({ error: travelMembershipsError.message });
  const travelTripIds = [...new Set((travelMemberships || []).map((row) => row.trip_id).filter(Boolean))];
  let travelBookings = [];
  if (travelTripIds.length > 0) {
    const { data, error } = await supabase
      .from('travel_bookings')
      .select('id,type,title,city,country,start_date,end_date,details,sort_order,trip_id,trip_name')
      .in('trip_id', travelTripIds)
      .order('start_date', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    travelBookings = data || [];
  }

  const [
    { data: list, error: listError },
    { data: members, error: membersError },
    { data: expenses, error: expensesError },
    { data: settings, error: settingsError },
    { data: userSettings, error: userSettingsError },
    { data: txns, error: txnsError },
    { data: monthlyQuotes, error: monthlyQuotesError },
    { data: dailyQuotes, error: dailyQuotesError },
    { count: stockUnread, error: stockUnreadError },
    { count: customUnread, error: customUnreadError },
  ] = await Promise.all([
    supabase.from('expense_lists').select('id,name,default_currency').eq('id', listId).single(),
    supabase.from('list_members').select('display_name').eq('list_id', listId),
    supabase.from('expenses').select('date,category,total_amount,shares,split_type').eq('list_id', listId).gte('date', monthStart).lte('date', monthEnd),
    supabase.from('list_settings').select('key,value').eq('list_id', listId),
    supabase.from('user_settings').select('key,value').eq('user_id', matched.user_id),
    supabase.from('securities_transactions').select('*').eq('user_id', matched.user_id),
    supabase.from('securities_monthly_quotes').select('*').eq('user_id', matched.user_id).order('month_key', { ascending: false }),
    supabase.from('securities_daily_quotes').select('*').eq('user_id', matched.user_id).order('quote_date', { ascending: false }).limit(1000),
    supabase.from('stock_news_items').select('id', { count: 'exact', head: true }).eq('user_id', matched.user_id).eq('is_read', false).neq('headline', ''),
    supabase.from('custom_news_items').select('id', { count: 'exact', head: true }).eq('user_id', matched.user_id).eq('is_read', false).neq('headline', ''),
  ]);

  const firstError = listError || membersError || expensesError || settingsError || userSettingsError || txnsError || monthlyQuotesError || dailyQuotesError || stockUnreadError || customUnreadError;
  if (firstError) return res.status(500).json({ error: firstError.message });

  const currency = list?.default_currency || 'AUD';
  const rates = await fetchRates('USD');
  const memberNames = (members || []).map((member) => member.display_name).filter(Boolean);
  const travelToday = buildTravelToday(travelBookings, todayStr);
  const upcomingStart = monthStart > todayStr ? monthStart : todayStr;
  const totals = { income: 0, investment: 0, expense: 0 };
  const current = { income: 0, investment: 0, expense: 0 };
  const upcoming = { income: 0, investment: 0, expense: 0 };

  (expenses || [])
    .filter((expense) => String(expense.date || '').startsWith(month) && expense.split_type !== 'settlement')
    .forEach((expense) => {
      const share = Number(expense.shares?.[person] || 0);
      addToBucket(current, expense.category, share);
    });

  const recurringSetting = (settings || []).find((setting) => setting.key === 'recurringTemplates');
  const recurringTemplates = Array.isArray(recurringSetting?.value)
    ? recurringSetting.value.map(normalizeRecurringTemplate).filter(Boolean)
    : [];

  recurringTemplates.forEach((template) => {
    const category = template.category || 'Other';
    if (!['Income', 'Investment', 'Other'].includes(category)) return;
    let dueDate = template.nextDueDate;
    let guard = 0;
    while (dueDate < upcomingStart && guard < 370) {
      dueDate = addRecurringInterval(dueDate, template.intervalCount, template.intervalUnit);
      guard += 1;
    }
    while (dueDate <= monthEnd && guard < 740) {
      if (dueDate >= upcomingStart && dueDate.startsWith(month)) {
        const parsed = parseRecurringRow(template, memberNames, person, currency, rates);
        const share = Number(parsed.shares?.[person] || 0);
        addToBucket(upcoming, category, share);
      }
      dueDate = addRecurringInterval(dueDate, template.intervalCount, template.intervalUnit);
      guard += 1;
    }
  });

  totals.income = current.income + upcoming.income;
  totals.investment = current.investment + upcoming.investment;
  totals.expense = current.expense + upcoming.expense;
  const spendLeft = totals.income - totals.investment - totals.expense;
  const hasIncome = Number(totals.income || 0) > 0.005;
  const unreadNews = Number(stockUnread || 0) + Number(customUnread || 0);
  const periodPnl = buildPeriodPnl(txns || [], dailyQuotes || [], monthlyQuotes || [], userSettings || []);
  const compactItems = [
    toPnlItem('daily_pnl', 'Daily', periodPnl.daily),
    toPnlItem('mtd_pnl', 'MTD', periodPnl.mtd),
    toPnlItem('ytd_pnl', 'YTD', periodPnl.ytd),
    { key: 'news_unread', label: 'News', value: String(unreadNews), display: String(unreadNews), color: unreadNews > 0 ? 'amber' : 'muted', suffix: 'unread' },
    hasIncome ? { key: 'spending_left', label: 'Left', value: fmtCurrency(spendLeft, currency), display: fmtCurrency(spendLeft, currency), color: spendLeft >= 0 ? 'green' : 'red' } : null,
  ].filter(Boolean);
  const compactSlots = ['daily_pnl', 'ytd_pnl', 'spending_left', 'news_unread']
    .map((key) => compactItems.find((item) => item.key === key))
    .filter(Boolean)
    .map(({ key, label, display, color }) => ({ key, label, value: display, color }));
  const compactLines = compactItems.map((item) => {
    if (item.pct) return `${item.label} ${item.value} ${item.pct}`;
    if (item.suffix) return `${item.label} ${item.value} ${item.suffix}`;
    return `${item.label} ${item.value}`;
  });

  return res.status(200).json({
    title: 'SplitEase',
    value: hasIncome ? `${fmtCurrency(spendLeft, currency)} left` : '',
    subtitle: `${monthLabel(month)} · ${unreadNews} unread news`,
    color: hasIncome ? (spendLeft >= 0 ? 'green' : 'red') : 'muted',
    updatedAt: new Date().toISOString(),
    layout: 'compact-summary',
    slots: compactSlots,
    travelToday,
    items: compactItems,
    lines: compactLines,
    pnl: periodPnl,
    unreadNews,
    list: list?.name || null,
    person,
    currency,
    month,
    current,
    upcoming,
    totals,
    spendLeft,
  });
}
