import React from 'react';
import { X } from 'lucide-react';
import { MONO, FS, FW, CLAY } from './theme';
import { s, SHELL_HEADING_STYLE } from './appConstants';

export default function PagePicker({
  config,
  currentTab,
  currentInvestingView,
  currentPortfolioView,
  currentSecuritiesView,
  onNavigate,
  onClose,
}) {
  const isActive = (action) => {
    if (!action || action.tab !== currentTab) return false;
    if (action.investingView  && action.investingView  !== currentInvestingView)  return false;
    if (action.portfolioView  && action.portfolioView  !== currentPortfolioView)  return false;
    if (action.securitiesView && action.securitiesView !== currentSecuritiesView) return false;
    return true;
  };

  const topLevel  = config.filter(item => item.id !== 'investing' && item.id !== 'settings');
  const investing = config.find(item  => item.id === 'investing');
  const settings  = config.find(item  => item.id === 'settings');

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(44,36,32,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 480, background: CLAY.bg, borderRadius: '24px 24px 0 0', padding: '20px 16px 36px', maxHeight: '88vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ ...SHELL_HEADING_STYLE, marginBottom: 0 }}>PAGES</div>
          <button onClick={onClose} style={s.ghost}><X size={20} /></button>
        </div>

        {/* Top-level pages grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
          {topLevel.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.action)}
              style={{ ...s.sm(isActive(item.action)), display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', textAlign: 'left' }}
            >
              <span style={{ fontSize: 22 }}>{item.emoji}</span>
              <span style={{ fontFamily: MONO, fontWeight: FW.semibold, fontSize: FS.lg }}>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Investing section */}
        {investing && (
          <div style={{ background: CLAY.surface, borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: CLAY.shadowSm }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 22 }}>{investing.emoji}</span>
              <span style={{ fontFamily: MONO, fontWeight: FW.semibold, fontSize: FS.lg, color: CLAY.text }}>{investing.label}</span>
            </div>
            {investing.groups.map((group, gi) => (
              <div key={group.label} style={{ marginBottom: gi < investing.groups.length - 1 ? 14 : 0 }}>
                <div style={{ fontSize: FS.compact, fontWeight: FW.semibold, color: CLAY.textLt, fontFamily: MONO, marginBottom: 8, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {group.label}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.items.map(item => (
                    <button key={item.id} onClick={() => onNavigate(item.action)} style={s.split(isActive(item.action))}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Settings */}
        {settings && (
          <>
            <div style={{ height: 1, background: CLAY.surf2, margin: '4px 0 12px' }} />
            <button
              onClick={() => onNavigate(settings.action)}
              style={{ ...s.sm(isActive(settings.action)), width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', textAlign: 'left' }}
            >
              <span style={{ fontSize: 22 }}>{settings.emoji}</span>
              <span style={{ fontFamily: MONO, fontWeight: FW.semibold, fontSize: FS.lg }}>{settings.label}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
