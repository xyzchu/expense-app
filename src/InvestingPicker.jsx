import React from 'react';
import { X, Settings2 } from 'lucide-react';
import { CLAY, FS, FW, MONO } from './theme';

export default function InvestingPicker({
  config,
  currentTab,
  currentInvestingView,
  currentPortfolioView,
  currentSecuritiesView,
  onNavigate,
  onClose,
  onOpenLayoutEditor,
  isWide = false,
}) {
  const investing = config.find(item => item.id === 'investing');
  if (!investing) return null;
  const menuItems = (investing.groups || []).flatMap(group =>
    group.items.map(item => ({
      ...item,
      menuLabel: group.label === item.label ? item.label : `${group.label} ${item.label}`,
    }))
  );

  const isActive = (action) => {
    if (!action || action.tab !== currentTab) return false;
    if (action.investingView === 'securities' && action.securitiesView === 'pnl') {
      return currentInvestingView === 'securities'
        && ['table', 'pnl', 'watchlist', 'statistics', 'transactions'].includes(currentSecuritiesView);
    }
    if (action.investingView  && action.investingView  !== currentInvestingView)  return false;
    if (action.portfolioView  && action.portfolioView  !== currentPortfolioView)  return false;
    if (action.securitiesView && action.securitiesView !== currentSecuritiesView) return false;
    return true;
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(44,36,32,0.55)', display: 'flex',
        alignItems: isWide ? 'center' : 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: isWide ? 440 : 480,
          background: CLAY.bg,
          borderRadius: isWide ? 24 : '24px 24px 0 0',
          padding: isWide ? '20px 16px 28px' : '20px 16px 36px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: MONO, fontWeight: FW.semibold, fontSize: FS.lg, letterSpacing: '0.08em', color: CLAY.textMid }}>MORE</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {onOpenLayoutEditor && (
              <button onClick={onOpenLayoutEditor} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: CLAY.textMid, display: 'flex', alignItems: 'center', opacity: 0.6 }}>
                <Settings2 size={18} />
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: CLAY.textMid, display: 'flex', alignItems: 'center' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {menuItems.map(item => {
            const active = isActive(item.action);
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.action)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  minHeight: 82, padding: '12px 8px 10px', gap: 6,
                  border: 'none', borderRadius: 14, cursor: 'pointer',
                  fontFamily: MONO, transition: 'all 0.2s', color: CLAY.text,
                  background: active ? CLAY.surf2 : 'transparent',
                  boxShadow: active ? CLAY.inset : 'none',
                  opacity: active ? 1 : 0.5,
                }}
              >
                <span style={{ fontSize: 23 }}>{item.emoji}</span>
                <span style={{ fontSize: FS.compact, fontWeight: active ? FW.semibold : FW.normal, textAlign: 'center', lineHeight: 1.2, textTransform: 'capitalize' }}>
                  {item.menuLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
