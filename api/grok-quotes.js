function extractText(responseJson) {
  return (
    responseJson?.output_text ||
    responseJson?.output
      ?.find((item) => item.type === 'message')
      ?.content?.find((item) => item.type === 'output_text')
      ?.text ||
    ''
  );
}

function parseQuotesFromText(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  if (!cleaned) return {};
  const parsed = JSON.parse(cleaned);
  return parsed?.quotes || {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { xaiApiKey, tickers, model } = req.body || {};
  const symbols = Array.isArray(tickers)
    ? [...new Set(tickers.map((t) => String(t).trim().toUpperCase()).filter(Boolean))].slice(0, 50)
    : [];

  if (!xaiApiKey) return res.status(400).json({ error: 'Missing xAI API key' });
  if (symbols.length === 0) return res.status(400).json({ error: 'Missing tickers' });

  const prompt = [
    'Use web search to find the latest regular market stock price for each ticker.',
    'Return strict JSON only, no markdown, no commentary.',
    'Format exactly as {"quotes":{"MSFT":{"price":370.12,"source":"Grok live search"}}}.',
    'Only include tickers you can verify.',
    `Tickers: ${symbols.join(', ')}`,
  ].join(' ');

  try {
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${xaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'grok-4-1-fast-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: json?.error?.message || 'xAI request failed',
        raw: json,
      });
    }

    const text = extractText(json);
    let quotes = {};
    try {
      quotes = parseQuotesFromText(text);
    } catch (err) {
      return res.status(502).json({
        error: `Could not parse Grok quote response: ${err.message}`,
        rawText: text,
      });
    }

    return res.status(200).json({
      quotes,
      responseId: json?.id || null,
      rawText: text,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown server error' });
  }
}
