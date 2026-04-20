import React, { useState } from 'react';
import { Download } from 'lucide-react';

const MONO = '"IBM Plex Mono", monospace';

const ITEMS = [
  { id: 'photo',          label: '影相',                    type: 'check',  hint: 'Take photo upon arrival' },
  { id: 'checkin',        label: '打卡',                    type: 'check',  hint: 'Check in' },
  { id: 'entry_notes',    label: '記錄入門',                type: 'text',   hint: 'Entry notes / observations' },

  { id: 'sec_arrival',    label: '── Arrival ──',           type: 'section' },
  { id: 'cust_count',     label: '記錄收銀枱顧客',          type: 'text',   hint: 'No. of customers at counter' },
  { id: 'staff_count',    label: '記錄收銀枱員工',          type: 'text',   hint: 'No. of staff at counter' },
  { id: 'greeted',        label: '有冇打招呼？',            type: 'yesno',  hint: 'Were you greeted?' },
  { id: 'greet_time',     label: '幾耐？',                  type: 'text',   hint: 'How long until greeted?' },

  { id: 'sec_browse',     label: '── Browse ──',            type: 'section' },
  { id: 'wait5',          label: '在店舖等5分鐘',           type: 'check',  hint: 'Waited 5 minutes in store' },

  { id: 'sec_enquiry',    label: '── Enquiry ──',           type: 'section' },
  { id: 'script_said',    label: '「Looking for Rosé about $10-20, dinner with fds, something smooth」', type: 'check', hint: 'Said the script line' },
  { id: 'staff_said',     label: '佢講乜？',                type: 'text',   hint: 'What did the staff say / recommend?' },
  { id: 'staff_name',     label: '咩名？',                  type: 'text',   hint: 'Staff name (enquiry)' },
  { id: 'staff_hair',     label: '咩頭髮顏色？',            type: 'text',   hint: 'Staff hair colour (enquiry)' },

  { id: 'sec_cashier',    label: '── Cashier ──',           type: 'section' },
  { id: 'cashier_name',   label: '咩名？',                  type: 'text',   hint: 'Cashier name' },
  { id: 'cashier_hair',   label: '咩髮色？',                type: 'text',   hint: 'Cashier hair colour' },
  { id: 'upsell',         label: '有冇up sell特價？',       type: 'yesno',  hint: 'Did cashier upsell specials?' },
  { id: 'receipt',        label: '拎收據',                  type: 'check',  hint: 'Got the receipt' },
];

const sq = (style) => ({ fontFamily: MONO, ...style });

export default function LiquorlandTab() {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      ITEMS.filter(i => i.type !== 'section')
           .map(i => [i.id, i.type === 'check' ? false : i.type === 'yesno' ? '' : ''])
    )
  );
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const set = (id, val) => setValues(v => ({ ...v, [id]: val }));

  const exportTxt = () => {
    const lines = [
      `LIQUORLAND VISIT REPORT`,
      `Date: ${visitDate}`,
      `Exported: ${new Date().toLocaleString()}`,
      '',
      '─'.repeat(40),
      '',
    ];
    ITEMS.forEach(item => {
      if (item.type === 'section') {
        lines.push(''); lines.push(item.label); lines.push('');
        return;
      }
      const val = values[item.id];
      let display = '';
      if (item.type === 'check') display = val ? '✓ YES' : '✗ NO';
      else if (item.type === 'yesno') display = val === 'yes' ? '✓ YES' : val === 'no' ? '✗ NO' : '— not answered';
      else display = val || '— not recorded';
      lines.push(`${item.label}`);
      if (item.hint) lines.push(`  (${item.hint})`);
      lines.push(`  → ${display}`);
      lines.push('');
    });
    if (notes.trim()) {
      lines.push('─'.repeat(40));
      lines.push('Additional Notes:');
      lines.push(notes);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liquorland-${visitDate}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputBase = {
    fontFamily: MONO, fontSize: 13,
    border: '1px solid #e5e7eb', borderRadius: 8,
    padding: '6px 10px', outline: 'none',
    background: '#fafafa', color: '#1a1a1a', width: '100%',
  };

  let itemIdx = 0;

  return (
    <div style={sq({ paddingBottom: 100 })}>
      <div style={{ padding: '20px 16px 8px' }}>
        <div style={sq({ fontSize: 18, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#1a1a1a' })}>
          Liquorland
        </div>
        <div style={sq({ fontSize: 11, opacity: 0.4, marginTop: 2 })}>Mystery Shopper Checklist</div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <label style={sq({ fontSize: 10, textTransform: 'uppercase', opacity: 0.4, display: 'block', marginBottom: 4 })}>
          Visit Date
        </label>
        <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)}
          style={{ ...inputBase, width: 'auto' }} />
      </div>

      <div style={{ padding: '0 16px' }}>
        {ITEMS.map(item => {
          if (item.type === 'section') {
            return (
              <div key={item.id} style={sq({
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
                opacity: 0.35, marginTop: 8, marginBottom: 4, paddingLeft: 2,
              })}>
                {item.label.replace(/──\s?|\s?──/g, '').trim()}
              </div>
            );
          }
          itemIdx += 1;
          const num = itemIdx;
          return (
            <div key={item.id} style={{
              background: '#fff', border: '1px solid #f0f0f0',
              borderRadius: 12, padding: '12px 14px', marginBottom: 10,
            }}>
              <div style={sq({ fontSize: 13, color: '#1a1a1a', marginBottom: 2 })}>
                <span style={{ opacity: 0.3, fontSize: 10, marginRight: 6 }}>{String(num).padStart(2, '0')}</span>
                {item.label}
              </div>
              {item.hint && (
                <div style={sq({ fontSize: 10, opacity: 0.35, marginBottom: 8 })}>{item.hint}</div>
              )}

              {item.type === 'check' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {[true, false].map(v => (
                    <button key={String(v)} onClick={() => set(item.id, v)}
                      style={sq({
                        padding: '5px 14px', borderRadius: 8, border: '1px solid',
                        borderColor: values[item.id] === v ? (v ? '#22c55e' : '#ef4444') : '#e5e7eb',
                        background: values[item.id] === v ? (v ? '#f0fdf4' : '#fef2f2') : '#fafafa',
                        color: values[item.id] === v ? (v ? '#15803d' : '#b91c1c') : '#9ca3af',
                        fontSize: 12, cursor: 'pointer',
                      })}>
                      {v ? '✓ Done' : '✗ Skip'}
                    </button>
                  ))}
                </div>
              )}

              {item.type === 'yesno' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {['yes', 'no'].map(v => (
                    <button key={v} onClick={() => set(item.id, v)}
                      style={sq({
                        padding: '5px 14px', borderRadius: 8, border: '1px solid',
                        borderColor: values[item.id] === v ? (v === 'yes' ? '#22c55e' : '#ef4444') : '#e5e7eb',
                        background: values[item.id] === v ? (v === 'yes' ? '#f0fdf4' : '#fef2f2') : '#fafafa',
                        color: values[item.id] === v ? (v === 'yes' ? '#15803d' : '#b91c1c') : '#9ca3af',
                        fontSize: 12, cursor: 'pointer',
                      })}>
                      {v === 'yes' ? '✓ Yes' : '✗ No'}
                    </button>
                  ))}
                </div>
              )}

              {item.type === 'text' && (
                <input type="text" value={values[item.id]} onChange={e => set(item.id, e.target.value)}
                  placeholder="Type here..."
                  style={inputBase} />
              )}
            </div>
          );
        })}

        <div style={{
          background: '#fff', border: '1px solid #f0f0f0',
          borderRadius: 12, padding: '12px 14px', marginBottom: 10,
        }}>
          <div style={sq({ fontSize: 13, color: '#1a1a1a', marginBottom: 8 })}>
            <span style={{ opacity: 0.3, fontSize: 10, marginRight: 6 }}>—</span>
            Additional Notes
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            rows={3} placeholder="Any other observations..."
            style={{ ...inputBase, resize: 'vertical' }} />
        </div>
      </div>

      <div style={{ padding: '0 16px 20px' }}>
        <button onClick={exportTxt}
          style={sq({
            width: '100%', padding: '14px',
            background: '#1a1a1a', color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, letterSpacing: '0.05em', textTransform: 'uppercase',
          })}>
          <Download size={15} />
          Export as Text File
        </button>
      </div>
    </div>
  );
}
