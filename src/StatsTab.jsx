import React from 'react';
import { ChevronDown } from 'lucide-react';
import { MONO, FS } from './theme';
import { SHELL_HEADING_STYLE, s, PERSON_COLORS, fmt, getCat } from './appConstants';

const localToday = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const isoLocal = (date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const addRecurringInterval = (dateStr, count = 1, unit = 'months') => {
  const d = new Date(`${dateStr}T00:00:00`);
  const safeCount = Math.max(1, parseInt(count, 10) || 1);
  if (unit === 'days') d.setDate(d.getDate() + safeCount);
  else if (unit === 'weeks') d.setDate(d.getDate() + (safeCount * 7));
  else d.setMonth(d.getMonth() + safeCount);
  return isoLocal(d);
};
const endOfMonthFor = (dateStr) => {
  const [year, month] = String(dateStr || localToday()).split('-').map(Number);
  const now = new Date();
  return isoLocal(new Date(year || now.getFullYear(), month || (now.getMonth() + 1), 0));
};
const addRecurringDueDate = (dateStr, count = 1, unit = 'months', dateMode = 'date') => (
  dateMode === 'month-end'
    ? endOfMonthFor(addRecurringInterval(endOfMonthFor(dateStr), count, 'months'))
    : addRecurringInterval(dateStr, count, unit)
);

export default function StatsTab({ months, monthExpenses, visibleExpenses, names, selMonth, setSelMonth, personFilter, setPersonFilter, expandedStatCats, setExpandedStatCats, customCats, members, defCur, recurringStatRows = [], embedded = false }) {
  const STAT_EXCL = new Set(['Income', 'Investment', 'Settlement']);
  const UPCOMING_INFO_CATS = new Set(['Income', 'Investment', 'Other']);
  const personTotals = {};
  names.forEach(n => { personTotals[n] = 0; });
  monthExpenses.forEach(e => {
    if (STAT_EXCL.has(e.category)) return;
    Object.entries(e.shares || {}).forEach(([n, a]) => {
      if (n in personTotals) personTotals[n] += a;
    });
  });
  const grandTotal = Object.values(personTotals).reduce((ss, v) => ss + v, 0);

  const visExps = personFilter ? monthExpenses.filter(e => e.shares?.[personFilter] > 0) : monthExpenses;
  const catTotals = {};
  const infoCatTotals = {};
  visExps.forEach(e => {
    const amt = personFilter ? (e.shares?.[personFilter] || 0) : e.total_amount;
    if (STAT_EXCL.has(e.category)) {
      infoCatTotals[e.category] = (infoCatTotals[e.category] || 0) + amt;
    } else {
      catTotals[e.category] = (catTotals[e.category] || 0) + amt;
    }
  });
  visibleExpenses.filter(e => e.date?.startsWith(selMonth) && e.split_type === 'settlement' && (!personFilter || e.shares?.[personFilter] > 0))
    .forEach(e => { infoCatTotals['Settlement'] = (infoCatTotals['Settlement'] || 0) + e.total_amount; });
  const catData = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const infoCatData = Object.entries(infoCatTotals).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const todayStr = localToday();
  const monthStart = `${selMonth}-01`;
  const monthEnd = isoLocal(new Date(Number(selMonth.slice(0, 4)), Number(selMonth.slice(5, 7)), 0));
  const upcomingStart = monthStart > todayStr ? monthStart : todayStr;
  const upcomingRecurringRows = recurringStatRows
    .flatMap(row => {
      if (!row.date || !UPCOMING_INFO_CATS.has(row.category)) return [];
      let dueDate = row.date;
      let guard = 0;
      while (dueDate < upcomingStart && guard < 370) {
        dueDate = addRecurringDueDate(dueDate, row.intervalCount, row.intervalUnit, row.dateMode);
        guard += 1;
      }
      const rows = [];
      while (dueDate <= monthEnd && guard < 740) {
        if (dueDate >= upcomingStart && dueDate.startsWith(selMonth)) {
          rows.push({ ...row, occurrenceDate: dueDate, occurrenceKey: `${row.id}-${dueDate}` });
        }
        dueDate = addRecurringDueDate(dueDate, row.intervalCount, row.intervalUnit, row.dateMode);
        guard += 1;
      }
      return rows;
    })
    .filter(row => !personFilter || row.shares?.[personFilter] > 0)
    .sort((a, b) => (
      String(a.occurrenceDate || '').localeCompare(String(b.occurrenceDate || '')) ||
      String(a.category || '').localeCompare(String(b.category || '')) ||
      String(a.item || '').localeCompare(String(b.item || ''))
    ));
  const upcomingRecurringTotals = {};
  upcomingRecurringRows.forEach(row => {
    const amt = personFilter ? (row.shares?.[personFilter] || 0) : row.total_amount;
    upcomingRecurringTotals[row.category] = (upcomingRecurringTotals[row.category] || 0) + amt;
  });
  const upcomingRecurringData = Object.entries(upcomingRecurringTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
  const upcomingRecurringGrandTotal = Object.values(upcomingRecurringTotals).reduce((sum, value) => sum + value, 0);
  const monthlyOutlookRows = [
    {
      name: 'Income',
      current: infoCatTotals.Income || 0,
      upcoming: upcomingRecurringTotals.Income || 0,
    },
    {
      name: 'Investment',
      current: infoCatTotals.Investment || 0,
      upcoming: upcomingRecurringTotals.Investment || 0,
    },
    {
      name: 'Expense',
      current: personFilter ? (personTotals[personFilter] || 0) : grandTotal,
      upcoming: upcomingRecurringTotals.Other || 0,
      categoryForStyle: 'Other',
    },
  ].map(row => ({ ...row, projected: row.current + row.upcoming }));
  const projectedIncome = monthlyOutlookRows.find(row => row.name === 'Income')?.projected || 0;
  const projectedInvestment = monthlyOutlookRows.find(row => row.name === 'Investment')?.projected || 0;
  const projectedExpense = monthlyOutlookRows.find(row => row.name === 'Expense')?.projected || 0;
  const projectedSpendLeft = projectedIncome - projectedInvestment - projectedExpense;

  return (
    <div style={{ padding: embedded ? '0 16px 80px' : '32px 16px 80px' }}>
      {!embedded && <div style={SHELL_HEADING_STYLE}>STATISTICS</div>}

      <div className="se-noscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
        {months.map(m => (
          <button key={m} style={s.chip(selMonth === m)} onClick={() => setSelMonth(m)}>{new Date(m + '-02').toLocaleDateString('en', { month: 'short', year: 'numeric' })}</button>
        ))}
      </div>

      <div className="se-noscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginTop: 12 }}>
        <button onClick={() => setPersonFilter('')}
          style={{ ...s.card, flexShrink: 0, minWidth: 110, padding: 12, cursor: 'pointer', border: 'none', fontFamily: MONO, ...(!personFilter ? { background: '#222', color: '#f5f5ee' } : {}) }}>
          <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.5, marginBottom: 6 }}>Together</div>
          <div style={{ fontSize: FS.lg, fontWeight: 700, ...s.tabnum }}>{fmt(grandTotal, defCur)}</div>
        </button>
        {names.map((n, i) => {
          const active = personFilter === n;
          const bg = PERSON_COLORS[i % PERSON_COLORS.length];
          return (
            <button key={n} onClick={() => setPersonFilter(active ? '' : n)}
              style={{ ...s.card, flexShrink: 0, minWidth: 110, padding: 12, cursor: 'pointer', border: 'none', fontFamily: MONO, ...(active ? { background: bg, color: '#fff' } : {}) }}>
              <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.5, marginBottom: 6 }}>{n}</div>
              <div style={{ fontSize: FS.lg, fontWeight: 700, ...s.tabnum }}>{fmt(personTotals[n] || 0, defCur)}</div>
            </button>
          );
        })}
      </div>

      <div style={{ ...s.card, padding: 16, marginTop: 12 }}>
        <div style={{ ...s.label, marginBottom: 12 }}>Projected Month Total</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 14, background: projectedSpendLeft >= 0 ? '#ECFDF3' : '#FEF2F2', marginBottom: 10, fontSize: FS.lg, ...s.upper }}>
          <div>
            <div style={{ fontWeight: 800 }}>Can still spend</div>
            <div style={{ opacity: 0.45, marginTop: 2 }}>Income - investment - expense</div>
          </div>
          <span style={{ ...s.tabnum, fontWeight: 900, color: projectedSpendLeft >= 0 ? '#059669' : '#dc2626' }}>{fmt(projectedSpendLeft, defCur)}</span>
        </div>
        {monthlyOutlookRows.map(row => {
          const ci = getCat(row.categoryForStyle || row.name, customCats, members);
          return (
            <div key={row.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: row.name === 'Expense' ? 'none' : '1px dashed #e5e7eb', fontSize: FS.lg, ...s.upper }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                  <span>{ci.emoji}</span>
                  <span>{row.name}</span>
                </div>
                <div style={{ opacity: 0.42, marginTop: 2 }}>
                  Current {fmt(row.current, defCur)} + upcoming {fmt(row.upcoming, defCur)}
                </div>
              </div>
              <span style={{ ...s.tabnum, fontWeight: 800, color: ci.tx }}>{fmt(row.projected, defCur)}</span>
            </div>
          );
        })}
      </div>

      {(catData.length > 0 || infoCatData.length > 0 || upcomingRecurringRows.length > 0) && (
        <div style={{ ...s.card, padding: 16, marginTop: 12 }}>
          <div style={{ ...s.label, marginBottom: 12 }}>Breakdown</div>
          {catData.map(({ name, value }) => {
            const ci = getCat(name, customCats, members);
            const baseTotal = personFilter ? (personTotals[personFilter] || 0) : grandTotal;
            const pct = baseTotal > 0 ? (value / baseTotal * 100) : 0;
            const isExpanded = expandedStatCats.has(name);
            const toggleCat = () => setExpandedStatCats(prev => {
              const next = new Set(prev);
              next.has(name) ? next.delete(name) : next.add(name);
              return next;
            });
            const catExps = visExps.filter(e => e.category === name).sort((a, b) => b.total_amount - a.total_amount);
            return (
              <div key={name} style={{ marginBottom: 10 }}>
                <button onClick={toggleCat} style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: FS.lg, ...s.upper }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ChevronDown size={12} style={{ color: '#9ca3af', transform: isExpanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
                    {ci.emoji} {name}
                  </span>
                  <span style={{ fontWeight: 700, ...s.tabnum }}>{fmt(value, defCur)} <span style={{ fontSize: FS.lg, opacity: 0.35 }}>({pct.toFixed(0)}%)</span></span>
                </button>
                <div style={{ height: 6, background: '#F0F0EA', borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: ci.c, transition: 'width 0.5s ease' }} />
                </div>
                {isExpanded && catExps.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 4, borderLeft: `2px solid ${ci.c}40` }}>
                    {catExps.map((e, i) => (
                      <div key={e.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', fontSize: FS.lg, ...s.upper, borderRadius: 6, marginBottom: 1, background: i % 2 === 0 ? 'transparent' : '#fafafa' }}>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <span style={{ color: '#374151', fontWeight: 600 }}>{e.item || '—'}</span>
                          <span style={{ opacity: 0.4, marginLeft: 6, fontSize: FS.lg }}>{e.date?.slice(5)}</span>
                        </div>
                        <span style={{ fontWeight: 700, ...s.tabnum, color: ci.tx, flexShrink: 0, marginLeft: 8 }}>{fmt(personFilter ? (e.shares?.[personFilter] || 0) : e.total_amount, defCur)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {(infoCatData.length > 0 || upcomingRecurringRows.length > 0) && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e5e7eb' }}>
              <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.4, marginBottom: 8, letterSpacing: '0.05em' }}>For information</div>
              {infoCatData.map(({ name, value }) => {
                const ci = getCat(name, customCats, members);
                return (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: FS.lg, ...s.upper, opacity: 0.6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{ci.emoji} {name}</span>
                    <span style={{ ...s.tabnum, fontWeight: 600 }}>{fmt(value, defCur)}</span>
                  </div>
                );
              })}
              {upcomingRecurringRows.length > 0 && (
                <div style={{ marginTop: infoCatData.length ? 10 : 0, paddingTop: infoCatData.length ? 10 : 0, borderTop: infoCatData.length ? '1px dashed #e5e7eb' : 'none' }}>
                  <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.4, marginBottom: 8, letterSpacing: '0.05em' }}>Expected upcoming</div>
                  {upcomingRecurringData.map(({ name, value }) => {
                    const ci = getCat(name, customCats, members);
                    const key = `expected:${name}`;
                    const pct = upcomingRecurringGrandTotal > 0 ? (value / upcomingRecurringGrandTotal * 100) : 0;
                    const isExpanded = expandedStatCats.has(key);
                    const toggleExpectedCat = () => setExpandedStatCats(prev => {
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    });
                    const expectedRows = upcomingRecurringRows.filter(row => row.category === name);
                    return (
                      <div key={`expected-${name}`} style={{ marginBottom: 10 }}>
                        <button onClick={toggleExpectedCat} style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: FS.lg, ...s.upper, opacity: 0.75 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <ChevronDown size={12} style={{ color: '#9ca3af', transform: isExpanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
                            {ci.emoji} Expected {name}
                          </span>
                          <span style={{ fontWeight: 700, ...s.tabnum }}>{fmt(value, defCur)} <span style={{ fontSize: FS.lg, opacity: 0.35 }}>({pct.toFixed(0)}%)</span></span>
                        </button>
                        <div style={{ height: 6, background: '#F0F0EA', borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: ci.c, transition: 'width 0.5s ease' }} />
                        </div>
                        {isExpanded && expectedRows.length > 0 && (
                          <div style={{ marginTop: 6, paddingLeft: 4, borderLeft: `2px solid ${ci.c}40` }}>
                            {expectedRows.map((row, i) => {
                              const amount = personFilter ? (row.shares?.[personFilter] || 0) : row.total_amount;
                              return (
                                <div key={row.occurrenceKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', fontSize: FS.lg, ...s.upper, borderRadius: 6, marginBottom: 1, background: i % 2 === 0 ? 'transparent' : '#fafafa' }}>
                                  <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <span style={{ color: '#374151', fontWeight: 600 }}>{row.item || '—'}</span>
                                    <span style={{ opacity: 0.4, marginLeft: 6, fontSize: FS.lg }}>{row.occurrenceDate?.slice(5)}</span>
                                    <span style={{ opacity: 0.35, marginLeft: 6, fontSize: FS.lg }}>
                                      {row.dateMode === 'month-end' ? 'end of each month' : `every ${row.intervalCount} ${row.intervalUnit}`}
                                    </span>
                                  </div>
                                  <span style={{ fontWeight: 700, ...s.tabnum, color: ci.tx, flexShrink: 0, marginLeft: 8 }}>{fmt(amount, defCur)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
