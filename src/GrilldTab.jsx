import React, { useState } from 'react';
import { Download } from 'lucide-react';

const MONO = '"IBM Plex Mono", monospace';

const ITEMS = [
  { id: 'photo',         label: '影相',                          type: 'check',  hint: 'Take photo upon arrival' },
  { id: 'checkin',       label: '打卡',                          type: 'check',  hint: 'Check in' },
  { id: 'entry_notes',   label: '記錄入門',                      type: 'text',   hint: 'Entry notes / observations' },
  { id: 'menu_wait',     label: '餐牌區等30秒',                  type: 'check',  hint: 'Wait 30s at menu board; if no one, take number and queue' },
  { id: 'queue_start',   label: '記錄排隊時間 (開始)',            type: 'time',   hint: 'Queue start time' },
  { id: 'not_sure',      label: '「Not Sure, prefer order at the counter」', type: 'yesno', hint: 'Did staff say this?' },
  { id: 'no_relish',     label: 'No Relish Program',             type: 'check',  hint: 'Confirmed: no relish program' },
  { id: 'no_local',      label: 'No Local Matters',              type: 'check',  hint: 'Confirmed: no local matters' },
  { id: 'queue_end',     label: '記錄排隊時間 (完結)',            type: 'time',   hint: 'Queue end / order placed time' },
  { id: 'order',         label: '"Simply Grill\'d, and a small chips"', type: 'check', hint: 'Ordered correctly' },
  { id: 'no_receipt',    label: '不要問收據！',                  type: 'check',  hint: 'Did NOT ask for receipt' },
  { id: 'food_time',     label: '記錄到餐時間',                  type: 'time',   hint: 'Food arrival time' },
  { id: 'side_photos',   label: '打直側面照片各一',              type: 'check',  hint: 'Took vertical side photos' },
  { id: 'asked_taste',   label: '有冇問好唔好味？',              type: 'yesno',  hint: 'Did staff ask how the food tasted?' },
  { id: 'table_clear',   label: '有無三分鐘執枱',                type: 'yesno',  hint: 'Was the table cleared within 3 minutes?' },
];

const sq = (style) => ({ fontFamily: MONO, ...style });

export default function GrilldTab() {
  const [values, setValues] = useState(() =>
    Object.fromEntries(ITEMS.map(i => [i.id, i.type === 'check' ? false : i.type === 'yesno' ? '' : '']))
  );
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const set = (id, val) => setValues(v => ({ ...v, [id]: val }));

  const exportTxt = () => {
    const lines = [
      `GRILL'D VISIT REPORT`,
      `Date: ${visitDate}`,
      `Exported: ${new Date().toLocaleString()}`,
      '',
      '─'.repeat(40),
      '',
    ];
    ITEMS.forEach(item => {
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
    a.download = `grilld-${visitDate}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputBase = {
    fontFamily: MONO,
    fontSize: 13,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '6px 10px',
    outline: 'none',
    background: '#fafafa',
    color: '#1a1a1a',
    width: '100%',
  };

  return (
    <div style={sq({ paddingBottom: 100 })}>
      {/* Header */}
      <div style={{ padding: '20px 16px 8px' }}>
        <div style={sq({ fontSize: 18, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#1a1a1a' })}>
          Grill'd
        </div>
        <div style={sq({ fontSize: 11, opacity: 0.4, marginTop: 2 })}>Mystery Diner Checklist</div>
      </div>

      {/* Visit date */}
      <div style={{ padding: '0 16px 16px' }}>
        <label style={sq({ fontSize: 10, textTransform: 'uppercase', opacity: 0.4, display: 'block', marginBottom: 4 })}>
          Visit Date
        </label>
        <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)}
          style={{ ...inputBase, width: 'auto' }} />
      </div>

      {/* Checklist items */}
      <div style={{ padding: '0 16px' }}>
        {ITEMS.map((item, idx) => (
          <div key={item.id} style={{
            background: '#fff',
            border: '1px solid #f0f0f0',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 10,
          }}>
            <div style={sq({ fontSize: 13, color: '#1a1a1a', marginBottom: 2 })}>
              <span style={{ opacity: 0.3, fontSize: 10, marginRight: 6 }}>{String(idx + 1).padStart(2, '0')}</span>
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
                      padding: '5px 14px',
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: values[item.id] === v ? (v ? '#22c55e' : '#ef4444') : '#e5e7eb',
                      background: values[item.id] === v ? (v ? '#f0fdf4' : '#fef2f2') : '#fafafa',
                      color: values[item.id] === v ? (v ? '#15803d' : '#b91c1c') : '#9ca3af',
                      fontSize: 12,
                      cursor: 'pointer',
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
                      padding: '5px 14px',
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: values[item.id] === v ? (v === 'yes' ? '#22c55e' : '#ef4444') : '#e5e7eb',
                      background: values[item.id] === v ? (v === 'yes' ? '#f0fdf4' : '#fef2f2') : '#fafafa',
                      color: values[item.id] === v ? (v === 'yes' ? '#15803d' : '#b91c1c') : '#9ca3af',
                      fontSize: 12,
                      cursor: 'pointer',
                    })}>
                    {v === 'yes' ? '✓ Yes' : '✗ No'}
                  </button>
                ))}
              </div>
            )}

            {item.type === 'time' && (
              <input type="time" value={values[item.id]} onChange={e => set(item.id, e.target.value)}
                style={{ ...inputBase, width: 'auto' }} />
            )}

            {item.type === 'text' && (
              <textarea value={values[item.id]} onChange={e => set(item.id, e.target.value)}
                rows={2} placeholder="Type here..."
                style={{ ...inputBase, resize: 'vertical' }} />
            )}
          </div>
        ))}

        {/* Additional notes */}
        <div style={{
          background: '#fff',
          border: '1px solid #f0f0f0',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 10,
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

      {/* Export button */}
      <div style={{ padding: '0 16px 20px' }}>
        <button onClick={exportTxt}
          style={sq({
            width: '100%',
            padding: '14px',
            background: '#1a1a1a',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          })}>
          <Download size={15} />
          Export as Text File
        </button>
      </div>
    </div>
  );
}
