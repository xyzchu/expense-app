import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

const MONO = '"SF Mono","Fira Code","Cascadia Code","Consolas","Liberation Mono",monospace';

const TYPE_COLORS = {
  BUY:      { bg: '#dcfce7', text: '#16a34a' },
  SELL:     { bg: '#fee2e2', text: '#dc2626' },
  DIVIDEND: { bg: '#dbeafe', text: '#2563eb' },
  OTHER:    { bg: '#f3f4f6', text: '#6b7280' },
};

const fmt = (v, dec = 2) =>
  v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export default function TransactionsTab({ user, sb, showToast }) {
  const [txns, setTxns]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [accountFilter, setAccountFilter] = useState('All');
  const [typeFilter, setTypeFilter]       = useState('All');
  const [showAdd, setShowAdd]     = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pendingParsed, setPendingParsed] = useState(null);
  const [xaiKey, setXaiKey]       = useState('');
  const [newTxn, setNewTxn] = useState({
    transaction_date: new Date().toISOString().slice(0, 10),
    type: 'BUY', ticker: '', name: '', quantity: '', price: '',
    currency: 'USD', amount: '', tax_withheld: '',
    account: 'HSBC HK', order_ref: '', notes: '',
  });

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from('securities_transactions')
      .select('*').eq('user_id', user.id)
      .order('transaction_date', { ascending: false });
    setTxns(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Load xAI key from user_settings (shared with FinancesTab)
    sb.from('user_settings').select('value')
      .eq('user_id', user.id).eq('key', 'xai_api_key').single()
      .then(({ data }) => { if (data?.value) setXaiKey(data.value); });
  }, [user]);

  const knownAccounts = [...new Set(txns.map(t => t.account).filter(Boolean))].sort();
  const filterAccounts = ['All', ...['HSBC HK', 'Futu HK', ...knownAccounts.filter(a => a !== 'HSBC HK' && a !== 'Futu HK')]
    .filter((v, i, a) => a.indexOf(v) === i)];

  const filtered = txns.filter(t => {
    if (accountFilter !== 'All' && t.account !== accountFilter) return false;
    if (typeFilter !== 'All' && t.type !== typeFilter) return false;
    return true;
  });

  // Group by month
  const grouped = {};
  filtered.forEach(t => {
    const m = t.transaction_date?.slice(0, 7) || 'Unknown';
    if (!grouped[m]) grouped[m] = [];
    grouped[m].push(t);
  });
  const months = Object.keys(grouped).sort().reverse();

  // Summary totals (all in native currency — mostly USD)
  const buys  = filtered.filter(t => t.type === 'BUY') .reduce((s, t) => s + (t.amount || 0), 0);
  const sells = filtered.filter(t => t.type === 'SELL').reduce((s, t) => s + (t.amount || 0), 0);
  const divs  = filtered.filter(t => t.type === 'DIVIDEND')
    .reduce((s, t) => s + (t.amount || 0) + (t.tax_withheld || 0), 0);

  const saveTxn = async () => {
    const qty = newTxn.quantity ? Number(newTxn.quantity) : null;
    const px  = newTxn.price    ? Number(newTxn.price)    : null;
    const row = {
      ...newTxn,
      user_id: user.id,
      quantity:     qty,
      price:        px,
      amount:       newTxn.amount ? Number(newTxn.amount) : (qty && px ? qty * px : null),
      tax_withheld: newTxn.tax_withheld ? Number(newTxn.tax_withheld) : null,
      source: 'manual',
    };
    const { error } = await sb.from('securities_transactions').insert(row);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Saved');
    setShowAdd(false);
    setNewTxn({
      transaction_date: new Date().toISOString().slice(0, 10),
      type: 'BUY', ticker: '', name: '', quantity: '', price: '',
      currency: 'USD', amount: '', tax_withheld: '',
      account: 'HSBC HK', order_ref: '', notes: '',
    });
    load();
  };

  const deleteTxn = async (id) => {
    await sb.from('securities_transactions').delete().eq('id', id);
    setTxns(t => t.filter(x => x.id !== id));
    showToast('Deleted');
  };

  const parsePaste = async () => {
    if (!pasteText.trim()) return;
    if (!xaiKey) { showToast('xAI key not set — add it in Finances tab settings'); return; }
    setPasteLoading(true);
    try {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${xaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [{ role: 'user', content:
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
      try { parsed = JSON.parse(raw); }
      catch {
        const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        parsed = m ? JSON.parse(m[1]) : [];
      }
      setPendingParsed(Array.isArray(parsed) ? parsed : [parsed]);
    } catch (e) {
      showToast('Parse error: ' + e.message);
    }
    setPasteLoading(false);
  };

  const saveParsed = async () => {
    const rows = pendingParsed.map(t => ({ ...t, user_id: user.id, source: 'email' }));
    const { error } = await sb.from('securities_transactions').insert(rows);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast(`Saved ${rows.length} transaction${rows.length !== 1 ? 's' : ''}`);
    setPendingParsed(null);
    setPasteText('');
    setShowPaste(false);
    load();
  };

  const s = {
    card:  { background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', marginBottom: 10 },
    pill:  (on) => ({ padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 10, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', background: on ? '#1a1a1a' : '#f0f0ea', color: on ? '#fff' : '#1a1a1a' }),
    label: { fontSize: 10, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.4 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontFamily: MONO, fontSize: 12, background: '#fafaf8', outline: 'none' },
    btn:   (primary) => ({ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', background: primary ? '#1a1a1a' : '#f0f0ea', color: primary ? '#fff' : '#1a1a1a' }),
  };

  return (
    <div style={{ padding: '16px 16px 140px', fontFamily: MONO }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Transactions</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowPaste(true)} style={s.btn(false)}>Paste</button>
          <button onClick={() => setShowAdd(true)} style={{ ...s.btn(true), display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={12} />Add
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ ...s.card, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
        <div>
          <div style={{ ...s.label, marginBottom: 2 }}>Bought</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#16a34a', fontFamily: MONO }}>{fmt(buys)}</div>
        </div>
        <div>
          <div style={{ ...s.label, marginBottom: 2 }}>Sold</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626', fontFamily: MONO }}>{fmt(sells)}</div>
        </div>
        <div>
          <div style={{ ...s.label, marginBottom: 2 }}>Dividends</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#2563eb', fontFamily: MONO }}>{fmt(divs)}</div>
        </div>
      </div>

      {/* Account filter */}
      <div style={{ marginBottom: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {filterAccounts.map(a => (
          <button key={a} onClick={() => setAccountFilter(a)} style={s.pill(accountFilter === a)}>{a}</button>
        ))}
      </div>

      {/* Type filter */}
      <div style={{ marginBottom: 14, display: 'flex', gap: 5 }}>
        {['All', 'BUY', 'SELL', 'DIVIDEND'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={s.pill(typeFilter === t)}>{t}</button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', opacity: 0.35, padding: 40, fontSize: 12 }}>Loading…</div>
      ) : months.length === 0 ? (
        <div style={{ textAlign: 'center', opacity: 0.35, padding: 40, fontSize: 12 }}>No transactions</div>
      ) : months.map(m => (
        <div key={m} style={s.card}>
          <div style={{ ...s.label, marginBottom: 10 }}>{m}</div>
          {grouped[m].map(t => {
            const tc = TYPE_COLORS[t.type] || TYPE_COLORS.OTHER;
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid #f5f5f0' }}>
                {/* Date + type badge */}
                <div style={{ width: 56, flexShrink: 0 }}>
                  <div style={{ fontSize: 9, opacity: 0.4, fontFamily: MONO, letterSpacing: '0.02em' }}>
                    {t.transaction_date?.slice(5)}
                  </div>
                  <div style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: tc.bg, color: tc.text, fontFamily: MONO, fontWeight: 700, display: 'inline-block', marginTop: 2, letterSpacing: '0.04em' }}>
                    {t.type}
                  </div>
                </div>
                {/* Name / details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12 }}>{t.ticker || '—'}</span>
                    <span style={{ fontSize: 10, opacity: 0.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  </div>
                  {t.type !== 'DIVIDEND' && t.quantity != null && (
                    <div style={{ fontSize: 10, opacity: 0.45, fontFamily: MONO }}>
                      {fmt(t.quantity, 0)} @ {fmt(t.price, 2)}
                    </div>
                  )}
                  {t.type === 'DIVIDEND' && t.tax_withheld != null && (
                    <div style={{ fontSize: 10, opacity: 0.45, fontFamily: MONO }}>
                      tax {fmt(t.tax_withheld, 2)} {t.currency}
                    </div>
                  )}
                  <div style={{ fontSize: 9, opacity: 0.3 }}>{t.account}{t.order_ref ? ` · ${t.order_ref}` : ''}</div>
                </div>
                {/* Amount + delete */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12 }}>
                    {t.currency} {fmt(Math.abs(t.amount || 0), 2)}
                  </div>
                  <button onClick={() => deleteTxn(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.2, padding: '2px', marginTop: 2, display: 'block', marginLeft: 'auto' }}>
                    <X size={10} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* ── Add modal ── */}
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
                <input type="date" style={s.input} value={newTxn.transaction_date}
                  onChange={e => setNewTxn(p => ({ ...p, transaction_date: e.target.value }))} />
              </div>
              <div>
                <div style={{ ...s.label, marginBottom: 4 }}>Type</div>
                <select style={s.input} value={newTxn.type}
                  onChange={e => setNewTxn(p => ({ ...p, type: e.target.value }))}>
                  <option>BUY</option><option>SELL</option><option>DIVIDEND</option><option>OTHER</option>
                </select>
              </div>
              <div>
                <div style={{ ...s.label, marginBottom: 4 }}>Account</div>
                <input style={s.input} value={newTxn.account}
                  onChange={e => setNewTxn(p => ({ ...p, account: e.target.value }))} placeholder="HSBC HK" />
              </div>
              <div>
                <div style={{ ...s.label, marginBottom: 4 }}>Ticker</div>
                <input style={s.input} value={newTxn.ticker}
                  onChange={e => setNewTxn(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} placeholder="NVDA" />
              </div>
              <div>
                <div style={{ ...s.label, marginBottom: 4 }}>Currency</div>
                <select style={s.input} value={newTxn.currency}
                  onChange={e => setNewTxn(p => ({ ...p, currency: e.target.value }))}>
                  {['USD','HKD','AUD','CNY','THB'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ ...s.label, marginBottom: 4 }}>Name</div>
                <input style={s.input} value={newTxn.name}
                  onChange={e => setNewTxn(p => ({ ...p, name: e.target.value }))} placeholder="NVIDIA CORP" />
              </div>
              {newTxn.type !== 'DIVIDEND' && <>
                <div>
                  <div style={{ ...s.label, marginBottom: 4 }}>Quantity</div>
                  <input type="number" style={s.input} value={newTxn.quantity}
                    onChange={e => setNewTxn(p => ({ ...p, quantity: e.target.value }))} />
                </div>
                <div>
                  <div style={{ ...s.label, marginBottom: 4 }}>Price</div>
                  <input type="number" step="0.01" style={s.input} value={newTxn.price}
                    onChange={e => setNewTxn(p => ({ ...p, price: e.target.value }))} />
                </div>
              </>}
              <div style={{ gridColumn: newTxn.type === 'DIVIDEND' ? '1' : '1/-1' }}>
                <div style={{ ...s.label, marginBottom: 4 }}>{newTxn.type === 'DIVIDEND' ? 'Dividend Amount' : 'Total Amount'}</div>
                <input type="number" step="0.01" style={s.input} value={newTxn.amount}
                  onChange={e => setNewTxn(p => ({ ...p, amount: e.target.value }))}
                  placeholder={newTxn.quantity && newTxn.price ? fmt(Number(newTxn.quantity) * Number(newTxn.price)) : ''} />
              </div>
              {newTxn.type === 'DIVIDEND' && (
                <div>
                  <div style={{ ...s.label, marginBottom: 4 }}>Tax Withheld</div>
                  <input type="number" step="0.01" style={s.input} value={newTxn.tax_withheld}
                    onChange={e => setNewTxn(p => ({ ...p, tax_withheld: e.target.value }))} placeholder="-43.68" />
                </div>
              )}
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ ...s.label, marginBottom: 4 }}>Order Ref</div>
                <input style={s.input} value={newTxn.order_ref}
                  onChange={e => setNewTxn(p => ({ ...p, order_ref: e.target.value }))} placeholder="P351713" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowAdd(false)} style={{ ...s.btn(false), flex: 1 }}>Cancel</button>
              <button onClick={saveTxn} style={{ ...s.btn(true), flex: 1 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Paste / AI parse modal ── */}
      {showPaste && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Paste Email / Statement</div>
              <button onClick={() => { setShowPaste(false); setPendingParsed(null); setPasteText(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {!pendingParsed ? (<>
              <textarea style={{ ...s.input, height: 180, resize: 'vertical' }}
                value={pasteText} onChange={e => setPasteText(e.target.value)}
                placeholder="Paste brokerage email or statement text here…" />
              <div style={{ fontSize: 10, opacity: 0.4, marginTop: 4, marginBottom: 12 }}>
                Grok AI will extract transaction details automatically.
                {!xaiKey && ' Set your xAI key in Finances tab first.'}
              </div>
              <button onClick={parsePaste} disabled={pasteLoading || !pasteText.trim()}
                style={{ ...s.btn(true), width: '100%', opacity: (!pasteText.trim() || pasteLoading) ? 0.5 : 1 }}>
                {pasteLoading ? 'Parsing…' : 'Parse with AI'}
              </button>
            </>) : (<>
              <div style={{ ...s.label, marginBottom: 8 }}>Review — {pendingParsed.length} transaction{pendingParsed.length !== 1 ? 's' : ''} found</div>
              {pendingParsed.map((t, i) => {
                const tc = TYPE_COLORS[t.type] || TYPE_COLORS.OTHER;
                return (
                  <div key={i} style={{ background: '#fafaf8', borderRadius: 8, padding: '8px 10px', marginBottom: 6, fontSize: 11, fontFamily: MONO }}>
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
                <button onClick={saveParsed} style={{ ...s.btn(true), flex: 1 }}>
                  Save {pendingParsed.length} Txn{pendingParsed.length !== 1 ? 's' : ''}
                </button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
