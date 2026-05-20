// Single source of truth for all app pages and sections.
// To add a new page: add an entry here. It will automatically appear in
// the bottom nav bar (if nav: true) and the page picker (always).
//
// action fields:
//   tab            — which top-level tab to set
//   homeView       — 'expenses' | 'stats'
//   investingView  — 'portfolio' | 'securities' | 'chat'
//   securitiesView — 'table' | 'pnl' | 'watchlist' | 'statistics' | 'transactions' | 'news'

export const buildNavPool = (can) => {
  const pool = [];
  for (const item of buildNavConfig(can)) {
    if (item.id === 'stats') continue;
    if (item.id === 'investing' && item.groups) {
      pool.push({ id: item.id, emoji: item.emoji, label: item.label, isInvestingTrigger: true, action: null });
      for (const group of item.groups) {
        for (const sub of group.items) {
          pool.push({ ...sub, defaultMoreGroup: group.label });
        }
      }
    } else {
      const rest = { ...item };
      delete rest.groups;
      delete rest.nav;
      rest.defaultMoreGroup = 'Main';
      pool.push(rest);
    }
  }
  return pool;
};

export const buildDefaultLayout = (can) => {
  const config = buildNavConfig(can);
  const nav = config.filter(i => i.nav).map(i => i.id);
  const investingItem = config.find(i => i.id === 'investing');
  const investingGroups = investingItem?.groups
    ? investingItem.groups.map(g => ({ label: g.label, items: g.items.map(i => i.id) }))
    : [];
  return { nav, investingGroups };
};

export const buildNavConfig = (can) => [
  {
    id: 'home', emoji: '🧾', label: 'Expense', nav: true,
    action: { tab: 'home', homeView: 'expenses' },
  },
  {
    id: 'stats', emoji: '📊', label: 'Stats', nav: false,
    action: { tab: 'home', homeView: 'stats' },
  },
  ...(can('investing') ? [{
    id: 'investing', emoji: '⋯', label: 'More', nav: true,
    action: { tab: 'investing' },
    groups: [
      {
        label: 'Portfolio',
        items: [
          { id: 'inv_portfolio', emoji: '💼', label: 'Portfolio', action: { tab: 'investing', investingView: 'portfolio' } },
        ],
      },
      {
        label: 'Securities',
        items: [
          { id: 'sec_securities',   emoji: '💰', label: 'Securities',   action: { tab: 'investing', investingView: 'securities', securitiesView: 'pnl'          } },
          { id: 'sec_news',         emoji: '📰', label: 'News',         action: { tab: 'investing', investingView: 'securities', securitiesView: 'news'         } },
        ],
      },
      {
        label: 'Other',
        items: [
          { id: 'inv_chat',  emoji: '💬', label: 'Chat',  action: { tab: 'investing', investingView: 'chat'  } },
        ],
      },
    ],
  }] : []),
  ...(can('shopper') ? [{
    id: 'shopper', emoji: '📋', label: 'List', nav: true,
    action: { tab: 'shopper' },
  }] : []),
  {
    id: 'tasks', emoji: '✅', label: 'Tasks', nav: true,
    action: { tab: 'tasks' },
  },
  {
    id: 'agenda', emoji: '📅', label: 'Agenda', nav: true,
    action: { tab: 'agenda' },
  },
  ...(can('travel') ? [{
    id: 'travel', emoji: '✈️', label: 'Travel', nav: true,
    action: { tab: 'travel' },
  }] : []),
  {
    id: 'mail', emoji: '✉️', label: 'Mail', nav: true,
    action: { tab: 'mail' },
  },
  {
    id: 'settings', emoji: '⚙️', label: 'Settings', nav: true,
    action: { tab: 'settings' },
  },
];
