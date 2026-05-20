import { MONO, FS, FW, CLAY } from './theme';

export const NO_DEC = new Set(['JPY','KRW','VND','IDR']);
export const CURR_FLAG = {AUD:'🇦🇺',USD:'🇺🇸',EUR:'🇪🇺',GBP:'🇬🇧',JPY:'🇯🇵',CNY:'🇨🇳',HKD:'🇭🇰',THB:'🇹🇭',NZD:'🇳🇿',SGD:'🇸🇬',KRW:'🇰🇷',INR:'🇮🇳',VND:'🇻🇳',IDR:'🇮🇩'};
export const ALL_CUR = ['AUD','USD','EUR','GBP','JPY','CNY','HKD','THB','NZD','SGD','KRW','INR','VND','IDR'];
export const BASE_CATS = {
  Restaurant:{emoji:'🍽️',c:'#f97316',bg:'#fff7ed',tx:'#c2410c'},
  Groceries:{emoji:'🛒',c:'#22c55e',bg:'#f0fdf4',tx:'#15803d'},
  Transport:{emoji:'🚗',c:'#3b82f6',bg:'#eff6ff',tx:'#1d4ed8'},
  Utilities:{emoji:'💡',c:'#eab308',bg:'#fefce8',tx:'#a16207'},
  Travel:{emoji:'✈️',c:'#a855f7',bg:'#faf5ff',tx:'#7e22ce'},
  Home:{emoji:'🏠',c:'#ec4899',bg:'#fdf2f8',tx:'#be185d'},
  Investment:{emoji:'📈',c:'#6366f1',bg:'#eef2ff',tx:'#4338ca'},
  Entertainment:{emoji:'🎬',c:'#f43f5e',bg:'#fff1f2',tx:'#be123c'},
  Income:{emoji:'💰',c:'#10b981',bg:'#ecfdf5',tx:'#047857'},
  Settlement:{emoji:'💸',c:'#64748b',bg:'#f1f5f9',tx:'#334155'},
  Other:{emoji:'📦',c:'#6b7280',bg:'#f3f4f6',tx:'#4b5563'},
};
export const PERSON_COLORS = ['#3b82f6','#ec4899','#f59e0b','#22c55e','#a855f7','#06b6d4','#ef4444','#84cc16'];
export const CUST_COLORS = ['#06b6d4','#f43f5e','#8b5cf6','#14b8a6','#f59e0b','#6366f1','#10b981','#e11d48'];

export const fmt = (n, cur = 'AUD') => {
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }
  catch { return `${cur} ${Math.round(n)}`; }
};

export const getCat = (name, customCats, members) => {
  if (BASE_CATS[name]) return BASE_CATS[name];
  if (customCats[name]) return customCats[name];
  const mi = members.findIndex(m => m.display_name === name);
  if (mi >= 0) return { emoji: '👤', c: PERSON_COLORS[mi % PERSON_COLORS.length], bg: '#eef2ff', tx: '#4338ca' };
  return BASE_CATS.Other;
};

export const s = {
  page: { minHeight: '100vh', background: CLAY.bg, color: CLAY.text, fontFamily: MONO, WebkitFontSmoothing: 'antialiased' },
  centerPage: { minHeight: '100vh', background: CLAY.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: MONO, color: CLAY.text },
  card: { background: CLAY.surface, borderRadius: 20, boxShadow: CLAY.shadow, padding: '20px' },
  input: { width: '100%', background: CLAY.surf2, border: 'none', borderRadius: 12, padding: '12px 14px', fontSize: FS.lg, color: CLAY.text, outline: 'none', letterSpacing: '0.04em', fontFamily: MONO },
  inputFocus: { background: '#E0D8CE' },
  label: { fontSize: FS.lg, opacity: 0.4, fontWeight: FW.semibold, marginBottom: 6, display: 'block' },
  btnDark: { width: '100%', padding: '14px', border: 'none', background: CLAY.text, color: CLAY.surface, fontSize: FS.lg, fontWeight: FW.semibold, borderRadius: 14, cursor: 'pointer', fontFamily: MONO, transition: 'all 0.2s', boxShadow: '5px 5px 14px rgba(44,36,32,0.32)' },
  btnOutline: { width: '100%', padding: '14px', border: `1.5px solid ${CLAY.surf2}`, background: 'transparent', color: CLAY.text, fontSize: FS.lg, fontWeight: FW.semibold, borderRadius: 14, cursor: 'pointer', fontFamily: MONO, transition: 'all 0.2s' },
  ghost: { background: 'none', border: 'none', fontSize: FS.lg, opacity: 0.35, cursor: 'pointer', padding: '8px 0', color: CLAY.text, fontFamily: MONO },
  tag: (bg, tx) => ({ fontSize: FS.lg, padding: '3px 8px', borderRadius: 9999, fontWeight: FW.semibold, display: 'inline-block', background: bg || CLAY.surf2, color: tx || CLAY.textMid }),
  chip: (active) => ({ fontSize: FS.lg, padding: '8px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer', transition: 'all 0.2s', fontFamily: MONO, fontWeight: active ? FW.semibold : FW.normal, background: active ? CLAY.text : CLAY.surf2, color: active ? CLAY.surface : CLAY.textMid, boxShadow: active ? '3px 3px 8px rgba(44,36,32,0.28)' : CLAY.btn }),
  sm: (active) => ({ fontSize: FS.lg, padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', transition: 'all 0.2s', fontFamily: MONO, background: active ? CLAY.text : CLAY.surf2, color: active ? CLAY.surface : CLAY.textMid, fontWeight: active ? FW.semibold : FW.normal, boxShadow: active ? '3px 3px 8px rgba(44,36,32,0.28)' : CLAY.btn }),
  split: (active) => ({ fontSize: FS.lg, padding: '6px 10px', borderRadius: 99, border: 'none', background: active ? CLAY.text : CLAY.surf2, color: active ? CLAY.surface : CLAY.textMid, cursor: 'pointer', transition: 'all 0.2s', fontFamily: MONO, fontWeight: active ? FW.semibold : FW.normal, boxShadow: active ? '3px 3px 8px rgba(44,36,32,0.28)' : CLAY.btn }),
  tabnum: { fontVariantNumeric: 'tabular-nums' },
  upper: {},
};

export const SHELL_HEADING_STYLE = { fontFamily: MONO, fontSize: FS.heading, fontWeight: FW.black, color: CLAY.text, marginBottom: 24, lineHeight: 1 };
