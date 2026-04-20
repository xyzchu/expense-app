import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import ChecklistPage from './ChecklistPage';

const MONO = '"IBM Plex Mono", monospace';
const sq = s => ({ fontFamily: MONO, ...s });

function loadCustom() {
  try { const s = localStorage.getItem('shopper_custom_pages'); if (s) return JSON.parse(s); } catch {}
  return [];
}
function saveCustom(pages) {
  try { localStorage.setItem('shopper_custom_pages', JSON.stringify(pages)); } catch {}
}

export default function ShopperTab() {
  const [venue, setVenue] = useState(() => loadCustom()[0]?.id ?? null);
  const [customPages, setCustomPages] = useState(loadCustom);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newItems, setNewItems] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const inputBase = sq({
    fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8,
    padding: '8px 10px', outline: 'none', background: '#fafafa',
    color: '#1a1a1a', width: '100%', display: 'block',
  });

  const openCreate = () => {
    setNewName(''); setNewItems(''); setCreating(true);
  };

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const lines = newItems.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const id = `custom_${Date.now()}`;
    const page = {
      id,
      label: name,
      items: lines.map((label, i) => ({ id: `i${i}`, label })),
    };
    const next = [...customPages, page];
    setCustomPages(next);
    saveCustom(next);
    setCreating(false);
    setVenue(id);
    setConfirmDelete(false);
  };

  const deletePage = (id) => {
    const next = customPages.filter(p => p.id !== id);
    setCustomPages(next);
    saveCustom(next);
    // clear its stored state
    ['_values', '_hidden', '_date'].forEach(suffix => {
      try { localStorage.removeItem(`${id}${suffix}`); } catch {}
    });
    setVenue(next.length ? next[0].id : null);
    setConfirmDelete(false);
  };

  const activePage = customPages.find(p => p.id === venue);

  return (
    <div>
      {/* Sub-nav */}
      <div style={{
        display: 'flex', gap: 6, padding: '12px 16px 0',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky', top: 0, background: '#fff', zIndex: 10,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}
        className="se-noscroll"
      >
        {customPages.map(v => (
          <button key={v.id} onClick={() => { setVenue(v.id); setCreating(false); setConfirmDelete(false); }}
            style={sq({
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: 'none',
              background: venue === v.id && !creating ? '#1a1a1a' : '#f3f4f6',
              color: venue === v.id && !creating ? '#fff' : '#6b7280',
              marginBottom: 12, flexShrink: 0, whiteSpace: 'nowrap',
            })}>
            {v.label}
          </button>
        ))}
        <button onClick={openCreate}
          style={sq({
            fontSize: 11, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed #d1d5db', background: creating ? '#1a1a1a' : 'transparent',
            color: creating ? '#fff' : '#9ca3af', marginBottom: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 4,
          })}>
          <Plus size={12} /> New
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ padding: '20px 16px' }}>
          <div style={sq({ fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 16, color: '#1a1a1a' })}>
            New Checklist
          </div>

          <label style={sq({ fontSize: 10, textTransform: 'uppercase', opacity: 0.4, display: 'block', marginBottom: 4 })}>
            Page Name
          </label>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Coles, Dan Murphy's…"
            style={{ ...inputBase, marginBottom: 16 }} />

          <label style={sq({ fontSize: 10, textTransform: 'uppercase', opacity: 0.4, display: 'block', marginBottom: 4 })}>
            Items (one per line)
          </label>
          <textarea value={newItems} onChange={e => setNewItems(e.target.value)}
            rows={12} placeholder={'影相\n打卡\n記錄入門\n...'}
            style={{ ...inputBase, resize: 'vertical', lineHeight: 1.8 }} />

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={() => setCreating(false)}
              style={sq({
                flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #e5e7eb',
                background: '#f9fafb', color: '#6b7280', fontSize: 13, cursor: 'pointer',
              })}>
              Cancel
            </button>
            <button onClick={create}
              style={sq({
                flex: 2, padding: '12px', borderRadius: 10, border: 'none',
                background: '#1a1a1a', color: '#fff', fontSize: 13, cursor: 'pointer',
                letterSpacing: '0.05em', textTransform: 'uppercase',
              })}>
              Create
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!creating && customPages.length === 0 && (
        <div style={sq({ padding: '60px 16px', textAlign: 'center', opacity: 0.35, fontSize: 13 })}>
          No pages yet — tap + New to create one
        </div>
      )}

      {/* Pages */}
      {!creating && activePage && (
        <div>
          <ChecklistPage
            key={activePage.id}
            storageKey={activePage.id}
            title={activePage.label}
            subtitle="Mystery Shopper Checklist"
            filename={activePage.label.toLowerCase().replace(/\s+/g, '-')}
            items={activePage.items}
          />

          {/* Delete section */}
          <div style={{ padding: '0 16px 40px' }}>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                style={sq({
                  width: '100%', padding: '12px', borderRadius: 10,
                  border: '1px solid #fecaca', background: '#fef2f2',
                  color: '#b91c1c', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                })}>
                <Trash2 size={13} /> Delete Page
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmDelete(false)}
                  style={sq({
                    flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #e5e7eb',
                    background: '#f9fafb', color: '#6b7280', fontSize: 12, cursor: 'pointer',
                  })}>
                  Cancel
                </button>
                <button onClick={() => deletePage(activePage.id)}
                  style={sq({
                    flex: 2, padding: '12px', borderRadius: 10, border: 'none',
                    background: '#b91c1c', color: '#fff', fontSize: 12, cursor: 'pointer',
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  })}>
                  Confirm Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
