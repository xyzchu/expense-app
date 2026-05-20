import React, { useState, useRef } from 'react';
import { Plus, Trash2, Pencil, Check, ChevronUp, ChevronDown, Download } from 'lucide-react';
import ChecklistPage from './ChecklistPage';
import { MONO, FS, FW, CLAY } from './theme';

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
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingItems, setEditingItems] = useState(false);
  const [editDraft, setEditDraft] = useState([]);
  const [newItemLabel, setNewItemLabel] = useState('');
  const [checklistKey, setChecklistKey] = useState(0);
  const exportFnRef = useRef(null);

  const inputBase = sq({
    fontSize: FS.lg, border: 'none', borderRadius: 8,
    boxShadow: CLAY.inset, padding: '8px 10px', outline: 'none',
    background: CLAY.surface, color: CLAY.text, width: '100%', display: 'block',
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

  const startEditItems = () => {
    setEditDraft(activePage ? activePage.items.map(i => ({ ...i })) : []);
    setNewItemLabel('');
    setEditingItems(true);
    setConfirmDelete(false);
  };

  const saveItemEdits = () => {
    const valid = editDraft.filter(i => i.label.trim());
    const next = customPages.map(p => p.id === venue ? { ...p, items: valid } : p);
    setCustomPages(next);
    saveCustom(next);
    setEditingItems(false);
  };

  const moveItem = (idx, dir) => {
    setEditDraft(d => {
      const next = [...d];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return d;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const addDraftItem = () => {
    const label = newItemLabel.trim();
    if (!label) return;
    setEditDraft(d => [...d, { id: `i${Date.now()}`, label }]);
    setNewItemLabel('');
  };

  const clearList = (id) => {
    ['_notes', '_responses', '_hidden'].forEach(suffix => {
      try { localStorage.removeItem(`${id}${suffix}`); } catch {}
    });
    setChecklistKey(k => k + 1);
    setConfirmClear(false);
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
      <div style={{ padding: '32px 16px 0' }}>
        <div style={sq({ fontSize: FS.heading, fontWeight: FW.black, color: CLAY.text, lineHeight: 1, marginBottom: 8 })}>List</div>
      </div>
      {/* Sub-nav */}
      <div style={{
        display: 'flex', gap: 6, padding: '12px 16px 0',
        borderBottom: `1px solid ${CLAY.surf2}`,
        position: 'sticky', top: 0, background: CLAY.bg, zIndex: 10,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}
        className="se-noscroll"
      >
        {customPages.map(v => (
          <button key={v.id} onClick={() => { setVenue(v.id); setCreating(false); setConfirmDelete(false); setConfirmClear(false); setEditingItems(false); }}
            style={sq({
              fontSize: FS.lg, letterSpacing: '0.06em',
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: 'none',
              background: venue === v.id && !creating ? CLAY.peach : CLAY.surf2,
              color: venue === v.id && !creating ? CLAY.peachDk : CLAY.textMid,
              boxShadow: venue === v.id && !creating ? CLAY.btn : 'none',
              fontWeight: venue === v.id && !creating ? FW.semibold : FW.normal,
              marginBottom: 12, flexShrink: 0, whiteSpace: 'nowrap',
            })}>
            {v.label}
          </button>
        ))}
        <button onClick={openCreate}
          style={sq({
            fontSize: FS.lg, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
            border: `1px dashed ${CLAY.peachDk}`, background: creating ? CLAY.peach : 'transparent',
            color: creating ? CLAY.peachDk : CLAY.textLt, marginBottom: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 4,
          })}>
          <Plus size={12} /> New
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ padding: '20px 16px', background: CLAY.bg }}>
          <div style={sq({ fontSize: FS.heading, fontWeight: FW.black, color: CLAY.text, lineHeight: 1, marginBottom: 16 })}>
            New Checklist
          </div>

          <label style={sq({ fontSize: FS.lg, color: CLAY.textMid, display: 'block', marginBottom: 4, fontWeight: FW.semibold })}>
            Page Name
          </label>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Coles, Dan Murphy's…"
            style={{ ...inputBase, marginBottom: 16 }} />

          <label style={sq({ fontSize: FS.lg, color: CLAY.textMid, display: 'block', marginBottom: 4, fontWeight: FW.semibold })}>
            Items (one per line)
          </label>
          <textarea value={newItems} onChange={e => setNewItems(e.target.value)}
            rows={12} placeholder={'影相\n打卡\n記錄入門\n...'}
            style={{ ...inputBase, resize: 'vertical', lineHeight: 1.8 }} />

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={() => setCreating(false)}
              style={sq({
                flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                boxShadow: CLAY.btn, background: CLAY.surface, color: CLAY.textMid,
                fontSize: FS.lg, cursor: 'pointer',
              })}>
              Cancel
            </button>
            <button onClick={create}
              style={sq({
                flex: 2, padding: '12px', borderRadius: 10, border: 'none',
                background: CLAY.peach, color: CLAY.peachDk, fontSize: FS.lg, cursor: 'pointer',
                boxShadow: CLAY.btn, letterSpacing: '0.05em', fontWeight: FW.semibold,
              })}>
              Create
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!creating && customPages.length === 0 && (
        <div style={sq({ padding: '60px 16px', textAlign: 'center', color: CLAY.textLt, fontSize: FS.lg })}>
          No pages yet — tap + New to create one
        </div>
      )}

      {/* Pages */}
      {!creating && activePage && (
        <div>
          {editingItems ? (
            <div style={{ padding: '16px 16px 0' }}>
              <div style={sq({ fontSize: FS.lg, fontWeight: FW.semibold, color: CLAY.textMid, marginBottom: 12 })}>Edit Items</div>
              {editDraft.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                      style={{ width: 24, height: 22, borderRadius: 5, border: 'none', background: idx === 0 ? 'transparent' : CLAY.surf2, color: idx === 0 ? CLAY.surf2 : CLAY.textMid, cursor: idx === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <ChevronUp size={12} />
                    </button>
                    <button onClick={() => moveItem(idx, 1)} disabled={idx === editDraft.length - 1}
                      style={{ width: 24, height: 22, borderRadius: 5, border: 'none', background: idx === editDraft.length - 1 ? 'transparent' : CLAY.surf2, color: idx === editDraft.length - 1 ? CLAY.surf2 : CLAY.textMid, cursor: idx === editDraft.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <ChevronDown size={12} />
                    </button>
                  </div>
                  <input
                    value={item.label}
                    onChange={e => setEditDraft(d => d.map(i => i.id === item.id ? { ...i, label: e.target.value } : i))}
                    style={{ ...inputBase, flex: 1 }}
                  />
                  <button onClick={() => setEditDraft(d => d.filter(i => i.id !== item.id))}
                    style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: `${CLAY.red}18`, color: CLAY.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 16, alignItems: 'center' }}>
                <span style={{ width: 24, flexShrink: 0 }} />
                <input
                  value={newItemLabel}
                  onChange={e => setNewItemLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDraftItem()}
                  placeholder="Add item…"
                  style={{ ...inputBase, flex: 1 }}
                />
                <button onClick={addDraftItem}
                  style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: CLAY.sage, color: CLAY.sageDk, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: CLAY.btn }}>
                  <Plus size={13} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button onClick={() => setEditingItems(false)}
                  style={sq({ flex: 1, padding: '12px', borderRadius: 10, border: 'none', boxShadow: CLAY.btn, background: CLAY.surface, color: CLAY.textMid, fontSize: FS.lg, cursor: 'pointer' })}>
                  Cancel
                </button>
                <button onClick={saveItemEdits}
                  style={sq({ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: CLAY.peach, color: CLAY.peachDk, fontSize: FS.lg, cursor: 'pointer', boxShadow: CLAY.btn, fontWeight: FW.semibold, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 })}>
                  <Check size={13} /> Save
                </button>
              </div>
            </div>
          ) : (
            <ChecklistPage
              key={`${activePage.id}_${checklistKey}`}
              storageKey={activePage.id}
              title={activePage.label}
              subtitle="Mystery Shopper Checklist"
              filename={activePage.label.toLowerCase().replace(/\s+/g, '-')}
              items={activePage.items}
              onExport={fn => { exportFnRef.current = fn; }}
            />
          )}

          {/* Edit items + Delete section */}
          {!editingItems && (
            <div style={{ padding: '0 16px 100px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={startEditItems}
                style={sq({
                  width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                  background: CLAY.surf2, color: CLAY.textMid, fontSize: FS.lg, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: CLAY.btn,
                })}>
                <Pencil size={13} /> Edit Items
              </button>
              <button onClick={() => exportFnRef.current?.()}
                style={sq({
                  width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                  background: CLAY.peach, color: CLAY.peachDk, fontSize: FS.lg, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: CLAY.btn, fontWeight: FW.semibold,
                })}>
                <Download size={13} /> Export as Text File
              </button>
              {!confirmClear ? (
                <button onClick={() => { setConfirmClear(true); setConfirmDelete(false); }}
                  style={sq({
                    width: '100%', padding: '12px', borderRadius: 10,
                    border: `1px solid ${CLAY.textLt}40`, background: CLAY.surf2,
                    color: CLAY.textMid, fontSize: FS.lg, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  })}>
                  Clear All Responses
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setConfirmClear(false)}
                    style={sq({ flex: 1, padding: '12px', borderRadius: 10, border: 'none', boxShadow: CLAY.btn, background: CLAY.surface, color: CLAY.textMid, fontSize: FS.lg, cursor: 'pointer' })}>
                    Cancel
                  </button>
                  <button onClick={() => clearList(activePage.id)}
                    style={sq({ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: CLAY.textMid, color: '#fff', fontSize: FS.lg, cursor: 'pointer' })}>
                    Confirm Clear
                  </button>
                </div>
              )}
              {!confirmDelete ? (
                <button onClick={() => { setConfirmDelete(true); setConfirmClear(false); }}
                  style={sq({
                    width: '100%', padding: '12px', borderRadius: 10,
                    border: `1px solid ${CLAY.red}40`, background: `${CLAY.red}10`,
                    color: CLAY.red, fontSize: FS.lg, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: '0.05em',
                  })}>
                  <Trash2 size={13} /> Delete Page
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setConfirmDelete(false)}
                    style={sq({ flex: 1, padding: '12px', borderRadius: 10, border: 'none', boxShadow: CLAY.btn, background: CLAY.surface, color: CLAY.textMid, fontSize: FS.lg, cursor: 'pointer' })}>
                    Cancel
                  </button>
                  <button onClick={() => deletePage(activePage.id)}
                    style={sq({ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: CLAY.red, color: '#fff', fontSize: FS.lg, cursor: 'pointer', letterSpacing: '0.05em' })}>
                    Confirm Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
