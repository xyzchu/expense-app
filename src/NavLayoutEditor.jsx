import React, { useState } from 'react';
import { X } from 'lucide-react';
import { CLAY, FS, FW, MONO } from './theme';

export default function NavLayoutEditor({ pool, layout, onSave, onClose, isWide }) {
  const [draft, setDraft] = useState(() => ({
    nav: [...layout.nav],
    investingGroups: layout.investingGroups.map(g => ({ ...g, items: [...g.items] })),
  }));

  const poolMap = new Map(pool.map(item => [item.id, item]));

  const moveNav = (idx, dir) => {
    setDraft(d => {
      const next = [...d.nav];
      const to = idx + dir;
      if (to < 0 || to >= next.length) return d;
      [next[idx], next[to]] = [next[to], next[idx]];
      return { ...d, nav: next };
    });
  };

  const unpinFromNav = (id) => {
    const item = poolMap.get(id);
    if (!item || item.isInvestingTrigger) return;
    const targetGroup = item.defaultMoreGroup || item.defaultInvestingGroup || 'Main';
    setDraft(d => {
      const nextNav = d.nav.filter(nid => nid !== id);
      let groups = d.investingGroups.map(g =>
        g.label === targetGroup && !g.items.includes(id) ? { ...g, items: [...g.items, id] } : g
      );
      if (!groups.find(g => g.label === targetGroup)) {
        groups = [...groups, { label: targetGroup, items: [id] }];
      }
      return { nav: nextNav, investingGroups: groups };
    });
  };

  const pinToNav = (id, groupLabel) => {
    setDraft(d => ({
      nav: [...d.nav, id],
      investingGroups: d.investingGroups.map(g =>
        g.label === groupLabel ? { ...g, items: g.items.filter(gid => gid !== id) } : g
      ),
    }));
  };

  const moveInGroup = (groupLabel, idx, dir) => {
    setDraft(d => ({
      ...d,
      investingGroups: d.investingGroups.map(g => {
        if (g.label !== groupLabel) return g;
        const next = [...g.items];
        const to = idx + dir;
        if (to < 0 || to >= next.length) return g;
        [next[idx], next[to]] = [next[to], next[idx]];
        return { ...g, items: next };
      }),
    }));
  };

  const btnStyle = (disabled) => ({
    padding: '5px 9px', border: 'none', borderRadius: 6, fontFamily: MONO, fontSize: 13,
    cursor: disabled ? 'default' : 'pointer',
    background: disabled ? 'transparent' : CLAY.surf2,
    opacity: disabled ? 0.25 : 1,
    color: CLAY.text,
  });

  const hasInvestingItems = draft.investingGroups.some(g => g.items.length > 0);
  const moreItems = draft.investingGroups.flatMap(group =>
    group.items.map((id, idx) => ({
      id,
      idx,
      groupLabel: group.label,
      item: poolMap.get(id),
    }))
  ).filter(entry => entry.item);
  const moreLabel = (entry) => entry.groupLabel === entry.item.label ? entry.item.label : `${entry.groupLabel} ${entry.item.label}`;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(44,36,32,0.55)', display: 'flex', alignItems: isWide ? 'center' : 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 480, background: CLAY.bg, borderRadius: isWide ? 24 : '24px 24px 0 0', padding: '20px 16px 44px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: MONO, fontWeight: FW.semibold, fontSize: FS.lg, letterSpacing: '0.08em', color: CLAY.textMid }}>CUSTOMIZE LAYOUT</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => { onSave(draft); onClose(); }}
              style={{ padding: '6px 16px', background: CLAY.surf2, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: MONO, fontSize: FS.sm, fontWeight: FW.semibold, color: CLAY.text, boxShadow: CLAY.inset }}
            >
              Done
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: CLAY.textMid, display: 'flex', alignItems: 'center' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Nav Bar */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: FS.compact, fontWeight: FW.semibold, color: CLAY.textLt, fontFamily: MONO, marginBottom: 10, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Nav Bar
          </div>
          {draft.nav.map((id, idx) => {
            const item = poolMap.get(id);
            if (!item) return null;
            const canMoveToMenu = !item.isInvestingTrigger;
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 12, marginBottom: 6, background: CLAY.surface }}>
                <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>{item.emoji}</span>
                <span style={{ flex: 1, fontFamily: MONO, fontSize: FS.sm }}>{item.label}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={btnStyle(idx === 0)} disabled={idx === 0} onClick={() => moveNav(idx, -1)}>↑</button>
                  <button style={btnStyle(idx === draft.nav.length - 1)} disabled={idx === draft.nav.length - 1} onClick={() => moveNav(idx, 1)}>↓</button>
                  {canMoveToMenu && (
                    <button
                      onClick={() => unpinFromNav(id)}
                      style={{ padding: '5px 9px', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#fee2e2', color: '#dc2626', fontSize: FS.compact, fontFamily: MONO }}
                    >
                      → More
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* More Menu */}
        {hasInvestingItems && (
          <div>
            <div style={{ fontSize: FS.compact, fontWeight: FW.semibold, color: CLAY.textLt, fontFamily: MONO, marginBottom: 10, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              More Menu
            </div>
            {moreItems.map(entry => {
              const group = draft.investingGroups.find(g => g.label === entry.groupLabel);
              const isFirst = entry.idx === 0;
              const isLast = entry.idx === (group?.items.length || 0) - 1;
              return (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 12, marginBottom: 4, background: CLAY.surface }}>
                  <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>{entry.item.emoji}</span>
                  <span style={{ flex: 1, fontFamily: MONO, fontSize: FS.sm, textTransform: 'capitalize' }}>{moreLabel(entry)}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={btnStyle(isFirst)} disabled={isFirst} onClick={() => moveInGroup(entry.groupLabel, entry.idx, -1)}>↑</button>
                    <button style={btnStyle(isLast)} disabled={isLast} onClick={() => moveInGroup(entry.groupLabel, entry.idx, 1)}>↓</button>
                    <button
                      onClick={() => pinToNav(entry.id, entry.groupLabel)}
                      style={{ padding: '5px 9px', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#dcfce7', color: '#16a34a', fontSize: FS.compact, fontFamily: MONO }}
                    >
                      → Nav
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  );
}
