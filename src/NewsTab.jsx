import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Check, CheckCheck, Copy, ExternalLink, Plus, RefreshCw, Settings, X } from 'lucide-react';
import { CLAY, FS, FW, MONO } from './theme';
import { UI } from './ui';

const fmtPrice = (p) => p == null ? '—' : Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct   = (v) => v == null ? null : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`;
const pctColor = (v) => v == null ? CLAY.textMid : v > 0 ? CLAY.green : v < 0 ? CLAY.red : CLAY.textMid;

// Strip <grok:render ...>...</grok:render> citation tags Grok sometimes injects
const stripCitations = (text) =>
  (text || '').replace(/<grok:[^>]*>[\s\S]*?<\/grok:[^>]*>/g, '').replace(/<grok:[^/][^>]*\/>/g, '').trim();

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL || '';
const MARKET_BRIEF_TICKER = 'MARKET_BRIEF';
const DEFAULT_NEWS_XAI_PROMPT =
  `Use web search once. Write one article from the requested stocks and custom topics, but keep unrelated themes separate.\n` +
  `Structure the article with short section headings when topics differ, e.g. Markets, Australia/Hong Kong, K-pop. Only combine topics in the same paragraph if they are directly related.\n` +
  `For ticker/finance sections, include only material current market news from roughly the last 24 hours: earnings/guidance, M&A, regulation, analyst action, major product/news events, or >3% price moves.\n` +
  `For non-finance custom topics, summarise them independently and do not force a finance angle unless the story clearly affects markets or a requested security.\n` +
  `Mention ticker symbols and custom topics naturally inside the article; do not make one card/list item per ticker.\n` +
  `If a section has no material/current news, say that briefly inside that section.`;

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('Clipboard unavailable');
}

const S = {
  card:    { background: CLAY.surface, borderRadius: UI.cardRadius, padding: '16px 18px', boxShadow: CLAY.shadow, marginBottom: UI.sectionGap },
  label:   { fontSize: FS.lg, fontFamily: MONO, fontWeight: FW.semibold, letterSpacing: '0.08em', color: CLAY.textMid },
  caption: { fontSize: FS.compact, fontFamily: MONO, letterSpacing: '0.07em', textTransform: 'uppercase', color: CLAY.textLt, fontWeight: FW.semibold },
  btn: (active = false) => ({
    border: 'none', borderRadius: UI.controlRadius, padding: '8px 14px', cursor: 'pointer',
    fontFamily: MONO, fontSize: FS.lg, fontWeight: active ? FW.semibold : FW.normal,
    background: active ? CLAY.text : CLAY.surf2,
    color: active ? CLAY.surface : CLAY.textMid,
    boxShadow: active ? UI.activeShadow : CLAY.btn,
    letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4,
  }),
  btnDark: {
    border: 'none', borderRadius: UI.controlRadius, padding: '10px 14px', cursor: 'pointer',
    fontFamily: MONO, fontSize: FS.lg, fontWeight: FW.semibold, letterSpacing: '0.04em',
    background: CLAY.text, color: CLAY.surface, boxShadow: '4px 4px 12px rgba(44,36,32,0.28)',
    display: 'flex', alignItems: 'center', gap: 5,
  },
  input: { border: 'none', borderRadius: UI.controlRadius, padding: '12px 14px', fontSize: FS.lg, fontFamily: MONO, outline: 'none', background: CLAY.surf2, color: CLAY.text, boxSizing: 'border-box' },
  select: { border: 'none', borderRadius: UI.controlRadius, padding: '12px 14px', fontSize: FS.lg, fontFamily: MONO, outline: 'none', background: CLAY.surf2, color: CLAY.text, cursor: 'pointer', flex: 1 },
  divider: { borderTop: `1px solid ${CLAY.surf2}`, margin: '12px 0' },
};

const TIMEZONES = [
  { value: 'Asia/Hong_Kong',        label: 'Hong Kong (HKT)'  },
  { value: 'Australia/Brisbane',    label: 'Brisbane (AEST)'  },
  { value: 'America/New_York',      label: 'New York (ET)'    },
  { value: 'America/Los_Angeles',   label: 'Los Angeles (PT)' },
  { value: 'Europe/London',         label: 'London (GMT)'     },
  { value: 'Asia/Tokyo',            label: 'Tokyo (JST)'      },
  { value: 'Asia/Singapore',        label: 'Singapore (SGT)'  },
  { value: 'UTC',                   label: 'UTC'              },
];

function fmtDate(d) {
  const today = new Date().toLocaleDateString('en-CA');
  if (d === today) return 'Today';
  const yest = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  if (d === yest) return 'Yesterday';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtAgo(ts) {
  if (!ts) return null;
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function AutoFetchStatus({ r }) {
  const fmtTime = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };
  const { status, time, items, error, remaining } = r;
  let color = CLAY.textLt;
  let icon = '·';
  let text = '';
  if (status === 'running') {
    color = CLAY.textMid; icon = '⟳';
    text = remaining != null ? `Fetching… ${remaining} remaining (since ${fmtTime(time)})` : `Running… (since ${fmtTime(time)})`;
  }
  else if (status === 'success') { color = CLAY.green; icon = '✓'; text = `Auto-fetched at ${fmtTime(time)}${items > 0 ? ` · ${items} item${items !== 1 ? 's' : ''}` : ' · no news'}`; }
  else if (status === 'failed') { color = CLAY.red; icon = '✕'; text = `Auto-fetch failed at ${fmtTime(time)}${error ? ` · ${error}` : ''}`; }
  if (!text) return null;
  return (
    <div style={{ fontSize: FS.compact, color, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
      <span>{icon}</span><span>{text}</span>
    </div>
  );
}

export default function NewsTab({
  user,
  sb,
  showToast,
  pushSupported = false,
  pushSubscribed = false,
  pushLoading = false,
  pushSubscribe,
  pushUnsubscribe,
}) {
  const [news,           setNews]           = useState([]);
  const [customNews,     setCustomNews]     = useState([]);
  const [customQueries,  setCustomQueries]  = useState([]);
  const [newQueryText,   setNewQueryText]   = useState('');
  const [addingQuery,    setAddingQuery]    = useState(false);
  const [allTickers,     setAllTickers]     = useState([]);
  const [settings,       setSettings]       = useState({
    fetchTimes: ['08:00'], timezone: 'Asia/Hong_Kong',
    includeHoldings: true, includeWatchlist: true, excludedTickers: [],
    newsPrompt: DEFAULT_NEWS_XAI_PROMPT,
  });
  const [newFetchTime,   setNewFetchTime]   = useState('09:00');
  const [lastAutoFetch,  setLastAutoFetch]  = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [fetching,       setFetching]       = useState(false);
  const [fetchingItemId, setFetchingItemId] = useState(null);
  const [fetchStartedAt, setFetchStartedAt] = useState(null);
  const [fetchElapsed,   setFetchElapsed]   = useState(0);
  const [marking,        setMarking]        = useState(false);
  const [readAt,         setReadAt]         = useState({});
  const [showSettings,   setShowSettings]   = useState(false);
  const [pushState,      setPushState]      = useState('unknown');
  const [copyFallbackText, setCopyFallbackText] = useState('');
  const copyFallbackRef = useRef(null);

  useEffect(() => {
    if (!fetchStartedAt) { setFetchElapsed(0); return; }
    const update = () => setFetchElapsed(Math.floor((Date.now() - fetchStartedAt) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [fetchStartedAt]);

  useEffect(() => {
    if (!copyFallbackText) return;
    const timer = window.setTimeout(() => {
      copyFallbackRef.current?.focus();
      copyFallbackRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [copyFallbackText]);

  const fmtElapsed = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const saveKey = useCallback(async (key, value) => {
    await sb.from('user_settings').upsert([{ user_id: user.id, key, value }], { onConflict: 'user_id,key' });
  }, [sb, user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const since = new Date(Date.now() - 7 * 86400000).toLocaleDateString('en-CA');
      const [newsRes, settingsRes, holdingRes, watchlistRes, customQRes, customNewsRes] = await Promise.all([
        sb.from('stock_news_items').select('*').eq('user_id', user.id)
          .gte('fetch_date', since).order('fetch_date', { ascending: false }).order('ticker'),
        sb.from('user_settings').select('key,value').eq('user_id', user.id)
          .in('key', ['news_fetch_times', 'news_fetch_time', 'news_fetch_timezone', 'news_excluded_tickers', 'news_include_holdings', 'news_include_watchlist', 'news_xai_prompt', 'news_last_auto_fetch_result']),
        sb.from('securities_transactions').select('ticker').eq('user_id', user.id).not('ticker', 'is', null),
        sb.from('watchlist_items').select('ticker').eq('user_id', user.id),
        sb.from('news_custom_queries').select('*').eq('user_id', user.id).order('created_at'),
        sb.from('custom_news_items').select('*').eq('user_id', user.id)
          .gte('fetch_date', since).order('fetch_date', { ascending: false }),
      ]);

      setNews(newsRes.data || []);
      setCustomQueries(customQRes.data || []);
      setCustomNews(customNewsRes.data || []);

      const sm = Object.fromEntries((settingsRes.data || []).map(s => [s.key, s.value]));
      let excluded = [];
      try { excluded = JSON.parse(sm['news_excluded_tickers'] || '[]'); } catch {}
      try {
        const r = sm['news_last_auto_fetch_result'];
        setLastAutoFetch(r ? JSON.parse(r) : null);
      } catch { setLastAutoFetch(null); }
      let fetchTimes = ['08:00'];
      if (sm['news_fetch_times']) {
        try { fetchTimes = JSON.parse(sm['news_fetch_times']); } catch {}
      } else if (sm['news_fetch_time']) {
        fetchTimes = [sm['news_fetch_time']];
      }
      setSettings({
        fetchTimes,
        timezone:         sm['news_fetch_timezone']  || 'Asia/Hong_Kong',
        includeHoldings:  sm['news_include_holdings']  !== 'false',
        includeWatchlist: sm['news_include_watchlist'] !== 'false',
        excludedTickers:  excluded,
        newsPrompt:       sm['news_xai_prompt'] || DEFAULT_NEWS_XAI_PROMPT,
      });

      const tSet = new Set([
        ...(holdingRes.data  || []).map(r => r.ticker?.toUpperCase()).filter(Boolean),
        ...(watchlistRes.data || []).map(r => r.ticker?.toUpperCase()).filter(Boolean),
      ]);
      setAllTickers([...tSet].sort());
    } catch {
      showToast?.('Failed to load news');
    } finally {
      setLoading(false);
    }
  }, [user, sb, showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!pushSupported) {
      setPushState('unsupported');
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setPushState('denied');
      return;
    }
    setPushState(pushSubscribed ? 'subscribed' : 'not-subscribed');
  }, [pushSupported, pushSubscribed]);

  const updateSettings = async (updates) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    const ops = [];
    if ('fetchTimes'       in updates) ops.push(saveKey('news_fetch_times',       JSON.stringify(next.fetchTimes)));
    if ('timezone'         in updates) ops.push(saveKey('news_fetch_timezone',    next.timezone));
    if ('includeHoldings'  in updates) ops.push(saveKey('news_include_holdings',  String(next.includeHoldings)));
    if ('includeWatchlist' in updates) ops.push(saveKey('news_include_watchlist', String(next.includeWatchlist)));
    if ('excludedTickers'  in updates) ops.push(saveKey('news_excluded_tickers', JSON.stringify(next.excludedTickers)));
    if ('newsPrompt'       in updates) ops.push(saveKey('news_xai_prompt',       next.newsPrompt.trim() || DEFAULT_NEWS_XAI_PROMPT));
    await Promise.all(ops);
  };

  const addCustomQuery = async () => {
    const text = newQueryText.trim();
    if (!text) return;
    setAddingQuery(true);
    try {
      const { data, error } = await sb.from('news_custom_queries')
        .insert({ user_id: user.id, query_text: text }).select().single();
      if (error) throw error;
      setCustomQueries(prev => [...prev, data]);
      setNewQueryText('');
    } catch (e) { showToast?.(`Failed: ${e.message}`); }
    finally { setAddingQuery(false); }
  };

  const deleteCustomQuery = async (id) => {
    await sb.from('news_custom_queries').delete().eq('id', id).eq('user_id', user.id);
    setCustomQueries(prev => prev.filter(q => q.id !== id));
    setCustomNews(prev => prev.filter(n => n.query_id !== id));
  };

  const handleFetchNow = async () => {
    setFetching(true);
    setFetchStartedAt(Date.now());
    try {
      const { data: reqRow, error } = await sb.from('futu_refresh_requests').insert({
        user_id: user.id,
        request_type: 'news_fetch',
        status: 'pending',
        payload: {},
        requested_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;

      // Poll for completion (max 5 min)
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const { data: row } = await sb.from('futu_refresh_requests')
          .select('status,result,error').eq('id', reqRow.id).maybeSingle();
        if (row?.status === 'completed') {
          const total = row.result?.news?.items || 0;
          showToast?.(total > 0 ? `Fetched ${total} news item(s)` : 'No significant news today');
          await load();
          return;
        }
        if (row?.status === 'failed') throw new Error(row.error || 'Fetch failed');
      }
      showToast?.('Fetch timed out after 5 minutes');
    } catch (e) {
      showToast?.(`Failed: ${e.message}`);
    } finally {
      setFetching(false);
      setFetchStartedAt(null);
    }
  };

  const fetchNews = async (extraBody, trackingId) => {
    setFetchingItemId(trackingId);
    setFetchStartedAt(Date.now());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    try {
      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/fetch-stock-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ user_id: user.id, ...extraBody }),
        signal: controller.signal,
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Fetch failed');
      const total = Number(data.items || 0) + Number(data.customItems || 0);
      showToast?.('Refreshed');
      await load();
    } catch (e) {
      showToast?.(`Failed: ${e.name === 'AbortError' ? 'Fetch timed out after 5 minutes' : e.message}`);
    } finally {
      clearTimeout(timer);
      setFetchingItemId(null);
      setFetchStartedAt(null);
    }
  };

  const fetchOneItem = (item) =>
    fetchNews(
      item._kind === 'brief' || item._kind === 'combined' ? {} : item._kind === 'custom' ? { query_ids: [item.query_id] } : { tickers: [item.ticker] },
      item.id
    );

  const markOneRead = async (item) => {
    if (item.is_read) return;
    if (Array.isArray(item._items)) {
      const tickerIds = item._items.filter(n => n._kind === 'ticker' || n._kind === 'brief').map(n => n.id);
      const customIds = item._items.filter(n => n._kind === 'custom').map(n => n.id);
      await Promise.all([
        tickerIds.length > 0 && sb.from('stock_news_items').update({ is_read: true }).in('id', tickerIds),
        customIds.length > 0 && sb.from('custom_news_items').update({ is_read: true }).in('id', customIds),
      ]);
      setReadAt(prev => ({ ...prev, [item.id]: Date.now() }));
      setNews(prev => prev.map(n => tickerIds.includes(n.id) ? { ...n, is_read: true } : n));
      setCustomNews(prev => prev.map(n => customIds.includes(n.id) ? { ...n, is_read: true } : n));
      return;
    }
    const table = item._kind === 'custom' ? 'custom_news_items' : 'stock_news_items';
    await sb.from(table).update({ is_read: true }).eq('id', item.id);
    setReadAt(prev => ({ ...prev, [item.id]: Date.now() }));
    if (item._kind === 'custom') {
      setCustomNews(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
    } else {
      setNews(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
    }
  };

  const copyItem = async (item) => {
    const text = `${stripCitations(item.headline)}\n\n${stripCitations(item.summary)}`;
    try {
      await copyTextToClipboard(text);
      showToast?.('Copied');
    } catch {
      setCopyFallbackText(text);
      showToast?.('Copy blocked — select text below');
    }
  };

  const openNewsSearch = (item) => {
    const query = `${stripCitations(item.headline)} ${stripCitations(item.summary)}`
      .replace(/\s+/g, ' ')
      .trim();
    if (!query) return;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query).replace(/%20/g, '+')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const retryFallbackCopy = async () => {
    try {
      await copyTextToClipboard(copyFallbackText);
      setCopyFallbackText('');
      showToast?.('Copied');
    } catch {
      copyFallbackRef.current?.focus();
      copyFallbackRef.current?.select();
      showToast?.('Still blocked — use the selected text menu');
    }
  };

  const handleMarkAllRead = async () => {
    const tickerIds = news.filter(n => !n.is_read).map(n => n.id);
    const customIds  = customNews.filter(n => !n.is_read).map(n => n.id);
    if (tickerIds.length === 0 && customIds.length === 0) return;
    setMarking(true);
    try {
      await Promise.all([
        tickerIds.length > 0 && sb.from('stock_news_items').update({ is_read: true }).in('id', tickerIds),
        customIds.length  > 0 && sb.from('custom_news_items').update({ is_read: true }).in('id', customIds),
      ]);
      setNews(prev => prev.map(n => ({ ...n, is_read: true })));
      setCustomNews(prev => prev.map(n => ({ ...n, is_read: true })));
      showToast?.('Marked all as read');
    } catch { showToast?.('Failed to mark as read'); }
    finally { setMarking(false); }
  };

  const toggleExclude = (ticker) => {
    const next = settings.excludedTickers.includes(ticker)
      ? settings.excludedTickers.filter(t => t !== ticker)
      : [...settings.excludedTickers, ticker];
    updateSettings({ excludedTickers: next });
  };

  // Build unified feed: merge ticker news + custom news; exclude placeholder "no news" rows
  const queryMap = Object.fromEntries(customQueries.map(q => [q.id, q.query_text]));
  const rawItems = [
    ...news.filter(n => n.headline).map(n => ({
      ...n,
      _kind: n.ticker === MARKET_BRIEF_TICKER ? 'brief' : 'ticker',
    })),
    ...customNews.filter(n => n.headline).map(n => ({ ...n, _kind: 'custom', _queryText: queryMap[n.query_id] || 'Custom topic' })),
  ];

  const formatBriefLine = (item) => {
    const source = item._kind === 'custom' ? item._queryText : item.ticker;
    return `${source ? `${source}: ` : ''}${stripCitations(item.headline)}\n${stripCitations(item.summary)}`.trim();
  };

  const combineDailyNews = (items) => {
    const buckets = {};
    for (const item of items) {
      const key = `${item.fetch_date}|${item.is_read ? 'read' : 'unread'}`;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(item);
    }
    return Object.values(buckets).map(bucket => {
      const sorted = [...bucket].sort((a, b) => new Date(b.fetched_at || 0) - new Date(a.fetched_at || 0));
      const brief = sorted.find(item => item._kind === 'brief');
      if (brief) return { ...brief, _items: sorted };
      const fetchedAt = sorted[0]?.fetched_at || null;
      const date = sorted[0]?.fetch_date;
      const isRead = sorted.every(item => item.is_read);
      return {
        id: `combined-${date}-${isRead ? 'read' : 'unread'}`,
        _kind: 'combined',
        _items: sorted,
        fetch_date: date,
        fetched_at: fetchedAt,
        is_read: isRead,
        headline: 'Market brief',
        summary: sorted.map(formatBriefLine).filter(Boolean).join('\n\n'),
      };
    });
  };

  const allItems = combineDailyNews(rawItems);

  const unreadItems = allItems.filter(n => !n.is_read).sort((a, b) => b.fetch_date.localeCompare(a.fetch_date));
  const readItems   = allItems.filter(n =>  n.is_read).sort((a, b) => {
    const ra = readAt[a.id] ?? 0, rb = readAt[b.id] ?? 0;
    if (ra !== rb) return rb - ra;
    return b.fetch_date.localeCompare(a.fetch_date);
  });

  // Group each section by date
  const groupByDate = (items) => {
    const map = {};
    for (const item of items) {
      if (!map[item.fetch_date]) map[item.fetch_date] = [];
      map[item.fetch_date].push(item);
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  };

  const unreadGroups = groupByDate(unreadItems);
  const readGroups   = groupByDate(readItems);
  const unreadCount  = unreadItems.length;
  const tzLabel = TIMEZONES.find(t => t.value === settings.timezone)?.label?.replace(/\s*\(.*\)/, '') || settings.timezone;
  const addFetchTime = () => {
    const t = newFetchTime.trim();
    if (!t || settings.fetchTimes.includes(t)) return;
    updateSettings({ fetchTimes: [...settings.fetchTimes, t].sort() });
  };
  const removeFetchTime = (t) => {
    if (settings.fetchTimes.length <= 1) return;
    updateSettings({ fetchTimes: settings.fetchTimes.filter(x => x !== t) });
  };

  if (loading) return <div style={{ padding: 32, fontFamily: MONO, color: CLAY.textMid, textAlign: 'center', fontSize: FS.lg }}>Loading…</div>;

  return (
    <div style={{ padding: '8px 16px 140px', fontFamily: MONO }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Header card ── */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={S.label}>Market News</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} disabled={marking} style={{ ...S.btn(), opacity: marking ? 0.5 : 1 }}>
                <CheckCheck size={13} /> Mark read
              </button>
            )}
            <button onClick={handleFetchNow} disabled={fetching} style={{ ...S.btn(), opacity: fetching ? 0.5 : 1 }}>
              <RefreshCw size={13} style={{ animation: fetching ? 'spin 1s linear infinite' : 'none' }} />
              {fetching ? `Fetching… ${fmtElapsed(fetchElapsed)}` : 'Fetch now'}
            </button>
            <button onClick={() => setShowSettings(v => !v)} style={{ ...S.btn(showSettings), padding: '8px 10px' }}>
              <Settings size={14} />
            </button>
          </div>
        </div>
        <div style={{ fontSize: FS.compact, color: CLAY.textLt }}>
          Auto-fetch at {settings.fetchTimes.join(', ')} {tzLabel}
          {unreadCount > 0 && <span style={{ color: CLAY.peachDk, fontWeight: FW.semibold }}> · {unreadCount} unread</span>}
        </div>
        {lastAutoFetch && <AutoFetchStatus r={lastAutoFetch} />}
        {(fetching || fetchingItemId) && (
          <div style={{ fontSize: FS.compact, color: CLAY.textMid, marginTop: 6 }}>
            Waiting for xAI feedback · elapsed {fmtElapsed(fetchElapsed)} / 5:00
          </div>
        )}
        {pushSupported && pushState === 'not-subscribed' && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: CLAY.surf2, borderRadius: 10, padding: '8px 12px' }}>
            <span style={{ fontSize: FS.compact, color: CLAY.textMid }}>Enable push notifications from Settings to receive news alerts.</span>
          </div>
        )}
      </div>

      {/* ── Settings panel ── */}
      {showSettings && (
        <div style={S.card}>
          <div style={{ ...S.label, marginBottom: 14 }}>Settings</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ ...S.caption, marginBottom: 6 }}>Fetch times</div>
            {settings.fetchTimes.map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ ...S.input, width: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 12px' }}>{t}</span>
                <button onClick={() => removeFetchTime(t)} disabled={settings.fetchTimes.length <= 1}
                  style={{ border: 'none', background: 'none', cursor: settings.fetchTimes.length <= 1 ? 'default' : 'pointer', color: CLAY.textLt, padding: '4px', opacity: settings.fetchTimes.length <= 1 ? 0.3 : 1 }}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input type="time" value={newFetchTime} onChange={e => setNewFetchTime(e.target.value)}
                style={{ ...S.input, width: 110 }} />
              <button onClick={addFetchTime} style={{ ...S.btn(), padding: '8px 12px' }}>
                <Plus size={13} /> Add
              </button>
            </div>
            <div style={{ ...S.caption, marginBottom: 6, marginTop: 10 }}>Timezone</div>
            <select value={settings.timezone}
              onChange={e => updateSettings({ timezone: e.target.value })}
              style={S.select}>
              {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ ...S.caption, marginBottom: 6 }}>Include</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => updateSettings({ includeHoldings: !settings.includeHoldings })} style={S.btn(settings.includeHoldings)}>
                Holdings
              </button>
              <button onClick={() => updateSettings({ includeWatchlist: !settings.includeWatchlist })} style={S.btn(settings.includeWatchlist)}>
                Watchlist
              </button>
            </div>
          </div>

          {allTickers.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.caption, marginBottom: 6 }}>Tickers <span style={{ fontWeight: FW.normal, opacity: 0.6 }}>· tap to exclude · ⟳ to refresh</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {allTickers.map(t => {
                  const excluded = settings.excludedTickers.includes(t);
                  const isRefreshing = fetchingItemId === `ticker:${t}`;
                  return (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', background: CLAY.surf2, borderRadius: 10, overflow: 'hidden' }}>
                      <button onClick={() => toggleExclude(t)}
                        style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: FS.lg, letterSpacing: '0.04em', textAlign: 'left', padding: '8px 12px', textDecoration: excluded ? 'line-through' : 'none', opacity: excluded ? 0.4 : 1, color: CLAY.text }}>
                        {t}
                      </button>
                      <button onClick={() => fetchNews({ tickers: [t] }, `ticker:${t}`)} disabled={isRefreshing}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: CLAY.textLt, padding: '8px 12px', display: 'flex', alignItems: 'center', opacity: isRefreshing ? 0.5 : 1, borderLeft: `1px solid ${CLAY.surface}` }}>
                        <RefreshCw size={12} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={S.divider} />

          <div style={{ marginBottom: 12 }}>
            <div style={{ ...S.caption, marginBottom: 8 }}>xAI prompt</div>
            <textarea
              value={settings.newsPrompt}
              onChange={e => setSettings(prev => ({ ...prev, newsPrompt: e.target.value }))}
              onBlur={() => updateSettings({ newsPrompt: settings.newsPrompt })}
              rows={9}
              style={{ ...S.input, width: '100%', resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <div style={{ fontSize: FS.compact, color: CLAY.textLt, lineHeight: 1.4 }}>
                The app adds date, tickers, topics, and JSON output rules automatically.
              </div>
              <button
                onClick={() => updateSettings({ newsPrompt: DEFAULT_NEWS_XAI_PROMPT })}
                style={{ ...S.btn(), whiteSpace: 'nowrap' }}
              >
                Reset
              </button>
            </div>
          </div>

          <div style={S.divider} />

          {/* Custom topics */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...S.caption, marginBottom: 8 }}>Custom topics</div>
            {customQueries.map(q => {
              const isRefreshing = fetchingItemId === `query:${q.id}`;
              return (
                <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6, background: CLAY.surf2, borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ flex: 1, fontSize: FS.lg, color: CLAY.text, lineHeight: 1.4 }}>{q.query_text}</div>
                  <button onClick={() => fetchNews({ query_ids: [q.id] }, `query:${q.id}`)} disabled={isRefreshing}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: CLAY.textLt, padding: '2px 4px', display: 'flex', alignItems: 'center', opacity: isRefreshing ? 0.5 : 1 }}>
                    <RefreshCw size={12} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                  </button>
                  <button onClick={() => deleteCustomQuery(q.id)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: CLAY.textLt, padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                    <X size={13} />
                  </button>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                value={newQueryText}
                onChange={e => setNewQueryText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomQuery()}
                placeholder="e.g. Donald Trump's top tweets today"
                style={{ ...S.input, flex: 1 }}
              />
              <button onClick={addCustomQuery} disabled={addingQuery || !newQueryText.trim()} style={{ ...S.btnDark, opacity: addingQuery || !newQueryText.trim() ? 0.5 : 1 }}>
                <Plus size={13} />
              </button>
            </div>
          </div>

          {pushSupported && (
            <div>
              <div style={S.divider} />
              <div style={{ ...S.caption, marginBottom: 8 }}>Push notifications</div>
              {pushState === 'denied' && (
                <div style={{ fontSize: FS.lg, color: CLAY.red }}>Blocked in browser — enable in device settings.</div>
              )}
              {pushState === 'subscribed' && (
                <button onClick={pushUnsubscribe} disabled={pushLoading} style={{ ...S.btn(), opacity: pushLoading ? 0.5 : 1 }}>
                  <BellOff size={13} /> Disable notifications
                </button>
              )}
              {(pushState === 'not-subscribed' || pushState === 'unknown') && (
                <button onClick={pushSubscribe} disabled={pushLoading || !pushSubscribe} style={{ ...S.btnDark, opacity: pushLoading || !pushSubscribe ? 0.5 : 1 }}>
                  <Bell size={13} /> Enable notifications
                </button>
              )}
            </div>
          )}

          <div style={{ marginTop: 12, padding: '10px 12px', background: CLAY.surf2, borderRadius: 10, fontSize: FS.compact, color: CLAY.textLt, lineHeight: 1.5 }}>
            Auto-fetch runs on your local Windows machine (Futu listener). No timeout limits — all tickers and topics processed in one run.
          </div>
        </div>
      )}

      {/* ── News list ── */}
      {allItems.length === 0 ? (
        <div style={{ ...S.card, color: CLAY.textLt, fontSize: FS.lg, textAlign: 'center', padding: '24px 18px' }}>
          No news yet — tap "Fetch now" to get today's market news.
        </div>
      ) : (
        [...unreadGroups, ...readGroups].map(([date, items]) => (
          <div key={`${items[0].is_read ? 'read' : 'unread'}-${date}`}>
            <div style={{ ...S.caption, marginBottom: 8, marginTop: 4 }}>{fmtDate(date)}</div>
            {items.map(item => {
              const isCustom = item._kind === 'custom';
              const isBrief = item._kind === 'brief' || item._kind === 'combined';
              const pct = item.price_change_pct;
              return (
                <div key={item.id} style={{
                  ...S.card,
                  opacity: item.is_read ? 0.55 : 1,
                  borderLeft: item.is_read ? '1.5px solid #f0f0f0' : `3px solid ${isBrief ? CLAY.green : isCustom ? '#818cf8' : CLAY.peach}`,
                  paddingLeft: item.is_read ? 18 : 15,
                }}>
                  {/* Label row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      {isBrief ? (
                        <span style={{ background: '#dcfce7', borderRadius: 6, padding: '2px 8px', fontSize: FS.compact, fontWeight: FW.semibold, letterSpacing: '0.04em', color: CLAY.green, whiteSpace: 'nowrap' }}>
                          Market brief
                        </span>
                      ) : isCustom ? (
                        <span style={{ background: '#ede9fe', borderRadius: 6, padding: '2px 8px', fontSize: FS.compact, fontWeight: FW.semibold, letterSpacing: '0.04em', color: '#6d28d9', whiteSpace: 'nowrap' }}>
                          topic
                        </span>
                      ) : (
                        <span style={{ background: CLAY.surf2, borderRadius: 6, padding: '2px 8px', fontSize: FS.compact, fontWeight: FW.semibold, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                          {item.ticker}
                        </span>
                      )}
                      {!item.is_read && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isBrief ? CLAY.green : isCustom ? '#818cf8' : CLAY.peach, display: 'inline-block', flexShrink: 0 }} />
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {!isCustom && !isBrief && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, marginRight: 6 }}>
                          {item.price != null && (
                            <span style={{ fontSize: FS.lg, fontWeight: FW.semibold, fontVariantNumeric: 'tabular-nums' }}>
                              ${fmtPrice(item.price)}
                            </span>
                          )}
                          {pct != null && (
                            <span style={{ fontSize: FS.lg, fontWeight: FW.semibold, color: pctColor(pct), fontVariantNumeric: 'tabular-nums' }}>
                              {fmtPct(pct)}
                            </span>
                          )}
                        </div>
                      )}
                      <button onClick={() => fetchOneItem(item)} disabled={fetchingItemId === item.id} title="Refresh"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: CLAY.textLt, padding: '3px 5px', display: 'flex', alignItems: 'center', opacity: fetchingItemId === item.id ? 0.5 : 1 }}>
                        <RefreshCw size={13} style={{ animation: fetchingItemId === item.id ? 'spin 1s linear infinite' : 'none' }} />
                      </button>
                      <button onClick={() => copyItem(item)} title="Copy"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: CLAY.textLt, padding: '3px 5px', display: 'flex', alignItems: 'center' }}>
                        <Copy size={13} />
                      </button>
                      <button onClick={() => openNewsSearch(item)} title="Search in Chrome"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: CLAY.textLt, padding: '3px 5px', display: 'flex', alignItems: 'center' }}>
                        <ExternalLink size={13} />
                      </button>
                      {!item.is_read && (
                        <button onClick={() => markOneRead(item)} title="Mark read"
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: CLAY.textLt, padding: '3px 5px', display: 'flex', alignItems: 'center' }}>
                          <Check size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Query text for custom items */}
                  {isCustom && (
                    <div style={{ fontSize: FS.compact, color: CLAY.textLt, marginBottom: 6, fontStyle: 'italic' }}>
                      {item._queryText}
                    </div>
                  )}
                  {/* Fetched-at timestamp */}
                  {item.fetched_at && (
                    <div style={{ fontSize: FS.compact, color: CLAY.textLt, marginBottom: 5 }}>
                      {fmtAgo(item.fetched_at)}
                    </div>
                  )}
                  {/* Headline */}
                  <div style={{ fontWeight: FW.semibold, fontSize: FS.lg, color: CLAY.text, lineHeight: 1.35, marginBottom: 5 }}>
                    {stripCitations(item.headline)}
                  </div>
                  {/* Summary */}
                  <div style={{ fontSize: FS.lg, color: CLAY.textMid, lineHeight: isBrief ? 1.75 : 1.6, whiteSpace: isBrief ? 'pre-wrap' : 'normal' }}>
                    {stripCitations(item.summary)}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}

      {copyFallbackText && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(44,36,32,0.28)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 14 }}>
          <div style={{ width: '100%', maxWidth: 640, background: CLAY.surface, borderRadius: '18px 18px 14px 14px', boxShadow: CLAY.shadow, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ ...S.label, letterSpacing: '0.04em' }}>Copy News Text</div>
              <button onClick={() => setCopyFallbackText('')} style={{ border: 'none', background: CLAY.surf2, color: CLAY.textMid, borderRadius: 12, width: 34, height: 34, cursor: 'pointer' }}>
                <X size={15} />
              </button>
            </div>
            <textarea
              ref={copyFallbackRef}
              readOnly
              value={copyFallbackText}
              onFocus={(e) => e.currentTarget.select()}
              style={{ ...S.input, width: '100%', minHeight: 150, resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <button onClick={retryFallbackCopy} style={S.btnDark}>
                <Copy size={13} /> Try copy again
              </button>
              <div style={{ fontSize: FS.compact, color: CLAY.textLt, lineHeight: 1.35 }}>
                If Android blocks copy again, long-press the selected text and tap Copy.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
