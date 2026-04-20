import React, { useState } from 'react';
import { Download } from 'lucide-react';

const MONO = '"IBM Plex Mono", monospace';
const sq = s => ({ fontFamily: MONO, ...s });
const inputBase = {
  fontFamily: MONO, fontSize: 13,
  border: '1px solid #e5e7eb', borderRadius: 8,
  padding: '6px 10px', outline: 'none',
  background: '#fafafa', color: '#1a1a1a', width: '100%',
};

function load(key, fallback) {
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s); } catch {}
  return fallback;
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export default function ChecklistPage({ storageKey, title, subtitle, filename, items }) {
  const dataItems = items.filter(i => !i.section);

  const [values, setValues] = useState(() =>
    load(`${storageKey}_values`, Object.fromEntries(dataItems.map(i => [i.id, ''])))
  );
  const [hidden, setHidden] = useState(() =>
    load(`${storageKey}_hidden`, Object.fromEntries(dataItems.map(i => [i.id, false])))
  );
  const [visitDate, setVisitDate] = useState(() =>
    localStorage.getItem(`${storageKey}_date`) || new Date().toISOString().slice(0, 10)
  );

  const setVal = (id, val) => setValues(v => {
    const next = { ...v, [id]: val };
    save(`${storageKey}_values`, next);
    return next;
  });

  const setHid = (id, val) => setHidden(h => {
    const next = { ...h, [id]: val };
    save(`${storageKey}_hidden`, next);
    return next;
  });

  const tick = (id) => {
    if (!values[id] || values[id].toLowerCase() === 'no') setVal(id, 'yes');
    setHid(id, true);
  };

  const cross = (id) => {
    if (!values[id] || values[id].toLowerCase() === 'yes') setVal(id, 'No');
    setHid(id, true);
  };

  const exportTxt = () => {
    const lines = [
      `${title.toUpperCase()} VISIT REPORT`,
      `Date: ${visitDate}`,
      `Exported: ${new Date().toLocaleString()}`,
      '', '─'.repeat(40), '',
    ];
    let num = 0;
    items.forEach(item => {
      if (item.section) {
        lines.push(''); lines.push(`[ ${item.label} ]`); lines.push('');
        return;
      }
      num += 1;
      lines.push(`${String(num).padStart(2, '0')}. ${item.label}`);
      lines.push(`    ${values[item.id] || '—'}`);
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}-${visitDate}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  let num = 0;

  return (
    <div style={sq({ paddingBottom: 100 })}>
      <div style={{ padding: '20px 16px 8px' }}>
        <div style={sq({ fontSize: 18, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#1a1a1a' })}>{title}</div>
        <div style={sq({ fontSize: 11, opacity: 0.4, marginTop: 2 })}>{subtitle}</div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <label style={sq({ fontSize: 10, textTransform: 'uppercase', opacity: 0.4, display: 'block', marginBottom: 4 })}>Visit Date</label>
        <input type="date" value={visitDate}
          onChange={e => { setVisitDate(e.target.value); localStorage.setItem(`${storageKey}_date`, e.target.value); }}
          style={{ ...inputBase, width: 'auto' }} />
      </div>

      <div style={{ padding: '0 16px' }}>
        {items.map(item => {
          if (item.section) {
            return (
              <div key={item.id} style={sq({
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
                opacity: 0.45, marginTop: 6, marginBottom: 6, paddingLeft: 2,
              })}>
                {item.label}
              </div>
            );
          }

          num += 1;
          const n = num;
          const isHidden = hidden[item.id];

          if (isHidden) {
            return (
              <div key={item.id}
                onClick={() => setHid(item.id, false)}
                style={{
                  background: '#f9fafb', border: '1px solid #f0f0f0', borderRadius: 12,
                  padding: '10px 14px', marginBottom: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                <span style={sq({ fontSize: 10, opacity: 0.25, flexShrink: 0 })}>{String(n).padStart(2, '0')}</span>
                <span style={sq({ fontSize: 13, color: '#9ca3af', flex: 1, textDecoration: 'line-through' })}>{item.label}</span>
                <span style={sq({ fontSize: 11, color: '#22c55e', flexShrink: 0 })}>
                  {values[item.id] ? values[item.id] : '✓'}
                </span>
              </div>
            );
          }

          return (
            <div key={item.id} style={{
              background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
              padding: '12px 14px', marginBottom: 10,
            }}>
              <div style={sq({ fontSize: 13, color: '#1a1a1a', marginBottom: 8 })}>
                <span style={{ opacity: 0.3, fontSize: 10, marginRight: 6 }}>{String(n).padStart(2, '0')}</span>
                {item.label}
              </div>
              <input type="text" value={values[item.id]} onChange={e => setVal(item.id, e.target.value)}
                style={{ ...inputBase, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => tick(item.id)} style={sq({
                  flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #bbf7d0',
                  background: '#f0fdf4', color: '#15803d', fontSize: 14, cursor: 'pointer',
                })}>✓</button>
                <button onClick={() => cross(item.id)} style={sq({
                  flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #fecaca',
                  background: '#fef2f2', color: '#b91c1c', fontSize: 14, cursor: 'pointer',
                })}>✗</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '0 16px 20px' }}>
        <button onClick={exportTxt} style={sq({
          width: '100%', padding: '14px', background: '#1a1a1a', color: '#fff',
          border: 'none', borderRadius: 12, fontSize: 13, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, letterSpacing: '0.05em', textTransform: 'uppercase',
        })}>
          <Download size={15} /> Export as Text File
        </button>
      </div>
    </div>
  );
}
