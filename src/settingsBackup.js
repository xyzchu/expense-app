import React from 'react';
import sb from './supabaseClient';

const FULL_BACKUP_VERSION = 1;

const FULL_BACKUP_TABLES = [
  { name: 'expense_lists', scope: 'list', key: 'id' },
  { name: 'list_members', scope: 'list', key: 'list_id,user_id' },
  { name: 'expenses', scope: 'list', key: 'id' },
  { name: 'list_settings', scope: 'list', key: 'list_id,key' },
  { name: 'pending_expenses', scope: 'list', key: 'id' },
  { name: 'webhook_tokens', scope: 'list', key: 'id' },
  { name: 'push_subscriptions', scope: 'list', key: 'id' },
  { name: 'user_settings', scope: 'user', key: 'user_id,key' },
  { name: 'financial_accounts', scope: 'user', key: 'id' },
  { name: 'financial_snapshots', scope: 'user', key: 'account_id,snapshot_date' },
  { name: 'financial_date_rates', scope: 'user', key: 'user_id,snapshot_date' },
  { name: 'securities_transactions', scope: 'user', key: 'id' },
  { name: 'securities_monthly_quotes', scope: 'user', key: 'user_id,month_key,ticker' },
  { name: 'securities_daily_quotes', scope: 'user', key: 'user_id,quote_date,ticker' },
  { name: 'securities_performance_snapshots', scope: 'user', key: 'user_id,snapshot_date,bank' },
  { name: 'futu_refresh_requests', scope: 'user', key: 'id' },
  { name: 'watchlists', scope: 'user', key: 'id' },
  { name: 'watchlist_items', scope: 'user', key: 'id' },
  { name: 'watchlist_price_snapshots', scope: 'user', key: 'id' },
  { name: 'stock_news_items', scope: 'user', key: 'user_id,ticker,fetch_date' },
  { name: 'news_custom_queries', scope: 'user', key: 'id' },
  { name: 'custom_news_items', scope: 'user', key: 'user_id,query_id,fetch_date' },
  { name: 'user_push_subscriptions', scope: 'user', key: 'user_id,endpoint' },
  { name: 'travel_bookings', scope: 'user', key: 'id' },
];

export const EXPORT_GROUPS = [
  {
    id: 'expenses',
    label: 'Expenses',
    tables: ['expense_lists', 'list_members', 'expenses', 'list_settings', 'pending_expenses'],
  },
  {
    id: 'finance',
    label: 'Portfolio / Finance',
    tables: ['financial_accounts', 'financial_snapshots', 'financial_date_rates'],
  },
  {
    id: 'securities',
    label: 'Securities',
    tables: ['securities_transactions', 'securities_monthly_quotes', 'securities_daily_quotes', 'securities_performance_snapshots', 'futu_refresh_requests'],
  },
  {
    id: 'watchlists',
    label: 'Watchlists',
    tables: ['watchlists', 'watchlist_items', 'watchlist_price_snapshots'],
  },
  {
    id: 'news',
    label: 'News',
    tables: ['stock_news_items', 'news_custom_queries', 'custom_news_items'],
  },
  {
    id: 'travel',
    label: 'Travel',
    tables: ['travel_bookings'],
  },
  {
    id: 'settings',
    label: 'App Settings',
    tables: ['user_settings', 'webhook_tokens', 'push_subscriptions', 'user_push_subscriptions'],
  },
];

const today = () => new Date().toISOString().slice(0, 10);
const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const tableTitle = (name) => name.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

const formatCsvCell = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
};

const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
};

const downloadBlob = (content, type, filename) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function useSettingsBackup({
  user,
  currentList,
  members,
  showToast,
  saveSetting,
  setExpenses,
  setCatOverrides,
  setCatSuggestions,
  setCustomCats,
  onImported,
}) {
  const fileRef = React.useRef(null);
  const csvRef = React.useRef(null);
  const [selectedExportGroups, setSelectedExportGroups] = React.useState(() => EXPORT_GROUPS.map(group => group.id));

  const getAccessibleListIds = React.useCallback(async () => {
    if (!user) return [];
    const { data, error } = await sb.from('list_members').select('list_id').eq('user_id', user.id);
    if (error) throw error;
    return [...new Set((data || []).map(row => row.list_id).filter(Boolean))];
  }, [user]);

  const getSelectedExportTables = React.useCallback(() => {
    const selected = new Set(selectedExportGroups);
    const tableNames = new Set(
      EXPORT_GROUPS
        .filter(group => selected.has(group.id))
        .flatMap(group => group.tables)
    );
    return FULL_BACKUP_TABLES.filter(table => tableNames.has(table.name));
  }, [selectedExportGroups]);

  const fetchBackupData = React.useCallback(async (tablesToExport = FULL_BACKUP_TABLES) => {
    if (!user) throw new Error('Not signed in');
    const listIds = await getAccessibleListIds();
    const tables = {};
    const warnings = [];
    for (const table of tablesToExport) {
      try {
        let query = sb.from(table.name).select('*');
        if (table.scope === 'user') query = query.eq('user_id', user.id);
        if (table.scope === 'list') {
          if (!listIds.length) { tables[table.name] = []; continue; }
          query = query.in('list_id', listIds);
        }
        const { data, error } = await query;
        if (error) throw error;
        tables[table.name] = data || [];
      } catch (err) {
        tables[table.name] = [];
        warnings.push(`${table.name}: ${err.message}`);
      }
    }
    return {
      app: 'splitease',
      backup_version: FULL_BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      exported_by: { id: user.id, email: user.email },
      list_ids: listIds,
      export_groups: selectedExportGroups,
      exported_tables: tablesToExport.map(table => table.name),
      tables,
      warnings,
    };
  }, [user, getAccessibleListIds, selectedExportGroups]);

  const exportJSON = React.useCallback(async () => {
    try {
      const selectedTables = getSelectedExportTables();
      if (!selectedTables.length) { showToast('Select at least one export option'); return; }
      const backup = await fetchBackupData(selectedTables);
      downloadBlob(JSON.stringify(backup, null, 2), 'application/json', `splitease-full-backup-${today()}.json`);
      showToast(`Exported ${Object.keys(backup.tables).length} tables${backup.warnings.length ? ` (${backup.warnings.length} warnings)` : ''}`);
    } catch (err) {
      showToast('Export error: ' + err.message);
    }
  }, [fetchBackupData, getSelectedExportTables, showToast]);

  const exportCSV = React.useCallback(async () => {
    try {
      const selectedTables = getSelectedExportTables();
      if (!selectedTables.length) { showToast('Select at least one export option'); return; }
      const backup = await fetchBackupData(selectedTables);
      const lines = [
        ['Splitease CSV Export'].map(csvEscape).join(','),
        ['Exported at', backup.exported_at].map(csvEscape).join(','),
        ['Selected groups', selectedExportGroups.map(id => EXPORT_GROUPS.find(group => group.id === id)?.label || id).join('; ')].map(csvEscape).join(','),
        [],
      ];
      for (const table of selectedTables) {
        const rows = backup.tables[table.name] || [];
        const columns = Array.from(rows.reduce((set, row) => {
          Object.keys(row || {}).forEach(key => set.add(key));
          return set;
        }, new Set()));
        lines.push([`${tableTitle(table.name)} (${table.name})`].map(csvEscape).join(','));
        lines.push((columns.length ? columns : ['No rows']).map(csvEscape).join(','));
        for (const row of rows) {
          lines.push(columns.map(key => csvEscape(formatCsvCell(row?.[key]))).join(','));
        }
        lines.push('');
      }
      if (backup.warnings.length) {
        lines.push(['Warnings'].map(csvEscape).join(','));
        backup.warnings.forEach(warning => lines.push([warning].map(csvEscape).join(',')));
      }
      downloadBlob(`\uFEFF${lines.join('\r\n')}`, 'text/csv;charset=utf-8', `splitease-export-${today()}.csv`);
      showToast(`Exported CSV report${backup.warnings.length ? ` (${backup.warnings.length} warnings)` : ''}`);
    } catch (err) {
      showToast('Export error: ' + err.message);
    }
  }, [fetchBackupData, getSelectedExportTables, selectedExportGroups, showToast]);

  const buildBackupFromColumnCSV = React.useCallback((headers, lines) => {
    const col = (name) => headers.indexOf(name);
    const backup = { app: 'splitease', backup_version: FULL_BACKUP_VERSION, tables: {} };
    const rowMaps = {};
    for (const table of FULL_BACKUP_TABLES) {
      backup.tables[table.name] = [];
      rowMaps[table.name] = new Map();
    }
    for (let i = 1; i < lines.length; i += 1) {
      const vals = parseCSVLine(lines[i]);
      const section = vals[col('section')];
      const tableName = vals[col('table')];
      const key = vals[col('column')];
      const value = JSON.parse(vals[col('value_json')] || 'null');
      if (section === 'meta' && tableName === 'backup') {
        backup[key] = value;
      } else if (section === 'table' && rowMaps[tableName]) {
        const idx = vals[col('row_index')] || '0';
        const row = rowMaps[tableName].get(idx) || {};
        row[key] = value;
        rowMaps[tableName].set(idx, row);
      }
    }
    for (const table of FULL_BACKUP_TABLES) {
      backup.tables[table.name] = Array.from(rowMaps[table.name].entries())
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, row]) => row);
    }
    return backup;
  }, []);

  const normalizeBackupRows = React.useCallback((tableName, rows) => {
    const table = FULL_BACKUP_TABLES.find(t => t.name === tableName);
    if (!table) return [];
    return (rows || []).map(row => {
      const next = { ...row };
      if (table.scope === 'user') next.user_id = user.id;
      if (table.name === 'expense_lists') next.created_by = user.id;
      if (table.name === 'list_members' && next.user_id !== user.id) return null;
      if ((table.name === 'push_subscriptions' || table.name === 'webhook_tokens') && next.user_id) next.user_id = user.id;
      if (table.name === 'pending_expenses' && next.user_id) next.user_id = user.id;
      return next;
    }).filter(Boolean);
  }, [user]);

  const saveFullBackup = React.useCallback(async (backup) => {
    if (!backup?.tables || !user) throw new Error('Invalid full backup file');
    const results = [];
    for (const table of FULL_BACKUP_TABLES) {
      const rows = normalizeBackupRows(table.name, backup.tables[table.name]);
      if (!rows.length) { results.push(`${table.name}: 0`); continue; }
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error } = await sb.from(table.name).upsert(chunk, { onConflict: table.key });
        if (error) throw new Error(`${table.name}: ${error.message}`);
      }
      results.push(`${table.name}: ${rows.length}`);
    }
    return results;
  }, [normalizeBackupRows, user]);

  const importFullBackupJSON = React.useCallback(async (data) => {
    const results = await saveFullBackup(data);
    await onImported?.();
    showToast(`Imported full backup (${results.filter(r => !r.endsWith(': 0')).length} tables)`);
  }, [onImported, saveFullBackup, showToast]);

  const importJSON = React.useCallback((e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.app === 'splitease' && data.tables) {
          await importFullBackupJSON(data);
          return;
        }
        if (data.expenses && currentList) {
          await sb.from('expenses').delete().eq('list_id', currentList.id);
          const rows = data.expenses.map(exp => ({
            list_id: currentList.id,
            item: exp.item,
            category: exp.category,
            date: exp.date,
            original_currency: exp.original_currency,
            original_amount: exp.original_amount,
            total_amount: exp.total_amount,
            paid_by: exp.paid_by,
            split_type: exp.split_type,
            shares: exp.shares || {},
          }));
          const { data: inserted } = await sb.from('expenses').insert(rows).select();
          setExpenses?.(inserted || []);
          if (data.catOverrides) { setCatOverrides?.(data.catOverrides); saveSetting?.('categoryOverrides', data.catOverrides); }
          if (data.catSuggestions) { setCatSuggestions?.(data.catSuggestions); saveSetting?.('categorySuggestions', data.catSuggestions); }
          if (data.customCats) { setCustomCats?.(data.customCats); saveSetting?.('customCats', data.customCats); }
          showToast(`Imported ${rows.length} expenses`);
        }
      } catch (err) {
        showToast('Import error: ' + err.message);
      }
    };
    reader.readAsText(file); e.target.value = '';
  }, [currentList, importFullBackupJSON, saveSetting, setCatOverrides, setCatSuggestions, setCustomCats, setExpenses, showToast]);

  const importCSV = React.useCallback((e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('Empty CSV');
        const headers = parseCSVLine(lines[0]).map((h, idx) => (idx === 0 ? h.replace(/^\uFEFF/, '') : h).trim().toLowerCase());
        if (headers[0] === 'splitease csv export') {
          throw new Error('This CSV is a readable export report. Use JSON export for importable backups.');
        }
        if (headers[0] === 'section' && headers[1] === 'table' && headers[2] === 'row_index' && headers[3] === 'column' && headers[4] === 'value_json') {
          const backup = buildBackupFromColumnCSV(headers, lines);
          await saveFullBackup(backup);
          await onImported?.();
          showToast('Imported full CSV backup');
          return;
        }
        if (headers[0] === 'section' && headers[1] === 'table' && headers[2] === 'row_json') {
          const backup = { app: 'splitease', backup_version: FULL_BACKUP_VERSION, tables: {} };
          for (const table of FULL_BACKUP_TABLES) backup.tables[table.name] = [];
          for (let i = 1; i < lines.length; i += 1) {
            const [section, tableName, rowJson] = parseCSVLine(lines[i]);
            if (section !== 'table' || !backup.tables[tableName]) continue;
            backup.tables[tableName].push(JSON.parse(rowJson));
          }
          await saveFullBackup(backup);
          await onImported?.();
          showToast('Imported full CSV backup');
          return;
        }
        const ns = members.map(m => m.display_name);
        const rows = [];
        for (let i = 1; i < lines.length; i += 1) {
          const vals = parseCSVLine(lines[i]).map(v => v.trim());
          const get = (key) => vals[headers.indexOf(key)] || '';
          const shares = {};
          let hasNewShares = false;
          for (const n of ns) {
            const idx = headers.indexOf(`share_${n.toLowerCase()}`);
            if (idx >= 0 && vals[idx]) { shares[n] = parseFloat(vals[idx]) || 0; hasNewShares = true; }
          }
          if (!hasNewShares && headers.includes('your_share')) {
            const ys = parseFloat(get('your_share')) || 0;
            const ps = parseFloat(get('partner_share')) || 0;
            if (ns.length >= 1) shares[ns[0]] = ys;
            if (ns.length >= 2) shares[ns[1]] = ps;
          }
          if (Object.keys(shares).length === 0) {
            const total = parseFloat(get('total_amount')) || 0;
            ns.forEach(n => { shares[n] = total / Math.max(ns.length, 1); });
          }
          rows.push({
            list_id: currentList.id,
            item: get('item') || 'Imported',
            category: get('category') || 'Other',
            date: get('date') || today(),
            original_currency: get('original_currency') || null,
            original_amount: parseFloat(get('original_amount')) || null,
            total_amount: parseFloat(get('total_amount')) || 0,
            paid_by: get('paid_by') || ns[0] || 'Unknown',
            split_type: get('split_type') || 'equal',
            shares,
          });
        }
        if (rows.length > 0) {
          const { data } = await sb.from('expenses').insert(rows).select();
          setExpenses?.(prev => [...(data || []), ...prev]);
          showToast(`Imported ${rows.length} expenses from CSV`);
        }
      } catch (err) {
        showToast('CSV import error: ' + err.message);
      }
    };
    reader.readAsText(file); e.target.value = '';
  }, [buildBackupFromColumnCSV, currentList, members, onImported, saveFullBackup, setExpenses, showToast]);

  return {
    exportGroupOptions: EXPORT_GROUPS,
    selectedExportGroups,
    setSelectedExportGroups,
    exportJSON,
    exportCSV,
    importJSON,
    importCSV,
    fileRef,
    csvRef,
  };
}
