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
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchYahooQuotes(tickers) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers.join(','))}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Splitease/1.0',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Yahoo quote request failed: ${res.status}`);
  const json = await res.json();
  const results = json?.quoteResponse?.result || [];
  const out = {};
  for (const item of results) {
    const symbol = String(item?.symbol || '').toUpperCase();
    const price = Number(item?.regularMarketPrice);
    if (symbol && Number.isFinite(price) && price > 0) {
      out[symbol] = { price, source: 'Yahoo server quote' };
    }
  }
  return out;
}

async function fetchStooqQuote(ticker) {
  const url = `https://stooq.com/q/l/?s=${ticker.toLowerCase()}.us&f=sd2t2ohlcvn&e=csv`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Splitease/1.0',
      Accept: 'text/csv,text/plain,*/*',
    },
  });
  if (!res.ok) return null;
  const text = await res.text();
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2) return null;
  const cols = parseCSVLine(rows[1]);
  const close = parseMoney(cols[6]);
  if (close == null || close <= 0) return null;
  return { price: close, source: 'Stooq server quote' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = String(req.query.tickers || '')
    .split(',')
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);

  const tickers = [...new Set(raw)].slice(0, 50);
  if (tickers.length === 0) {
    return res.status(400).json({ error: 'Missing tickers query parameter' });
  }

  const quotes = {};
  const errors = {};

  try {
    const yahooQuotes = await fetchYahooQuotes(tickers);
    Object.assign(quotes, yahooQuotes);
  } catch (err) {
    errors.yahoo = err.message;
  }

  const missing = tickers.filter((ticker) => !quotes[ticker]);
  await Promise.all(
    missing.map(async (ticker) => {
      try {
        const quote = await fetchStooqQuote(ticker);
        if (quote) quotes[ticker] = quote;
      } catch (err) {
        errors[ticker] = err.message;
      }
    })
  );

  return res.status(200).json({
    quotes,
    errors,
    requested: tickers,
    found: Object.keys(quotes),
  });
}
