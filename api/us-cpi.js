const CPI_SERIES_ID = 'CUSR0000SA0'; // CPI-U, U.S. city average, all items, seasonally adjusted

function normalizeMonthEntry(item) {
  if (!item || !/^M(0[1-9]|1[0-2])$/.test(item.period)) return null;
  const month = `${item.year}-${item.period.slice(1)}`;
  const value = Number(item.value);
  if (!Number.isFinite(value)) return null;
  return { month, value };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const now = new Date();
    const endYear = now.getUTCFullYear();
    const startYear = endYear - 2;

    const response = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        seriesid: [CPI_SERIES_ID],
        startyear: String(startYear),
        endyear: String(endYear),
      }),
    });

    if (!response.ok) {
      throw new Error(`BLS request failed: ${response.status}`);
    }

    const json = await response.json();
    const data = json?.Results?.series?.[0]?.data || [];
    const monthlyEntries = data
      .map(normalizeMonthEntry)
      .filter(Boolean)
      .sort((a, b) => a.month.localeCompare(b.month));

    const monthlyRates = {};
    let prev = null;
    for (const entry of monthlyEntries) {
      if (prev && prev.value !== 0) {
        monthlyRates[entry.month] = (entry.value - prev.value) / prev.value;
      }
      prev = entry;
    }

    res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=86400');
    return res.status(200).json({
      seriesId: CPI_SERIES_ID,
      source: 'U.S. Bureau of Labor Statistics',
      monthlyRates,
      monthlyIndexes: Object.fromEntries(monthlyEntries.map((entry) => [entry.month, entry.value])),
      latestMonth: monthlyEntries[monthlyEntries.length - 1]?.month || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to fetch U.S. CPI' });
  }
}
