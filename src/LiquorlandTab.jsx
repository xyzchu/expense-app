import React, { useState } from 'react';
import { Download } from 'lucide-react';

const MONO = '"IBM Plex Mono", monospace';

const ITEMS = [
  { id: 'a', label: '影相' },
  { id: 'b', label: '打卡' },
  { id: 'c', label: '記錄入門' },
  { id: 'd', label: '記錄收銀枱顧客' },
  { id: 'e', label: '記錄收銀枱員工' },
  { id: 'f', label: '有冇打招呼？幾耐？' },
  { id: 'g', label: '在店舖等5分鐘' },
  { id: 'h', label: '「Looking for Rosé about $10-20, dinner with fds, something smooth」' },
  { id: 'i', label: '佢講乜？' },
  { id: 'j', label: '咩名？' },
  { id: 'k', label: '咩頭髮顏色？' },
  { id: 'sec', label: '收銀處', section: true },
  { id: 'l', label: '咩名？' },
  { id: 'm', label: '咩髮色？' },
  { id: 'n', label: '有冇up sell特價？' },
  { id: 'o', label: '拎收據' },
];

const sq = s => ({ fontFamily: MONO, ...s });
const inputBase = {
  fontFamily: MONO, fontSize: 13,
  border: '1px solid #e5e7eb', borderRadius: 8,
  padding: '6px 10px', outline: 'none',
  background: '#fafafa', color: '#1a1a1a', width: '100%',
};

export default function LiquorlandTab() {
  const [values, setValues] = useState(() =>
    Object.fromEntries(ITEMS.filter(i => !i.section).map(i => [i.id, '']))
  );
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));

  const set = (id, val) => setValues(v => ({ ...v, [id]: val }));

  const exportTxt = () => {
    const lines = [
      'LIQUORLAND VISIT REPORT',
      `Date: ${visitDate}`,
      `Exported: ${new Date().toLocaleString()}`,
      '', '─'.repeat(40), '',
    ];
    let num = 0;
    ITEMS.forEach(item => {
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
    a.href = url; a.download = `liquorland-${visitDate}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  let num = 0;

  return (
    <div style={sq({ paddingBottom: 100 })}>
      <div style={{ padding: '20px 16px 8px' }}>
        <div style={sq({ fontSize: 18, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#1a1a1a' })}>Liquorland</div>
        <div style={sq({ fontSize: 11, opacity: 0.4, marginTop: 2 })}>Mystery Shopper Checklist</div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <label style={sq({ fontSize: 10, textTransform: 'uppercase', opacity: 0.4, display: 'block', marginBottom: 4 })}>Visit Date</label>
        <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)}
          style={{ ...inputBase, width: 'auto' }} />
      </div>

      <div style={{ padding: '0 16px' }}>
        {ITEMS.map(item => {
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
          return (
            <div key={item.id} style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
              <div style={sq({ fontSize: 13, color: '#1a1a1a', marginBottom: 8 })}>
                <span style={{ opacity: 0.3, fontSize: 10, marginRight: 6 }}>{String(n).padStart(2, '0')}</span>
                {item.label}
              </div>
              <input type="text" value={values[item.id]} onChange={e => set(item.id, e.target.value)}
                style={inputBase} />
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
