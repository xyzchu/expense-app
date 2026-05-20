
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Pencil, Trash2, X, Send, LogOut, Plus, Users, Check, Copy,
  Upload, Download, UserPlus, Home as HomeIcon, BarChart3,
  Settings as SettingsIcon, ChevronDown, ChevronUp, ArrowRight,
  RefreshCw, Eye, EyeOff, TrendingUp
} from 'lucide-react';
import sb from './supabaseClient';
const FinancesTab = React.lazy(() => import('./FinancesTab'));
const TransactionsTab = React.lazy(() => import('./TransactionsTab'));
const SecuritiesStatisticsTab = React.lazy(() => import('./SecuritiesStatisticsTab'));
const ShopperTab = React.lazy(() => import('./ShopperTab'));
const TravelTabLazy = React.lazy(() => import('./TravelTab'));
const MailTabLazy = React.lazy(() => import('./MailTab'));
const TasksTabLazy = React.lazy(() => import('./TasksTab'));
const GoogleAgendaTabLazy = React.lazy(() => import('./GoogleAgendaTab'));
const StatsTabLazy = React.lazy(() => import('./StatsTab'));
const SettingsTabLazy = React.lazy(() => import('./SettingsTab'));
const InvestingTabLazy = React.lazy(() => import('./InvestingTab'));
const InvestingPickerLazy = React.lazy(() => import('./InvestingPicker'));
const NavLayoutEditorLazy = React.lazy(() => import('./NavLayoutEditor'));
import { buildNavPool, buildDefaultLayout } from './navConfig';
import { usePushNotifications } from './usePushNotifications';
import { useIsWide } from './hooks';
import { SegmentedTabs } from './ui';

/* ══════════════════════════════════════════════════════════════
   RESPONSIVE
   ══════════════════════════════════════════════════════════════ */

const SIDEBAR_W = 200;

/* ══════════════════════════════════════════════════════════════
   THEME
   ══════════════════════════════════════════════════════════════ */

import { MONO, FS, FW, CLAY } from './theme';
import { NO_DEC, CURR_FLAG, ALL_CUR, BASE_CATS, PERSON_COLORS, CUST_COLORS, fmt, getCat, s, SHELL_HEADING_STYLE } from './appConstants';

const THEME_CSS = `
  .se * { box-sizing: border-box; }
  .se, .se input, .se select, .se button, .se textarea, .se code {
    font-family: ${MONO};
  }
  .se, .se * {
    font-weight: 400 !important;
  }
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }
  .se-noscroll::-webkit-scrollbar { display: none; }
  .se-noscroll { -ms-overflow-style: none; scrollbar-width: none; }
`;

/* ══════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════ */

const FALLBACK_RATES_USD = {
  USD:1, AUD:1.58, EUR:0.92, GBP:0.79, JPY:149.5, CNY:7.24, HKD:7.82,
  THB:34.2, NZD:1.70, SGD:1.34, KRW:1380, INR:84.5, VND:25400, IDR:15800
};

const CURR_SYM = {'¥':'CNY','€':'EUR','£':'GBP','₩':'KRW','₹':'INR','฿':'THB'};
const CURR_WORDS = [
  [/\b(yuan|rmb|renminbi)\b/i,'CNY'],[/\byen\b/i,'JPY'],[/\bwon\b/i,'KRW'],
  [/\bbaht\b/i,'THB'],[/\brupees?\b/i,'INR'],[/\beuros?\b/i,'EUR'],
  [/\bpounds?\b(?!\s+of\b)/i,'GBP'],[/\bdollars?\b/i,'USD']
];

const CAT_KW = {
  Income:/\b(salary|wage|income|paycheck|payroll|dividend|interest|bonus|commission|freelance|refund|reimburs|rent|rental|revenue)\b/i,
  Restaurant:/\b(restaurant|dinner|lunch|breakfast|brunch|cafe|coffee|tea|eat|food|drink|bar|pub|pizza|burger|sushi|ramen|noodle|bbq|grill|takeaway|takeout|delivery|uber\s?eats|doordash|meal|snack|bubble\s?tea|boba|dessert|cake|ice\s?cream|mcdonald|kfc|subway)\b/i,
  Groceries:/\b(grocer|supermarket|woolworth|coles|aldi|costco|iga|market|fruit|vegetable|meat|chicken|pork|beef|fish|milk|bread|egg|rice|pasta|butter|cheese|grocery|shop)\b/i,
  Transport:/\b(uber|lyft|taxi|cab|bus|train|tram|metro|subway|fuel|gas|petrol|parking|toll|rego|car|vehicle|insurance|bike|scooter|opal|myki|transport)\b/i,
  Utilities:/\b(electric|power|water|internet|wifi|phone|mobile|bill|utility|subscription|spotify|netflix|disney|hulu|youtube|rent|lease)\b/i,
  Travel:/\b(flight|hotel|hostel|airbnb|booking|travel|airport|luggage|visa|passport|tour|trip|holiday|vacation|accommodation|resort|cruise)\b/i,
  Home:/\b(furniture|ikea|bed|sofa|couch|chair|table|desk|lamp|curtain|rug|kitchen|bathroom|cleaning|laundry|repair|maintenance|garden|tool|hardware|bunnings)\b/i,
};
const STOP = new Set('the and for from with this that have been were they them their what when where which who will would could should about into over after before between under through during each just also than very some only other most paid owes owed split share'.split(' '));
const toTitleCase = s => s ? s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) : s;
const personTagStyle = (name, names) => {
  const idx = names.indexOf(name);
  const c = idx >= 0 ? PERSON_COLORS[idx % PERSON_COLORS.length] : null;
  return c ? { background: c + '25', color: c } : { background: '#f3f4f6', color: '#6b7280' };
};
const PAYMENT_PREFIXES = [
  /^sq\s*\*+\s*/i,
  /^sq\s+/i,
  /^tst\*+\s*/i,
  /^paypal\s*\*+\s*/i,
  /^pp\*+\s*/i,
  /^uber\s*\*+\s*/i,
  /^google\s*\*+\s*/i,
  /^apple\.com\/bill\s*/i,
];
const KNOWN_MERCHANT_PATTERNS = [
  { pattern: /\bbunnings(?:\s+warehouse)?\b/i, canonical: 'bunnings' },
  { pattern: /\bwoolworths(?:\s+metro)?\b/i, canonical: 'woolworths' },
  { pattern: /\bcoles\b/i, canonical: 'coles' },
  { pattern: /\baldi\b/i, canonical: 'aldi' },
  { pattern: /\bcostco\b/i, canonical: 'costco' },
  { pattern: /\bkmart\b/i, canonical: 'kmart' },
  { pattern: /\btarget\b/i, canonical: 'target' },
  { pattern: /\bofficeworks\b/i, canonical: 'officeworks' },
  { pattern: /\bikea\b/i, canonical: 'ikea' },
  { pattern: /\bbp\b/i, canonical: 'bp' },
  { pattern: /\bshell\b/i, canonical: 'shell' },
  { pattern: /\b7\s*eleven\b/i, canonical: '7 eleven' },
];

/* ══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ══════════════════════════════════════════════════════════════ */


const today = () => new Date().toISOString().slice(0,10);
const makeRecurringId = () => `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const clampRecurringInterval = (value) => Math.max(1, Math.min(999, parseInt(value, 10) || 1));
const formatLocalIsoDate = (date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);
const endOfMonthFor = (dateStr = today()) => {
  const [year, month] = String(dateStr || today()).split('-').map(Number);
  const now = new Date();
  return formatLocalIsoDate(new Date(year || now.getFullYear(), month || (now.getMonth() + 1), 0));
};
const addRecurringInterval = (dateStr, count = 1, unit = 'months') => {
  const [year, month, day] = String(dateStr || today()).split('-').map(Number);
  const date = new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
  if (unit === 'days') date.setDate(date.getDate() + count);
  else if (unit === 'weeks') date.setDate(date.getDate() + (count * 7));
  else date.setMonth(date.getMonth() + count);
  return formatLocalIsoDate(date);
};
const addRecurringDueDate = (dateStr, count = 1, unit = 'months', dateMode = 'date') => {
  if (dateMode === 'month-end') {
    const base = endOfMonthFor(dateStr);
    return endOfMonthFor(addRecurringInterval(base, count, 'months'));
  }
  return addRecurringInterval(dateStr, count, unit);
};
const endOfCurrentMonth = () => {
  const now = new Date();
  return formatLocalIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
};
const extractRecurringExpenseScheduleHint = (raw) => {
  const source = String(raw || '');
  const eomPattern = /\b(?:eom|month\s*end|end\s+of\s+(?:each\s+|every\s+|the\s+)?month|last\s+day\s+of\s+(?:each\s+|every\s+|the\s+)?month)\b/i;
  if (!eomPattern.test(source)) return { text: source, schedule: null };
  return {
    text: source.replace(eomPattern, ' ').replace(/\s+/g, ' ').trim(),
    schedule: { intervalCount: 1, intervalUnit: 'months', nextDueDate: endOfCurrentMonth(), dateMode: 'month-end' },
  };
};
const advanceRecurringDueDate = (dateStr, count = 1, unit = 'months', dateMode = 'date') => {
  let next = addRecurringDueDate(dateStr || today(), clampRecurringInterval(count), unit, dateMode);
  const now = today();
  let guard = 0;
  while (next <= now && guard < 120) {
    next = addRecurringDueDate(next, clampRecurringInterval(count), unit, dateMode);
    guard += 1;
  }
  return next;
};
const normalizeRecurringTemplate = (template) => {
  const rawText = typeof template === 'string' ? template : template?.text;
  const text = String(rawText || '').trim();
  if (!text) return null;
  const intervalUnit = ['days', 'weeks', 'months'].includes(template?.intervalUnit) ? template.intervalUnit : 'months';
  return {
    id: template?.id || makeRecurringId(),
    text,
    category: template?.category || null,
    intervalCount: clampRecurringInterval(template?.intervalCount || 1),
    intervalUnit,
    nextDueDate: template?.nextDueDate || today(),
    dateMode: template?.dateMode === 'month-end' ? 'month-end' : 'date',
    lastActionDate: template?.lastActionDate || null,
  };
};

const DEFAULT_NOTIFICATION_PREFS = {
  expense: true,
  settlement: true,
  news: true,
  pnl: true,
  ai: true,
};

const readSavedNavLayout = () => {
  try {
    const raw = localStorage.getItem('se_nav_layout');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const cacheNavLayout = (layout) => {
  try {
    localStorage.setItem('se_nav_layout', JSON.stringify(layout));
  } catch {
    // Local cache is best-effort; Supabase is the source of truth when signed in.
  }
};

const EXPENSE_LIST_CACHE_KEY = 'splitease_list';
const EXPENSE_LIST_META_CACHE_KEY = 'splitease_list_meta';

const readCachedExpenseList = () => {
  try {
    const raw = localStorage.getItem(EXPENSE_LIST_META_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
};

const cacheExpenseList = (list) => {
  if (!list?.id) return;
  try {
    localStorage.setItem(EXPENSE_LIST_CACHE_KEY, list.id);
    localStorage.setItem(EXPENSE_LIST_META_CACHE_KEY, JSON.stringify({
      id: list.id,
      name: list.name,
      default_currency: list.default_currency,
      invite_code: list.invite_code,
      myDisplayName: list.myDisplayName,
    }));
  } catch {
    // Best effort only. Supabase still verifies access on startup.
  }
};

const clearCachedExpenseList = () => {
  try {
    localStorage.removeItem(EXPENSE_LIST_CACHE_KEY);
    localStorage.removeItem(EXPENSE_LIST_META_CACHE_KEY);
  } catch {}
};

const withTimeout = (promise, ms, label = 'Request') => (
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ])
);

const uniqueExistingIds = (ids, validIds) => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  return ids.filter(id => {
    if (!validIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const normalizeNavLayout = (layout, defaultLayout, navPool) => {
  const validIds = new Set(navPool.map(item => item.id));
  const poolMap = new Map(navPool.map(item => [item.id, item]));
  const safeLayout = layout && typeof layout === 'object' && !Array.isArray(layout) ? layout : {};
  const nav = uniqueExistingIds(safeLayout.nav, validIds);
  const safeNav = nav.length > 0 ? nav : uniqueExistingIds(defaultLayout.nav, validIds);
  const navIds = new Set(safeNav);
  const missingMenuIds = navPool
    .filter(item => !item.isInvestingTrigger && !navIds.has(item.id))
    .map(item => item.id);
  const rawGroups = Array.isArray(safeLayout.investingGroups)
    ? safeLayout.investingGroups
    : defaultLayout.investingGroups;
  const groupBuckets = new Map();
  for (const group of rawGroups) {
    if (!group || typeof group.label !== 'string') continue;
    groupBuckets.set(group.label, uniqueExistingIds(group.items, validIds).filter(id => !navIds.has(id)));
  }
  for (const id of missingMenuIds) {
    const item = poolMap.get(id);
    const label = item?.defaultMoreGroup || item?.defaultInvestingGroup || 'Main';
    const items = groupBuckets.get(label) || [];
    if (!items.includes(id)) groupBuckets.set(label, [...items, id]);
  }
  const investingGroups = Array.from(groupBuckets.entries())
    .map(([label, items]) => ({ label, items }))
    .filter(group => group && typeof group.label === 'string')
    .filter(group => group.items.length > 0);

  return { nav: safeNav, investingGroups };
};

const sigWords = (text) =>
  text.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));

const stripPaymentPrefixes = (text) => {
  let cleaned = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of PAYMENT_PREFIXES) {
      if (re.test(cleaned)) {
        cleaned = cleaned.replace(re, '').trim();
        changed = true;
      }
    }
  }
  return cleaned;
};

const normalizeMerchantText = (text) => {
  let cleaned = stripPaymentPrefixes(String(text || ''));
  cleaned = cleaned
    .replace(/[0-9]{3,}/g, ' ')
    .replace(/[#*]/g, ' ')
    .replace(/\b(?:pty|ltd|australia|au)\b/gi, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  for (const { pattern, canonical } of KNOWN_MERCHANT_PATTERNS) {
    if (pattern.test(cleaned)) return canonical;
  }
  return cleaned;
};

const deriveOverrideKeys = (text) => {
  const normalized = normalizeMerchantText(text);
  const keys = [];
  if (normalized) keys.push(normalized);
  for (const word of sigWords(normalized)) {
    if (!keys.includes(word)) keys.push(word);
  }
  return keys;
};

const prettifyMerchantText = (text) => {
  const normalized = normalizeMerchantText(text);
  if (!normalized) return '';
  return normalized.replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseNamedExactShares = (text, names, total) => {
  const absTotal = Math.abs(Number(total || 0));
  if (!absTotal || !names.length) return null;

  const sign = Number(total) < 0 ? -1 : 1;
  const explicit = {};
  for (const name of names) {
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(name)}\\s+\\$?\\s*(\\d+(?:\\.\\d+)?)\\b`, 'i');
    const match = String(text || '').match(re);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 0) explicit[name] = value;
  }

  const specifiedTotal = Object.values(explicit).reduce((sum, value) => sum + value, 0);
  if (!Object.keys(explicit).length || specifiedTotal > absTotal + 0.005) return null;

  const shares = {};
  for (const [name, value] of Object.entries(explicit)) shares[name] = value * sign;

  const others = names.filter((name) => !Object.prototype.hasOwnProperty.call(explicit, name));
  const remainder = Math.max(0, absTotal - specifiedTotal) * sign;
  if (others.length) {
    others.forEach((name) => { shares[name] = remainder / others.length; });
  } else if (Object.keys(explicit).length === 1) {
    shares[Object.keys(explicit)[0]] = total;
  }

  return shares;
};

const cvt = (amount, from, to, rates) => {
  if (from === to || !from || !to) return amount;
  const fr = rates[from] || 1, tr = rates[to] || 1;
  return (amount / fr) * tr;
};

const simplifyDebts = (nets) => {
  const txns = [], cr = [], dr = [];
  Object.entries(nets).forEach(([p,b]) => {
    if (b > 0.005) cr.push({p,a:b});
    else if (b < -0.005) dr.push({p,a:-b});
  });
  cr.sort((a,b) => b.a - a.a);
  dr.sort((a,b) => b.a - a.a);
  let i=0, j=0;
  while (i < cr.length && j < dr.length) {
    const a = Math.min(cr[i].a, dr[j].a);
    if (a > 0.005) txns.push({from:dr[j].p, to:cr[i].p, amount:Math.round(a*100)/100});
    cr[i].a -= a; dr[j].a -= a;
    if (cr[i].a < 0.005) i++;
    if (dr[j].a < 0.005) j++;
  }
  return txns;
};

const detectCategory = (text, overrides, customCats) => {
  const normalized = normalizeMerchantText(text);
  if (overrides[normalized]) return overrides[normalized];
  const sw = sigWords(normalized);
  for (const w of sw) { if (overrides[w]) return overrides[w]; }
  for (const [cat, re] of Object.entries(CAT_KW)) { if (re.test(normalized)) return cat; }
  return 'Other';
};

const categoryNamesForHints = (members, customCats) => (
  Array.from(new Set([
    ...Object.keys(BASE_CATS),
    ...Object.keys(customCats || {}),
    ...(members || []).map(m => m.display_name).filter(Boolean),
  ]))
);

const categoryNameFromHint = (hint, categories) => {
  const clean = normalizeMerchantText(String(hint || '').replace(/^#/, ''));
  if (!clean) return null;
  return categories.find(c => normalizeMerchantText(c) === clean) || null;
};

const extractCategoryHint = (text, categories) => {
  let next = text;
  let category = null;

  const hashMatch = next.match(/(^|\s)#([A-Za-z][\w-]*)/);
  if (hashMatch) {
    category = categoryNameFromHint(hashMatch[2], categories);
    if (category) next = next.replace(hashMatch[0], ' ');
  }

  if (!category) {
    const sorted = [...categories].sort((a, b) => b.length - a.length);
    const catPattern = sorted.map(escapeRegExp).join('|');
    if (catPattern) {
      const phraseRe = new RegExp(`\\b(?:category|cat)\\s*[:=]?\\s*(${catPattern})\\b`, 'i');
      const phraseMatch = next.match(phraseRe);
      if (phraseMatch) {
        category = categoryNameFromHint(phraseMatch[1], categories);
        next = next.replace(phraseMatch[0], ' ');
      }
    }
  }

  if (!category) {
    const sorted = [...categories].sort((a, b) => b.length - a.length);
    const catPattern = sorted.map(escapeRegExp).join('|');
    if (catPattern) {
      const asRe = new RegExp(`\\bas\\s+(${catPattern})\\b`, 'i');
      const asMatch = next.match(asRe);
      if (asMatch) {
        category = categoryNameFromHint(asMatch[1], categories);
        next = next.replace(asMatch[0], ' ');
      }
    }
  }

  return { text: next, category };
};



/* ══════════════════════════════════════════════════════════════
   NLP PARSER
   ══════════════════════════════════════════════════════════════ */

function parseExpense(raw, members, myName, rates, defCur, overrides, customCats) {
  if (!raw.trim()) return null;
  const recurringHintResult = extractRecurringExpenseScheduleHint(raw);
  const cleanedRaw = recurringHintResult.text || raw;
  const isRefund = /\b(refund|refunded|return|returned|reimburs(?:e|ed|ement)|cashback|cash\s+back|rebate)\b/i.test(cleanedRaw);
  const categoryHintResult = extractCategoryHint(cleanedRaw, categoryNamesForHints(members, customCats));
  const rawWithoutCategoryHint = categoryHintResult.text;
  const categoryHint = categoryHintResult.category;
  let t = rawWithoutCategoryHint, cur = null, amt = null;

  const sm = t.match(/([¥€£₩₹฿])\s*(\d+(?:\.\d+)?)/);
  if (sm) {
    cur = CURR_SYM[sm[1]];
    if (sm[1]==='¥' && /\b(jpy|japan|yen)\b/i.test(t)) cur='JPY';
    amt = parseFloat(sm[2]); t = t.replace(sm[0],' ');
  }

  if (amt==null) { const m = t.match(/\$\s*(\d+(?:\.\d+)?)/); if(m){amt=parseFloat(m[1]);t=t.replace(m[0],' ');} }

  if (amt==null) {
    const cc = ALL_CUR.join('|');
    const m1 = t.match(new RegExp(`\\b(${cc})\\s*(\\d+(?:\\.\\d+)?)\\b`,'i'));
    if (m1) { cur=m1[1].toUpperCase(); amt=parseFloat(m1[2]); t=t.replace(m1[0],' '); }
    else { const m2=t.match(new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(${cc})\\b`,'i')); if(m2){amt=parseFloat(m2[1]);cur=m2[2].toUpperCase();t=t.replace(m2[0],' ');} }
  }

  if (!cur) { for (const [re,code] of CURR_WORDS) { if (re.test(t)){cur=code; t=t.replace(re,' '); break;} } }

  if (!cur) {
    const cc = ALL_CUR.join('|');
    const m = t.match(new RegExp(`\\b(${cc})\\b`, 'i'));
    if (m) { cur = m[1].toUpperCase(); t = t.replace(m[0], ' '); }
  }

  if (amt==null) { const m=t.match(/\b(\d+(?:\.\d+)?)\b/); if(m){amt=parseFloat(m[1]);t=t.replace(m[0],' ');} }
  if (amt==null) return null;

  const origCur = cur || defCur, origAmt = isRefund ? -Math.abs(amt) : amt;
  const total = (cur && cur !== defCur ? cvt(Math.abs(amt), cur, defCur, rates) : Math.abs(amt)) * (isRefund ? -1 : 1);
  if (!cur) cur = defCur;

  let paidBy = myName;
  const names = members.map(m => m.display_name);
  for (const n of names) {
    if (new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b`,'i').test(raw)) { paidBy = n; break; }
  }

  let st = rawWithoutCategoryHint;
  for (const n of names) st = st.replace(new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b`,'ig'),' ');

  let splitType = 'equal', shares = {}, headcount = null;
  const personalRe = /\b(for\s+myself|for\s+me|mine\s+only|personal|just\s+me|no\s+split|my\s+own|only\s+me|myself)\b/i;
  const personalShort = /(?:^|\s)(me|own)(?:\s|$)/i;
  const ratioMatch = st.match(/\b(\d+(?:\/\d+)+)\b/);
  const pctMatch = st.match(/\b(\d+)\s*%\s*(\w+)/i);
  const headcountMatch = st.match(/\bfor\s+(\d+)\s+(?:people|persons?|ppl|guests?|friends?|heads?)\b|\b(\d+)\s+(?:people|persons?|ppl|guests?)\b|\bsplit\s+(\d+)\s*ways?\b/i);
  const namedExactShares = parseNamedExactShares(st, names, total);

  let fullPerson = null;
  for (const n of names) {
    if (new RegExp(`\\bfor\\s+${n}\\b|\\b${n}\\s+owes?\\b|\\bowed\\s+by\\s+${n}\\b|\\b100\\s*%\\s*${n}\\b|\\ball\\s+${n}\\b`,'i').test(st)) {
      fullPerson = n; break;
    }
  }

  if (personalRe.test(st) || personalShort.test(st)) {
    splitType = 'personal'; shares = {[paidBy]: total};
  } else if (fullPerson) {
    splitType = 'full'; shares = {[fullPerson]: total};
  } else if (namedExactShares) {
    splitType = 'custom'; shares = namedExactShares;
  } else if (headcountMatch) {
    headcount = parseInt(headcountMatch[1] || headcountMatch[2] || headcountMatch[3]);
    if (headcount >= 2 && headcount > names.length) {
      splitType = 'headcount';
      const perPerson = total / headcount;
      names.forEach(n => { shares[n] = perPerson; });
    } else {
      splitType = 'equal';
      names.forEach(n => { shares[n] = total / names.length; });
      headcount = null;
    }
  } else if (ratioMatch) {
    splitType = 'custom';
    const parts = ratioMatch[1].split('/').map(Number);
    const sum = parts.reduce((a,b)=>a+b,0);
    if (parts.length === names.length && sum > 0) {
      names.forEach((n,i) => { shares[n] = total * (parts[i]/sum); });
    } else {
      const use = names.slice(0, parts.length);
      use.forEach((n,i) => { shares[n] = total * (parts[i]/sum); });
    }
  } else if (pctMatch) {
    splitType = 'custom';
    const pct = parseInt(pctMatch[1]);
    const who = names.find(n => n.toLowerCase() === pctMatch[2].toLowerCase()) || pctMatch[2];
    shares[who] = total * pct / 100;
    const rest = total - shares[who];
    const others = names.filter(n => n !== who);
    others.forEach(n => { shares[n] = rest / Math.max(others.length, 1); });
  } else {
    splitType = 'equal';
    names.forEach(n => { shares[n] = total / names.length; });
  }

  let item = rawWithoutCategoryHint;
  item = item.replace(/[¥€£₩₹฿$]\s*\d+(\.\d+)?/g,' ');
  item = item.replace(/\b\d+(\.\d+)?\s*(AUD|USD|EUR|GBP|JPY|CNY|HKD|THB|NZD|SGD|KRW|INR|VND|IDR)\b/gi,' ');
  item = item.replace(/\b(AUD|USD|EUR|GBP|JPY|CNY|HKD|THB|NZD|SGD|KRW|INR|VND|IDR)\s*\d+(\.\d+)?\b/gi,' ');
  for (const n of names) item = item.replace(new RegExp(`\\b${escapeRegExp(n)}\\s+\\$?\\s*\\d+(?:\\.\\d+)?\\b`,'gi'),' ');
  item = item.replace(/\b\d+(\.\d+)?\b/g,' ');
  for (const n of names) item = item.replace(new RegExp(`\\b${n}\\s+paid\\b|\\bpaid\\s+by\\s+${n}\\b|\\bfor\\s+${n}\\b|\\b${n}\\s+owes?\\b|\\bowed\\s+by\\s+${n}\\b|\\b100\\s*%\\s*${n}\\b|\\ball\\s+${n}\\b`,'gi'),' ');
  item = item.replace(/\b(for\s+myself|for\s+me|mine\s+only|personal|just\s+me|no\s+split|my\s+own|only\s+me|myself|yuan|rmb|renminbi|yen|won|baht|rupees?|euros?|pounds?|dollars?)\b/gi,' ');
  item = item.replace(/\b(me|own)\b/gi,' ');
  item = item.replace(/\b\d+\s*%\s*\w+/gi,' ');
  item = item.replace(/\b\d+(?:\/\d+)+\b/g,' ');
  item = item.replace(/\bfor\s+\d+\s+(?:people|persons?|ppl|guests?|friends?|heads?)\b/gi,' ');
  item = item.replace(/\b\d+\s+(?:people|persons?|ppl|guests?)\b/gi,' ');
  item = item.replace(/\bsplit\s+\d+\s*ways?\b/gi,' ');
  for (const [re] of CURR_WORDS) item = item.replace(re,' ');
  item = item.replace(/\s+/g,' ').trim();
  item = prettifyMerchantText(item) || item;
  if (!item) item = 'Expense';

  const category = categoryHint || detectCategory(item, overrides, customCats);

  return {
    item, category, date: today(),
    original_currency: origCur !== defCur ? origCur : null,
    original_amount: origCur !== defCur ? origAmt : null,
    total_amount: Math.round(total * 100) / 100,
    paid_by: paidBy, split_type: splitType,
    shares: Object.fromEntries(Object.entries(shares).map(([k,v])=>[k,Math.round(v*100)/100])),
    headcount: headcount ?? null,
  };
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function SplitEase() {
  const isWide = useIsWide();

  // ── Auth State ──
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [setPasswordMode, setSetPasswordMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordBusy, setNewPasswordBusy] = useState(false);

  // ── List State ──
  const [lists, setLists] = useState([]);
  const [currentList, setCurrentList] = useState(() => readCachedExpenseList());
  const [listsLoading, setListsLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [myName, setMyName] = useState(currentList?.myDisplayName || '');
  const [listScreen, setListScreen] = useState('select');
  const [newListName, setNewListName] = useState('');
  const [newListCur, setNewListCur] = useState('AUD');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);

  // ── App State ──
  const [tab, setTab] = useState('home');
  const [homeView, setHomeView] = useState('expenses');
  const [showInvestingPicker, setShowInvestingPicker] = useState(false);
  const [investingView, setInvestingView] = useState('portfolio');
  const [investingPortfolioView, setInvestingPortfolioView] = useState('summary');
  const [investingSecuritiesView, setInvestingSecuritiesView] = useState('pnl');
  const [investingToolsView, setInvestingToolsView] = useState('portfolio');
  const [expenses, setExpenses] = useState([]);
  const [expenseDetailsLoaded, setExpenseDetailsLoaded] = useState(false);
  const [expenseDetailsLoading, setExpenseDetailsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [inputText, setInputText] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [taskInputFocusRequest, setTaskInputFocusRequest] = useState(0);
  const [previewCatOverride, setPreviewCatOverride] = useState(null);
  const [recurringTemplates, setRecurringTemplates] = useState([]); // array of recurring expense rules
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [expenseTool, setExpenseTool] = useState(null);
  const [newRecurringText, setNewRecurringText] = useState('');
  const [newRecurringIntervalCount, setNewRecurringIntervalCount] = useState(1);
  const [newRecurringIntervalUnit, setNewRecurringIntervalUnit] = useState('months');
  const [newRecurringNextDueDate, setNewRecurringNextDueDate] = useState(today());
  const [newRecurringDateMode, setNewRecurringDateMode] = useState('date');
  const [newRecurringCategory, setNewRecurringCategory] = useState('');

  // ── Settings State ──
  const [catOverrides, setCatOverrides] = useState({});
  const [catSuggestions, setCatSuggestions] = useState({});
  const [customCats, setCustomCats] = useState({});
  const [defCur, setDefCur] = useState(currentList?.default_currency || 'AUD');
  const [newCatName, setNewCatName] = useState('');

  // ── Stats State ──
  const [selMonth, setSelMonth] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [expandedStatCats, setExpandedStatCats] = useState(new Set());

  // ── Settings Tab State ──
  const [editName, setEditName] = useState('');
  const [nameEditing, setNameEditing] = useState(false);
  const [webhookToken, setWebhookToken] = useState(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [overrideDrafts, setOverrideDrafts] = useState({});

  // ── Pending Expenses (from webhook) ──
  const [pendingExpenses, setPendingExpenses] = useState([]);
  const [pendingDrafts, setPendingDrafts] = useState({});
  const [recurringDrafts, setRecurringDrafts] = useState({});
  const [otherCategoryDismissedIds, setOtherCategoryDismissedIds] = useState([]);

  // ── Settle State ──
  const [showSettle, setShowSettle] = useState(false);
  const [settleFrom, setSettleFrom] = useState('');
  const [settleTo, setSettleTo] = useState('');
  const [settleAmt, setSettleAmt] = useState('');

  // ── Manual Add Form ──
  const [showAddForm, setShowAddForm] = useState(false);
  const [addItem, setAddItem] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addCategory, setAddCategory] = useState('Other');
  const [addPaidBy, setAddPaidBy] = useState('');
  const [addDate, setAddDate] = useState(today());
  const [addSplitType, setAddSplitType] = useState('equal');
  const [addExactAmounts, setAddExactAmounts] = useState({});
  const [addProportions, setAddProportions] = useState({});
  const [addPercentages, setAddPercentages] = useState({});
  const [addHeadcount, setAddHeadcount] = useState('');
  const [addHeadcountMembers, setAddHeadcountMembers] = useState({});
  const [addOrigCur, setAddOrigCur] = useState('');
  const [addOrigAmt, setAddOrigAmt] = useState('');
  const [showForeign, setShowForeign] = useState(false);

  // ── Exchange Rates ──
  const [rates, setRates] = useState(FALLBACK_RATES_USD);
  const [ratesDate, setRatesDate] = useState('');

  // ── UI ──
  const [toast, setToast] = useState({msg:'', show:false});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [collapsedMonths, setCollapsedMonths] = useState(new Set());
  const inputRef = useRef(null);
  const lastDeepLinkRef = useRef('');
  const expenseDetailsAutoLoadRef = useRef(null);

  // ── Nav Layout ──
  const [navLayout, setNavLayout] = useState(readSavedNavLayout);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const navLongPressRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToast({msg, show:true});
    setTimeout(() => setToast(t=>({...t, show:false})), 3500);
  }, []);

  const { supported: pushSupported, permission: pushPermission, subscribed: pushSubscribed,
          loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe,
          sendNotification: rawSendNotification } = usePushNotifications(user, currentList, showToast);
  const [notificationPrefs, setNotificationPrefs] = useState(DEFAULT_NOTIFICATION_PREFS);
  const [permissions, setPermissions] = useState(new Set());
  const can = (f) => permissions.has(f);

  const navPool = useMemo(() => buildNavPool(can), [permissions]);

  const saveNavLayout = useCallback(async (layout) => {
    setNavLayout(layout);
    cacheNavLayout(layout);
    if (!user) return;
    const { error } = await sb
      .from('user_settings')
      .upsert({ user_id: user.id, key: 'se_nav_layout', value: layout }, { onConflict: 'user_id,key' });
    if (error) showToast('Could not sync layout');
  }, [user, showToast]);

  useEffect(() => {
    if (!user) {
      setNotificationPrefs(DEFAULT_NOTIFICATION_PREFS);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await sb
        .from('user_settings')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'notification_preferences')
        .maybeSingle();
      if (cancelled) return;
      try {
        const parsed = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value;
        setNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...(parsed || {}) });
      } catch {
        setNotificationPrefs(DEFAULT_NOTIFICATION_PREFS);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const updateNotificationPrefs = useCallback(async (nextPrefs) => {
    const merged = { ...DEFAULT_NOTIFICATION_PREFS, ...nextPrefs };
    setNotificationPrefs(merged);
    if (!user) return;
    await sb
      .from('user_settings')
      .upsert({ user_id: user.id, key: 'notification_preferences', value: JSON.stringify(merged) }, { onConflict: 'user_id,key' });
  }, [user]);

  const sendNotification = useCallback((title, body, tag = 'expense', targetUserId = null) => {
    if (tag !== 'test' && notificationPrefs[tag] === false) return;
    return rawSendNotification(title, body, tag, targetUserId);
  }, [rawSendNotification, notificationPrefs]);

  const effectiveNavConfig = useMemo(() => {
    const defaultLayout = buildDefaultLayout(can);
    const layout = normalizeNavLayout(navLayout, defaultLayout, navPool);
    const poolMap = new Map(navPool.map(item => [item.id, item]));

    const investingBase = navPool.find(item => item.id === 'investing');
    const investingGroups = (layout.investingGroups || []).map(g => ({
      label: g.label,
      items: g.items.filter(id => poolMap.has(id)).map(id => poolMap.get(id)),
    })).filter(g => g.items.length > 0);

    return (layout.nav || defaultLayout.nav)
      .filter(id => poolMap.has(id))
      .map(id => {
        const item = poolMap.get(id);
        if (id === 'investing' && investingBase) {
          return { ...investingBase, nav: true, groups: investingGroups };
        }
        return { ...item, nav: true };
      });
  }, [navPool, navLayout, permissions]);

  const navigate = useCallback((action) => {
    if (!action) return;
    const nextTab = action.tab === 'stats' ? 'home' : action.tab;
    setTab(nextTab);
    if (nextTab === 'home') setHomeView(action.homeView || (action.tab === 'stats' ? 'stats' : 'expenses'));
    if (action.investingView)  setInvestingView(action.investingView);
    if (action.portfolioView)  setInvestingPortfolioView(action.portfolioView);
    if (action.securitiesView) setInvestingSecuritiesView(action.securitiesView);
    setEditingId(null);
    setShowInvestingPicker(false);
  }, []);

  const applyDeepLink = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const targetPage = (params.get('page') || params.get('tab') || '').toLowerCase();
    if (!targetPage) return;
    if (['pnl', 'p&l', 'news', 'sec_news'].includes(targetPage) && !can('investing')) return;
    if (targetPage === 'tasks' && params.get('focusTaskInput') === '1') {
      setTaskInputFocusRequest(Date.now());
    }

    const targets = {
      expense: { tab: 'home', homeView: 'expenses' },
      expenses: { tab: 'home', homeView: 'expenses' },
      tasks: { tab: 'tasks' },
      agenda: { tab: 'agenda' },
      calendar: { tab: 'agenda' },
      travel: { tab: 'travel' },
      pnl: { tab: 'investing', investingView: 'securities', securitiesView: 'pnl' },
      'p&l': { tab: 'investing', investingView: 'securities', securitiesView: 'pnl' },
      news: { tab: 'investing', investingView: 'securities', securitiesView: 'news' },
      sec_news: { tab: 'investing', investingView: 'securities', securitiesView: 'news' },
    };
    const action = targets[targetPage];
    if (!action) return;

    const deepLinkKey = `${window.location.pathname}${window.location.search}`;
    if (lastDeepLinkRef.current === deepLinkKey) return;

    navigate(action);
    lastDeepLinkRef.current = deepLinkKey;
  }, [navigate, permissions]);

  useEffect(() => {
    applyDeepLink();
    window.addEventListener('focus', applyDeepLink);
    window.addEventListener('pageshow', applyDeepLink);
    window.addEventListener('popstate', applyDeepLink);
    return () => {
      window.removeEventListener('focus', applyDeepLink);
      window.removeEventListener('pageshow', applyDeepLink);
      window.removeEventListener('popstate', applyDeepLink);
    };
  }, [applyDeepLink]);

  /* ── Auth Effects ── */
  useEffect(() => {
    if (window.location.hash.includes('type=invite') || window.location.hash.includes('type=recovery')) setSetPasswordMode(true);
    let cancelled = false;
    sb.auth.getSession()
      .then(({data:{session}}) => {
        if (cancelled) return;
        setUser(session?.user || null);
        setAuthLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setAuthLoading(false);
      });
    const {data:{subscription}} = sb.auth.onAuthStateChange((_,session) => {
      if (cancelled) return;
      setUser(session?.user || null);
      setAuthLoading(false);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!can('investing') && tab === 'investing') setTab('home');
    if (!can('shopper')   && tab === 'shopper')   setTab('home');
  }, [permissions, tab]);

  /* ── Fetch Permissions ── */
  useEffect(() => {
    if (!user) { setPermissions(new Set()); return; }
    sb.from('user_permissions').select('feature').eq('email', user.email)
      .then(({ data }) => setPermissions(new Set((data || []).map(r => r.feature))));
  }, [user]);

  /* ── Fetch Per-User Nav Layout ── */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const localLayout = readSavedNavLayout();
      const { data, error } = await sb
        .from('user_settings')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'se_nav_layout')
        .maybeSingle();

      if (cancelled) return;
      const remoteLayout = data?.value && typeof data.value === 'object' && !Array.isArray(data.value)
        ? data.value
        : null;

      if (remoteLayout) {
        setNavLayout(remoteLayout);
        cacheNavLayout(remoteLayout);
        return;
      }

      if (!error && localLayout) {
        await sb
          .from('user_settings')
          .upsert({ user_id: user.id, key: 'se_nav_layout', value: localLayout }, { onConflict: 'user_id,key' });
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  /* ── Fetch Lists ── */
  useEffect(() => {
    if (!user) {
      setListsLoading(false);
      return;
    }
    let cancelled = false;
    setListsLoading(true);
    (async () => {
      try {
        const {data} = await withTimeout(
          sb.from('list_members').select('list_id, display_name, expense_lists(id, name, default_currency, invite_code)').eq('user_id', user.id),
          8000,
          'Opening expense list'
        );
        if (cancelled) return;
        const ls = (data || []).map(d => ({...d.expense_lists, myDisplayName: d.display_name})).filter(l => l?.id);
        if (ls.length > 0) {
          setLists(ls);
          const saved = localStorage.getItem(EXPENSE_LIST_CACHE_KEY);
          const found = ls.find(l => l.id === saved);
          const shouldAutoSelect = found || (!saved && ls.length === 1 ? ls[0] : null);
          if (shouldAutoSelect) {
            selectList(shouldAutoSelect).catch(() => {
              if (!cancelled) showToast('Opened list, but some details are still loading');
            });
          } else {
            clearCachedExpenseList();
            setCurrentList(null);
          }
        } else {
          setLists([]);
          setCurrentList(null);
          clearCachedExpenseList();
        }
      } catch (error) {
        if (!cancelled) {
          const cachedList = readCachedExpenseList();
          setLists(cachedList ? [cachedList] : []);
          setCurrentList(cachedList);
          if (cachedList) {
            setDefCur(cachedList.default_currency || 'AUD');
            setMyName(cachedList.myDisplayName || '');
          }
          showToast(error?.message || 'Could not open expense list');
        }
      } finally {
        if (!cancelled) setListsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  /* ── Fetch Exchange Rates ── */
  const fetchRates = useCallback(async (base) => {
    try {
      const r = await fetch(`https://api.exchangerate-api.com/v4/latest/${base || 'USD'}`);
      if (r.ok) {
        const d = await r.json();
        setRates(d.rates);
        setRatesDate(d.date || today());
        localStorage.setItem('splitease_rates', JSON.stringify({rates: d.rates, date: d.date || today(), base}));
        return d.rates;
      }
    } catch {}
    try {
      const cached = JSON.parse(localStorage.getItem('splitease_rates'));
      if (cached && cached.rates) {
        if (cached.base === base) {
          setRates(cached.rates); setRatesDate(cached.date + ' (cached)'); return cached.rates;
        }
        const baseRate = cached.rates[base] || 1;
        const rebased = {};
        Object.entries(cached.rates).forEach(([k,v]) => { rebased[k] = v / baseRate; });
        setRates(rebased); setRatesDate(cached.date + ' (cached)'); return rebased;
      }
    } catch {}
    const fb = {};
    const baseRate = FALLBACK_RATES_USD[base] || 1;
    Object.entries(FALLBACK_RATES_USD).forEach(([k,v]) => { fb[k] = v / baseRate; });
    setRates(fb); setRatesDate('hardcoded'); return fb;
  }, []);

  useEffect(() => { fetchRates(defCur); }, [defCur]);

  /* ── Realtime: pending expenses ── */
  useEffect(() => {
    if (!currentList || !user) return;
    const channel = sb
      .channel(`pending-${currentList.id}-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pending_expenses', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new?.list_id !== currentList.id) return;
          setPendingExpenses(prev => [payload.new, ...prev.filter(p => p.id !== payload.new.id)]);
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pending_expenses', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setPendingExpenses(prev => prev.filter(p => p.id !== payload.old.id));
        })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [currentList, user]);

  const loadExpenseDetails = useCallback(async (listArg = currentList) => {
    if (!listArg) return [];
    setExpenseDetailsLoading(true);
    const { data: exps } = await sb
      .from('expenses')
      .select('*')
      .eq('list_id', listArg.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    setExpenses(exps || []);
    setExpenseDetailsLoaded(true);
    setExpenseDetailsLoading(false);
    return exps || [];
  }, [currentList]);

  useEffect(() => {
    if (!currentList || listsLoading || expenseDetailsLoaded || expenseDetailsLoading) return undefined;
    if (tab !== 'home' || homeView !== 'expenses') return undefined;

    const run = () => loadExpenseDetails(currentList);
    const schedule = () => {
      if ('requestIdleCallback' in window) {
        expenseDetailsAutoLoadRef.current = window.requestIdleCallback(run, { timeout: 6000 });
        return () => window.cancelIdleCallback(expenseDetailsAutoLoadRef.current);
      }
      expenseDetailsAutoLoadRef.current = window.setTimeout(run, 3000);
      return () => window.clearTimeout(expenseDetailsAutoLoadRef.current);
    };

    const cancel = schedule();
    return () => {
      cancel?.();
      expenseDetailsAutoLoadRef.current = null;
    };
  }, [currentList, listsLoading, tab, homeView, expenseDetailsLoaded, expenseDetailsLoading, loadExpenseDetails]);

  /* ── Select a List ── */
  const selectList = useCallback(async (list) => {
    setCurrentList(list);
    setDefCur(list.default_currency || 'AUD');
    setMyName(list.myDisplayName || '');
    setExpenses([]);
    setExpenseDetailsLoaded(false);
    setExpenseDetailsLoading(false);
    setHomeView('expenses');
    setSearch('');
    setExpenseTool(null);
    cacheExpenseList(list);
    fetchRates(list.default_currency || 'AUD');
    const [
      membersResult,
      settingsResult,
      webhookResult,
      pendingResult,
    ] = await Promise.allSettled([
      sb.from('list_members').select('*').eq('list_id', list.id),
      sb.from('list_settings').select('*').eq('list_id', list.id),
      user
        ? sb.from('webhook_tokens').select('secret').eq('list_id', list.id).eq('user_id', user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from('pending_expenses').select('*').eq('list_id', list.id).order('created_at',{ascending:false}),
    ]);
    const mems = membersResult.status === 'fulfilled' ? membersResult.value?.data : null;
    const sets = settingsResult.status === 'fulfilled' ? settingsResult.value?.data : null;
    const wt = webhookResult.status === 'fulfilled' ? webhookResult.value?.data : null;
    const pend = pendingResult.status === 'fulfilled' ? pendingResult.value?.data : null;
    const ov = sets?.find(s=>s.key==='categoryOverrides');
    const sg = sets?.find(s=>s.key==='categorySuggestions');
    const cc = sets?.find(s=>s.key==='customCats');
    const rt = sets?.find(s=>s.key==='recurringTemplates');
    const od = sets?.find(s=>s.key==='otherCategoryDismissedIds');
    setMembers(mems || []);
    setCatOverrides(ov?.value || {});
    setCatSuggestions(sg?.value || {});
    setCustomCats(cc?.value || {});
    setRecurringTemplates((rt?.value || []).map(normalizeRecurringTemplate).filter(Boolean));
    setOtherCategoryDismissedIds(Array.isArray(od?.value) ? od.value : []);
    setWebhookToken(wt?.secret || null);
    setPendingExpenses(pend || []);
  }, [fetchRates, user]);

  useEffect(() => {
    if (currentList && (homeView === 'stats' || tab === 'stats') && !expenseDetailsLoaded && !expenseDetailsLoading) {
      loadExpenseDetails(currentList);
    }
  }, [currentList, homeView, tab, expenseDetailsLoaded, expenseDetailsLoading, loadExpenseDetails]);

  /* ── Save Setting ── */
  const saveSetting = useCallback(async (key, value) => {
    if (!currentList) return;
    await sb.from('list_settings').upsert({list_id: currentList.id, key, value}, {onConflict:'list_id,key'});
  }, [currentList]);

  /* ── Auth Handlers ── */
  const handleAuth = async () => {
    setAuthError(''); setAuthBusy(true);
    try {
      if (authMode === 'login') {
        const {data, error} = await sb.auth.signInWithPassword({email:authEmail, password:authPass});
        if (error) throw error;
        setSession(data?.session || null);
        setUser(data?.user || data?.session?.user || null);
      } else {
        const {error} = await sb.auth.signUp({email:authEmail, password:authPass});
        if (error) throw error;
        showToast('Check your email to confirm your account!');
      }
    } catch(e) {
      setAuthError(e.message || 'Login failed. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSetPassword = async () => {
    if (newPassword.length < 6) { showToast('Password must be at least 6 characters'); return; }
    setNewPasswordBusy(true);
    const {error} = await sb.auth.updateUser({password: newPassword});
    setNewPasswordBusy(false);
    if (error) { showToast('Error: ' + error.message); return; }
    setSetPasswordMode(false);
    window.history.replaceState(null, '', window.location.pathname);
    showToast('Password set — welcome!');
  };

  /* ── Create List ── */
  const handleCreateList = async () => {
    if (!newListName.trim() || !newDisplayName.trim()) return;
    const {data: listJson, error} = await sb.rpc('create_expense_list', {
      p_name: newListName.trim(), p_currency: newListCur, p_display_name: newDisplayName.trim()
    });
    if (error) { showToast('Error: ' + error.message); return; }
    const list = listJson;

    const name = newDisplayName.trim();
    const d = (daysAgo) => {
      const dt = new Date(); dt.setDate(dt.getDate() - daysAgo);
      return dt.toISOString().slice(0, 10);
    };
    const samples = [
      { item: 'Grocery run', category: 'Groceries', date: d(1), total_amount: 45.50, paid_by: name, split_type: 'equal', shares: {[name]: 45.50} },
      { item: 'Coffee & cake', category: 'Restaurant', date: d(3), total_amount: 12.00, paid_by: name, split_type: 'equal', shares: {[name]: 12.00} },
      { item: 'Uber to city', category: 'Transport', date: d(5), total_amount: 28.00, paid_by: name, split_type: 'equal', shares: {[name]: 28.00} },
      { item: 'Netflix subscription', category: 'Utilities', date: d(10), total_amount: 16.99, paid_by: name, split_type: 'equal', shares: {[name]: 16.99} },
      { item: 'Dinner out', category: 'Restaurant', date: d(18), total_amount: 62.00, paid_by: name, split_type: 'equal', shares: {[name]: 62.00} },
      { item: 'Flight booking', category: 'Travel', date: d(35), total_amount: 250.00, paid_by: name, split_type: 'equal', shares: {[name]: 250.00} },
      { item: 'New lamp', category: 'Home', date: d(40), total_amount: 39.95, paid_by: name, split_type: 'equal', shares: {[name]: 39.95} },
    ].map(s => ({ ...s, list_id: list.id, original_currency: null, original_amount: null }));

    await sb.from('expenses').insert(samples);
    const full = {...list, myDisplayName: name};
    setLists(prev => [...prev, full]);
    selectList(full);
    setListScreen('select');
    setNewListName(''); setNewDisplayName('');
    showToast('List created with sample data! Share code: ' + list.invite_code);
  };

  /* ── Delete List ── */
  const deleteList = async () => {
    if (!currentList) return;
    const { error: expError } = await sb.from('expenses').delete().eq('list_id', currentList.id);
    if (expError) { showToast('Error deleting expenses: ' + expError.message); return; }
    const { error: setError } = await sb.from('list_settings').delete().eq('list_id', currentList.id);
    if (setError) { showToast('Error deleting list settings: ' + setError.message); return; }
    const { error: memError } = await sb.from('list_members').delete().eq('list_id', currentList.id);
    if (memError) { showToast('Error deleting list members: ' + memError.message); return; }
    const { error: listError } = await sb.from('expense_lists').delete().eq('id', currentList.id);
    if (listError) { showToast('Error deleting list: ' + listError.message); return; }
    setLists(prev => prev.filter(l => l.id !== currentList.id));
    setCurrentList(null);
    clearCachedExpenseList();
    setTab('home');
    setConfirmDeleteList(false);
    showToast('List deleted');
  };

  /* ── Join List ── */
  const handleJoinList = async () => {
    if (!joinCode.trim() || !newDisplayName.trim()) return;
    const { data: list, error } = await sb.rpc('join_expense_list_by_invite_code', {
      p_invite_code: joinCode.trim().toLowerCase(),
      p_display_name: newDisplayName.trim(),
      p_email: user.email,
    });
    if (error || !list) { showToast(error?.message || 'Invalid invite code'); return; }
    const full = {...list, myDisplayName: newDisplayName.trim()};
    setLists(prev => [...prev.filter(l => l.id !== full.id), full]);
    selectList(full);
    setListScreen('select');
    setJoinCode(''); setNewDisplayName('');
    showToast('Joined "' + list.name + '"!');
  };

  /* ── Add Expense ── */
  const parsedPreview = useMemo(() => {
    if (!inputText.trim() || members.length === 0) return null;
    return parseExpense(inputText, members, myName, rates, defCur, catOverrides, customCats);
  }, [inputText, members, myName, rates, defCur, catOverrides, customCats]);

  const normalizedRecurringTemplates = useMemo(
    () => recurringTemplates
      .map(normalizeRecurringTemplate)
      .filter(Boolean)
      .sort((a, b) => (
        String(a.nextDueDate || '').localeCompare(String(b.nextDueDate || '')) ||
        String(a.text || '').localeCompare(String(b.text || ''))
      )),
    [recurringTemplates]
  );

  const dueRecurringTemplates = useMemo(
    () => normalizedRecurringTemplates.filter(t => t.nextDueDate && t.nextDueDate <= today()),
    [normalizedRecurringTemplates]
  );

  const recurringStatRows = useMemo(() => {
    const infoCategories = new Set(['Income', 'Investment', 'Other']);
    return normalizedRecurringTemplates
      .map(rule => {
        const parsed = parseExpense(rule.text, members, myName, rates, defCur, catOverrides, customCats);
        if (!parsed) return null;
        const category = rule.category || parsed.category || 'Other';
        if (!infoCategories.has(category)) return null;
        return {
          id: rule.id,
          text: rule.text,
          item: parsed.item || rule.text,
          category,
          date: rule.nextDueDate || today(),
          total_amount: parsed.total_amount || 0,
          shares: parsed.shares || {},
          intervalCount: rule.intervalCount,
          intervalUnit: rule.intervalUnit,
          dateMode: rule.dateMode,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (
        String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.category || '').localeCompare(String(b.category || '')) ||
        String(a.item || '').localeCompare(String(b.item || ''))
      ));
  }, [normalizedRecurringTemplates, members, myName, rates, defCur, catOverrides, customCats]);

  const addSettlement = async () => {
    if (!settleFrom || !settleTo || !settleAmt || !currentList) return;
    const amount = parseFloat(settleAmt);
    if (!amount || amount <= 0) return;
    const row = {
      list_id: currentList.id, item: `💸 ${settleFrom} paid ${settleTo}`,
      category: 'Settlement', date: today(), original_currency: null, original_amount: null,
      total_amount: amount, paid_by: settleFrom, split_type: 'settlement', shares: {[settleTo]: amount}
    };
    const {data, error} = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setExpenses(prev => [data, ...prev]);
    setExpenseDetailsLoaded(true);
    loadExpenseDetails(currentList);
    setShowSettle(false); setSettleAmt('');
    showToast(`Recorded: ${settleFrom} paid ${settleTo} ${fmt(amount, defCur)}`);
    sendNotification(`💸 ${settleFrom} paid ${settleTo}`, `${fmt(amount, defCur)} in ${currentList.name}`, 'settlement');
  };

  const addManualExpense = async () => {
    if (!addItem.trim() || !addAmount || !currentList) return;
    const amount = parseFloat(addAmount);
    if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
    const ns = members.map(m => m.display_name);
    const payer = addPaidBy || ns[0];
    let shares = {};
    if (addSplitType === 'equal') { ns.forEach(n => { shares[n] = amount / ns.length; }); }
    else if (addSplitType === 'ratio') {
      const totalRatio = Object.values(addProportions).reduce((s,v) => s + (parseFloat(v)||0), 0);
      if (totalRatio === 0) { showToast('Enter at least one ratio'); return; }
      ns.forEach(n => { const r = parseFloat(addProportions[n]) || 0; if (r > 0) shares[n] = (r / totalRatio) * amount; });
    } else if (addSplitType === 'percent') {
      const totalPct = Object.values(addPercentages).reduce((s,v) => s + (parseFloat(v)||0), 0);
      if (Math.abs(totalPct - 100) > 0.01) { showToast('Percentages must add up to 100%'); return; }
      ns.forEach(n => { const p = parseFloat(addPercentages[n]) || 0; if (p > 0) shares[n] = (p / 100) * amount; });
    } else if (addSplitType === 'exact') {
      ns.forEach(n => { const v = parseFloat(addExactAmounts[n]); if (v > 0) shares[n] = v; });
      const sum = Object.values(shares).reduce((a,b)=>a+b,0);
      if (Math.abs(sum - amount) > 0.01) { showToast('Exact amounts must equal total'); return; }
    } else if (addSplitType === 'payer') { shares = {[payer]: amount};
    } else if (addSplitType === 'headcount') {
      const hc = parseInt(addHeadcount) || 0;
      if (hc < 2) { showToast('Enter total number of people (min 2)'); return; }
      const selected = ns.filter(n => addHeadcountMembers[n] !== false);
      if (selected.length === 0) { showToast('Select at least one member'); return; }
      if (selected.length >= hc) { showToast(`In-app members must be fewer than total (${hc})`); return; }
      const perPerson = amount / hc;
      selected.forEach(n => { shares[n] = perPerson; });
    }
    shares = Object.fromEntries(Object.entries(shares).map(([k,v])=>[k,Math.round(v*100)/100]));

    let origCur = null, origAmt = null;
    if (addOrigCur && addOrigCur !== defCur && addOrigAmt) { origCur = addOrigCur; origAmt = parseFloat(addOrigAmt); }

    const row = {
      list_id: currentList.id, item: addItem.trim(), category: addCategory, date: addDate,
      original_currency: origCur, original_amount: origAmt, total_amount: Math.round(amount * 100) / 100,
      paid_by: payer, split_type: addSplitType, shares,
      headcount: addSplitType === 'headcount' ? (parseInt(addHeadcount) || null) : null,
    };
    const {data, error} = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setExpenses(prev => [data, ...prev]);
    setExpenseDetailsLoaded(true);
    loadExpenseDetails(currentList);
    setShowAddForm(false);
    setAddItem(''); setAddAmount(''); setAddCategory('Other'); setAddSplitType('equal');
    setAddExactAmounts({}); setAddProportions({}); setAddPercentages({});
    setAddHeadcount(''); setAddHeadcountMembers({});
    setAddOrigCur(''); setAddOrigAmt(''); setShowForeign(false);
    showToast('Added: ' + data.item);
    const shareNames1 = Object.keys(data.shares || {}).filter(n => (data.shares[n] || 0) > 0);
    const isPersonal1 = shareNames1.length === 1 && shareNames1[0] === myName;
    sendNotification(`New expense in ${currentList.name}`, `${myName} added ${data.item} — ${fmt(data.total_amount, defCur)}`, 'expense', isPersonal1 ? user.id : null);
  };

  const addExpense = async () => {
    if (!parsedPreview || !currentList) return;
    const row = {...parsedPreview, list_id: currentList.id};
    if (previewCatOverride) row.category = previewCatOverride;
    const {data, error} = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setExpenses(prev => [data, ...prev]);
    setExpenseDetailsLoaded(true);
    loadExpenseDetails(currentList);
    const finalCat = row.category;
    const autoCat = parsedPreview.category;
    if (previewCatOverride || finalCat === 'Income') {
      queueCategorySuggestions(parsedPreview.item || inputText, finalCat, autoCat);
    }
    setInputText(''); setInputFocused(false); setPreviewCatOverride(null); setShowSaveTemplate(false);
    showToast('Added: ' + data.item);
    const shareNames2 = Object.keys(data.shares || {}).filter(n => (data.shares[n] || 0) > 0);
    const isPersonal2 = shareNames2.length === 1 && shareNames2[0] === myName;
    sendNotification(`New expense in ${currentList.name}`, `${myName} added ${data.item} — ${fmt(data.total_amount, defCur)}`, 'expense', isPersonal2 ? user.id : null);
  };

  const saveTemplate = () => {
    if (!inputText.trim()) return;
    const recurringHint = extractRecurringExpenseScheduleHint(inputText.trim());
    const templateText = recurringHint.text || inputText.trim();
    const finalCat = previewCatOverride || parsedPreview?.category || 'Other';
    const existing = normalizedRecurringTemplates.find(t => t.text === templateText);
    const entry = normalizeRecurringTemplate({
      ...(existing || {}),
      text: templateText,
      category: finalCat,
      intervalCount: recurringHint.schedule?.intervalCount || existing?.intervalCount || 1,
      intervalUnit: recurringHint.schedule?.intervalUnit || existing?.intervalUnit || 'months',
      nextDueDate: recurringHint.schedule?.nextDueDate || existing?.nextDueDate || today(),
      dateMode: recurringHint.schedule?.dateMode || existing?.dateMode || 'date',
    });
    const next = [...normalizedRecurringTemplates.filter(t => t.text !== entry.text), entry];
    setRecurringTemplates(next);
    saveSetting('recurringTemplates', next);
    setShowSaveTemplate(false);
    showToast('Recurring expense saved');
  };

  const toggleRecurringTool = () => {
    if (expenseTool !== 'recurring' && inputText.trim() && !newRecurringText.trim()) {
      setNewRecurringText(inputText.trim());
    }
    setExpenseTool(v => v === 'recurring' ? null : 'recurring');
  };

  const saveManualRecurringTemplate = () => {
    const text = newRecurringText.trim();
    if (!text) { showToast('Enter recurring expense text'); return; }
    const existing = normalizedRecurringTemplates.find(t => t.text === text);
    const entry = normalizeRecurringTemplate({
      ...(existing || {}),
      text,
      category: newRecurringCategory || null,
      intervalCount: newRecurringIntervalCount,
      intervalUnit: newRecurringIntervalUnit,
      nextDueDate: newRecurringDateMode === 'month-end' ? endOfMonthFor(newRecurringNextDueDate || today()) : newRecurringNextDueDate || today(),
      dateMode: newRecurringDateMode,
    });
    const next = [...normalizedRecurringTemplates.filter(t => t.text !== entry.text), entry];
    setRecurringTemplates(next);
    saveSetting('recurringTemplates', next);
    setNewRecurringText('');
    setNewRecurringIntervalCount(1);
    setNewRecurringIntervalUnit('months');
    setNewRecurringNextDueDate(today());
    setNewRecurringDateMode('date');
    setNewRecurringCategory('');
    showToast('Recurring expense saved');
  };

  const deleteTemplate = (t) => {
    const rule = normalizeRecurringTemplate(t);
    const next = normalizedRecurringTemplates.filter(x => x.id !== rule?.id);
    setRecurringTemplates(next);
    saveSetting('recurringTemplates', next);
  };

  const updateRecurringRule = (id, patch) => {
    const next = normalizedRecurringTemplates.map(rule => (
      rule.id === id
        ? normalizeRecurringTemplate({ ...rule, ...patch, intervalCount: patch.intervalCount ?? rule.intervalCount })
        : rule
    )).filter(Boolean);
    setRecurringTemplates(next);
    saveSetting('recurringTemplates', next);
  };

  const updateRecurringSchedule = (rule, patch) => {
    const currentDue = rule.nextDueDate || today();
    const nextDateMode = patch.dateMode ?? rule.dateMode ?? 'date';
    updateRecurringRule(rule.id, {
      ...patch,
      nextDueDate: nextDateMode === 'month-end'
        ? endOfMonthFor(currentDue > today() ? today() : currentDue)
        : currentDue > today() ? today() : currentDue,
    });
  };

  const advanceRecurringRule = (rule, actionDate = today()) => {
    const nextDueDate = advanceRecurringDueDate(rule.nextDueDate || actionDate, rule.intervalCount, rule.intervalUnit, rule.dateMode);
    updateRecurringRule(rule.id, { nextDueDate, lastActionDate: actionDate });
  };

  const confirmRecurringExpense = async (rule) => {
    const draftText = (recurringDrafts[rule.id] || rule.text).trim();
    const parsed = parseExpense(draftText, members, myName, rates, defCur, catOverrides, customCats);
    if (!parsed || !currentList) { showToast('Could not read recurring expense'); return; }
    const row = {
      ...parsed,
      list_id: currentList.id,
      category: rule.category || parsed.category,
      date: rule.nextDueDate || today(),
    };
    const { data, error } = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setExpenses(prev => [data, ...prev]);
    setExpenseDetailsLoaded(true);
    loadExpenseDetails(currentList);
    setRecurringDrafts(prev => {
      const next = { ...prev };
      delete next[rule.id];
      return next;
    });
    advanceRecurringRule(rule, row.date);
    showToast('Added: ' + data.item);
    const shareNames = Object.keys(data.shares || {}).filter(n => (data.shares[n] || 0) > 0);
    const isPersonal = shareNames.length === 1 && shareNames[0] === myName;
    sendNotification(`New expense in ${currentList.name}`, `${myName} added ${data.item} - ${fmt(data.total_amount, defCur)}`, 'expense', isPersonal ? user.id : null);
  };

  const dismissRecurringSuggestion = (rule) => {
    advanceRecurringRule(rule);
    showToast('Skipped recurring expense');
  };

  const addPendingLikeExpense = async (pending, draft = {}, options = {}) => {
    if (!currentList) return;
    const names = members.map(m => m.display_name);
    if (names.length === 0) { showToast('No members in list'); return null; }
    const payer = draft.paid_by || pending.paid_by || myName || names[0];
    const category = draft.category || 'Other';
    const splitType = draft.split_type || 'equal';
    const amt = parseFloat(pending.amount);
    if (!Number.isFinite(amt) || amt <= 0) { showToast('Enter a valid amount'); return null; }
    const isForeign = pending.currency && pending.currency !== defCur;
    const total = isForeign && rates[pending.currency] && rates[defCur]
      ? Math.round(cvt(amt, pending.currency, defCur, rates) * 100) / 100
      : amt;

    const shares = {};
    if (splitType === 'personal') {
      shares[payer] = total;
    } else {
      names.forEach(n => { shares[n] = Math.round(total / names.length * 100) / 100; });
    }

    const row = {
      list_id: currentList.id,
      item: pending.item,
      category,
      date: pending.date || new Date().toISOString().slice(0, 10),
      total_amount: total,
      paid_by: payer,
      split_type: splitType,
      shares,
      original_currency: isForeign ? pending.currency : null,
      original_amount: isForeign ? amt : null,
    };

    const { data, error } = await sb.from('expenses').insert(row).select().single();
    if (error) { showToast('Error: ' + error.message); return null; }
    if (options.deletePending !== false && pending.id) {
      await sb.from('pending_expenses').delete().eq('id', pending.id);
    }
    setExpenses(prev => [data, ...prev]);
    setExpenseDetailsLoaded(true);
    loadExpenseDetails(currentList);
    if (pending.id) setPendingExpenses(prev => prev.filter(p => p.id !== pending.id));
    showToast('Added: ' + data.item);
    return data;
  };

  /* ── Confirm / Dismiss Pending (from webhook) ── */
  const confirmPending = async (pending, draft) => {
    await addPendingLikeExpense(pending, draft);
  };

  const addMailCandidateExpense = async (candidate) => {
    if (!currentList || !user) return null;
    const pending = {
      item: candidate.item || candidate.subject || 'Mail expense',
      amount: candidate.amount,
      currency: candidate.currency || defCur,
      date: candidate.date,
      paid_by: myName,
    };
    const draft = {
      category: candidate.category || (candidate.kind === 'income' ? 'Income' : 'Other'),
      split_type: candidate.splitType || candidate.split_type || 'personal',
      paid_by: myName,
    };
    return addPendingLikeExpense(pending, draft, { deletePending: false });
  };

  const dismissPending = async (id) => {
    await sb.from('pending_expenses').delete().eq('id', id);
    setPendingExpenses(prev => prev.filter(p => p.id !== id));
    showToast('Dismissed');
  };

  /* ── Delete Expense ── */
  const deleteExpense = async (id) => {
    await sb.from('expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    setConfirmDelete(null);
    showToast('Deleted');
  };

  /* ── Edit Expense ── */
  const startEdit = (exp) => {
    setEditingId(exp.id);
    const hasOrig = exp.original_currency && exp.original_amount;
    setEditForm({
      item: exp.item, total_amount: exp.total_amount, category: exp.category,
      paid_by: exp.paid_by, date: exp.date, split_type: exp.split_type,
      shares: {...(exp.shares || {})},
      original_currency: exp.original_currency || '',
      original_amount: exp.original_amount ?? '',
      exchange_rate: hasOrig ? parseFloat((exp.total_amount / exp.original_amount).toFixed(6)) : 1,
      headcount: exp.headcount || '',
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const names = members.map(m => m.display_name);
    let shares = editForm.shares;
    const total = parseFloat(editForm.total_amount);
    if (editForm.split_type === 'equal') {
      shares = {}; names.forEach(n => { shares[n] = total / names.length; });
    } else if (editForm.split_type === 'ratio') {
      const totalRatio = Object.values(editForm.shares||{}).reduce((s,v) => s + (parseFloat(v)||0), 0);
      shares = {};
      if (totalRatio > 0) names.forEach(n => { const r = parseFloat(editForm.shares?.[n])||0; if(r>0) shares[n]=(r/totalRatio)*total; });
    } else if (editForm.split_type === 'percent') {
      shares = {};
      names.forEach(n => { const p = parseFloat(editForm.shares?.[n])||0; if(p>0) shares[n]=(p/100)*total; });
    } else if (editForm.split_type === 'personal') {
      shares = {[editForm.paid_by]: total};
    } else if (editForm.split_type === 'headcount') {
      const hc = parseInt(editForm.headcount) || 0;
      if (hc >= 2) {
        const perPerson = total / hc;
        const selected = Object.keys(editForm.shares || {}).filter(n => names.includes(n) && editForm.shares[n]);
        shares = {};
        selected.forEach(n => { shares[n] = perPerson; });
      }
    }
    shares = Object.fromEntries(Object.entries(shares).map(([k,v])=>[k,Math.round(parseFloat(v)*100)/100]));

    const {_computedShares, exchange_rate, ...cleanForm} = editForm;
    const upd = {
      ...cleanForm, total_amount: total, shares,
      original_currency: editForm.original_currency || null,
      original_amount: editForm.original_currency ? (parseFloat(editForm.original_amount) || null) : null,
      headcount: editForm.split_type === 'headcount' ? (parseInt(editForm.headcount) || null) : null,
    };
    const {error} = await sb.from('expenses').update(upd).eq('id', editingId);
    if (error) { showToast('Error: '+error.message); return; }

    const oldExp = expenses.find(e => e.id === editingId);
    if (oldExp && oldExp.category !== editForm.category) {
      const normalizedEditKeys = deriveOverrideKeys(editForm.item);
      queueCategorySuggestions(editForm.item, editForm.category, oldExp.category);
      let count = 0;
      const updated = expenses.map(e => {
        if (e.id === editingId) return {...e, ...upd};
        const expenseKeys = deriveOverrideKeys(e.item);
        if (expenseKeys.some(key => normalizedEditKeys.includes(key))) {
          count++; return {...e, category: editForm.category};
        }
        return e;
      });
      setExpenses(updated);
      if (count > 0) {
        for (const e of updated) {
          if (e.id !== editingId && expenses.find(o => o.id === e.id)?.category !== e.category) {
            await sb.from('expenses').update({category: e.category}).eq('id', e.id);
          }
        }
        showToast(`Updated ${count + 1} similar items`);
      } else {
        setExpenses(prev => prev.map(e => e.id === editingId ? {...e,...upd} : e));
        showToast('Saved');
      }
    } else {
      setExpenses(prev => prev.map(e => e.id === editingId ? {...e,...upd} : e));
      showToast('Saved');
    }
    const shareNames3 = Object.keys(upd.shares || {}).filter(n => (upd.shares[n] || 0) > 0);
    const isPersonal3 = shareNames3.length === 1 && shareNames3[0] === myName;
    sendNotification(`Expense updated in ${currentList.name}`, `${myName} updated ${upd.item} — ${fmt(upd.total_amount, defCur)}`, 'expense', isPersonal3 ? user.id : null);
    setEditingId(null);
  };

  /* ── Balance Computation ── */
  const {netBalances, txns, totals} = useMemo(() => {
    const nets = {}; const totals = {};
    members.forEach(m => { nets[m.display_name] = 0; totals[m.display_name] = 0; });
    expenses.forEach(e => {
      const payer = e.paid_by;
      if (nets[payer] !== undefined) {
        const creditAmt = e.split_type === 'headcount'
          ? Object.values(e.shares || {}).reduce((s, v) => s + (v || 0), 0)
          : (e.total_amount || 0);
        nets[payer] += creditAmt;
        totals[payer] = (totals[payer] || 0) + creditAmt;
      }
      const shares = e.shares || {};
      Object.entries(shares).forEach(([name, amt]) => {
        if (nets[name] !== undefined) nets[name] -= amt;
      });
    });
    return {netBalances: nets, txns: simplifyDebts(nets), totals};
  }, [expenses, members]);

  /* ── Visible Expenses (hide other people's personal entries) ── */
  const visibleExpenses = useMemo(() => {
    if (!myName) return expenses;
    return expenses.filter(e => {
      const sn = Object.keys(e.shares || {}).filter(n => (e.shares[n] || 0) > 0);
      // Hide only if personal to someone else AND I didn't pay for it
      return !(sn.length === 1 && sn[0] !== myName && e.paid_by !== myName);
    });
  }, [expenses, myName]);

  /* ── Filtered Expenses ── */
  const filtered = useMemo(() => {
    if (!search.trim()) return visibleExpenses;
    const q = search.toLowerCase();
    return visibleExpenses.filter(e =>
      e.item?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q) ||
      e.date?.includes(q) || e.paid_by?.toLowerCase().includes(q) ||
      e.original_currency?.toLowerCase().includes(q)
    );
  }, [visibleExpenses, search]);

  const otherCategoryCandidates = useMemo(() => {
    if (!expenseDetailsLoaded) return [];
    const dismissed = new Set(otherCategoryDismissedIds);
    return visibleExpenses
      .filter(e => e.category === 'Other' && e.split_type !== 'settlement' && !dismissed.has(e.id))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }, [expenseDetailsLoaded, visibleExpenses, otherCategoryDismissedIds]);

  /* ── Stats Data ── */
  const months = useMemo(() => {
    const ms = new Set(visibleExpenses.map(e => e.date?.slice(0,7)).filter(Boolean));
    return [...ms].sort().reverse();
  }, [visibleExpenses]);

  useEffect(() => { if (months.length && !selMonth) setSelMonth(months[0]); }, [months]);

  const monthExpenses = useMemo(() =>
    visibleExpenses.filter(e => e.date?.startsWith(selMonth) && e.split_type !== 'settlement'),
  [visibleExpenses, selMonth]);

  const currentMonthSpendOutlook = useMemo(() => {
    const memberNames = members.map(m => m.display_name);
    const month = today().slice(0, 7);
    const monthStart = `${month}-01`;
    const [year, monthNumber] = month.split('-').map(Number);
    const monthEnd = new Date(year, monthNumber, 0).toISOString().slice(0, 10);
    const todayStr = today();
    const upcomingStart = monthStart > todayStr ? monthStart : todayStr;
    const totals = {
      currentIncome: 0,
      currentInvestment: 0,
      currentExpense: 0,
      upcomingIncome: 0,
      upcomingInvestment: 0,
      upcomingExpense: 0,
    };
    const byPerson = {};
    memberNames.forEach(name => {
      byPerson[name] = {
        currentIncome: 0,
        currentInvestment: 0,
        currentExpense: 0,
        upcomingIncome: 0,
        upcomingInvestment: 0,
        upcomingExpense: 0,
      };
    });

    visibleExpenses
      .filter(e => e.date?.startsWith(month) && e.split_type !== 'settlement')
      .forEach(e => {
        const amount = e.total_amount || 0;
        if (e.category === 'Income') totals.currentIncome += amount;
        else if (e.category === 'Investment') totals.currentInvestment += amount;
        else if (e.category === 'Settlement') return;
        else totals.currentExpense += amount;
        Object.entries(e.shares || {}).forEach(([name, share]) => {
          if (!byPerson[name]) return;
          if (e.category === 'Income') byPerson[name].currentIncome += share || 0;
          else if (e.category === 'Investment') byPerson[name].currentInvestment += share || 0;
          else if (e.category === 'Settlement') return;
          else byPerson[name].currentExpense += share || 0;
        });
      });

    recurringStatRows.forEach(row => {
      if (!row.date) return;
      let dueDate = row.date;
      let guard = 0;
      while (dueDate < upcomingStart && guard < 370) {
        dueDate = addRecurringDueDate(dueDate, row.intervalCount, row.intervalUnit, row.dateMode);
        guard += 1;
      }
      while (dueDate <= monthEnd && guard < 740) {
        if (dueDate >= upcomingStart && dueDate.startsWith(month)) {
          const amount = row.total_amount || 0;
          if (row.category === 'Income') totals.upcomingIncome += amount;
          else if (row.category === 'Investment') totals.upcomingInvestment += amount;
          else if (row.category === 'Other') totals.upcomingExpense += amount;
          Object.entries(row.shares || {}).forEach(([name, share]) => {
            if (!byPerson[name]) return;
            if (row.category === 'Income') byPerson[name].upcomingIncome += share || 0;
            else if (row.category === 'Investment') byPerson[name].upcomingInvestment += share || 0;
            else if (row.category === 'Other') byPerson[name].upcomingExpense += share || 0;
          });
        }
        dueDate = addRecurringDueDate(dueDate, row.intervalCount, row.intervalUnit, row.dateMode);
        guard += 1;
      }
    });

    const income = totals.currentIncome + totals.upcomingIncome;
    const investment = totals.currentInvestment + totals.upcomingInvestment;
    const expense = totals.currentExpense + totals.upcomingExpense;
    const personOutlook = {};
    Object.entries(byPerson).forEach(([name, personTotals]) => {
      const personIncome = personTotals.currentIncome + personTotals.upcomingIncome;
      const personInvestment = personTotals.currentInvestment + personTotals.upcomingInvestment;
      const personExpense = personTotals.currentExpense + personTotals.upcomingExpense;
      personOutlook[name] = {
        ...personTotals,
        income: personIncome,
        investment: personInvestment,
        expense: personExpense,
        spendLeft: personIncome - personInvestment - personExpense,
      };
    });
    return {
      ...totals,
      income,
      investment,
      expense,
      spendLeft: income - investment - expense,
      byPerson: personOutlook,
    };
  }, [visibleExpenses, recurringStatRows, members]);

  const allCats = useMemo(() => {
    const merged = {...BASE_CATS};
    members.forEach((m,i) => {
      merged[m.display_name] = {emoji:'👤', c:PERSON_COLORS[i%PERSON_COLORS.length], bg:'#eef2ff', tx:'#4338ca'};
    });
    Object.entries(customCats).forEach(([k,v]) => { merged[k] = v; });
    return merged;
  }, [customCats, members]);

  const overrideExamples = useMemo(() => {
    const result = {};
    Object.keys(catOverrides).forEach((key) => { result[key] = { total: 0, examples: [] }; });
    expenses.forEach((expense) => {
      const keys = deriveOverrideKeys(expense.item || '');
      keys.forEach((key) => {
        if (!result[key]) return;
        result[key].total += 1;
        if (!result[key].examples.includes(expense.item) && result[key].examples.length < 3) {
          result[key].examples.push(expense.item);
        }
      });
    });
    return result;
  }, [catOverrides, expenses]);

  const suggestionExamples = useMemo(() => {
    const result = {};
    Object.keys(catSuggestions).forEach((key) => { result[key] = { total: 0, examples: [] }; });
    expenses.forEach((expense) => {
      const keys = deriveOverrideKeys(expense.item || '');
      keys.forEach((key) => {
        if (!result[key]) return;
        result[key].total += 1;
        if (!result[key].examples.includes(expense.item) && result[key].examples.length < 3) {
          result[key].examples.push(expense.item);
        }
      });
    });
    return result;
  }, [catSuggestions, expenses]);

  /* ── Add Custom Category ── */
  const addCustomCat = () => {
    if (!newCatName.trim()) return;
    const n = newCatName.trim();
    const existing = Object.keys(allCats).find(c => c.toLowerCase() === n.toLowerCase());
    if (existing) {
      showToast('Category already exists: ' + existing);
      setNewCatName('');
      return;
    }
    const idx = Object.keys(customCats).length % CUST_COLORS.length;
    const newC = {...customCats, [n]: {emoji:'🏷️', c:CUST_COLORS[idx], bg:'#ecfeff', tx:'#0e7490'}};
    setCustomCats(newC);
    saveSetting('customCats', newC);
    setNewCatName('');
    showToast('Added category: ' + n);
  };

  const deleteCustomCat = async (name) => {
    const nc = {...customCats}; delete nc[name];
    setCustomCats(nc); saveSetting('customCats', nc);
    const updated = expenses.map(e => {
      if (e.category === name) { return {...e, category: detectCategory(e.item, catOverrides, nc)}; }
      return e;
    });
    setExpenses(updated);
    for (const e of updated) {
      if (expenses.find(o=>o.id===e.id)?.category !== e.category) {
        await sb.from('expenses').update({category:e.category}).eq('id',e.id);
      }
    }
    showToast('Deleted category: ' + name);
  };

  const updateCatOverride = (key, value) => {
    const next = { ...catOverrides, [key]: value };
    setCatOverrides(next);
    saveSetting('categoryOverrides', next);
    showToast(`Updated learned category for ${key}`);
  };

  const queueCategorySuggestions = (text, category, autoCategory) => {
    const keys = deriveOverrideKeys(text);
    if (!keys.length) return;
    const next = { ...catSuggestions };
    let added = 0;
    keys.forEach((key) => {
      if (catOverrides[key]) return;
      if (next[key]?.category === category) return;
      next[key] = {
        category,
        source: prettifyMerchantText(text) || text,
        autoCategory: autoCategory || null,
      };
      added += 1;
    });
    if (added > 0) {
      setCatSuggestions(next);
      saveSetting('categorySuggestions', next);
      showToast(`Added ${added} category suggestion${added === 1 ? '' : 's'} for review`);
    }
  };

  const renameCatOverride = (oldKey) => {
    const draft = normalizeMerchantText(overrideDrafts[oldKey] || '');
    if (!draft) {
      showToast('Mapping name cannot be empty');
      return;
    }
    if (draft === oldKey) return;
    const next = { ...catOverrides };
    const currentValue = next[oldKey];
    delete next[oldKey];
    next[draft] = currentValue;
    setCatOverrides(next);
    setOverrideDrafts((prev) => {
      const copy = { ...prev };
      delete copy[oldKey];
      copy[draft] = draft;
      return copy;
    });
    saveSetting('categoryOverrides', next);
    showToast(`Renamed learned mapping to ${draft}`);
  };

  const updateCategorySuggestion = (key, patch) => {
    const next = { ...catSuggestions, [key]: { ...catSuggestions[key], ...patch } };
    setCatSuggestions(next);
    saveSetting('categorySuggestions', next);
  };

  const renameCategorySuggestion = (oldKey) => {
    const draft = normalizeMerchantText(overrideDrafts[oldKey] || '');
    if (!draft) {
      showToast('Suggestion name cannot be empty');
      return;
    }
    if (draft === oldKey) return;
    const next = { ...catSuggestions };
    const currentValue = next[oldKey];
    delete next[oldKey];
    next[draft] = currentValue;
    setCatSuggestions(next);
    setOverrideDrafts((prev) => {
      const copy = { ...prev };
      delete copy[oldKey];
      copy[draft] = draft;
      return copy;
    });
    saveSetting('categorySuggestions', next);
    showToast(`Renamed suggestion to ${draft}`);
  };

  const acceptCategorySuggestion = (key) => {
    const suggestion = catSuggestions[key];
    if (!suggestion) return;
    const nextOverrides = { ...catOverrides, [key]: suggestion.category };
    const nextSuggestions = { ...catSuggestions };
    delete nextSuggestions[key];
    setCatOverrides(nextOverrides);
    setCatSuggestions(nextSuggestions);
    saveSetting('categoryOverrides', nextOverrides);
    saveSetting('categorySuggestions', nextSuggestions);
    showToast(`Added learned category for ${key}`);
  };

  const dismissCategorySuggestion = (key) => {
    const next = { ...catSuggestions };
    delete next[key];
    setCatSuggestions(next);
    setOverrideDrafts((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    saveSetting('categorySuggestions', next);
    showToast(`Dismissed suggestion for ${key}`);
  };

  const saveOtherCategoryDismissedIds = (ids) => {
    const unique = [...new Set(ids)].slice(-500);
    setOtherCategoryDismissedIds(unique);
    saveSetting('otherCategoryDismissedIds', unique);
  };

  const keepExpenseAsOther = (id) => {
    saveOtherCategoryDismissedIds([...otherCategoryDismissedIds, id]);
    showToast('Kept as Other');
  };

  const updateExpenseCategoryQuick = async (expense, category) => {
    if (!expense?.id || !category || category === expense.category) return;
    const { error } = await sb.from('expenses').update({ category }).eq('id', expense.id);
    if (error) {
      showToast('Error: ' + error.message);
      return;
    }
    setExpenses(prev => prev.map(e => e.id === expense.id ? { ...e, category } : e));
    saveOtherCategoryDismissedIds(otherCategoryDismissedIds.filter(id => id !== expense.id));
    queueCategorySuggestions(expense.item, category, expense.category);
    showToast(`Changed to ${category}`);
  };

  const deleteCatOverride = (key) => {
    const next = { ...catOverrides };
    delete next[key];
    setCatOverrides(next);
    setOverrideDrafts((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    saveSetting('categoryOverrides', next);
    showToast(`Removed learned category for ${key}`);
  };

  /* ── Update Member Name ── */
  const updateMyName = async (newN) => {
    if (!newN.trim() || !currentList) return;
    const oldName = myName;
    await sb.from('list_members').update({display_name: newN.trim()}).eq('list_id',currentList.id).eq('user_id',user.id);
    setMyName(newN.trim());
    setMembers(prev => prev.map(m => m.user_id===user.id ? {...m,display_name:newN.trim()} : m));
    if (oldName !== newN.trim()) {
      const updated = expenses.map(e => {
        let changed = false; let ne = {...e};
        if (e.paid_by === oldName) { ne.paid_by = newN.trim(); changed = true; }
        if (e.shares && e.shares[oldName] !== undefined) {
          const ns = {...e.shares}; ns[newN.trim()] = ns[oldName]; delete ns[oldName];
          ne.shares = ns; changed = true;
        }
        return changed ? ne : e;
      });
      setExpenses(updated);
      for (const e of updated) {
        const orig = expenses.find(o=>o.id===e.id);
        if (orig?.paid_by !== e.paid_by || JSON.stringify(orig?.shares) !== JSON.stringify(e.shares)) {
          await sb.from('expenses').update({paid_by:e.paid_by, shares:e.shares}).eq('id',e.id);
        }
      }
    }
  };

  /* ── Logout ── */
  const logout = async () => {
    await sb.auth.signOut();
    setUser(null); setCurrentList(null); setLists([]);
    setExpenses([]); setMembers([]); setTab('home');
    clearCachedExpenseList();
  };

  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */

  const catInfo = (name) => getCat(name, customCats, members);

  // ── Toast ──
  const ToastEl = (
    <AnimatePresence>
      {toast.show && (
        <motion.div initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}}
          style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',zIndex:99,background:'#222',color:'#f5f5ee',padding:'10px 20px',borderRadius:16,fontSize: FS.lg,fontWeight:700,textAlign:'center',fontFamily:MONO,maxWidth:320,boxShadow:'0 8px 32px rgba(0,0,0,0.2)'}}>
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Confirm Delete Modal ──
  const ConfirmModal = confirmDelete !== null && (
    <div style={{position:'fixed',inset:0,zIndex:90,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={()=>setConfirmDelete(null)}>
      <div style={{...s.card,margin:16,maxWidth:360,width:'100%'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize: FS.lg,...s.upper,fontWeight:700,marginBottom:8}}>Delete Expense?</div>
        <div style={{fontSize: FS.lg,opacity:0.5,lineHeight:1.6,marginBottom:20}}>This action cannot be undone.</div>
        <div style={{display:'flex',gap:8}}>
          <button style={s.sm(false)} onClick={()=>setConfirmDelete(null)}>Cancel</button>
          <button style={s.sm(true)} onClick={()=>deleteExpense(confirmDelete)}>Delete</button>
        </div>
      </div>
    </div>
  );

  // ── Loading ──
  if (authLoading) return (
    <div style={s.centerPage}>
      <style>{THEME_CSS}</style>
      <motion.div animate={{rotate:360}} transition={{repeat:Infinity,duration:1}}
        style={{width:40,height:40,border:'4px solid #222',borderTopColor:'transparent',borderRadius:'50%'}}/>
    </div>
  );

  // ── Set Password Screen (after invite link) ──
  if (user && setPasswordMode) return (
    <div className="se" style={s.centerPage}>
      <style>{THEME_CSS}</style>
      {ToastEl}
      <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}}
        style={{...s.card,width:'100%',maxWidth:380,padding:'32px 24px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,fontSize:32,fontWeight:700,...s.upper,letterSpacing:'-0.02em',textAlign:'center',marginBottom:4}}>
          <img src="/icons/icon-192.png" alt="SplitEase" style={{width:40,height:40,borderRadius:10}} />
          SplitEase
        </div>
        <div style={{...s.label,textAlign:'center',marginBottom:24}}>Set your password</div>
        <div style={{marginBottom:16,position:'relative'}}>
          <div style={s.label}>New Password</div>
          <input type={showPass?'text':'password'} placeholder="••••••••" value={newPassword}
            onChange={e=>setNewPassword(e.target.value)}
            onKeyDown={async e=>{ if(e.key==='Enter') await handleSetPassword(); }}
            style={{...s.input,paddingRight:40}} autoFocus/>
          <button onClick={()=>setShowPass(!showPass)} style={{position:'absolute',right:12,bottom:12,background:'none',border:'none',cursor:'pointer',opacity:0.3}}>
            {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
          </button>
        </div>
        <button onClick={handleSetPassword} disabled={newPasswordBusy} style={{...s.btnDark,opacity:newPasswordBusy?0.5:1}}>
          {newPasswordBusy ? '...' : 'Set Password & Continue'}
        </button>
      </motion.div>
    </div>
  );

  // ── Auth Screen ──
  if (!user) return (
    <div className="se" style={s.centerPage}>
      <style>{THEME_CSS}</style>
      {ToastEl}
      <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}}
        style={{...s.card,width:'100%',maxWidth:380,padding:'32px 24px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,fontSize:32,fontWeight:700,...s.upper,letterSpacing:'-0.02em',textAlign:'center',marginBottom:4}}>
          <img src="/icons/icon-192.png" alt="SplitEase" style={{width:40,height:40,borderRadius:10}} />
          SplitEase
        </div>
        <div style={{...s.label,textAlign:'center',marginBottom:24}}>{authMode==='login'?'Welcome back':'Create an account'}</div>
        {authError && <div style={{background:'#fef2f2',color:'#dc2626',fontSize: FS.lg,padding:8,borderRadius:12,marginBottom:12}}>{authError}</div>}
        <div style={{marginBottom:12}}>
          <div style={s.label}>Email</div>
          <input type="email" placeholder="you@email.com" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}
            style={s.input}/>
        </div>
        <div style={{marginBottom:16,position:'relative'}}>
          <div style={s.label}>Password</div>
          <input type={showPass?'text':'password'} placeholder="••••••••" value={authPass}
            onChange={e=>setAuthPass(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleAuth();}}
            style={{...s.input,paddingRight:40}}/>
          <button onClick={()=>setShowPass(!showPass)} style={{position:'absolute',right:12,bottom:12,background:'none',border:'none',cursor:'pointer',opacity:0.3}}>
            {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
          </button>
        </div>
        <button onClick={handleAuth} disabled={authBusy} style={{...s.btnDark,opacity:authBusy?0.5:1,marginBottom:12}}>
          {authBusy ? '...' : authMode==='login' ? 'Log In' : 'Sign Up'}
        </button>
        {authMode==='login' && (
          <p style={{textAlign:'center',marginBottom:4}}>
            <button style={{...s.ghost,opacity:0.4,padding:0,fontSize: FS.lg,...s.upper}} onClick={async()=>{
              if (!authEmail) { setAuthError('Enter your email first'); return; }
              const {error} = await sb.auth.resetPasswordForEmail(authEmail, {redirectTo: window.location.origin});
              if (error) setAuthError(error.message);
              else { setAuthError(''); showToast('Password reset email sent'); }
            }}>Forgot password?</button>
          </p>
        )}
        <p style={{textAlign:'center',fontSize: FS.lg,...s.upper,opacity:0.35}}>
          {authMode==='login' ? "Don't have an account? " : 'Already have an account? '}
          <button style={{...s.ghost,opacity:1,fontWeight:700,padding:0}} onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthError('');}}>
            {authMode==='login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </motion.div>
    </div>
  );

  // ── List Bootstrapping ──
  if (!currentList && listsLoading) return (
    <div className="se" style={s.centerPage}>
      <style>{THEME_CSS}</style>
      {ToastEl}
      <div style={{...s.card,width:'100%',maxWidth:380,padding:'32px 24px',textAlign:'center'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:24,fontWeight:700,...s.upper,letterSpacing:'-0.02em',marginBottom:14}}>
          <img src="/icons/icon-192.png" alt="SplitEase" style={{width:32,height:32,borderRadius:8}} />
          SplitEase
        </div>
        <motion.div animate={{rotate:360}} transition={{repeat:Infinity,duration:1}}
          style={{width:28,height:28,border:'3px solid #222',borderTopColor:'transparent',borderRadius:'50%',margin:'0 auto 12px'}}/>
        <div style={{...s.label}}>Opening your expense list...</div>
      </div>
    </div>
  );

  // ── List Selection ──
  if (!currentList) return (
    <div className="se" style={s.centerPage}>
      <style>{THEME_CSS}</style>
      {ToastEl}
      <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}}
        style={{...s.card,width:'100%',maxWidth:380,padding:'32px 24px'}}>

        {listScreen === 'select' && (<>
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:24,fontWeight:700,...s.upper,letterSpacing:'-0.02em',marginBottom:2}}>
            <img src="/icons/icon-192.png" alt="SplitEase" style={{width:32,height:32,borderRadius:8}} />
            SplitEase
          </div>
          <div style={{...s.label,marginBottom:20}}>{user.email}</div>
          {lists.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{...s.label,marginBottom:8}}>Your Lists</div>
              {lists.map(l => (
                <button key={l.id} onClick={()=>selectList(l)}
                  style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'#F0F0EA',borderRadius:12,border:'none',cursor:'pointer',textAlign:'left',marginBottom:8,fontFamily:MONO,transition:'background 0.2s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#e8e8df'}
                  onMouseLeave={e=>e.currentTarget.style.background='#F0F0EA'}>
                  <div>
                    <div style={{fontSize: FS.lg,fontWeight:700,...s.upper}}>{l.name}</div>
                    <div style={{fontSize: FS.lg,opacity:0.35,...s.upper,marginTop:2}}>{l.default_currency} • as {l.myDisplayName}</div>
                  </div>
                  <ArrowRight size={14} style={{opacity:0.3}}/>
                </button>
              ))}
            </div>
          )}
          <button style={{...s.btnDark,marginBottom:8,display:'flex',alignItems:'center',justifyContent:'center',gap:6}} onClick={()=>setListScreen('create')}>
            <Plus size={16}/> New Expense List
          </button>
          <button style={{...s.btnOutline,display:'flex',alignItems:'center',justifyContent:'center',gap:6}} onClick={()=>setListScreen('join')}>
            <UserPlus size={16}/> Join with Code
          </button>
          <button style={{...s.ghost,display:'block',width:'100%',textAlign:'center',marginTop:12}} onClick={logout}>Log Out</button>
        </>)}

        {listScreen === 'create' && (<>
          <div style={{fontSize:18,fontWeight:700,...s.upper,marginBottom:16}}>Create New List</div>
          <div style={{marginBottom:12}}><input placeholder="List name (e.g. 'Housemates')" value={newListName} onChange={e=>setNewListName(e.target.value)} style={s.input}/></div>
          <div style={{marginBottom:12}}><input placeholder="Your display name" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)} style={s.input}/></div>
          <div style={{marginBottom:16}}>
            <select value={newListCur} onChange={e=>setNewListCur(e.target.value)} style={s.input}>
              {ALL_CUR.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button style={{...s.btnDark,marginBottom:8}} onClick={handleCreateList}>Create</button>
          <button style={{...s.ghost,display:'block',width:'100%',textAlign:'center'}} onClick={()=>setListScreen('select')}>Back</button>
        </>)}

        {listScreen === 'join' && (<>
          <div style={{fontSize:18,fontWeight:700,...s.upper,marginBottom:16}}>Join Expense List</div>
          <div style={{marginBottom:12}}><input placeholder="Invite code" value={joinCode} onChange={e=>setJoinCode(e.target.value)} style={s.input}/></div>
          <div style={{marginBottom:16}}><input placeholder="Your display name" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)} style={s.input}/></div>
          <button style={{...s.btnDark,marginBottom:8}} onClick={handleJoinList}>Join</button>
          <button style={{...s.ghost,display:'block',width:'100%',textAlign:'center'}} onClick={()=>setListScreen('select')}>Back</button>
        </>)}
      </motion.div>
    </div>
  );

  // ── Derived ──
  const names = members.map(m => m.display_name);
  const allCatNames = Array.from(new Set([...Object.keys(BASE_CATS), ...Object.keys(customCats), ...names]));
  const statsProps = {
    months,
    monthExpenses,
    visibleExpenses,
    names,
    selMonth,
    setSelMonth,
    personFilter,
    setPersonFilter,
    expandedStatCats,
    setExpandedStatCats,
    customCats,
    members,
    defCur,
    recurringStatRows,
  };

  const homeTabs = [
    { id: 'expenses', icon: HomeIcon, label: 'Expenses' },
    { id: 'stats', icon: BarChart3, label: 'Stats' },
  ];

  const HomeViewTabs = () => <SegmentedTabs
    tabs={homeTabs}
    value={homeView}
    onChange={(next) => {
      setHomeView(next);
      if (next === 'stats' && !expenseDetailsLoaded) loadExpenseDetails();
    }}
  />;

  const HomeStatsView = () => (
    <div style={{ paddingBottom: isWide ? 40 : 80 }}>
      <div style={{ padding: '32px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div style={SHELL_HEADING_STYLE}>Statistics</div>
        </div>
      </div>
      <HomeViewTabs />
      {!expenseDetailsLoaded ? (
        <div style={{ margin:'12px 16px 0', ...s.card, color:CLAY.textLt, fontSize:FS.lg }}>
          Loading statistics...
        </div>
      ) : (
        <React.Suspense fallback={<div style={{ padding: '20px 16px', fontFamily: MONO, color: CLAY.textLt, fontSize: FS.lg }}>Loading statistics...</div>}>
          <StatsTabLazy {...statsProps} embedded />
        </React.Suspense>
      )}
    </div>
  );

  /* ════════════════════════════════════════════════════════════
     HOME TAB
     ════════════════════════════════════════════════════════════ */
const HomeTab = () => (
    <div style={{paddingBottom: isWide ? 40 : 80, display:'flex', flexDirection:'column'}}>
      <div style={{padding:'32px 16px 0'}}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={SHELL_HEADING_STYLE}>Expense</div>
        </div>
      </div>
      <HomeViewTabs />
      {/* Balance Header */}
      {expenseDetailsLoaded && (
      <div style={{background:CLAY.surface,color:CLAY.text,borderRadius:20,padding:20,margin:'0 16px 0',boxShadow:CLAY.shadow,order:0}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
          <div>
            <div style={{fontSize:18,fontWeight:600,letterSpacing:'-0.01em'}}>{currentList.name}</div>
          </div>
          <span style={{fontSize: FS.lg,...s.upper,fontWeight:600,background:CLAY.surf2,color:CLAY.textMid,padding:'6px 12px',borderRadius:9999,boxShadow:CLAY.shadowSm}}>{defCur}</span>
        </div>

        {txns.length === 0 ? (
          <div style={{textAlign:'center',fontSize: FS.lg,...s.upper,color:CLAY.textLt,padding:'10px 0'}}>All settled up! ✨</div>
        ) : (
          txns.map((t,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:CLAY.surf2,borderRadius:14,padding:'10px 14px',marginBottom:6,fontSize: FS.lg,...s.upper,boxShadow:CLAY.inset}}>
              <span style={{color:CLAY.textMid}}>{t.from} owes {t.to}</span>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontWeight:600,...s.tabnum,color:CLAY.text}}>{fmt(t.amount, defCur)}</span>
                <button onClick={()=>{setShowSettle(!showSettle);setSettleFrom(t.from);setSettleTo(t.to);setSettleAmt(t.amount.toString());}}
                  style={{fontFamily:MONO,fontSize: FS.lg,...s.upper,background:CLAY.peach,border:'none',color:CLAY.peachDk,padding:'5px 12px',borderRadius:9999,cursor:'pointer',fontWeight:600,boxShadow:CLAY.btn}}>
                  💸 Settle
                </button>
              </div>
            </div>
          ))
        )}

        {/* Spend Grid */}
        {(() => {
          const thisMonth = new Date().toISOString().slice(0,7);
          const lm = new Date(); lm.setDate(1); lm.setMonth(lm.getMonth()-1);
          const lastMonth = lm.toISOString().slice(0,7);
          const EXCL = new Set(['Income','Investment','Settlement']);
          const spend = {}; names.forEach(n => { spend[n] = {exp:0, prevExp:0}; });
          visibleExpenses.filter(e => e.split_type !== 'settlement' && !EXCL.has(e.category)).forEach(e => {
            const m = e.date?.slice(0,7);
            Object.entries(e.shares||{}).forEach(([n,a]) => {
              if (!spend[n]) return;
              if (m === thisMonth) spend[n].exp += a;
              else if (m === lastMonth) spend[n].prevExp += a;
            });
          });
          return (
            <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(names.length,2)}, 1fr)`,gap:10,marginTop:14}}>
                {names.map((n,ni) => {
                  const pc = PERSON_COLORS[ni % PERSON_COLORS.length];
                  const outlook = currentMonthSpendOutlook.byPerson?.[n] || {};
                  const left = outlook.spendLeft || 0;
                  const hasIncome = Number(outlook.income || 0) > 0.005;
                  return (
                    <div key={n} style={{background: pc + '18', borderRadius:14,padding:'12px 14px',boxShadow:CLAY.inset}}>
                      <div style={{fontSize: FS.lg,color: pc,marginBottom:4,fontWeight:600}}>{n}</div>
                      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:8}}>
                        <div style={{fontSize: FS.lg,fontWeight:600,...s.tabnum,color:CLAY.text}}>{fmt(spend[n].exp, defCur)}</div>
                        {hasIncome && (
                          <div style={{fontSize: FS.lg,fontWeight:700,...s.tabnum,color:left >= 0 ? '#059669' : '#dc2626'}}>
                            {fmt(left, defCur)} left
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })()}

        {/* Settle Form */}
        <AnimatePresence>
          {showSettle && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} style={{overflow:'hidden'}}>
              <div style={{background:'#f3f4f6',borderRadius:12,padding:12,marginTop:10}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                  <select value={settleFrom} onChange={e=>setSettleFrom(e.target.value)}
                    style={{flex:1,background:'#fff',border:'1px solid #e5e7eb',color:'#1a1a1a',borderRadius:12,padding:'8px 10px',fontFamily:MONO,fontSize:16,outline:'none',...s.upper}}>
                    {names.map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                  <span style={{fontSize: FS.lg,...s.upper,opacity:0.4}}>paid</span>
                  <select value={settleTo} onChange={e=>setSettleTo(e.target.value)}
                    style={{flex:1,background:'#fff',border:'1px solid #e5e7eb',color:'#1a1a1a',borderRadius:12,padding:'8px 10px',fontFamily:MONO,fontSize:16,outline:'none',...s.upper}}>
                    {names.filter(n=>n!==settleFrom).map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <input type="number" placeholder="0.00" value={settleAmt} onChange={e=>setSettleAmt(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')addSettlement();}}
                    style={{flex:1,background:'#fff',border:'1px solid #e5e7eb',color:'#1a1a1a',borderRadius:12,padding:'8px 10px',fontFamily:MONO,fontSize:16,outline:'none',...s.tabnum}}/>
                  <button onClick={addSettlement}
                    style={{fontFamily:MONO,fontSize: FS.lg,...s.upper,fontWeight:700,background:'#1a1a1a',color:'#fff',border:'none',padding:'8px 14px',borderRadius:12,cursor:'pointer'}}>
                    Record
                  </button>
                </div>
                {txns.length > 0 && (
                  <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:8}}>
                    {txns.map((t,i)=>(
                      <button key={i} onClick={()=>{setSettleFrom(t.from);setSettleTo(t.to);setSettleAmt(t.amount.toString());}}
                        style={{background:'#fff',border:'1px solid #e5e7eb',color:'#374151',borderRadius:9999,padding:'4px 10px',fontSize: FS.lg,...s.upper,cursor:'pointer',fontFamily:MONO}}>
                        {t.from} → {t.to}: {fmt(t.amount, defCur)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      {/* Other Category Alert */}
      <AnimatePresence>
        {otherCategoryCandidates.length > 0 && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            style={{margin:'12px 16px 0', order:2}}>
            <div style={{background:'#FFF8E8',borderRadius:20,padding:14,boxShadow:CLAY.shadow,border:'1px solid #F3DFA0'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:10}}>
                <div>
                  <div style={{fontSize:FS.lg,...s.upper,fontWeight:700,color:'#92400e'}}>Needs category · {otherCategoryCandidates.length}</div>
                  <div style={{fontSize:FS.lg,...s.upper,opacity:0.55,marginTop:3}}>These are marked as Other. Pick a better category or keep as Other.</div>
                </div>
                <button onClick={()=>saveOtherCategoryDismissedIds([...otherCategoryDismissedIds, ...otherCategoryCandidates.map(e=>e.id)])}
                  style={{background:'rgba(255,255,255,0.7)',border:'none',borderRadius:9999,padding:'6px 10px',fontFamily:MONO,fontSize:FS.lg,...s.upper,cursor:'pointer',boxShadow:CLAY.btn,color:CLAY.textMid}}>
                  Dismiss all
                </button>
              </div>
              <div style={{display:'grid',gap:8}}>
                {otherCategoryCandidates.slice(0,3).map(exp => (
                  <div key={exp.id} style={{background:'rgba(255,255,255,0.72)',borderRadius:16,padding:10}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:8}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:FS.lg,fontWeight:700,...s.upper,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{exp.item}</div>
                        <div style={{fontSize:FS.lg,...s.upper,opacity:0.45}}>{exp.date} · {fmt(exp.total_amount, defCur)}</div>
                      </div>
                      <button onClick={()=>keepExpenseAsOther(exp.id)}
                        style={{background:CLAY.surf2,border:'none',borderRadius:9999,padding:'6px 10px',fontFamily:MONO,fontSize:FS.lg,...s.upper,cursor:'pointer',boxShadow:CLAY.btn,color:CLAY.textMid,flexShrink:0}}>
                        Keep
                      </button>
                    </div>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                      {allCatNames.filter(c => c !== 'Other' && c !== 'Settlement').slice(0,10).map(c => {
                        const ci = catInfo(c);
                        return (
                          <button key={c} onClick={()=>updateExpenseCategoryQuick(exp,c)}
                            style={{...s.split(false),display:'inline-flex',alignItems:'center',gap:3,background:ci.bg || CLAY.surf2,color:ci.tx || CLAY.textMid}}>
                            <span>{ci.emoji}</span>{c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {otherCategoryCandidates.length > 3 && (
                <div style={{fontSize:FS.lg,...s.upper,opacity:0.45,marginTop:8,padding:'0 2px'}}>
                  Showing 3. Fix or keep these to reveal more.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggested Recurring Expenses */}
      <AnimatePresence>
        {dueRecurringTemplates.length > 0 && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            style={{margin:'12px 16px 0', order:2}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,padding:'0 4px'}}>
              <span style={{fontSize: FS.lg,...s.upper,fontWeight:700,opacity:0.6}}>
                Suggested recurring · {dueRecurringTemplates.length}
              </span>
            </div>
            {dueRecurringTemplates.map(rule => {
              const draftText = recurringDrafts[rule.id] ?? rule.text;
              const parsed = parseExpense(draftText, members, myName, rates, defCur, catOverrides, customCats);
              const category = rule.category || parsed?.category || 'Other';
              const ci = catInfo(category);
              return (
                <motion.div key={rule.id} layout initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.97}}
                  style={{background:'#F4FBF7',borderRadius:20,padding:14,marginBottom:10,boxShadow:CLAY.shadow,border:'1.5px dashed #86efac'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize: FS.lg,fontWeight:700,...s.upper,marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{parsed?.item || rule.text}</div>
                      <div style={{fontSize: FS.lg,...s.upper,opacity:0.45}}>
                        Due {rule.nextDueDate} · {rule.dateMode === 'month-end' ? 'end of each month' : `every ${rule.intervalCount} ${rule.intervalUnit}`}
                      </div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize: FS.lg,fontWeight:700,...s.tabnum}}>{parsed ? fmt(parsed.total_amount, defCur) : ''}</div>
                      <span style={{...s.tag(ci.bg,ci.tx),marginTop:4}}>{ci.emoji} {category}</span>
                    </div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{...s.label,marginBottom:4}}>Expense text</div>
                    <input
                      value={draftText}
                      onChange={e=>setRecurringDrafts(prev=>({...prev,[rule.id]:e.target.value}))}
                      onKeyDown={e=>{if(e.key==='Enter')confirmRecurringExpense(rule);}}
                      style={{...s.input,padding:'8px 10px',fontSize:16,background:'#fff'}}
                    />
                  </div>
                  {parsed?.shares && (
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:12}}>
                      {Object.entries(parsed.shares).map(([n,a])=>(
                        <span key={n} style={{fontSize: FS.lg,...s.upper,background:'#fff',padding:'4px 8px',borderRadius:9999,...s.tabnum}}>{n}: {fmt(a,defCur)}</span>
                      ))}
                    </div>
                  )}
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>confirmRecurringExpense(rule)}
                      style={{...s.btnDark,flex:1,padding:'10px',borderRadius:14}}>
                      <Check size={14} style={{verticalAlign:'middle',marginRight:4}}/>Confirm
                    </button>
                    <button onClick={()=>dismissRecurringSuggestion(rule)}
                      style={{background:CLAY.surf2,border:'none',color:CLAY.textMid,padding:'0 14px',borderRadius:14,cursor:'pointer',boxShadow:CLAY.btn,fontFamily:MONO,fontSize:FS.lg}}>
                      Skip
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending Expenses (from webhook) */}
      <AnimatePresence>
        {pendingExpenses.length > 0 && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            style={{margin:'12px 16px 0', order:3}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,padding:'0 4px'}}>
              <span style={{fontSize: FS.lg,...s.upper,fontWeight:700,opacity:0.6}}>
                Awaiting confirmation · {pendingExpenses.length}
              </span>
            </div>
            {pendingExpenses.map(p => {
              const draft = pendingDrafts[p.id] || {};
              const category = draft.category || 'Other';
              const payer = draft.paid_by || p.paid_by || myName || names[0] || '';
              const splitType = draft.split_type || (p.split === 0 ? 'personal' : 'equal');
              const cur = p.currency || defCur;
              const ageMin = Math.max(0, Math.round((Date.now() - new Date(p.created_at).getTime()) / 60000));
              const ageLabel = ageMin < 1 ? 'just now' : ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin/60)}h ago`;
              return (
                <motion.div key={p.id} layout initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.97}}
                  style={{background:'#FEF8EE',borderRadius:20,padding:14,marginBottom:10,boxShadow:CLAY.shadow,border:'1.5px dashed #E8C878'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize: FS.lg,fontWeight:700,...s.upper,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.item}</div>
                      <div style={{fontSize: FS.lg,...s.upper,opacity:0.4}}>{ageLabel} · from bank</div>
                    </div>
                    <div style={{textAlign:'right',marginLeft:8}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}}>
                        <span style={{fontSize: FS.lg,...s.upper,fontWeight:700,background:'#f0f0ea',padding:'2px 7px',borderRadius:9999}}>
                          {CURR_FLAG[cur]||''} {cur}
                        </span>
                        <div style={{fontSize: FS.lg,fontWeight:700,...s.tabnum}}>{fmt(parseFloat(p.amount), cur)}</div>
                      </div>
                      {p.currency && p.currency !== defCur && (
                        <div style={{fontSize: FS.lg,...s.upper,opacity:0.4,marginTop:3}}>→ {fmt(rates[p.currency]&&rates[defCur]?cvt(parseFloat(p.amount),p.currency,defCur,rates):parseFloat(p.amount), defCur)}</div>
                      )}
                    </div>
                  </div>

                  <div style={{marginBottom:8}}>
                    <div style={{...s.label,marginBottom:4}}>Category</div>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {allCatNames.map(c => {
                        const meta = BASE_CATS[c] || customCats[c] || {emoji:'🏷️'};
                        return (
                          <button key={c} onClick={()=>setPendingDrafts(prev=>({...prev,[p.id]:{...prev[p.id],category:c}}))}
                            style={{...s.split(category===c),display:'inline-flex',alignItems:'center',gap:3}}>
                            <span>{meta.emoji}</span>{c}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{marginBottom:8}}>
                    <div style={{...s.label,marginBottom:4}}>Paid by</div>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {names.map(n => (
                        <button key={n} onClick={()=>setPendingDrafts(prev=>({...prev,[p.id]:{...prev[p.id],paid_by:n}}))}
                          style={s.split(payer===n)}>{n}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{marginBottom:12}}>
                    <div style={{...s.label,marginBottom:4}}>Split</div>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      <button onClick={()=>setPendingDrafts(prev=>({...prev,[p.id]:{...prev[p.id],split_type:'equal'}}))}
                        style={s.split(splitType==='equal')}>Equal</button>
                      <button onClick={()=>setPendingDrafts(prev=>({...prev,[p.id]:{...prev[p.id],split_type:'personal'}}))}
                        style={s.split(splitType==='personal')}>Personal</button>
                    </div>
                  </div>

                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>confirmPending(p,{category,paid_by:payer,split_type:splitType})}
                      style={{...s.btnDark,flex:1,padding:'10px',borderRadius:14}}>
                      <Check size={14} style={{verticalAlign:'middle',marginRight:4}}/>Confirm
                    </button>
                    <button onClick={()=>dismissPending(p.id)}
                      style={{background:CLAY.surf2,border:'none',color:CLAY.textMid,width:44,borderRadius:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:CLAY.btn}}>
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Add Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}
            style={{...s.card,margin:'12px 16px 0',border:'2px solid #222',padding:16,order:4}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <span style={{fontSize: FS.lg,...s.upper,fontWeight:700}}>Add Expense</span>
              <button onClick={()=>setShowAddForm(false)} style={{background:'none',border:'none',cursor:'pointer',opacity:0.3}}><X size={18}/></button>
            </div>
            <div style={{marginBottom:8}}><input placeholder="Item name" value={addItem} onChange={e=>setAddItem(e.target.value)} style={s.input}/></div>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <input type="number" placeholder="0.00" value={addAmount} onChange={e=>setAddAmount(e.target.value)} style={s.input}/>
              <select value={addCategory} onChange={e=>setAddCategory(e.target.value)} style={s.input}>
                {allCatNames.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <select value={addPaidBy||names[0]} onChange={e=>setAddPaidBy(e.target.value)} style={s.input}>
                {names.map(n=><option key={n} value={n}>{n} paid</option>)}
              </select>
              <input type="date" value={addDate} onChange={e=>setAddDate(e.target.value)} style={s.input}/>
            </div>

            {/* Foreign currency */}
            <div style={{fontSize: FS.lg,...s.upper,opacity:0.35,cursor:'pointer',padding:'4px 0',marginBottom:8}} onClick={()=>setShowForeign(!showForeign)}>
              {showForeign?'▾':'▸'} Foreign currency?
            </div>
            {showForeign && (
              <div style={{display:'flex',gap:8,marginBottom:8}}>
                <select value={addOrigCur} onChange={e=>{setAddOrigCur(e.target.value);if(e.target.value&&addOrigAmt)setAddAmount(cvt(parseFloat(addOrigAmt),e.target.value,defCur,rates).toFixed(2));}} style={s.input}>
                  <option value="">None</option>
                  {ALL_CUR.filter(c=>c!==defCur).map(c=><option key={c} value={c}>{CURR_FLAG[c]} {c}</option>)}
                </select>
                <input type="number" placeholder="Original amount" value={addOrigAmt}
                  onChange={e=>{setAddOrigAmt(e.target.value);if(addOrigCur&&e.target.value)setAddAmount(cvt(parseFloat(e.target.value),addOrigCur,defCur,rates).toFixed(2));}}
                  style={s.input}/>
              </div>
            )}

            {/* Split type */}
            <div style={{...s.label,marginBottom:6}}>Split type</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:12}}>
              {['equal','ratio','percent','exact','payer','headcount'].map(st=>(
                <button key={st} style={s.split(addSplitType===st)} onClick={()=>setAddSplitType(st)}>{st}</button>
              ))}
            </div>

            {/* Ratio inputs */}
            {addSplitType === 'ratio' && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize: FS.lg,opacity:0.4,...s.upper,marginBottom:6}}>Enter ratio for each person (0 = excluded)</div>
                {names.map(n => (
                  <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize: FS.lg,width:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',...s.upper}}>{n}</span>
                    <input type="number" min="0" placeholder="0" value={addProportions[n]||''} onChange={e=>setAddProportions(p=>({...p,[n]:e.target.value}))} style={{...s.input,flex:1}}/>
                    <span style={{fontSize: FS.lg,opacity:0.35,...s.upper}}>parts</span>
                  </div>
                ))}
                {addAmount > 0 && (() => {
                  const total = Object.values(addProportions).reduce((ss,v) => ss + (parseFloat(v)||0), 0);
                  if (total === 0) return null;
                  return (
                    <div style={{background:'#F0F0EA',borderRadius:12,padding:8,fontSize: FS.lg,...s.upper}}>
                      <div style={{fontWeight:700,marginBottom:4}}>Preview:</div>
                      {names.filter(n => parseFloat(addProportions[n]) > 0).map(n => (
                        <div key={n} style={{display:'flex',justifyContent:'space-between',opacity:0.6}}>
                          <span>{n} ({addProportions[n]} of {total} = {((parseFloat(addProportions[n])/total)*100).toFixed(1)}%)</span>
                          <span>{fmt((parseFloat(addProportions[n])/total) * parseFloat(addAmount), defCur)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Percent inputs */}
            {addSplitType === 'percent' && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize: FS.lg,opacity:0.4,...s.upper,marginBottom:6}}>Enter percentage (must total 100%)</div>
                {names.map(n => (
                  <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize: FS.lg,width:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',...s.upper}}>{n}</span>
                    <input type="number" min="0" max="100" placeholder="0" value={addPercentages[n]||''} onChange={e=>setAddPercentages(p=>({...p,[n]:e.target.value}))} style={{...s.input,flex:1}}/>
                    <span style={{fontSize: FS.lg,opacity:0.35}}>%</span>
                  </div>
                ))}
                {(() => {
                  const total = Object.values(addPercentages).reduce((ss,v) => ss + (parseFloat(v)||0), 0);
                  const isValid = Math.abs(total - 100) < 0.01;
                  return (
                    <div style={{fontSize: FS.lg,padding:8,borderRadius:12,background:isValid?'#f0fdf4':'#fef2f2',color:isValid?'#15803d':'#dc2626'}}>
                      Total: {total.toFixed(1)}% {isValid?'✓':`(${total < 100 ? 'need '+(100-total).toFixed(1)+'% more' : (total-100).toFixed(1)+'% over'})`}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Exact inputs */}
            {addSplitType === 'exact' && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize: FS.lg,opacity:0.4,...s.upper,marginBottom:6}}>Enter exact amount (must total {addAmount || '0'})</div>
                {names.map(n => (
                  <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize: FS.lg,width:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',...s.upper}}>{n}</span>
                    <input type="number" min="0" placeholder="0" value={addExactAmounts[n]||''} onChange={e=>setAddExactAmounts(p=>({...p,[n]:e.target.value}))} style={{...s.input,flex:1}}/>
                  </div>
                ))}
                {(() => {
                  const sum = Object.values(addExactAmounts).reduce((ss,v) => ss + (parseFloat(v)||0), 0);
                  const target = parseFloat(addAmount) || 0;
                  const diff = target - sum;
                  return <div style={{fontSize: FS.lg,padding:8,borderRadius:12,background:Math.abs(diff)<0.01?'#f0fdf4':'#fef2f2',color:Math.abs(diff)<0.01?'#15803d':'#dc2626'}}>
                    Total: {fmt(sum, defCur)} {Math.abs(diff)<0.01?'✓':`(${diff > 0 ? fmt(diff,defCur)+' remaining' : fmt(-diff,defCur)+' over'})`}
                  </div>;
                })()}
              </div>
            )}

            {addSplitType === 'payer' && (
              <div style={{fontSize: FS.lg,opacity:0.4,...s.upper,background:'#F0F0EA',borderRadius:12,padding:8,marginBottom:12}}>
                Entire amount assigned to the payer — no split.
              </div>
            )}

            {/* Headcount inputs */}
            {addSplitType === 'headcount' && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize: FS.lg,opacity:0.4,...s.upper,marginBottom:6}}>Total people (incl. those not in this list)</div>
                <input type="number" min="2" placeholder="e.g. 10" value={addHeadcount}
                  onChange={e=>setAddHeadcount(e.target.value)} style={{...s.input,marginBottom:10}}/>
                <div style={{fontSize: FS.lg,opacity:0.4,...s.upper,marginBottom:6}}>In-app members to split with</div>
                {names.map(n => (
                  <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <input type="checkbox" checked={addHeadcountMembers[n] !== false}
                      onChange={e=>setAddHeadcountMembers(p=>({...p,[n]:e.target.checked}))}
                      style={{width:14,height:14,cursor:'pointer'}}/>
                    <span style={{fontSize: FS.lg,...s.upper}}>{n}</span>
                  </div>
                ))}
                {addAmount > 0 && parseInt(addHeadcount) >= 2 && (() => {
                  const hc = parseInt(addHeadcount);
                  const bill = parseFloat(addAmount);
                  const perPerson = bill / hc;
                  const selected = names.filter(n => addHeadcountMembers[n] !== false);
                  const tracked = perPerson * selected.length;
                  return (
                    <div style={{background:'#F0F0EA',borderRadius:12,padding:8,fontSize: FS.lg,...s.upper,marginTop:6}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,marginBottom:6}}>
                        <span>{fmt(bill,defCur)} ÷ {hc} people</span>
                        <span>{fmt(perPerson,defCur)}/person</span>
                      </div>
                      {selected.map(n=>(
                        <div key={n} style={{display:'flex',justifyContent:'space-between',opacity:0.6,marginBottom:2}}>
                          <span>{n}</span><span>{fmt(perPerson,defCur)}</span>
                        </div>
                      ))}
                      <div style={{borderTop:'1px solid #d4d4cc',marginTop:6,paddingTop:6,display:'flex',justifyContent:'space-between',opacity:0.4}}>
                        <span>{hc - selected.length} external people</span>
                        <span>{fmt(bill - tracked,defCur)} collected outside</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontWeight:700}}>
                        <span>Tracking in-app</span><span>{fmt(tracked,defCur)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <button style={s.btnDark} onClick={addManualExpense}>Add Expense</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Input */}
      <div style={{background:CLAY.surface,borderRadius:20,margin:'12px 16px 0',padding:0,overflow:'hidden',boxShadow:CLAY.shadow,order:1}}>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px'}}>
          <input ref={inputRef} placeholder="Describe an expense…" value={inputText}
            onChange={e=>{setInputText(e.target.value);setPreviewCatOverride(null);}} onFocus={()=>setInputFocused(true)}
            onKeyDown={e=>{if(e.key==='Enter'&&parsedPreview)addExpense();}}
            style={{flex:1,fontSize:16,outline:'none',background:'transparent',border:'none',fontFamily:MONO,color:CLAY.text,letterSpacing:'0.02em'}}/>
          {inputText && <button onClick={()=>{setInputText('');setInputFocused(false);setPreviewCatOverride(null);}} style={{background:'none',border:'none',cursor:'pointer',opacity:0.3,color:CLAY.text}}><X size={16}/></button>}
          {parsedPreview && <button onClick={addExpense} style={{background:CLAY.text,color:CLAY.surface,border:'none',width:34,height:34,borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'4px 4px 12px rgba(44,36,32,0.32)',flexShrink:0}}><Send size={14}/></button>}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,padding:'0 12px 12px'}}>
          {[
            {id:'manual',label:'Manual',icon:Plus,onClick:()=>{setShowAddForm(true);setAddPaidBy(myName);setExpenseTool(null);}},
            {id:'recurring',label:'Recurring',icon:RefreshCw,onClick:toggleRecurringTool},
            {id:'search',label:'Search',icon:Search,onClick:()=>{ if (!expenseDetailsLoaded) loadExpenseDetails(); setExpenseTool(v=>v==='search'?null:'search'); }},
          ].map(tool => {
            const active = expenseTool === tool.id || (tool.id === 'manual' && showAddForm);
            const Icon = tool.icon;
            return (
              <button key={tool.id} onClick={tool.onClick}
                style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:'8px 6px',border:'none',borderRadius:12,cursor:'pointer',fontFamily:MONO,fontSize:FS.lg,fontWeight:600,background:active?CLAY.text:CLAY.surf2,color:active?CLAY.surface:CLAY.textMid,boxShadow:active?'3px 3px 9px rgba(44,36,32,0.24)':CLAY.btn}}>
                <Icon size={13}/>
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>
        <AnimatePresence>
          {inputFocused && parsedPreview && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} style={{overflow:'hidden'}}>
              {(() => {
                const effectiveCat = previewCatOverride || parsedPreview.category;
                const ci = catInfo(effectiveCat);
                return (
                  <div style={{borderTop:'1px solid #eee',padding:'12px 16px',fontSize: FS.lg}}>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                      <span style={{fontSize: FS.lg,fontWeight:700,...s.upper}}>{parsedPreview.item}</span>
                      <select value={effectiveCat} onChange={e=>setPreviewCatOverride(e.target.value)}
                        style={{fontSize: FS.lg,fontFamily:MONO,fontWeight:600,
                          background:ci.bg,color:ci.tx,border:'none',borderRadius:9999,padding:'3px 8px',cursor:'pointer',outline:'none'}}>
                        {allCatNames.map(c=>{const ci2=catInfo(c);return <option key={c} value={c}>{ci2.emoji} {c}</option>;})}
                      </select>
                    </div>
                    <div style={{fontSize:18,fontWeight:700,...s.tabnum,marginTop:4}}>{fmt(parsedPreview.total_amount, defCur)}</div>
                    {parsedPreview.original_currency && (
                      <span style={{...s.tag('#fef3c7','#92400e'),marginTop:4}}>
                        {CURR_FLAG[parsedPreview.original_currency]||''} {fmt(parsedPreview.original_amount, parsedPreview.original_currency)}
                      </span>
                    )}
                    <div style={{opacity:0.35,marginTop:4,...s.upper}}>Paid by <strong>{parsedPreview.paid_by}</strong> • {parsedPreview.split_type}</div>
                    {Object.keys(parsedPreview.shares).length > 0 && (
                      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
                        {Object.entries(parsedPreview.shares).map(([n,a])=>(
                          <span key={n} style={{fontSize: FS.lg,...s.upper,background:'#F0F0EA',padding:'4px 8px',borderRadius:9999,...s.tabnum}}>{n}: {fmt(a,defCur)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {expenseTool && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} style={{overflow:'hidden',borderTop:`1px solid ${CLAY.surf2}`}}>
              {expenseTool === 'search' && (
                <div style={{padding:'12px 14px',position:'relative'}}>
                  <Search size={14} style={{position:'absolute',left:28,top:'50%',transform:'translateY(-50%)',color:CLAY.textLt}}/>
                  <input autoFocus placeholder="Search expenses…" value={search} onChange={e=>setSearch(e.target.value)}
                    style={{...s.input,paddingLeft:36,borderRadius:14,background:CLAY.surf2,boxShadow:CLAY.inset}}/>
                  {search && (
                    <button onClick={()=>setSearch('')}
                      style={{position:'absolute',right:28,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:CLAY.textLt,display:'flex',alignItems:'center'}}>
                      <X size={14}/>
                    </button>
                  )}
                </div>
              )}
              {expenseTool === 'recurring' && (
                <div style={{padding:'10px 12px 12px',display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                    <span style={{fontSize:FS.lg,fontWeight:700,color:CLAY.textMid}}>Recurring expense settings</span>
                    <span style={{fontSize:FS.lg,opacity:0.35}}>{normalizedRecurringTemplates.length} saved</span>
                  </div>
                  <div style={{display:'grid',gap:8,background:'#fff',borderRadius:12,padding:'10px',boxShadow:CLAY.inset}}>
                    <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.7}}>
                      New recurring expense
                      <input
                        value={newRecurringText}
                        onChange={e=>setNewRecurringText(e.target.value)}
                        placeholder="e.g. Rent 550 me"
                        style={{...s.input,padding:'8px 10px',fontSize:16,background:CLAY.surf2}}
                      />
                    </label>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                      <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.7}}>
                        Every
                        <input
                          type="number"
                          min="1"
                          value={newRecurringIntervalCount}
                          onChange={e=>setNewRecurringIntervalCount(clampRecurringInterval(e.target.value))}
                          style={{...s.input,padding:'8px 10px',fontSize:16,background:CLAY.surf2}}
                        />
                      </label>
                      <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.7}}>
                        Unit
                        <select value={newRecurringIntervalUnit} onChange={e=>setNewRecurringIntervalUnit(e.target.value)}
                          style={{...s.input,padding:'8px 10px',fontSize:16,background:CLAY.surf2}}>
                          <option value="days">Days</option>
                          <option value="weeks">Weeks</option>
                          <option value="months">Months</option>
                        </select>
                      </label>
                      <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.7}}>
                        Next due
                        <input type="date" value={newRecurringNextDueDate}
                          onChange={e=>setNewRecurringNextDueDate(e.target.value || today())}
                          style={{...s.input,padding:'8px 10px',fontSize:16,background:CLAY.surf2}}/>
                      </label>
                      <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.7}}>
                        Due mode
                        <select value={newRecurringDateMode} onChange={e=>{
                          const mode = e.target.value;
                          setNewRecurringDateMode(mode);
                          if (mode === 'month-end') {
                            setNewRecurringIntervalCount(1);
                            setNewRecurringIntervalUnit('months');
                            setNewRecurringNextDueDate(endOfMonthFor(newRecurringNextDueDate || today()));
                          }
                        }}
                          style={{...s.input,padding:'8px 10px',fontSize:16,background:CLAY.surf2}}>
                          <option value="date">Selected date</option>
                          <option value="month-end">End of each month</option>
                        </select>
                      </label>
                      <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.7}}>
                        Category
                        <select value={newRecurringCategory} onChange={e=>setNewRecurringCategory(e.target.value)}
                          style={{...s.input,padding:'8px 10px',fontSize:16,background:CLAY.surf2}}>
                          <option value="">Auto</option>
                          {allCatNames.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                    </div>
                    <button onClick={saveManualRecurringTemplate} style={{...s.btnDark,padding:'10px 12px',borderRadius:14}}>
                      Save recurring expense
                    </button>
                  </div>
              {normalizedRecurringTemplates.map(t => {
                return (
                  <div key={t.id} style={{display:'grid',gap:8,background:CLAY.surf2,borderRadius:12,padding:'10px'}}>
                    <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.6}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6}}>
                        <span>Expense text</span>
                        <button onClick={()=>deleteTemplate(t)}
                          style={{background:'none',border:'none',cursor:'pointer',padding:'2px 4px',color:CLAY.textLt,display:'flex',alignItems:'center',flexShrink:0}}>
                          <X size={12}/>
                        </button>
                      </div>
                      <input
                        defaultValue={t.text}
                        onBlur={e=>{
                          const text = e.target.value.trim();
                          if (!text) { e.target.value = t.text; return; }
                          updateRecurringRule(t.id,{text});
                        }}
                        onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}
                        style={{...s.input,padding:'8px 10px',fontSize:16,background:'#fff'}}
                      />
                    </label>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                      <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.6}}>
                        Every
                        <input type="number" min="1" value={t.intervalCount}
                          onChange={e=>updateRecurringSchedule(t,{intervalCount:e.target.value})}
                          style={{...s.input,padding:'8px 10px',fontSize:16,background:'#fff'}}/>
                      </label>
                      <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.6}}>
                        Unit
                        <select value={t.intervalUnit} onChange={e=>updateRecurringSchedule(t,{intervalUnit:e.target.value})}
                          style={{...s.input,padding:'8px 10px',fontSize:16,background:'#fff'}}>
                          <option value="days">Days</option>
                          <option value="weeks">Weeks</option>
                          <option value="months">Months</option>
                        </select>
                      </label>
                      <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.6}}>
                        Next due
                        <input type="date" value={t.nextDueDate || today()}
                          onChange={e=>updateRecurringRule(t.id,{nextDueDate:t.dateMode === 'month-end' ? endOfMonthFor(e.target.value || today()) : e.target.value || today()})}
                          style={{...s.input,padding:'8px 10px',fontSize:16,background:'#fff'}}/>
                      </label>
                      <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.6}}>
                        Due mode
                        <select value={t.dateMode || 'date'} onChange={e=>updateRecurringSchedule(t,{dateMode:e.target.value,intervalUnit:e.target.value === 'month-end' ? 'months' : t.intervalUnit,intervalCount:e.target.value === 'month-end' ? 1 : t.intervalCount})}
                          style={{...s.input,padding:'8px 10px',fontSize:16,background:'#fff'}}>
                          <option value="date">Selected date</option>
                          <option value="month-end">End of each month</option>
                        </select>
                      </label>
                      <label style={{display:'grid',gap:4,fontSize: FS.lg,...s.upper,opacity:0.6}}>
                        Category
                        <select value={t.category || ''} onChange={e=>updateRecurringRule(t.id,{category:e.target.value || null})}
                          style={{...s.input,padding:'8px 10px',fontSize:16,background:'#fff'}}>
                          <option value="">Auto</option>
                          {allCatNames.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                    </div>
                    <div style={{fontSize: FS.lg,...s.upper,opacity:0.4}}>
                      {t.nextDueDate <= today() ? 'Ready for confirmation now' : `Will suggest on ${t.nextDueDate}`}
                    </div>
                  </div>
                );
              })}
              {normalizedRecurringTemplates.length === 0 && (
                <div style={{fontSize: FS.lg,...s.upper,opacity:0.35,padding:'4px 2px'}}>
                  No recurring expenses yet. Add one above and it will suggest itself when due.
                </div>
              )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!expenseDetailsLoaded && (
        <div style={{margin:'12px 16px 0',order:5}}>
          <button
            onClick={()=>loadExpenseDetails()}
            disabled={expenseDetailsLoading}
            style={{...s.btnOutline,border:'none',background:CLAY.surface,boxShadow:CLAY.shadow,padding:'14px 16px',textTransform:'none',letterSpacing:'0.02em',fontSize:FS.lg,color:CLAY.textMid}}
          >
            {expenseDetailsLoading ? 'Loading balances & history...' : 'Load balances & history'}
          </button>
        </div>
      )}

      {/* Expense List */}
      {expenseDetailsLoaded && (
      <div style={{padding:'12px 16px',order:5}}>
        {(() => {
          const curMonth = new Date().toISOString().slice(0,7);
          // Build month groups
          const groupMap = [];
          const seen = {};
          filtered.forEach(exp => {
            const m = exp.date?.slice(0,7) || '';
            if (!seen[m]) { seen[m] = true; groupMap.push({m, exps:[]}); }
            groupMap[groupMap.length-1].exps.push(exp);
          });
          return groupMap.map(({m, exps: groupExps}) => {
            const [y, mo] = m.split('-');
            const label = m ? new Date(parseInt(y), parseInt(mo)-1).toLocaleString('en-AU', {month:'long', year:'numeric'}) : 'Unknown';
            const isCollapsed = !search.trim() && collapsedMonths.has(m) || (!search.trim() && m !== curMonth && !collapsedMonths.has('__expanded__'+m));
            const monthTotal = groupExps.reduce((s,e) => s + (e.total_amount||0), 0);
            const toggleMonth = () => setCollapsedMonths(prev => {
              const next = new Set(prev);
              if (isCollapsed) { next.delete(m); next.add('__expanded__'+m); }
              else { next.add(m); next.delete('__expanded__'+m); }
              return next;
            });
            return (
              <div key={m}>
                <button onClick={toggleMonth} style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',background:'none',border:'none',cursor:'pointer',padding:'16px 4px 8px',fontFamily:MONO}}>
                  <span style={{fontSize: FS.lg,...s.upper,fontWeight:600,color:CLAY.textLt,letterSpacing:'0.1em'}}>{label}</span>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    {isCollapsed && <span style={{fontSize: FS.lg,...s.tabnum,fontWeight:600,color:CLAY.textMid}}>{fmt(monthTotal,defCur)}</span>}
                    <span style={{fontSize: FS.lg,color:CLAY.textLt}}>{isCollapsed ? '▸' : '▾'}</span>
                  </div>
                </button>
                <AnimatePresence>
                  {!isCollapsed && groupExps.map(exp => {
                    const exp2 = exp;
            const ci = catInfo(exp2.category);
            const isEditing = editingId === exp2.id;
            return (
              <motion.div key={exp2.id} layout initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,x:-100}}
                style={{background:CLAY.surface,borderRadius:20,marginBottom:10,padding:0,overflow:'hidden',boxShadow:CLAY.shadowSm}}>
                {!isEditing ? (
                  <div style={{padding:'14px 16px'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:12,flex:1,minWidth:0}}>
                        <span style={{width:40,height:40,borderRadius:'50%',background:ci.bg||CLAY.surf2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0,boxShadow:CLAY.btn}}>{ci.emoji}</span>
                        <div style={{minWidth:0,paddingTop:10}}>
                          <div style={{fontSize: FS.lg,fontWeight:500,color:CLAY.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{toTitleCase(exp.item)}</div>
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0,paddingTop:10}}>
                        <div style={{fontSize: FS.lg,fontWeight:600,...s.tabnum,color:CLAY.text}}>{fmt(exp.total_amount, defCur)}</div>
                        {exp.split_type === 'headcount' && (
                          <div style={{fontSize: FS.lg,...s.upper,color:CLAY.textLt,marginTop:1}}>
                            {fmt(Object.values(exp.shares||{}).reduce((a,b)=>a+b,0),defCur)} tracked
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Pills row + edit/delete inline */}
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:8,alignItems:'center'}}>
                      <span style={s.tag(ci.bg,ci.tx)}>{exp.category}</span>
                      <span style={s.tag(CLAY.surf2,CLAY.textMid)}>{exp.date}</span>
                      <span style={{...s.tag(CLAY.surf2,CLAY.textMid),...personTagStyle(exp.paid_by,names)}}>{exp.paid_by} paid</span>
                      {exp.original_currency && <span style={s.tag(CLAY.sand,CLAY.sandDk)}>{CURR_FLAG[exp.original_currency]||''} {fmt(exp.original_amount, exp.original_currency)}</span>}
                      {exp.split_type && exp.split_type !== 'settlement' && exp.split_type !== 'headcount' && exp.split_type !== 'equal' && (
                        <span style={s.tag(CLAY.surf2,CLAY.textLt)}>{exp.split_type === 'exact' ? 'custom' : exp.split_type}</span>
                      )}
                      {exp.split_type === 'headcount' && exp.headcount && (
                        <span style={s.tag(CLAY.blue,CLAY.blueDk)}>{exp.headcount} ppl · {fmt(exp.total_amount / exp.headcount, defCur)}/ea</span>
                      )}
                      {exp.shares && Object.keys(exp.shares).length > 0 && exp.split_type !== 'personal' && exp.split_type !== 'settlement' && (
                        Object.entries(exp.shares).map(([n,a])=>(
                          <span key={n} style={{fontSize: FS.lg,padding:'4px 10px',borderRadius:9999,...s.tabnum,boxShadow:CLAY.btn,...personTagStyle(n,names)}}>{n}: {fmt(a,defCur)}</span>
                        ))
                      )}
                      <button onClick={()=>startEdit(exp)} style={{width:28,height:28,borderRadius:8,border:'none',background:CLAY.surf2,cursor:'pointer',opacity:0.4,display:'flex',alignItems:'center',justifyContent:'center',color:CLAY.textMid,flexShrink:0}}
                        onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.4'}><Pencil size={12}/></button>
                      <button onClick={()=>setConfirmDelete(exp.id)} style={{width:28,height:28,borderRadius:8,border:'none',background:CLAY.surf2,cursor:'pointer',opacity:0.4,display:'flex',alignItems:'center',justifyContent:'center',color:CLAY.textMid,flexShrink:0}}
                        onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.4'}><Trash2 size={12}/></button>
                    </div>
                  </div>
                ) : (
                  <div style={{padding:'14px 16px',background:'#fafaf8'}}>
                    <div style={{marginBottom:8}}><input value={editForm.item} onChange={e=>setEditForm({...editForm,item:e.target.value})} style={s.input}/></div>
                    {/* Amount + Currency */}
                    <div style={{display:'flex',gap:8,marginBottom:8}}>
                      <input type="number"
                        value={editForm.original_currency ? editForm.original_amount : editForm.total_amount}
                        onChange={e => {
                          const val = e.target.value;
                          if (editForm.original_currency) {
                            const rate = parseFloat(editForm.exchange_rate) || 0;
                            setEditForm({...editForm, original_amount: val, total_amount: parseFloat(((parseFloat(val)||0) * rate).toFixed(2))});
                          } else {
                            setEditForm({...editForm, total_amount: val});
                          }
                        }}
                        style={s.input} placeholder="Amount"/>
                      <select
                        value={editForm.original_currency || defCur}
                        onChange={e => {
                          const cur = e.target.value;
                          if (cur === defCur) {
                            setEditForm(f => ({...f, original_currency: '', original_amount: '', exchange_rate: 1}));
                          } else {
                            const rate = rates[cur] ? parseFloat((1 / rates[cur]).toFixed(6)) : 1;
                            if (!editForm.original_currency) {
                              const origAmt = parseFloat(editForm.total_amount) || 0;
                              const newTotal = parseFloat((origAmt * rate).toFixed(2));
                              setEditForm(f => ({...f, original_currency: cur, original_amount: origAmt, exchange_rate: rate, total_amount: newTotal}));
                            } else {
                              setEditForm(f => {
                                const origAmt = parseFloat(f.original_amount) || 0;
                                return {...f, original_currency: cur, exchange_rate: rate, total_amount: parseFloat((origAmt * rate).toFixed(2))};
                              });
                            }
                          }
                        }}
                        style={{...s.input, maxWidth: 120}}>
                        {ALL_CUR.map(c => <option key={c} value={c}>{CURR_FLAG[c]||''} {c}</option>)}
                      </select>
                    </div>

                    {/* Exchange rate row — only for foreign currency */}
                    {editForm.original_currency && (
                      <div style={{background:'#fef9e7',border:'1px solid #f0e6c0',borderRadius:12,padding:'8px 12px',marginBottom:8,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <span style={{fontSize: FS.lg,...s.upper,opacity:0.5,whiteSpace:'nowrap'}}>1 {editForm.original_currency} =</span>
                        <input type="number" step="0.000001"
                          value={editForm.exchange_rate}
                          onChange={e => {
                            const rate = e.target.value;
                            const origAmt = parseFloat(editForm.original_amount) || 0;
                            setEditForm({...editForm, exchange_rate: rate, total_amount: parseFloat((origAmt * (parseFloat(rate)||0)).toFixed(2))});
                          }}
                          style={{...s.input,width:100,background:'#fff',padding:'6px 10px',flex:'0 0 auto'}}/>
                        <span style={{fontSize: FS.lg,...s.upper,opacity:0.5}}>{defCur}</span>
                        <span style={{fontSize: FS.lg,fontWeight:700,...s.tabnum,marginLeft:'auto'}}>≈ {fmt(parseFloat(editForm.total_amount)||0, defCur)}</span>
                      </div>
                    )}

                    {/* Category */}
                    <div style={{marginBottom:8}}>
                      <select value={editForm.category} onChange={e=>setEditForm({...editForm,category:e.target.value})} style={s.input}>
                        {allCatNames.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div style={{display:'flex',gap:8,marginBottom:8}}>
                      <select value={editForm.paid_by} onChange={e=>setEditForm({...editForm,paid_by:e.target.value})} style={s.input}>
                        {names.map(n=><option key={n} value={n}>{n}</option>)}
                      </select>
                      <input type="date" value={editForm.date} onChange={e=>setEditForm({...editForm,date:e.target.value})} style={s.input}/>
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                      {['equal','ratio','percent','personal','full','custom','headcount'].map(ss=>(
                        <button key={ss} style={s.split(editForm.split_type===ss)} onClick={()=>{
                          const total = parseFloat(editForm.total_amount) || 0;
                          let shares = {};
                          if (ss==='equal') names.forEach(n=>{shares[n]=total/names.length;});
                          else if (ss==='personal') shares = {[editForm.paid_by]:total};
                          else if (ss==='full') shares = {[names[0]]:total};
                          else if (ss==='headcount') names.forEach(n=>{shares[n]=1;});
                          else shares = {...editForm.shares};
                          setEditForm({...editForm,split_type:ss,shares});
                        }}>{ss}</button>
                      ))}
                    </div>
                    {editForm.split_type==='ratio' && (
                      <div style={{marginBottom:8}}>
                        {names.map(n=>(
                          <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <span style={{fontSize: FS.lg,width:50,...s.upper,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n}</span>
                            <input type="number" min="0" placeholder="0" value={editForm.shares?.[n]||''} onChange={e=>{
                              const ns2 = {...editForm.shares, [n]:e.target.value};
                              const total = parseFloat(editForm.total_amount)||0;
                              const sum = Object.values(ns2).reduce((ss2,v)=>ss2+(parseFloat(v)||0),0);
                              if (sum > 0) {
                                const computed = {};
                                names.forEach(nm=>{const r=parseFloat(ns2[nm])||0; if(r>0) computed[nm]=Math.round((r/sum)*total*100)/100;});
                                setEditForm({...editForm,shares:ns2,_computedShares:computed});
                              } else setEditForm({...editForm,shares:ns2});
                            }} style={{...s.input,flex:1,padding:'8px 10px'}}/>
                            <span style={{fontSize: FS.lg,opacity:0.35,...s.upper}}>parts</span>
                          </div>
                        ))}
                        {editForm._computedShares && (
                          <div style={{background:'#F0F0EA',borderRadius:8,padding:6,fontSize: FS.lg,opacity:0.6}}>
                            {Object.entries(editForm._computedShares).map(([n,a])=><span key={n} style={{marginRight:8}}>{n}: {fmt(a,defCur)}</span>)}
                          </div>
                        )}
                      </div>
                    )}
                    {editForm.split_type==='percent' && (
                      <div style={{marginBottom:8}}>
                        {names.map(n=>(
                          <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <span style={{fontSize: FS.lg,width:50,...s.upper,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n}</span>
                            <input type="number" min="0" max="100" placeholder="0" value={editForm.shares?.[n]||''} onChange={e=>setEditForm({...editForm,shares:{...editForm.shares,[n]:e.target.value}})} style={{...s.input,flex:1,padding:'8px 10px'}}/>
                            <span style={{fontSize: FS.lg,opacity:0.35}}>%</span>
                          </div>
                        ))}
                        {(()=>{const sum=Object.values(editForm.shares||{}).reduce((ss2,v)=>ss2+(parseFloat(v)||0),0);return <div style={{fontSize: FS.lg,padding:4,color:Math.abs(sum-100)<0.01?'#15803d':'#dc2626'}}>Total: {sum.toFixed(1)}%</div>;})()}
                      </div>
                    )}
                    {(editForm.split_type==='custom'||editForm.split_type==='full') && (
                      <div style={{marginBottom:8}}>
                        {names.map(n=>(
                          <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <span style={{fontSize: FS.lg,width:50,...s.upper,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n}</span>
                            <input type="number" value={editForm.shares?.[n]||0} onChange={e=>setEditForm({...editForm,shares:{...editForm.shares,[n]:parseFloat(e.target.value)||0}})} style={{...s.input,flex:1,padding:'8px 10px'}}/>
                          </div>
                        ))}
                      </div>
                    )}
                    {editForm.split_type==='headcount' && (
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize: FS.lg,opacity:0.4,...s.upper,marginBottom:4}}>Total people (incl. external)</div>
                        <input type="number" min="2" placeholder="e.g. 10" value={editForm.headcount||''}
                          onChange={e=>setEditForm({...editForm,headcount:e.target.value})}
                          style={{...s.input,marginBottom:8}}/>
                        <div style={{fontSize: FS.lg,opacity:0.4,...s.upper,marginBottom:4}}>In-app members</div>
                        {names.map(n=>(
                          <div key={n} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <input type="checkbox" checked={!!editForm.shares?.[n]}
                              onChange={e=>{
                                const ns2 = {...editForm.shares};
                                if (e.target.checked) ns2[n] = 1; else delete ns2[n];
                                setEditForm({...editForm,shares:ns2});
                              }} style={{width:14,height:14,cursor:'pointer'}}/>
                            <span style={{fontSize: FS.lg,...s.upper}}>{n}</span>
                            {!!editForm.shares?.[n] && parseInt(editForm.headcount) >= 2 && (
                              <span style={{fontSize: FS.lg,opacity:0.4,...s.tabnum,marginLeft:'auto'}}>
                                {fmt((parseFloat(editForm.total_amount)||0)/parseInt(editForm.headcount),defCur)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                      <button style={s.sm(false)} onClick={()=>setEditingId(null)}>Cancel</button>
                      <button style={s.sm(true)} onClick={saveEdit}>Save</button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
                </AnimatePresence>
              </div>
            );
          });
        })()}
        {filtered.length === 0 && (
          <div style={{textAlign:'center',padding:'60px 16px',fontSize: FS.lg,...s.upper,opacity:0.2}}>
            {expenses.length === 0 ? 'No expenses yet. Add one above!' : 'No results found.'}
          </div>
        )}
      </div>
      )}
    </div>
  );


  /* ── Webhook Token ── */
  const generateWebhookToken = async () => {
    if (!currentList || !user) return;
    setWebhookLoading(true);
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2,'0')).join('');
    const { error } = await sb.from('webhook_tokens').upsert(
      { user_id: user.id, list_id: currentList.id, secret, display_name: myName },
      { onConflict: 'user_id,list_id' }
    );
    if (!error) { setWebhookToken(secret); showToast('Webhook token generated'); }
    setWebhookLoading(false);
  };

  const revokeWebhookToken = async () => {
    if (!currentList || !user) return;
    await sb.from('webhook_tokens').delete().eq('user_id', user.id).eq('list_id', currentList.id);
    setWebhookToken(null);
    showToast('Token revoked');
  };


  /* ════════════════════════════════════════════════════════════
     MAIN LAYOUT
     ════════════════════════════════════════════════════════════ */

  const navItems = effectiveNavConfig
    .filter(t => t.nav && t.id !== 'stats')
    .flatMap(t => (t.id === 'investing' && t.groups)
      ? t.groups.flatMap(group => group.items)
      : [t]
    )
    .filter(t => t.action);

  const isNavItemActive = (t) => {
    if (t.id === 'investing') {
      return showInvestingPicker || t.groups?.some(group =>
        group.items.some(item => isNavItemActive(item))
      );
    }
    if (!t.action) return false;
    if (t.id === 'sec_securities') {
      return tab === 'investing'
        && investingView === 'securities'
        && ['table', 'pnl', 'watchlist', 'statistics', 'transactions'].includes(investingSecuritiesView);
    }
    const actionTab = t.action.tab === 'stats' ? 'home' : t.action.tab;
    if (actionTab !== tab) return false;
    if (actionTab === 'home') {
      const actionHomeView = t.action.homeView || (t.action.tab === 'stats' ? 'stats' : 'expenses');
      if (actionHomeView !== homeView) return false;
    }
    if (t.action.investingView && t.action.investingView !== investingView) return false;
    if (t.action.portfolioView && t.action.portfolioView !== investingPortfolioView) return false;
    if (t.action.securitiesView && t.action.securitiesView !== investingSecuritiesView) return false;
    return true;
  };

  const NavButton = ({ t }) => {
    const active = isNavItemActive(t);
    return (
      <button
        onClick={() => navigate(t.action)}
        style={isWide ? {
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', marginBottom: 2, width: '100%',
          border: 'none', cursor: 'pointer', fontFamily: MONO,
          transition: 'all 0.15s', color: CLAY.text, textAlign: 'left',
          borderRadius: 14, background: active ? CLAY.surf2 : 'transparent',
          boxShadow: active ? CLAY.inset : 'none', opacity: active ? 1 : 0.45,
          fontSize: FS.lg,
        } : {
          flex: '0 0 76px', display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '8px 6px 6px', border: 'none', cursor: 'pointer', fontFamily: MONO,
          transition: 'all 0.2s', color: CLAY.text, borderRadius: 14,
          background: active ? CLAY.surf2 : 'transparent',
          boxShadow: active ? CLAY.inset : 'none', opacity: active ? 1 : 0.4,
        }}
      >
        <span style={{ fontSize: isWide ? 18 : 20 }}>{t.emoji}</span>
        <span style={isWide
          ? { fontWeight: active ? FW.semibold : FW.normal }
          : { fontSize: FS.compact, fontWeight: 600, marginTop: 3 }
        }>{t.label}</span>
      </button>
    );
  };

  const tabContent = (
    <>
      {tab === 'home' && (homeView === 'stats' ? <HomeStatsView /> : HomeTab())}
      <React.Suspense fallback={<div style={{padding:'60px 16px',textAlign:'center',fontFamily:MONO,color:CLAY.textLt,fontSize:FS.lg}}>Loading…</div>}>
        {tab === 'stats' && <StatsTabLazy {...statsProps} />}
        {tab === 'settings' && <SettingsTabLazy user={user} currentList={currentList} setCurrentList={setCurrentList} members={members} confirmDeleteList={confirmDeleteList} setConfirmDeleteList={setConfirmDeleteList} deleteList={deleteList} logout={logout} showToast={showToast} defCur={defCur} ratesDate={ratesDate} rates={rates} fetchRates={fetchRates} customCats={customCats} setCustomCats={setCustomCats} addCustomCat={addCustomCat} deleteCustomCat={deleteCustomCat} newCatName={newCatName} setNewCatName={setNewCatName} catSuggestions={catSuggestions} setCatSuggestions={setCatSuggestions} overrideDrafts={overrideDrafts} setOverrideDrafts={setOverrideDrafts} suggestionExamples={suggestionExamples} renameCategorySuggestion={renameCategorySuggestion} updateCategorySuggestion={updateCategorySuggestion} allCatNames={allCatNames} acceptCategorySuggestion={acceptCategorySuggestion} dismissCategorySuggestion={dismissCategorySuggestion} catOverrides={catOverrides} setCatOverrides={setCatOverrides} overrideExamples={overrideExamples} renameCatOverride={renameCatOverride} updateCatOverride={updateCatOverride} deleteCatOverride={deleteCatOverride} saveSetting={saveSetting} pushSupported={pushSupported} pushPermission={pushPermission} pushSubscribed={pushSubscribed} pushLoading={pushLoading} pushSubscribe={pushSubscribe} pushUnsubscribe={pushUnsubscribe} sendNotification={sendNotification} notificationPrefs={notificationPrefs} updateNotificationPrefs={updateNotificationPrefs} webhookToken={webhookToken} webhookLoading={webhookLoading} generateWebhookToken={generateWebhookToken} revokeWebhookToken={revokeWebhookToken} editName={editName} setEditName={setEditName} nameEditing={nameEditing} setNameEditing={setNameEditing} updateMyName={updateMyName} can={can} setTab={setTab} txns={txns} expenses={expenses} setExpenses={setExpenses} onImported={() => currentList && selectList(currentList)} />}
        {can('investing') && tab === 'investing' && <InvestingTabLazy user={user} showToast={showToast} sendNotification={sendNotification} rates={rates} txns={txns} defCur={defCur} expenses={expenses} currentList={currentList} investingView={investingView} setInvestingView={setInvestingView} investingPortfolioView={investingPortfolioView} setInvestingPortfolioView={setInvestingPortfolioView} investingSecuritiesView={investingSecuritiesView} setInvestingSecuritiesView={setInvestingSecuritiesView} pushSupported={pushSupported} pushSubscribed={pushSubscribed} pushLoading={pushLoading} pushSubscribe={pushSubscribe} pushUnsubscribe={pushUnsubscribe} />}
        {tab === 'shopper' && <ShopperTab />}
        {tab === 'tasks' && <TasksTabLazy user={user} sb={sb} showToast={showToast} focusRequest={taskInputFocusRequest} />}
        {tab === 'agenda' && <GoogleAgendaTabLazy user={user} showToast={showToast} />}
        {can('travel') && tab === 'travel' && <TravelTabLazy user={user} sb={sb} showToast={showToast} />}
        {tab === 'mail' && <MailTabLazy user={user} defCur={defCur} showToast={showToast} addExpenseCandidate={addMailCandidateExpense} />}
      </React.Suspense>
      {tab !== 'investing' && tab !== 'shopper' && tab !== 'tasks' && tab !== 'agenda' && tab !== 'travel' && tab !== 'mail' && (
        <div style={{
          textAlign: 'center',
          padding: isWide ? '16px 16px 40px' : '16px 16px 80px',
          fontSize: FS.lg, letterSpacing: '0.08em', opacity: 0.2,
          fontFamily: MONO, lineHeight: 1.8,
        }}>
          <div>© {new Date().getFullYear()} By Roland Chu. All rights reserved.</div>
          <div>Last updated: {typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '—'} {typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''}</div>
        </div>
      )}
    </>
  );

  const investingPicker = showInvestingPicker && (
    <React.Suspense fallback={null}>
      <InvestingPickerLazy
        config={effectiveNavConfig}
        currentTab={tab}
        currentInvestingView={investingView}
        currentPortfolioView={investingPortfolioView}
        currentSecuritiesView={investingSecuritiesView}
        onNavigate={navigate}
        onClose={() => setShowInvestingPicker(false)}
        onOpenLayoutEditor={() => { setShowInvestingPicker(false); setShowLayoutEditor(true); }}
        isWide={isWide}
      />
    </React.Suspense>
  );

  const layoutEditor = showLayoutEditor && (
    <React.Suspense fallback={null}>
      <NavLayoutEditorLazy
        pool={navPool}
        layout={normalizeNavLayout(navLayout, buildDefaultLayout(can), navPool)}
        onSave={saveNavLayout}
        onClose={() => setShowLayoutEditor(false)}
        isWide={isWide}
      />
    </React.Suspense>
  );

  if (isWide) {
    return (
      <div className="se" style={{ display: 'flex', minHeight: '100vh', background: CLAY.bg }}>
        <style>{THEME_CSS}</style>
        {ToastEl}
        {ConfirmModal}

        {/* ── Sidebar ── */}
        <div style={{
          width: SIDEBAR_W, flexShrink: 0,
          position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh',
          background: CLAY.surface,
          borderRight: '1px solid rgba(188,165,144,0.13)',
          boxShadow: '1px 0 16px rgba(0,0,0,0.04)',
          display: 'flex', flexDirection: 'column',
          fontFamily: MONO, padding: '20px 12px',
          zIndex: 40,
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '4px 6px 20px',
            borderBottom: '1px solid rgba(188,165,144,0.13)',
            marginBottom: 12,
          }}>
            <img src="/icons/icon-192.png" alt="" style={{ width: 28, height: 28, borderRadius: 8 }} />
            <span style={{ fontSize: FS.lg, fontWeight: FW.semibold, color: CLAY.text, letterSpacing: '-0.01em' }}>SplitEase</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
            {navItems.map(t => <NavButton key={t.id} t={t} />)}
          </div>
          <button
            onClick={() => setShowLayoutEditor(true)}
            style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: 'none', cursor: 'pointer', fontFamily: MONO, borderRadius: 10, background: 'transparent', opacity: 0.4, color: CLAY.text, fontSize: FS.sm }}
          >
            <span>⠿</span>
            <span>Customize</span>
          </button>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {tabContent}
        </div>

        {investingPicker}
        {layoutEditor}
      </div>
    );
  }

  return (
    <div className="se" style={{ ...s.page, maxWidth: 480, margin: '0 auto', position: 'relative' }}>
      <style>{THEME_CSS}</style>
      {ToastEl}
      {ConfirmModal}

      {tabContent}

      {/* ── Bottom Nav ── */}
      <div
        style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: CLAY.surface, borderTop: 'none', boxShadow: '0 -8px 24px rgba(188,165,144,0.28), 0 -1px 0 rgba(188,165,144,0.18)', zIndex: 40, display: 'flex', gap: 2, fontFamily: MONO, padding: '6px 8px 14px', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}
        onPointerDown={() => { navLongPressRef.current = setTimeout(() => setShowLayoutEditor(true), 650); }}
        onPointerUp={() => clearTimeout(navLongPressRef.current)}
        onPointerLeave={() => clearTimeout(navLongPressRef.current)}
        onPointerCancel={() => clearTimeout(navLongPressRef.current)}
      >
        {navItems.map(t => <NavButton key={t.id} t={t} />)}
      </div>

      {investingPicker}
      {layoutEditor}
    </div>
  );
}
