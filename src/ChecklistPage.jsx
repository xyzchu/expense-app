import React, { useState } from 'react';
import { MONO, FS, FW, CLAY } from './theme';

const sq = s => ({ fontFamily: MONO, ...s });
const inputBase = {
  fontFamily: MONO, fontSize: FS.lg,
  border: 'none', borderRadius: 8,
  boxShadow: CLAY.inset, padding: '6px 10px', outline: 'none',
  background: CLAY.surface, color: CLAY.text, width: '100%',
};

function load(key, fallback) {
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s); } catch {}
  return fallback;
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export default function ChecklistPage({ storageKey, title, subtitle, filename, items, onExport }) {
  const dataItems = items.filter(i => !i.section);

  const [notes, setNotes] = useState(() =>
    load(`${storageKey}_notes`, Object.fromEntries(dataItems.map(i => [i.id, ''])))
  );
  const [responses, setResponses] = useState(() =>
    load(`${storageKey}_responses`, Object.fromEntries(dataItems.map(i => [i.id, ''])))
  );
  const [hidden, setHidden] = useState(() =>
    load(`${storageKey}_hidden`, Object.fromEntries(dataItems.map(i => [i.id, false])))
  );

  const setNote = (id, val) => setNotes(v => {
    const next = { ...v, [id]: val };
    save(`${storageKey}_notes`, next);
    return next;
  });

  const setResponse = (id, val) => setResponses(r => {
    const next = { ...r, [id]: val };
    save(`${storageKey}_responses`, next);
    return next;
  });

  const setHid = (id, val) => setHidden(h => {
    const next = { ...h, [id]: val };
    save(`${storageKey}_hidden`, next);
    return next;
  });

  const tick = (id) => {
    setResponse(id, 'yes');
    setHid(id, true);
  };

  const cross = (id) => {
    setResponse(id, 'no');
    setHid(id, true);
  };

  const exportTxt = React.useCallback(() => {
    const lines = [
      `${title.toUpperCase()}`,
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
      const resp = responses[item.id] || '—';
      const note = notes[item.id] || '';
      lines.push(`${String(num).padStart(2, '0')}. ${item.label}`);
      lines.push(`    Response: ${resp}`);
      if (note) lines.push(`    Note: ${note}`);
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.txt`; a.click();
    URL.revokeObjectURL(url);
  }, [title, filename, items, responses, notes]);

  React.useEffect(() => { if (onExport) onExport(exportTxt); }, [exportTxt]);

  let num = 0;

  return (
    <div style={sq({ paddingBottom: 100 })}>

      <div style={{ padding: '0 16px' }}>
        {items.map(item => {
          if (item.section) {
            return (
              <div key={item.id} style={sq({
                fontSize: FS.lg, letterSpacing: '0.08em',
                color: CLAY.textMid, fontWeight: FW.semibold, marginTop: 6, marginBottom: 6, paddingLeft: 2,
              })}>
                {item.label}
              </div>
            );
          }

          num += 1;
          const n = num;
          const isHidden = hidden[item.id];
          const resp = responses[item.id] || '';
          const note = notes[item.id] || '';

          if (isHidden) {
            return (
              <div key={item.id}
                onClick={() => setHid(item.id, false)}
                style={{
                  background: CLAY.surf2, border: 'none', boxShadow: CLAY.inset, borderRadius: 12,
                  padding: '10px 14px', marginBottom: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                <span style={sq({ fontSize: FS.lg, color: CLAY.textLt, flexShrink: 0 })}>{String(n).padStart(2, '0')}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={sq({ fontSize: FS.lg, color: CLAY.textLt, textDecoration: 'line-through' })}>{item.label}</div>
                  {note ? <div style={sq({ fontSize: FS.lg, color: CLAY.textMid, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{note}</div> : null}
                </div>
                {resp && (
                  <span style={sq({
                    fontSize: FS.lg, fontWeight: FW.semibold, flexShrink: 0,
                    padding: '2px 8px', borderRadius: 6,
                    background: resp === 'yes' ? `${CLAY.green}20` : `${CLAY.red}18`,
                    color: resp === 'yes' ? CLAY.green : CLAY.red,
                  })}>
                    {resp === 'yes' ? 'Yes' : 'No'}
                  </span>
                )}
              </div>
            );
          }

          return (
            <div key={item.id} style={{
              background: CLAY.surface, border: 'none', boxShadow: CLAY.shadowSm, borderRadius: 12,
              padding: '12px 14px', marginBottom: 10,
            }}>
              <div style={sq({ fontSize: FS.lg, color: CLAY.text, marginBottom: 8 })}>
                <span style={{ color: CLAY.textLt, fontSize: FS.lg, marginRight: 6 }}>{String(n).padStart(2, '0')}</span>
                {item.label}
              </div>
              <input type="text" value={note} onChange={e => setNote(item.id, e.target.value)}
                placeholder="Note…"
                style={{ ...inputBase, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => tick(item.id)} style={sq({
                  flex: 1, padding: '6px', borderRadius: 8, border: 'none',
                  background: resp === 'yes' ? CLAY.sage : CLAY.surf2,
                  color: resp === 'yes' ? CLAY.sageDk : CLAY.textMid,
                  fontSize: FS.lg, cursor: 'pointer',
                  boxShadow: CLAY.btn, fontWeight: FW.semibold,
                })}>✓ Yes</button>
                <button onClick={() => cross(item.id)} style={sq({
                  flex: 1, padding: '6px', borderRadius: 8, border: 'none',
                  background: resp === 'no' ? `${CLAY.red}28` : CLAY.surf2,
                  color: resp === 'no' ? CLAY.red : CLAY.textMid,
                  fontSize: FS.lg, cursor: 'pointer',
                  boxShadow: CLAY.btn, fontWeight: FW.semibold,
                })}>✗ No</button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
