import React, { useState } from 'react';
import { Download } from 'lucide-react';

const MONO = '"IBM Plex Mono", monospace';

const ITEMS = [
  { id: 'a', label: '影相' },
  { id: 'b', label: '打卡' },
  { id: 'c', label: '記錄入門' },
  { id: 'd', label: '餐牌區等30秒，無人就拎牌去排隊' },
  { id: 'e', label: '記錄排隊時間' },
  { id: 'f', label: '「Not Sure, prefer order at the counter」' },
  { id: 'g', label: 'No Relish Program' },
  { id: 'h', label: 'No Local Matters' },
  { id: 'i', label: '記錄排隊時間' },
  { id: 'j', label: '"Simply Grill\'d, and a small chips"' },
  { id: 'k', label: '不要問收據！' },
  { id: 'l', label: '記錄到餐時間' },
  { id: 'm', label: '打直側面照片各一' },
  { id: 'n', label: '有冇問好唔好味？' },
  { id: 'o', label: '有無三分鐘執枱' },
];

const sq = s => ({ fontFamily: MONO, ...s });
const inputBase = {
  fontFamily: MONO, fontSize: 13,
  border: '1px solid #e5e7eb', borderRadius: 8,
  padding: '6px 10px', outline: 'none',
  background: '#fafafa', color: '#1a1a1a', width: '100%',
};

export default function GrilldTab() {
  const [values, setValues] = useState(() => Object.fromEntries(ITEMS.map(i => [i.id, ''])));
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));

  const set = (id, val) => setValues(v => ({ ...v, [id]: val }));

  const exportTxt = () => {
    const lines = [
      "GRILL'D VISIT REPORT",
      `Date: ${visitDate}`,
      `Exported: ${new Date().toLocaleString()}`,
      '', '─'.repeat(40), '',
    ];
    ITEMS.forEach((item, idx) => {
      lines.push(`${String(idx + 1).padStart(2, '0')}. ${item.label}`);
      lines.push(`    ${values[item.id] || '—'}`);
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `grilld-${visitDate}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={sq({ paddingBottom: 100 })}>
      <div style={{ padding: '20px 16px 8px' }}>
        <div style={sq({ fontSize: 18, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#1a1a1a' })}>Grill'd</div>
        <div style={sq({ fontSize: 11, opacity: 0.4, marginTop: 2 })}>Mystery Diner Checklist</div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <label style={sq({ fontSize: 10, textTransform: 'uppercase', opacity: 0.4, display: 'block', marginBottom: 4 })}>Visit Date</label>
        <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)}
          style={{ ...inputBase, width: 'auto' }} />
      </div>

      <div style={{ padding: '0 16px' }}>
        {ITEMS.map((item, idx) => (
          <div key={item.id} style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
            <div style={sq({ fontSize: 13, color: '#1a1a1a', marginBottom: 8 })}>
              <span style={{ opacity: 0.3, fontSize: 10, marginRight: 6 }}>{String(idx + 1).padStart(2, '0')}</span>
              {item.label}
            </div>
            <input type="text" value={values[item.id]} onChange={e => set(item.id, e.target.value)}
              style={inputBase} />
          </div>
        ))}
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
