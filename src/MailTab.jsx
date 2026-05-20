import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Mail, Plus, RefreshCw, Settings2 } from 'lucide-react';
import sb from './supabaseClient';
import { CLAY, FS, FW, MONO } from './theme';
import { ALL_CUR, BASE_CATS, fmt, s } from './appConstants';
import { Button, Card, EmptyState, Field, IconButton, PageShell } from './ui';

const DEFAULT_WORKER_URL = 'http://127.0.0.1:3857';
const WORKER_SETTING_KEY = 'mail_worker_url';
const SCHEDULE_TIMES_KEY = 'mail_sync_schedule_times';
const SCHEDULE_TIMEZONE_KEY = 'mail_sync_timezone';
const IGNORE_KEYWORDS_KEY = 'mail_ignore_subject_keywords';
const DEFAULT_TIMEZONE = 'Asia/Hong_Kong';
const DEFAULT_IGNORE_KEYWORDS = 'general meeting, annual general meeting, extraordinary general meeting, calendar invitation, meeting reminder, statement, eStatement, webinar, pending dealing, pending transaction';
const CANNED_DESCRIPTIONS = new Set([
  'aliexpress card purchase',
  'hsbc credit card payment',
  'salary from employer',
  'boc transfer to hsbc',
]);
const EXPENSE_SPLIT_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'equal', label: 'Equal' },
];
const SECURITY_TYPES = ['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL'];
const SECURITY_CASH_TYPES = new Set(['DEPOSIT', 'WITHDRAWAL']);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function normalizeCurrency(value, fallback = 'AUD') {
  const cur = String(value || fallback || 'AUD').trim().toUpperCase();
  return ALL_CUR.includes(cur) ? cur : fallback;
}

function numberOrNull(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) && String(value ?? '').trim() !== '' ? parsed : null;
}

function extractHsbcTradeOverrides(text) {
  const source = normalizeText(text);
  if (!/HSBC|Hongkong and Shanghai Banking Corporation/i.test(source)) return null;
  if (!/Trade Order/i.test(source)) return null;
  const overrides = {};
  const orderRef = source.match(/\bOrder Reference:\s*([A-Z0-9-]+)/i) || source.match(/\bOrder ref:\s*([A-Z0-9-]+)/i);
  const type = source.match(/\bOrder Type:\s*(BUY|SELL)\b/i) || source.match(/\b(BUY|SELL)\s+Trade Order\b/i);
  const stock = source.match(/\bStock:\s*([^()•]+?)\s*\(([A-Z0-9.-]+)\)/i);
  const totalQuantity = source.match(/\bTotal Executed Quantity\s*\(shares\/units\):\s*([0-9,]+(?:\.\d+)?)/i);
  const executedQuantity = source.match(/\bExecuted Order Quantity\s*\(shares\/units\):\s*([0-9,]+(?:\.\d+)?)/i);
  const price = source.match(/\bMarket Execution Price:\s*([A-Z]{3})?\s*\$?\s*([0-9,]+(?:\.\d+)?)/i);
  if (orderRef) overrides.orderRef = orderRef[1];
  if (type) overrides.transactionType = type[1].toUpperCase();
  if (stock) {
    overrides.name = normalizeText(stock[1]);
    overrides.ticker = stock[2].toUpperCase();
  }
  if (totalQuantity || executedQuantity) overrides.quantity = numberOrNull((totalQuantity || executedQuantity)[1]);
  if (price) {
    if (price[1]) overrides.currency = price[1].toUpperCase();
    overrides.price = numberOrNull(price[2]);
  }
  const derived = derivedTradeAmount({ ...overrides, transactionType: overrides.transactionType || 'SELL' });
  if (derived != null) overrides.amount = derived;
  return Object.keys(overrides).length ? overrides : null;
}

function normalizedSecurityAmount(payload) {
  const type = String(payload.transactionType || payload.transaction_type || payload.security?.type || '').toUpperCase();
  const amount = numberOrNull(payload.amount ?? payload.security?.amount);
  const quantity = numberOrNull(payload.quantity ?? payload.security?.quantity);
  const price = numberOrNull(payload.price ?? payload.security?.price);
  const derived = ['BUY', 'SELL'].includes(type) && quantity != null && price != null
    ? Math.abs(quantity * price)
    : null;
  if (derived == null) return amount ?? '';
  if (amount == null || amount <= 0) return Number(derived.toFixed(2));
  if (amount < derived * 0.5 || amount > derived * 2) return Number(derived.toFixed(2));
  return amount;
}

function derivedTradeAmount(candidate) {
  const type = String(candidate?.transactionType || candidate?.transaction_type || candidate?.security?.type || '').toUpperCase();
  const quantity = numberOrNull(candidate?.quantity ?? candidate?.security?.quantity);
  const price = numberOrNull(candidate?.price ?? candidate?.security?.price);
  if (!['BUY', 'SELL'].includes(type) || quantity == null || price == null) return null;
  const derived = Math.abs(quantity * price);
  return Number.isFinite(derived) && derived > 0 ? Number(derived.toFixed(2)) : null;
}

function shouldUseDerivedTradeAmount(candidate, rawAmount) {
  const derived = derivedTradeAmount(candidate);
  if (derived == null) return false;
  const amount = rawAmount ?? numberOrNull(candidate?.amount);
  return amount == null || amount <= 0 || amount < derived * 0.5 || amount > derived * 2;
}

function candidateFromRow(row) {
  const payload = row?.payload || {};
  const security = payload.security || {};
  const candidate = {
    ...payload,
    id: row.id,
    dbId: row.id,
    messageId: row.gmail_message_id,
    threadId: row.gmail_thread_id,
    subject: row.email_subject,
    from: row.email_from,
    emailDate: row.email_date,
    snippet: row.email_snippet,
    kind: row.kind,
    status: row.status,
    confidence: Number(row.confidence ?? payload.confidence ?? 0.75),
    reason: row.reason || payload.reason || '',
    emailText: payload.emailText || '',
    splitType: payload.splitType || payload.split_type || 'personal',
    transactionType: payload.transactionType || payload.transaction_type || security.type || 'BUY',
    ticker: payload.ticker || security.ticker || '',
    name: payload.name || security.name || '',
    quantity: payload.quantity ?? security.quantity ?? '',
    price: payload.price ?? security.price ?? '',
    amount: (row.kind === 'security' || payload.kind === 'security')
      ? normalizedSecurityAmount(payload)
      : (payload.amount ?? security.amount ?? ''),
    taxWithheld: payload.taxWithheld ?? payload.tax_withheld ?? security.tax_withheld ?? '',
    currency: payload.currency || security.currency || '',
    account: payload.account || security.account || '',
    orderRef: payload.orderRef || payload.order_ref || security.order_ref || '',
    notes: payload.notes || security.notes || '',
  };
  if (candidate.kind === 'security') {
    Object.assign(candidate, extractHsbcTradeOverrides(candidate.emailText) || {});
  }
  const summary = normalizeText(candidate.summary);
  const item = normalizeText(candidate.item);
  if (candidate.kind !== 'security' && summary && (item !== summary || item.split(' ').length > 8)) {
    candidate.item = summary;
  } else if (CANNED_DESCRIPTIONS.has(item.toLowerCase())) {
    candidate.item = normalizeText(candidate.summary)
      || normalizeText(candidate.merchant)
      || normalizeText(candidate.payee)
      || normalizeText(candidate.bank)
      || candidate.subject;
  }
  return candidate;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function appendUniqueText(base, addition) {
  const cleanBase = normalizeText(base);
  const cleanAddition = normalizeText(addition);
  if (!cleanAddition) return cleanBase;
  if (cleanBase.toLowerCase().includes(cleanAddition.toLowerCase())) return cleanBase;
  return [cleanBase, cleanAddition].filter(Boolean).join(' ');
}

function candidateExtractedDetails(candidate) {
  const fields = [
    ['Summary', candidate.summary],
    ['Ticker', candidate.ticker],
    ['Stock', candidate.name],
    ['Units', candidate.quantity],
    ['Price', candidate.price],
    ['Amount', candidate.amount],
    ['Merchant', candidate.merchant],
    ['Payee', candidate.payee],
    ['Payer', candidate.payer],
    ['Bank', candidate.bank],
    ['Account', candidate.account],
    ['Order ref', candidate.orderRef],
  ];
  const seen = new Set();
  return fields
    .map(([label, value]) => ({ label, value: normalizeText(value) }))
    .filter(({ value }) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export default function MailTab({
  user,
  defCur = 'AUD',
  showToast,
  addExpenseCandidate,
}) {
  const [workerUrl, setWorkerUrl] = useState(DEFAULT_WORKER_URL);
  const [draftWorkerUrl, setDraftWorkerUrl] = useState(DEFAULT_WORKER_URL);
  const [scheduleTimes, setScheduleTimes] = useState([]);
  const [draftScheduleTimes, setDraftScheduleTimes] = useState([]);
  const [draftScheduleTime, setDraftScheduleTime] = useState('');
  const [scheduleTimezone, setScheduleTimezone] = useState(DEFAULT_TIMEZONE);
  const [draftScheduleTimezone, setDraftScheduleTimezone] = useState(DEFAULT_TIMEZONE);
  const [ignoreKeywords, setIgnoreKeywords] = useState(DEFAULT_IGNORE_KEYWORDS);
  const [draftIgnoreKeywords, setDraftIgnoreKeywords] = useState(DEFAULT_IGNORE_KEYWORDS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearingScanned, setClearingScanned] = useState(false);
  const [confirmClearScanned, setConfirmClearScanned] = useState(false);
  const [status, setStatus] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [expandedEmailText, setExpandedEmailText] = useState({});

  const cleanWorkerUrl = useMemo(() => workerUrl.replace(/\/+$/, ''), [workerUrl]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await sb
        .from('user_settings')
        .select('key,value')
        .eq('user_id', user.id)
        .in('key', [WORKER_SETTING_KEY, SCHEDULE_TIMES_KEY, SCHEDULE_TIMEZONE_KEY, IGNORE_KEYWORDS_KEY]);
      if (cancelled) return;
      const map = Object.fromEntries((data || []).map(row => [row.key, row.value]));
      const saved = String(map[WORKER_SETTING_KEY] || DEFAULT_WORKER_URL);
      let savedTimes = [];
      try {
        const parsed = JSON.parse(map[SCHEDULE_TIMES_KEY] || '[]');
        savedTimes = Array.isArray(parsed) ? parsed.filter(Boolean).sort() : [];
      } catch {
        savedTimes = [];
      }
      const savedTimezone = String(map[SCHEDULE_TIMEZONE_KEY] || DEFAULT_TIMEZONE);
      const savedIgnoreKeywords = String(map[IGNORE_KEYWORDS_KEY] || DEFAULT_IGNORE_KEYWORDS);
      setWorkerUrl(saved);
      setDraftWorkerUrl(saved);
      setScheduleTimes(savedTimes);
      setDraftScheduleTimes(savedTimes);
      setScheduleTimezone(savedTimezone);
      setDraftScheduleTimezone(savedTimezone);
      setIgnoreKeywords(savedIgnoreKeywords);
      setDraftIgnoreKeywords(savedIgnoreKeywords);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const loadCandidates = useCallback(async () => {
    if (!user) return;
    const { data, error } = await sb
      .from('mail_candidates')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'dismissed')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      showToast?.(`Mail queue error: ${error.message}`);
      return;
    }
    setCandidates((data || []).map(candidateFromRow));
  }, [showToast, user]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const saveWorkerSettings = async () => {
    const nextUrl = draftWorkerUrl.trim() || DEFAULT_WORKER_URL;
    const nextTimes = [...new Set(draftScheduleTimes.filter(Boolean))].sort();
    const nextTimezone = draftScheduleTimezone.trim() || DEFAULT_TIMEZONE;
    const nextIgnoreKeywords = draftIgnoreKeywords.trim();
    setWorkerUrl(nextUrl);
    setScheduleTimes(nextTimes);
    setScheduleTimezone(nextTimezone);
    setIgnoreKeywords(nextIgnoreKeywords);
    setSettingsOpen(false);
    if (!user) return;
    const { error } = await sb
      .from('user_settings')
      .upsert([
        { user_id: user.id, key: WORKER_SETTING_KEY, value: nextUrl },
        { user_id: user.id, key: SCHEDULE_TIMES_KEY, value: JSON.stringify(nextTimes) },
        { user_id: user.id, key: SCHEDULE_TIMEZONE_KEY, value: nextTimezone },
        { user_id: user.id, key: IGNORE_KEYWORDS_KEY, value: nextIgnoreKeywords },
      ], { onConflict: 'user_id,key' });
    showToast?.(error ? `Mail settings error: ${error.message}` : 'Mail settings saved');
  };

  const addScheduleTime = () => {
    if (!draftScheduleTime) return;
    setDraftScheduleTimes(prev => [...new Set([...prev, draftScheduleTime])].sort());
    setDraftScheduleTime('');
  };

  const clearScannedMessages = async () => {
    if (!user || clearingScanned) return;
    if (!confirmClearScanned) {
      setConfirmClearScanned(true);
      return;
    }
    setClearingScanned(true);
    try {
      const { error } = await sb
        .from('mail_processed_messages')
        .delete()
        .eq('user_id', user.id);
      if (error) throw error;
      setConfirmClearScanned(false);
      setStatus('Scanned Gmail history cleared');
      showToast?.('Scanned Gmail messages cleared');
    } catch (err) {
      showToast?.(`Clear scanned Gmail failed: ${err.message}`);
    } finally {
      setClearingScanned(false);
    }
  };

  const toggleSettings = () => {
    setSettingsOpen((open) => {
      if (!open) {
        setDraftWorkerUrl(workerUrl);
        setDraftScheduleTimes(scheduleTimes);
        setDraftScheduleTimezone(scheduleTimezone);
        setDraftScheduleTime('');
        setDraftIgnoreKeywords(ignoreKeywords);
        setConfirmClearScanned(false);
      }
      return !open;
    });
  };

  const triggerWorkerSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setStatus('Contacting local mail worker...');
    try {
      const res = await fetch(`${cleanWorkerUrl}/sync`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Worker ${res.status}`);
      setStatus(json?.message || 'Local worker sync started');
      setLastSyncAt(new Date().toLocaleString());
      showToast?.(json?.message || 'Mail sync started');
      const startedAt = json?.lastStartedAt || new Date().toISOString();
      for (let attempt = 0; attempt < 720; attempt += 1) {
        await sleep(5000);
        const statusRes = await fetch(`${cleanWorkerUrl}/status`);
        const workerStatus = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) throw new Error(workerStatus?.error || `Worker ${statusRes.status}`);
        if (workerStatus.running) {
          const seconds = workerStatus.lastStartedAt
            ? Math.max(0, Math.round((Date.now() - new Date(workerStatus.lastStartedAt).getTime()) / 1000))
            : null;
          setStatus(seconds == null ? 'Mail sync running...' : `Mail sync running... ${seconds}s`);
          continue;
        }
        if (workerStatus.lastError) throw new Error(workerStatus.lastError);
        const finishedAt = workerStatus.lastFinishedAt || '';
        if (!finishedAt || finishedAt >= startedAt || attempt > 0) {
          await loadCandidates();
          setStatus('Mail sync finished. Queue refreshed.');
          showToast?.('Mail queue refreshed');
          break;
        }
      }
    } catch (err) {
      const msg = err?.message || 'Could not reach local mail worker';
      setStatus(msg);
      showToast?.(msg);
    } finally {
      setSyncing(false);
    }
  };

  const updateCandidate = (id, patch) => {
    setCandidates(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const toggleEmailText = (id) => {
    setExpandedEmailText(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const saveCandidatePayload = async (candidate, patch) => {
    if (!candidate.dbId) return;
    const nextPayload = { ...candidate, ...patch };
    const { error } = await sb
      .from('mail_candidates')
      .update({ payload: nextPayload, updated_at: new Date().toISOString() })
      .eq('id', candidate.dbId);
    if (error) showToast?.(`Mail queue update error: ${error.message}`);
  };

  const appendCandidateDetail = async (candidate, value) => {
    const targetField = candidate.kind === 'security' ? 'notes' : 'item';
    const nextValue = appendUniqueText(candidate[targetField], value);
    updateCandidate(candidate.id, { [targetField]: nextValue });
    await saveCandidatePayload(candidate, { [targetField]: nextValue });
  };

  const clearCandidateDescription = async (candidate) => {
    const targetField = candidate.kind === 'security' ? 'notes' : 'item';
    updateCandidate(candidate.id, { [targetField]: '' });
    await saveCandidatePayload(candidate, { [targetField]: '' });
  };

  const saveCandidateEditAndPayload = async (candidate, field, value) => {
    updateCandidate(candidate.id, { [field]: value });
    await saveCandidatePayload(candidate, { [field]: value });
  };

  const updateCandidateStatus = async (candidate, patch) => {
    updateCandidate(candidate.id, patch);
    if (!candidate.dbId) return;
    const { error } = await sb
      .from('mail_candidates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', candidate.dbId);
    if (error) showToast?.(`Mail queue update error: ${error.message}`);
  };

  const addExpense = async (candidate) => {
    if (!addExpenseCandidate) {
      showToast?.('Mail expense add handler is unavailable');
      return;
    }
    const data = await addExpenseCandidate({
      ...candidate,
      amount: Math.abs(Number(candidate.amount || 0)),
      currency: normalizeCurrency(candidate.currency, defCur),
      date: candidate.date || today(),
    });
    if (!data?.id) return;
    await updateCandidateStatus(candidate, { status: 'added', added_target: 'expense', added_target_id: data.id });
  };

  const addSecurity = async (candidate) => {
    if (!user) return;
    const type = String(candidate.transactionType || 'BUY').toUpperCase();
    const isCash = SECURITY_CASH_TYPES.has(type);
    const ticker = isCash ? '' : String(candidate.ticker || '').trim().toUpperCase();
    const quantity = numberOrNull(candidate.quantity);
    const price = numberOrNull(candidate.price);
    const rawAmount = numberOrNull(candidate.amount);
    const derivedAmount = derivedTradeAmount({ ...candidate, transactionType: type });
    const amount = shouldUseDerivedTradeAmount({ ...candidate, transactionType: type }, rawAmount)
      ? derivedAmount
      : rawAmount;
    if (!isCash && !ticker) {
      showToast?.('Please enter a ticker before saving this securities transaction');
      return;
    }
    if (!amount) {
      showToast?.('Please enter an amount before saving this securities transaction');
      return;
    }
    const row = {
      user_id: user.id,
      transaction_date: candidate.date || today(),
      sort_order: Date.now(),
      type,
      ticker,
      name: isCash ? (type === 'DEPOSIT' ? 'Cash deposit' : 'Cash withdrawal') : (candidate.name || ticker),
      quantity,
      original_quantity: quantity,
      stock_split: 1,
      price,
      currency: normalizeCurrency(candidate.currency, 'USD'),
      amount,
      tax_withheld: numberOrNull(candidate.taxWithheld),
      account: candidate.account || 'HSBC',
      order_ref: candidate.orderRef || '',
      notes: candidate.notes || candidate.subject,
      source: 'gmail-ollama',
    };
    const { data, error } = await sb.from('securities_transactions').insert(row).select('id').single();
    if (error) {
      showToast?.(`Error: ${error.message}`);
      return;
    }
    await updateCandidateStatus(candidate, { status: 'added', added_target: 'security', added_target_id: data?.id });
    showToast?.(`Added ${type} ${row.ticker || row.name}`);
  };

  const saveCandidateEdit = (candidate, field, value) => {
    const patch = { [field]: value };
    if (candidate.kind === 'security' && ['transactionType', 'quantity', 'price'].includes(field)) {
      const next = { ...candidate, ...patch };
      const previousDerived = derivedTradeAmount(candidate);
      const rawAmount = numberOrNull(candidate.amount);
      const amountWasAutoOrSuspicious = rawAmount == null
        || rawAmount <= 0
        || (previousDerived != null && Math.abs(rawAmount - previousDerived) < 0.01)
        || shouldUseDerivedTradeAmount(candidate, rawAmount);
      const nextDerived = derivedTradeAmount(next);
      if (amountWasAutoOrSuspicious && nextDerived != null) patch.amount = nextDerived;
    }
    updateCandidate(candidate.id, patch);
  };

  return (
    <PageShell
      title="Mail"
      actions={(
        <div style={{ display: 'flex', gap: 8 }}>
          <IconButton onClick={toggleSettings} title={settingsOpen ? 'Hide mail settings' : 'Mail settings'}><Settings2 size={16} /></IconButton>
          <IconButton onClick={loadCandidates} title="Refresh queue"><RefreshCw size={16} /></IconButton>
          <IconButton onClick={triggerWorkerSync} title="Trigger local sync" disabled={syncing}><Mail size={16} /></IconButton>
        </div>
      )}
    >
      <Card compact>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: CLAY.surf2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Mail size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS.lg, color: CLAY.text, lineHeight: 1.45 }}>
              Your local mail worker reads Gmail, classifies with Ollama, and saves review candidates here.
            </div>
            <div style={{ marginTop: 8, fontSize: FS.lg, color: CLAY.textLt, lineHeight: 1.45 }}>
              {lastSyncAt ? `Last trigger ${lastSyncAt}` : 'Use Sync now to trigger your local worker'}
              {scheduleTimes.length ? ` · Auto: ${scheduleTimes.join(', ')} ${scheduleTimezone}` : ' · Auto sync off'}
              {status ? ` · ${status}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, padding: 12, borderRadius: 14, background: CLAY.surf2, color: CLAY.textMid, fontSize: FS.lg, lineHeight: 1.35 }}>
          <AlertCircle size={16} />
          <span>Keep <code style={{ fontFamily: MONO }}>scripts\start_mail_ollama_worker.bat</code> running. Manual and scheduled syncs use {cleanWorkerUrl}.</span>
        </div>
        {settingsOpen && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 18, background: CLAY.surf, border: `1px solid ${CLAY.line}`, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: FS.lg, fontWeight: FW.semibold, color: CLAY.text }}>Mail settings</div>
                <div style={{ marginTop: 3, fontSize: FS.lg, color: CLAY.textLt }}>Set worker access, auto sync times, and emails to ignore.</div>
              </div>
              <IconButton onClick={() => setSettingsOpen(false)} title="Hide settings"><Settings2 size={16} /></IconButton>
            </div>
            <label>
              <div style={s.label}>Local worker URL</div>
              <Field value={draftWorkerUrl} onChange={e => setDraftWorkerUrl(e.target.value)} placeholder={DEFAULT_WORKER_URL} />
            </label>
            <div>
              <div style={s.label}>Scheduled sync times</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Field
                  type="time"
                  value={draftScheduleTime}
                  onChange={e => setDraftScheduleTime(e.target.value)}
                  style={{ maxWidth: 150 }}
                />
                <Button onClick={addScheduleTime}>Add</Button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {draftScheduleTimes.length === 0 ? (
                  <span style={{ fontSize: FS.lg, color: CLAY.textLt }}>No automatic sync times set.</span>
                ) : draftScheduleTimes.map(time => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setDraftScheduleTimes(prev => prev.filter(item => item !== time))}
                    style={{
                      border: 'none',
                      borderRadius: 999,
                      background: CLAY.surf2,
                      color: CLAY.text,
                      padding: '7px 11px',
                      fontFamily: MONO,
                      fontSize: FS.lg,
                      cursor: 'pointer',
                    }}
                  >
                    {time} ×
                  </button>
                ))}
              </div>
            </div>
            <label>
              <div style={s.label}>Schedule timezone</div>
              <Field
                value={draftScheduleTimezone}
                onChange={e => setDraftScheduleTimezone(e.target.value)}
                placeholder={DEFAULT_TIMEZONE}
              />
            </label>
            <label>
              <div style={s.label}>Ignore email keywords</div>
              <Field
                as="textarea"
                rows={3}
                value={draftIgnoreKeywords}
                onChange={e => setDraftIgnoreKeywords(e.target.value)}
                placeholder="statement, general meeting, webinar"
                style={{ resize: 'vertical', minHeight: 86, lineHeight: 1.45 }}
              />
              <div style={{ marginTop: 5, fontSize: FS.lg, color: CLAY.textLt, lineHeight: 1.4 }}>
                Comma-separated. If a keyword appears in the sender, subject, or snippet, the worker skips Ollama for that email.
              </div>
            </label>
            <div style={{ fontSize: FS.lg, color: CLAY.textLt, lineHeight: 1.45 }}>
              Gmail credentials, Ollama model, and Gmail query stay in your local <code style={{ fontFamily: MONO }}>.env</code>. Scheduled times and ignore keywords are stored here and checked by the running local worker.
            </div>
            <div style={{ padding: 12, borderRadius: 14, background: CLAY.surf2, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: FS.lg, fontWeight: FW.semibold, color: CLAY.text }}>Rescan Gmail</div>
              <div style={{ fontSize: FS.lg, color: CLAY.textLt, lineHeight: 1.4 }}>
                Delete the scanned-message history only. Existing Mail candidates stay here, but the next sync can scan the same Gmail messages again.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  danger
                  disabled={clearingScanned}
                  onClick={clearScannedMessages}
                  style={{ flex: 1 }}
                >
                  {clearingScanned
                    ? 'Clearing...'
                    : confirmClearScanned
                    ? 'Confirm clear scanned'
                    : 'Clear scanned Gmail'}
                </Button>
                {confirmClearScanned && (
                  <Button
                    disabled={clearingScanned}
                    onClick={() => setConfirmClearScanned(false)}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button style={{ flex: 1 }} onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button variant="primary" style={{ flex: 1 }} onClick={saveWorkerSettings}>Save</Button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={triggerWorkerSync} disabled={syncing}>
            {syncing ? 'Triggering...' : 'Sync now'}
          </Button>
          <Button onClick={loadCandidates}>Refresh queue</Button>
        </div>
      </Card>

      {candidates.length === 0 ? (
        <Card compact>
          <EmptyState>
            No mail candidates yet. Trigger the local worker, then refresh this queue.
          </EmptyState>
        </Card>
      ) : (
        candidates.map(candidate => {
          const extractedDetails = candidateExtractedDetails(candidate);
          return (
          <Card key={candidate.id} compact>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ ...s.tag(candidate.kind === 'security' ? '#eef2ff' : '#ecfdf5', candidate.kind === 'security' ? '#4338ca' : '#047857') }}>
                    {candidate.kind === 'security' ? 'Security' : candidate.kind === 'income' ? 'Income' : 'Expense'}
                  </span>
                  {candidate.status === 'added' && <span style={{ ...s.tag('#dcfce7', '#15803d') }}><Check size={12} /> Added</span>}
                </div>
                <div style={{ marginTop: 10, fontSize: FS.lg, fontWeight: FW.semibold, color: CLAY.text, lineHeight: 1.3 }}>
                  {candidate.kind === 'security'
                    ? `${candidate.transactionType} ${candidate.ticker || candidate.name}`
                    : candidate.item}
                </div>
                <div style={{ marginTop: 4, fontSize: FS.lg, color: CLAY.textLt, lineHeight: 1.35 }}>
                  {candidate.subject} · {candidate.from}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: FS.lg, color: CLAY.text, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {candidate.kind === 'security'
                  ? `${candidate.currency || 'USD'} ${candidate.amount || ''}`
                  : fmt(candidate.amount, normalizeCurrency(candidate.currency, defCur))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 14 }}>
              <Field type="date" value={candidate.date || ''} onChange={e => saveCandidateEdit(candidate, 'date', e.target.value)} />
              {candidate.kind === 'security' ? (
                <>
                  <Field as="select" value={candidate.transactionType || 'BUY'} onChange={e => saveCandidateEdit(candidate, 'transactionType', e.target.value)}>
                    {SECURITY_TYPES.map(type => <option key={type}>{type}</option>)}
                  </Field>
                  {!SECURITY_CASH_TYPES.has(candidate.transactionType || 'BUY') && (
                    <>
                      <Field value={candidate.ticker || ''} onChange={e => saveCandidateEdit(candidate, 'ticker', e.target.value.toUpperCase())} placeholder="Ticker" />
                      <Field value={candidate.name || ''} onChange={e => saveCandidateEdit(candidate, 'name', e.target.value)} placeholder="Stock name" />
                    </>
                  )}
                  {['BUY', 'SELL'].includes(candidate.transactionType || 'BUY') && (
                    <>
                      <Field type="number" value={candidate.quantity ?? ''} onChange={e => saveCandidateEdit(candidate, 'quantity', e.target.value)} placeholder="Units" />
                      <Field type="number" value={candidate.price ?? ''} onChange={e => saveCandidateEdit(candidate, 'price', e.target.value)} placeholder="Price" />
                    </>
                  )}
                  <Field type="number" value={candidate.amount ?? ''} onChange={e => saveCandidateEdit(candidate, 'amount', e.target.value)} placeholder="Amount" />
                  <Field as="select" value={normalizeCurrency(candidate.currency, 'USD')} onChange={e => saveCandidateEdit(candidate, 'currency', e.target.value)}>
                    {['USD', 'HKD', 'AUD', 'CNY', 'THB', 'SGD', 'EUR', 'GBP', 'JPY'].map(currency => <option key={currency}>{currency}</option>)}
                  </Field>
                  {candidate.transactionType === 'DIVIDEND' && (
                    <Field type="number" value={candidate.taxWithheld ?? ''} onChange={e => saveCandidateEdit(candidate, 'taxWithheld', e.target.value)} placeholder="Tax withheld" />
                  )}
                  <Field value={candidate.account || ''} onChange={e => saveCandidateEdit(candidate, 'account', e.target.value)} placeholder="Account" />
                  <Field value={candidate.orderRef || ''} onChange={e => saveCandidateEdit(candidate, 'orderRef', e.target.value)} placeholder="Order ref" />
                  <Field value={candidate.notes || ''} onChange={e => saveCandidateEdit(candidate, 'notes', e.target.value)} placeholder="Notes" style={{ gridColumn: '1/-1' }} />
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                    <Field
                      value={candidate.item || ''}
                      onChange={e => saveCandidateEdit(candidate, 'item', e.target.value)}
                      placeholder="Description"
                      style={{ minWidth: 0 }}
                    />
                    <Button
                      onClick={() => clearCandidateDescription(candidate)}
                      style={{ flexShrink: 0, padding: '8px 11px' }}
                    >
                      Clear
                    </Button>
                  </div>
                  <Field as="select" value={candidate.category || 'Other'} onChange={e => saveCandidateEdit(candidate, 'category', e.target.value)}>
                    {Object.keys(BASE_CATS).map(cat => <option key={cat}>{cat}</option>)}
                  </Field>
                  <Field
                    as="select"
                    value={candidate.splitType || 'personal'}
                    onChange={e => saveCandidateEditAndPayload(candidate, 'splitType', e.target.value)}
                  >
                    {EXPENSE_SPLIT_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Field>
                </>
              )}
            </div>

            {extractedDetails.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 16, background: CLAY.surf2 }}>
                <div style={{ fontSize: FS.lg, color: CLAY.textLt, marginBottom: 8 }}>
                  Extracted details · tap to append to {candidate.kind === 'security' ? 'notes' : 'description'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {extractedDetails.map(detail => (
                    <button
                      key={`${detail.label}-${detail.value}`}
                      type="button"
                      onClick={() => appendCandidateDetail(candidate, detail.value)}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        background: CLAY.surface,
                        color: CLAY.text,
                        boxShadow: CLAY.btn,
                        padding: '7px 11px',
                        cursor: 'pointer',
                        fontFamily: MONO,
                        fontSize: FS.lg,
                        lineHeight: 1.25,
                        maxWidth: '100%',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      <span style={{ color: CLAY.textLt }}>{detail.label}: </span>{detail.value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {candidate.emailText && (
              <div style={{ marginTop: 12 }}>
                <Button onClick={() => toggleEmailText(candidate.id)}>
                  {expandedEmailText[candidate.id] ? 'Hide email text' : 'Show email text'}
                </Button>
                {expandedEmailText[candidate.id] && (
                  <pre style={{
                    margin: '10px 0 0',
                    padding: 12,
                    borderRadius: 14,
                    background: CLAY.surf2,
                    color: CLAY.textMid,
                    fontFamily: MONO,
                    fontSize: FS.md,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    maxHeight: 260,
                    overflow: 'auto',
                  }}>
                    {candidate.emailText}
                  </pre>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                disabled={candidate.status === 'added'}
                onClick={() => candidate.kind === 'security' ? addSecurity(candidate) : addExpense(candidate)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} />
                  {candidate.kind === 'security' ? 'Confirm securities transaction' : 'Add to expense'}
                </span>
              </Button>
              <Button onClick={async () => {
                await updateCandidateStatus(candidate, { status: 'dismissed' });
                setCandidates(prev => prev.filter(item => item.id !== candidate.id));
              }}>Dismiss</Button>
            </div>
          </Card>
          );
        })
      )}

    </PageShell>
  );
}
