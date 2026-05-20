import React, { useEffect, useState, useCallback } from 'react';
import { Bookmark, BookmarkCheck, Check, Edit2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { CLAY, FS, FW, MONO } from './theme';
import { UI, UnifiedDataTable } from './ui';

const fmtPrice = (p) =>
  p == null ? '—' : Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (v) =>
  v == null || isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const pctColor = (v) =>
  v == null || isNaN(v) ? CLAY.textLt : v > 0 ? CLAY.green : v < 0 ? CLAY.red : CLAY.textMid;

// ATH % is always ≤ 0; color by severity of drawdown
const athPctColor = (v) =>
  v == null || isNaN(v) ? CLAY.textLt : v >= -5 ? CLAY.green : v >= -20 ? CLAY.textMid : CLAY.red;

const getMonthKeyOffset = (n) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const s = {
  card:  { background: CLAY.surface, borderRadius: UI.cardRadius, padding: '12px 14px', boxShadow: CLAY.shadow, marginBottom: UI.sectionGap },
  label: { fontSize: FS.lg, fontFamily: MONO, letterSpacing: '0.08em', color: CLAY.textMid, fontWeight: FW.semibold },
  btn:   (active = false) => ({
    border: 'none', borderRadius: UI.controlRadius, padding: '8px 12px', cursor: 'pointer',
    fontFamily: MONO, fontSize: FS.lg, letterSpacing: '0.04em',
    background: active ? CLAY.text : CLAY.surf2,
    color:      active ? CLAY.surface : CLAY.textMid,
    boxShadow:  active ? UI.activeShadow : CLAY.btn,
    fontWeight: active ? FW.semibold : FW.normal,
  }),
  iconBtn: (danger = false) => ({
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
    color: danger ? CLAY.red : CLAY.textMid, display: 'flex', alignItems: 'center',
  }),
};

export default function WatchlistTab({ user, sb, showToast }) {
  const [watchlists,   setWatchlists]   = useState([]);
  const [items,        setItems]        = useState([]);
  const [priceMap,     setPriceMap]     = useState({});
  const [athMap,       setAthMap]       = useState({});
  const [monthlyQuotes, setMonthlyQuotes] = useState({});
  const [snapshots,    setSnapshots]    = useState({});
  const [knownTickers, setKnownTickers] = useState([]);
  const [activeWl,     setActiveWl]     = useState('holdings');
  const [loading,      setLoading]      = useState(true);
  const [editMode,     setEditMode]     = useState(false);
  const [showAdd,      setShowAdd]      = useState(false);
  const [newTicker,    setNewTicker]    = useState('');
  const [addTo,        setAddTo]        = useState(new Set());
  const [saving,       setSaving]       = useState(null);
  const [fetchingQuotes, setFetchingQuotes] = useState(false);
  const [renamingId,   setRenamingId]   = useState(null);
  const [renameVal,    setRenameVal]    = useState('');
  const [showNewWl,    setShowNewWl]    = useState(false);
  const [newWlName,    setNewWlName]    = useState('');
  const [watchlistSort, setWatchlistSort] = useState({ key: 'ticker', direction: 'asc' });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [wlRes, wiRes, settingsRes, quotesRes, snapRes, txnRes] = await Promise.all([
        sb.from('watchlists').select('*').eq('user_id', user.id).order('sort_order'),
        sb.from('watchlist_items').select('*').eq('user_id', user.id).order('sort_order'),
        sb.from('user_settings').select('key,value').eq('user_id', user.id),
        sb.from('securities_monthly_quotes').select('ticker,month_key,price').eq('user_id', user.id),
        sb.from('watchlist_price_snapshots').select('*').eq('user_id', user.id).order('saved_at', { ascending: false }),
        sb.from('securities_transactions').select('ticker').eq('user_id', user.id).not('ticker', 'is', null),
      ]);
      setWatchlists(wlRes.data || []);
      setItems(wiRes.data || []);

      const prices = {};
      const ath = {};
      (settingsRes.data || []).forEach(r => {
        const key = String(r.key);
        if (key.startsWith('latest_stock_price:')) {
          const ticker = key.split(':')[1]?.toUpperCase();
          try { const p = JSON.parse(r.value); if (ticker && p?.price != null) prices[ticker] = p; } catch {}
        } else if (key.startsWith('latest_stock_ath:')) {
          const ticker = key.split(':')[1]?.toUpperCase();
          try { const p = JSON.parse(r.value); if (ticker && p?.high52w != null) ath[ticker] = p; } catch {}
        }
      });
      setPriceMap(prices);
      setAthMap(ath);

      const quotes = {};
      (quotesRes.data || []).forEach(r => {
        if (!quotes[r.ticker]) quotes[r.ticker] = {};
        quotes[r.ticker][r.month_key] = Number(r.price);
      });
      setMonthlyQuotes(quotes);

      const snaps = {};
      (snapRes.data || []).forEach(r => { if (!snaps[r.ticker]) snaps[r.ticker] = r; });
      setSnapshots(snaps);

      setKnownTickers([...new Set((txnRes.data || []).map(r => r.ticker).filter(Boolean))].sort());
    } catch {
      showToast?.('Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  }, [user, sb, showToast]);

  useEffect(() => { load(); }, [load]);

  // Realtime: reload when a monthly_quotes request completes
  useEffect(() => {
    if (!user) return;
    const channel = sb.channel(`watchlist-monthly-quotes-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'futu_refresh_requests', filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const row = payload.new || payload.old;
          if (row?.request_type !== 'monthly_quotes' && row?.request_type !== 'prices') return;
          if (row.status === 'completed') {
            setFetchingQuotes(false);
            await load();
            showToast?.('Quotes updated');
          } else if (row.status === 'failed') {
            setFetchingQuotes(false);
            showToast?.(`Fetch failed: ${row.error || 'unknown error'}`);
          }
        })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [user, sb, load, showToast]);

  const handleFetchMissing = async (missingPrice, missingAth, missing1M, missing3M, missing12M) => {
    setFetchingQuotes(true);
    const requests = [];
    const priceRefreshTickers = [...new Set([...missingPrice, ...missingAth])];
    if (priceRefreshTickers.length > 0)
      requests.push(sb.from('futu_refresh_requests').insert({ user_id: user.id, request_type: 'prices', payload: { tickers: priceRefreshTickers } }));
    if (missing1M.length  > 0)
      requests.push(sb.from('futu_refresh_requests').insert({ user_id: user.id, request_type: 'monthly_quotes', payload: { tickers: missing1M,  start_month: getMonthKeyOffset(-2),  end_month: getMonthKeyOffset(0)   } }));
    if (missing3M.length  > 0)
      requests.push(sb.from('futu_refresh_requests').insert({ user_id: user.id, request_type: 'monthly_quotes', payload: { tickers: missing3M,  start_month: getMonthKeyOffset(-4),  end_month: getMonthKeyOffset(-2)  } }));
    if (missing12M.length > 0)
      requests.push(sb.from('futu_refresh_requests').insert({ user_id: user.id, request_type: 'monthly_quotes', payload: { tickers: missing12M, start_month: getMonthKeyOffset(-13), end_month: getMonthKeyOffset(-11) } }));
    const results = await Promise.all(requests);
    if (results.some(r => r.error)) {
      setFetchingQuotes(false);
      showToast?.('Failed to queue request');
    } else {
      const n = [...new Set([...missingPrice, ...missingAth, ...missing1M, ...missing3M, ...missing12M])].length;
      showToast?.(`Queued fetch for ${n} ticker(s)`);
    }
  };

  const mk1  = getMonthKeyOffset(-1);
  const mk3  = getMonthKeyOffset(-3);
  const mk12 = getMonthKeyOffset(-12);

  const pct = (cur, base) => (cur != null && base != null && base !== 0)
    ? ((Number(cur) - Number(base)) / Number(base)) * 100 : null;

  const get1M  = (t) => { const cur = priceMap[t]?.price; if (cur == null) return null; const k = withinWindow(monthlyQuotes[t], mk1,  ONE_MONTH_MS); return k ? pct(cur, monthlyQuotes[t][k]) : null; };

  const withinWindow = (qs, targetMK, windowMs) => {
    if (!qs) return null;
    if (qs[targetMK] != null) return targetMK;
    const targetTime = new Date(targetMK + '-01').getTime();
    const nearby = Object.keys(qs).filter(k => Math.abs(new Date(k + '-01').getTime() - targetTime) <= windowMs);
    if (nearby.length === 0) return null;
    return nearby.reduce((best, k) =>
      Math.abs(new Date(k + '-01').getTime() - targetTime) < Math.abs(new Date(best + '-01').getTime() - targetTime) ? k : best
    );
  };

  const ONE_MONTH_MS = 31 * 24 * 60 * 60 * 1000;

  const get3M  = (t) => { const cur = priceMap[t]?.price; if (cur == null) return null; const k = withinWindow(monthlyQuotes[t], mk3,  ONE_MONTH_MS); return k ? pct(cur, monthlyQuotes[t][k]) : null; };
  const get12M = (t) => { const cur = priceMap[t]?.price; if (cur == null) return null; const k = withinWindow(monthlyQuotes[t], mk12, ONE_MONTH_MS); return k ? pct(cur, monthlyQuotes[t][k]) : null; };

  const getSinceSaved = (t) => pct(priceMap[t]?.price, snapshots[t]?.price);

  const isBuiltin = activeWl === 'all' || activeWl === 'holdings';

  const visibleItems = activeWl === 'holdings'
    ? knownTickers.map(ticker => ({ ticker, id: `h:${ticker}`, watchlist_id: 'holdings' }))
    : activeWl === 'all'
      ? [...new Map(items.map(i => [i.ticker, i])).values()]
      : items.filter(i => i.watchlist_id === activeWl);

  const toggleWatchlistSort = (key) => {
    setWatchlistSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: ['ticker'].includes(key) ? 'asc' : 'desc' }
    );
  };

  const watchlistRows = visibleItems.map((item) => {
    const ticker = item.ticker;
    const cur = priceMap[ticker]?.price;
    const high52 = athMap[ticker]?.high52w;
    const athPct = (cur != null && high52 != null && high52 > 0) ? ((cur - high52) / high52) * 100 : null;
    const d1m = get1M(ticker);
    const d3m = get3M(ticker);
    const y12 = get12M(ticker);
    const svd = getSinceSaved(ticker);
    return { ...item, cur, athPct, d1m, d3m, y12, svd, snap: snapshots[ticker] };
  });

  const sortedWatchlistRows = watchlistRows.slice().sort((a, b) => {
    const direction = watchlistSort.direction === 'desc' ? -1 : 1;
    const av = a[watchlistSort.key];
    const bv = b[watchlistSort.key];
    if (typeof av === 'number' || typeof bv === 'number') {
      return (Number(av ?? Number.NEGATIVE_INFINITY) - Number(bv ?? Number.NEGATIVE_INFINITY)) * direction;
    }
    return String(av || '').localeCompare(String(bv || '')) * direction;
  });

  const watchlistColumns = [
    {
      key: 'ticker',
      top: 'Ticker',
      sticky: true,
      width: 80,
      min: 70,
      maxVw: 25,
      emphasis: true,
      render: (row) => <div style={{ fontWeight: FW.semibold, fontSize: FS.lg, letterSpacing: '0.04em' }}>{row.ticker}</div>,
    },
    {
      key: 'cur',
      top: 'Price',
      width: 90,
      min: 76,
      maxVw: 22,
      render: (row) => <div style={{ fontWeight: FW.semibold, fontSize: FS.lg, fontVariantNumeric: 'tabular-nums' }}>{row.cur != null ? fmtPrice(row.cur) : '—'}</div>,
    },
    {
      key: 'athPct',
      top: '% 52w H',
      width: 72,
      min: 64,
      maxVw: 20,
      render: (row) => <div style={{ fontWeight: FW.semibold, fontSize: FS.lg, color: athPctColor(row.athPct), fontVariantNumeric: 'tabular-nums' }}>{fmtPct(row.athPct)}</div>,
    },
    ...[
      { key: 'd1m', top: '1M' },
      { key: 'd3m', top: '3M' },
      { key: 'y12', top: '12M' },
      { key: 'svd', top: 'Saved' },
    ].map((column) => ({
      ...column,
      width: 72,
      min: 64,
      maxVw: 20,
      render: (row) => <div style={{ fontWeight: FW.semibold, fontSize: FS.lg, color: pctColor(row[column.key]), fontVariantNumeric: 'tabular-nums' }}>{fmtPct(row[column.key])}</div>,
    })),
    {
      key: 'action',
      top: '',
      width: 44,
      min: 40,
      action: true,
      sortable: false,
      render: (row) => editMode && !isBuiltin ? (
        <button onClick={() => removeTicker(row)} style={s.iconBtn(true)}>
          <Trash2 size={15} />
        </button>
      ) : (
        <button
          onClick={() => saveSnapshot(row.ticker)}
          disabled={saving === row.ticker || row.cur == null}
          title={row.snap ? `Saved: ${fmtPrice(row.snap.price)} on ${new Date(row.snap.saved_at).toLocaleDateString()}` : 'Save current price'}
          style={{ ...s.iconBtn(), opacity: row.cur == null ? 0.25 : 1, color: row.snap ? CLAY.text : CLAY.textLt }}
        >
          {row.snap ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
        </button>
      ),
    },
  ];

  const saveSnapshot = async (ticker) => {
    const price = priceMap[ticker]?.price;
    if (price == null) { showToast?.('No price available'); return; }
    setSaving(ticker);
    try {
      const { error } = await sb.from('watchlist_price_snapshots').insert({ user_id: user.id, ticker, price: Number(price) });
      if (error) throw error;
      setSnapshots(prev => ({ ...prev, [ticker]: { price: Number(price), saved_at: new Date().toISOString(), ticker } }));
      showToast?.(`Saved price for ${ticker}`);
    } catch { showToast?.('Failed to save snapshot'); }
    finally { setSaving(null); }
  };

  const createWatchlist = async () => {
    const name = newWlName.trim();
    if (!name) return;
    const { data, error } = await sb.from('watchlists').insert({ user_id: user.id, name, sort_order: watchlists.length }).select().single();
    if (error) { showToast?.('Failed to create'); return; }
    setWatchlists(p => [...p, data]);
    setNewWlName(''); setShowNewWl(false); setActiveWl(data.id);
  };

  const renameWatchlist = async (id) => {
    const name = renameVal.trim();
    if (!name) return;
    const { error } = await sb.from('watchlists').update({ name }).eq('id', id).eq('user_id', user.id);
    if (error) { showToast?.('Failed to rename'); return; }
    setWatchlists(p => p.map(w => w.id === id ? { ...w, name } : w));
    setRenamingId(null);
  };

  const deleteWatchlist = async (id) => {
    if (!window.confirm('Delete this watchlist?')) return;
    const { error } = await sb.from('watchlists').delete().eq('id', id).eq('user_id', user.id);
    if (error) { showToast?.('Failed to delete'); return; }
    setWatchlists(p => p.filter(w => w.id !== id));
    setItems(p => p.filter(i => i.watchlist_id !== id));
    if (activeWl === id) setActiveWl('holdings');
  };

  const addTicker = async () => {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker || addTo.size === 0) return;
    const inserts = [...addTo].map(wid => ({ watchlist_id: wid, user_id: user.id, ticker, sort_order: items.filter(i => i.watchlist_id === wid).length }));
    const { data, error } = await sb.from('watchlist_items').upsert(inserts, { onConflict: 'watchlist_id,ticker', ignoreDuplicates: true }).select();
    if (error) { showToast?.('Failed to add'); return; }
    setItems(prev => {
      const keys = new Set(prev.map(i => `${i.watchlist_id}:${i.ticker}`));
      return [...prev, ...(data || []).filter(i => !keys.has(`${i.watchlist_id}:${i.ticker}`))];
    });
    setNewTicker(''); setShowAdd(false);
    showToast?.(`Added ${ticker}`);
  };

  const removeTicker = async (item) => {
    const { error } = await sb.from('watchlist_items').delete().eq('id', item.id);
    if (error) { showToast?.('Failed to remove'); return; }
    setItems(p => p.filter(i => i.id !== item.id));
  };

  const openAdd = () => {
    setShowAdd(v => {
      if (!v) {
        const def = activeWl !== 'all' && activeWl !== 'holdings' ? activeWl : watchlists[0]?.id;
        setAddTo(def ? new Set([def]) : new Set());
        setNewTicker('');
      }
      return !v;
    });
    setEditMode(false);
  };

  if (loading) return <div style={{ padding: 32, fontFamily: MONO, color: CLAY.textMid, textAlign: 'center', fontSize: FS.lg }}>Loading…</div>;

  return (
    <div style={{ padding: '8px 16px 140px', fontFamily: MONO }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Filter / watchlist selector card ── */}
      <div style={s.card}>
        <div style={{ ...s.label, marginBottom: 8 }}>Watchlist</div>

        {/* Tabs row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: showNewWl ? 10 : 0 }}>
          <button onClick={() => setActiveWl('holdings')} style={s.btn(activeWl === 'holdings')}>Holdings</button>
          <button onClick={() => setActiveWl('all')}      style={s.btn(activeWl === 'all')}>All</button>
          {watchlists.map(w =>
            renamingId === w.id ? (
              <div key={w.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameWatchlist(w.id); if (e.key === 'Escape') setRenamingId(null); }}
                  style={{ background: CLAY.surf2, border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: FS.lg, fontFamily: MONO, width: 120, color: CLAY.text, outline: 'none' }}
                  autoFocus
                />
                <button onClick={() => renameWatchlist(w.id)} style={s.iconBtn()}><Check size={14} /></button>
                <button onClick={() => setRenamingId(null)}   style={s.iconBtn()}><X size={14} /></button>
              </div>
            ) : (
              <button key={w.id} onClick={() => setActiveWl(w.id)} style={s.btn(activeWl === w.id)}>{w.name}</button>
            )
          )}
          <button onClick={() => setShowNewWl(v => !v)} style={{ ...s.btn(showNewWl), padding: '8px 10px' }}>
            <Plus size={14} />
          </button>
        </div>

        {/* New watchlist input */}
        {showNewWl && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              value={newWlName}
              onChange={e => setNewWlName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createWatchlist(); }}
              placeholder="Watchlist name"
              style={{ flex: 1, background: CLAY.surf2, border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: FS.lg, fontFamily: MONO, color: CLAY.text, outline: 'none' }}
              autoFocus
            />
            <button onClick={createWatchlist} style={s.btn(true)}>Create</button>
          </div>
        )}

        {/* Actions for named watchlist */}
        {!isBuiltin && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${CLAY.surf2}` }}>
            <button onClick={openAdd} style={s.btn(showAdd)}><Plus size={13} style={{ verticalAlign: 'middle' }} /> Add</button>
            {visibleItems.length > 0 && (
              <button onClick={() => { setEditMode(v => !v); setShowAdd(false); }} style={s.btn(editMode)}>
                {editMode ? 'Done' : 'Edit'}
              </button>
            )}
            {(() => {
              const allTickers    = visibleItems.map(i => i.ticker);
              const missingPrice  = allTickers.filter(t => priceMap[t]?.price == null);
              const missingAth    = allTickers.filter(t => athMap[t]?.high52w == null);
              const withPrice     = allTickers.filter(t => priceMap[t]?.price != null);
              const missing1M     = [...new Set([...missingPrice, ...withPrice.filter(t => get1M(t)  === null)])];
              const missing3M     = [...new Set([...missingPrice, ...withPrice.filter(t => get3M(t)  === null)])];
              const missing12M    = [...new Set([...missingPrice, ...withPrice.filter(t => get12M(t) === null)])];
              return (missingPrice.length > 0 || missingAth.length > 0 || missing1M.length > 0 || missing3M.length > 0 || missing12M.length > 0) ? (
                <button
                  onClick={() => handleFetchMissing(missingPrice, missingAth, missing1M, missing3M, missing12M)}
                  disabled={fetchingQuotes}
                  style={{ ...s.btn(false), display: 'flex', alignItems: 'center', gap: 5, opacity: fetchingQuotes ? 0.5 : 1 }}
                >
                  <RefreshCw size={13} style={{ animation: fetchingQuotes ? 'spin 1s linear infinite' : 'none' }} />
                  {fetchingQuotes ? 'Fetching…' : 'Fetch missing'}
                </button>
              ) : null;
            })()}
            <div style={{ flex: 1 }} />
            <button onClick={() => { const w = watchlists.find(w => w.id === activeWl); setRenamingId(activeWl); setRenameVal(w?.name || ''); }} style={s.iconBtn()}>
              <Edit2 size={15} />
            </button>
            <button onClick={() => deleteWatchlist(activeWl)} style={s.iconBtn(true)}>
              <Trash2 size={15} />
            </button>
          </div>
        )}

        {/* Actions for builtin views */}
        {isBuiltin && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${CLAY.surf2}` }}>
            <button onClick={openAdd} style={s.btn(showAdd)}><Plus size={13} style={{ verticalAlign: 'middle' }} /> Add</button>
            {(() => {
              const allTickers    = visibleItems.map(i => i.ticker);
              const missingPrice  = allTickers.filter(t => priceMap[t]?.price == null);
              const missingAth    = allTickers.filter(t => athMap[t]?.high52w == null);
              const withPrice     = allTickers.filter(t => priceMap[t]?.price != null);
              const missing1M     = [...new Set([...missingPrice, ...withPrice.filter(t => get1M(t)  === null)])];
              const missing3M     = [...new Set([...missingPrice, ...withPrice.filter(t => get3M(t)  === null)])];
              const missing12M    = [...new Set([...missingPrice, ...withPrice.filter(t => get12M(t) === null)])];
              return (missingPrice.length > 0 || missingAth.length > 0 || missing1M.length > 0 || missing3M.length > 0 || missing12M.length > 0) ? (
                <button
                  onClick={() => handleFetchMissing(missingPrice, missingAth, missing1M, missing3M, missing12M)}
                  disabled={fetchingQuotes}
                  style={{ ...s.btn(false), display: 'flex', alignItems: 'center', gap: 5, opacity: fetchingQuotes ? 0.5 : 1 }}
                >
                  <RefreshCw size={13} style={{ animation: fetchingQuotes ? 'spin 1s linear infinite' : 'none' }} />
                  {fetchingQuotes ? 'Fetching…' : 'Fetch missing'}
                </button>
              ) : null;
            })()}
          </div>
        )}
      </div>

      {/* ── Add ticker panel ── */}
      {showAdd && (
        <div style={s.card}>
          <div style={{ ...s.label, marginBottom: 8 }}>Add Ticker</div>
          <input
            value={newTicker}
            onChange={e => setNewTicker(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') addTicker(); }}
            placeholder="Type any ticker, e.g. AAPL"
            style={{ width: '100%', background: CLAY.surf2, border: 'none', borderRadius: 8, padding: '10px 12px', fontSize: FS.lg, fontFamily: MONO, color: CLAY.text, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
            autoFocus
          />
          {knownTickers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {knownTickers.filter(t => !newTicker || t.includes(newTicker)).slice(0, 24).map(t => (
                <button key={t} onClick={() => setNewTicker(t)} style={s.btn(newTicker === t)}>{t}</button>
              ))}
            </div>
          )}
          {watchlists.length === 0 ? (
            <div style={{ fontSize: FS.lg, color: CLAY.textLt, textAlign: 'center', padding: '8px 0 4px' }}>
              Create a watchlist first using the <strong>+</strong> button above.
            </div>
          ) : (
            <>
              <div style={{ ...s.label, marginBottom: 6 }}>Add to</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {watchlists.map(w => {
                  const sel = addTo.has(w.id);
                  return (
                    <button key={w.id} onClick={() => setAddTo(prev => { const n = new Set(prev); sel ? n.delete(w.id) : n.add(w.id); return n; })} style={s.btn(sel)}>
                      {w.name}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={addTicker}
                disabled={!newTicker.trim() || addTo.size === 0}
                style={{ ...s.btn(true), width: '100%', opacity: !newTicker.trim() || addTo.size === 0 ? 0.45 : 1 }}
              >
                Add to Watchlist
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <UnifiedDataTable
        title="Watchlist"
        subtitle={`${visibleItems.length} ticker${visibleItems.length === 1 ? '' : 's'} · Tap a heading to sort`}
        columns={watchlistColumns}
        rows={sortedWatchlistRows}
        rowKey={(row) => `${row.watchlist_id}:${row.ticker}`}
        sort={watchlistSort}
        onSort={toggleWatchlistSort}
        empty={activeWl === 'holdings' ? 'No transactions found.' : 'No stocks yet. Tap Add to get started.'}
        onSettings={() => showToast?.('Table settings coming soon')}
      />
    </div>
  );
}
