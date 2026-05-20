import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Circle, RefreshCw, Send, Settings2, X } from 'lucide-react';
import sb from './supabaseClient';
import { CLAY, FS, FW, MONO } from './theme';
import { s } from './appConstants';
import { Button, Card, EmptyState, Field, IconButton, PageShell } from './ui';

const DEFAULT_WORKER_URL = 'http://127.0.0.1:3867';
const WORKER_SETTING_KEY = 'google_agenda_worker_url';
const SCHEDULE_TIMES_KEY = 'google_agenda_sync_times';
const SCHEDULE_TIMEZONE_KEY = 'google_agenda_sync_timezone';
const LAST_SYNC_KEY = 'google_agenda_last_sync';
const DEFAULT_TIMEZONE = 'Australia/Brisbane';
const BRISBANE_TIMEZONE = 'Australia/Brisbane';

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function brisbaneIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRISBANE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function brisbaneDayStartIso(dateStr) {
  return new Date(`${dateStr}T00:00:00+10:00`).toISOString();
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function dayLabel(dateStr) {
  const today = localIsoDate();
  const tomorrow = addDays(today, 1);
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function dateKeyFromTimestamp(value) {
  if (!value) return null;
  return brisbaneIsoDate(new Date(value));
}

function timeLabel(event) {
  if (event.all_day) return 'All day';
  const start = event.start_at ? new Date(event.start_at) : null;
  const end = event.end_at ? new Date(event.end_at) : null;
  if (!start || Number.isNaN(start.getTime())) return '';
  const fmt = { hour: '2-digit', minute: '2-digit' };
  const startText = start.toLocaleTimeString('en-AU', fmt);
  if (!end || Number.isNaN(end.getTime())) return startText;
  return `${startText}-${end.toLocaleTimeString('en-AU', fmt)}`;
}

function brisbaneDateTimeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-AU', {
    timeZone: BRISBANE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function scheduleLabel(times, timeZone) {
  if (!times.length) return 'Auto sync off';
  const zoneLabel = timeZone === BRISBANE_TIMEZONE ? 'Brisbane time' : `${timeZone} time`;
  return `Auto: ${times.join(', ')} ${zoneLabel}`;
}

function isYutonClassEvent(event, source) {
  const text = [event?.title, event?.description, event?.location, source?.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return text.includes('yuton') && text.includes('class');
}

function summarizeYutonClassEvents(events, sourcesById, expandedGroups) {
  const normalEvents = [];
  const groups = { morning: [], afternoon: [] };

  for (const event of events) {
    const source = sourcesById.get(event.source_id);
    if (!isYutonClassEvent(event, source) || event.all_day || !event.start_at) {
      normalEvents.push(event);
      continue;
    }
    const start = new Date(event.start_at);
    if (Number.isNaN(start.getTime())) {
      normalEvents.push(event);
      continue;
    }
    const bucket = start.getHours() < 12 ? 'morning' : 'afternoon';
    groups[bucket].push(event);
  }

  const summaryEvents = Object.entries(groups).flatMap(([period, items]) => {
    if (!items.length) return [];
    const starts = items.map(item => new Date(item.start_at)).filter(date => !Number.isNaN(date.getTime()));
    const ends = items
      .map(item => item.end_at ? new Date(item.end_at) : new Date(item.start_at))
      .filter(date => !Number.isNaN(date.getTime()));
    if (!starts.length) return items;
    const start = new Date(Math.min(...starts.map(date => date.getTime())));
    const end = new Date(Math.max(...ends.map(date => date.getTime())));
    const summaryId = `yuton-class-${period}-${items.map(item => item.id).join('-')}`;
    const summary = {
      ...items[0],
      id: summaryId,
      title: 'Yuton Class',
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      location: '',
      is_summary: true,
      summary_count: items.length,
      summary_period: period,
      summary_children: items,
    };
    return expandedGroups[summaryId] ? [summary, ...items] : [summary];
  });

  return [...normalEvents, ...summaryEvents].sort((a, b) => {
    const left = new Date(a.start_at || 0).getTime();
    const right = new Date(b.start_at || 0).getTime();
    return left - right;
  });
}

function parseJsonSetting(value, fallback) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function sourcePillStyle(source) {
  const color = source.color || (source.source_type === 'calendar' ? CLAY.blueDk : CLAY.green);
  return {
    border: 'none',
    borderRadius: 999,
    padding: '8px 11px',
    background: source.selected ? `${color}22` : CLAY.surf2,
    color: source.selected ? color : CLAY.textLt,
    boxShadow: source.selected ? CLAY.btn : 'none',
    cursor: 'pointer',
    fontFamily: MONO,
    fontSize: FS.lg,
  };
}

export default function GoogleAgendaTab({ user, showToast }) {
  const [workerUrl, setWorkerUrl] = useState(DEFAULT_WORKER_URL);
  const [draftWorkerUrl, setDraftWorkerUrl] = useState(DEFAULT_WORKER_URL);
  const [scheduleTimes, setScheduleTimes] = useState([]);
  const [draftScheduleTimes, setDraftScheduleTimes] = useState([]);
  const [draftScheduleTime, setDraftScheduleTime] = useState('');
  const [scheduleTimezone, setScheduleTimezone] = useState(DEFAULT_TIMEZONE);
  const [draftScheduleTimezone, setDraftScheduleTimezone] = useState(DEFAULT_TIMEZONE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [sources, setSources] = useState([]);
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [actions, setActions] = useState([]);
  const [collapsedOverdue, setCollapsedOverdue] = useState(true);
  const [expandedClassGroups, setExpandedClassGroups] = useState({});
  const [loading, setLoading] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(() => brisbaneIsoDate());
  const [taskNotes, setTaskNotes] = useState('');
  const [taskListId, setTaskListId] = useState('');

  const cleanWorkerUrl = useMemo(() => workerUrl.replace(/\/+$/, ''), [workerUrl]);
  const today = useMemo(() => brisbaneIsoDate(), []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, idx) => addDays(today, idx)), [today]);
  const endDate = days[days.length - 1];
  const sourcesById = useMemo(() => new Map(sources.map(source => [source.id, source])), [sources]);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await sb
      .from('user_settings')
      .select('key,value')
      .eq('user_id', user.id)
      .in('key', [WORKER_SETTING_KEY, SCHEDULE_TIMES_KEY, SCHEDULE_TIMEZONE_KEY, LAST_SYNC_KEY]);
    const map = Object.fromEntries((data || []).map(row => [row.key, row.value]));
    const savedUrl = String(map[WORKER_SETTING_KEY] || DEFAULT_WORKER_URL);
    const savedTimes = parseJsonSetting(map[SCHEDULE_TIMES_KEY], []);
    const savedTimezone = String(map[SCHEDULE_TIMEZONE_KEY] || DEFAULT_TIMEZONE);
    setWorkerUrl(savedUrl);
    setDraftWorkerUrl(savedUrl);
    setScheduleTimes(Array.isArray(savedTimes) ? savedTimes.filter(Boolean).sort() : []);
    setDraftScheduleTimes(Array.isArray(savedTimes) ? savedTimes.filter(Boolean).sort() : []);
    setScheduleTimezone(savedTimezone);
    setDraftScheduleTimezone(savedTimezone);
    setLastSync(parseJsonSetting(map[LAST_SYNC_KEY], null));
  }, [user]);

  const loadAgenda = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const startIso = brisbaneDayStartIso(today);
    const endIso = brisbaneDayStartIso(addDays(endDate, 1));
    const [sourceRes, eventRes, taskRes, actionRes] = await Promise.all([
      sb.from('google_agenda_sources').select('*').eq('user_id', user.id).order('source_type').order('name'),
      sb.from('google_calendar_events').select('*').eq('user_id', user.id).gte('start_at', startIso).lt('start_at', endIso).order('start_at'),
      sb.from('google_tasks_cache').select('*').eq('user_id', user.id).or(`due_date.is.null,due_date.lte.${endDate}`).order('due_date', { ascending: true, nullsFirst: false }).order('title'),
      sb.from('google_task_actions').select('*').eq('user_id', user.id).neq('status', 'done').order('created_at', { ascending: false }).limit(50),
    ]);
    if (sourceRes.error) showToast?.(`Agenda sources error: ${sourceRes.error.message}`);
    if (eventRes.error) showToast?.(`Calendar events error: ${eventRes.error.message}`);
    if (taskRes.error) showToast?.(`Google tasks error: ${taskRes.error.message}`);
    if (actionRes.error) showToast?.(`Task actions error: ${actionRes.error.message}`);
    setSources(sourceRes.data || []);
    setEvents(eventRes.data || []);
    setTasks(taskRes.data || []);
    setActions(actionRes.data || []);
    setLoading(false);
  }, [endDate, showToast, today, user]);

  useEffect(() => {
    loadSettings();
    loadAgenda();
  }, [loadAgenda, loadSettings]);

  useEffect(() => {
    const taskLists = sources.filter(source => source.source_type === 'task_list' && source.selected);
    if (taskLists.length && !taskLists.some(source => source.id === taskListId)) {
      setTaskListId(taskLists[0].id);
    }
  }, [sources, taskListId]);

  const saveSettings = async () => {
    const nextUrl = draftWorkerUrl.trim() || DEFAULT_WORKER_URL;
    const nextTimes = [...new Set(draftScheduleTimes.filter(Boolean))].sort();
    const nextTimezone = draftScheduleTimezone.trim() || DEFAULT_TIMEZONE;
    setWorkerUrl(nextUrl);
    setScheduleTimes(nextTimes);
    setScheduleTimezone(nextTimezone);
    setSettingsOpen(false);
    if (!user) return;
    const { error } = await sb.from('user_settings').upsert([
      { user_id: user.id, key: WORKER_SETTING_KEY, value: nextUrl },
      { user_id: user.id, key: SCHEDULE_TIMES_KEY, value: JSON.stringify(nextTimes) },
      { user_id: user.id, key: SCHEDULE_TIMEZONE_KEY, value: nextTimezone },
    ], { onConflict: 'user_id,key' });
    showToast?.(error ? `Agenda settings error: ${error.message}` : 'Agenda settings saved');
  };

  const addScheduleTime = () => {
    if (!draftScheduleTime) return;
    setDraftScheduleTimes(prev => [...new Set([...prev, draftScheduleTime])].sort());
    setDraftScheduleTime('');
  };

  const toggleSettings = () => {
    setSettingsOpen(open => {
      if (!open) {
        setDraftWorkerUrl(workerUrl);
        setDraftScheduleTimes(scheduleTimes);
        setDraftScheduleTimezone(scheduleTimezone);
        setDraftScheduleTime('');
      }
      return !open;
    });
  };

  const triggerWorkerSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setStatus('Contacting local Google Agenda worker...');
    try {
      const res = await fetch(`${cleanWorkerUrl}/sync`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Worker ${res.status}`);
      setStatus(json?.message || 'Google Agenda sync started');
      showToast?.(json?.message || 'Google Agenda sync started');
      const startedAt = json?.lastStartedAt || new Date().toISOString();
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await sleep(3000);
        const statusRes = await fetch(`${cleanWorkerUrl}/status`);
        const workerStatus = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) throw new Error(workerStatus?.error || `Worker ${statusRes.status}`);
        if (workerStatus.running) {
          const seconds = workerStatus.lastStartedAt
            ? Math.max(0, Math.round((Date.now() - new Date(workerStatus.lastStartedAt).getTime()) / 1000))
            : null;
          setStatus(seconds == null ? 'Google Agenda sync running...' : `Google Agenda sync running... ${seconds}s`);
          continue;
        }
        if (workerStatus.lastError) throw new Error(workerStatus.lastError);
        if (!workerStatus.lastFinishedAt || workerStatus.lastFinishedAt >= startedAt || attempt > 0) {
          await loadSettings();
          await loadAgenda();
          setStatus('Google Agenda sync finished.');
          showToast?.('Agenda refreshed');
          break;
        }
      }
    } catch (err) {
      const msg = err?.message || 'Could not reach local Google Agenda worker';
      setStatus(msg);
      showToast?.(msg);
    } finally {
      setSyncing(false);
    }
  };

  const toggleSource = async (source) => {
    const nextSelected = !source.selected;
    setSources(prev => prev.map(item => item.id === source.id ? { ...item, selected: nextSelected } : item));
    const { error } = await sb
      .from('google_agenda_sources')
      .update({ selected: nextSelected, updated_at: new Date().toISOString() })
      .eq('id', source.id)
      .eq('user_id', user.id);
    if (error) {
      showToast?.(`Source update error: ${error.message}`);
      await loadAgenda();
    }
  };

  const toggleGoogleTask = async (task) => {
    const source = sourcesById.get(task.source_id);
    if (!source) {
      showToast?.('Task list source is missing. Refresh Agenda after syncing.');
      return;
    }
    const action = task.is_completed ? 'uncomplete' : 'complete';
    const nextDone = action === 'complete';
    setTasks(prev => prev.map(item => item.id === task.id ? { ...item, is_completed: nextDone, status: nextDone ? 'completed' : 'needsAction' } : item));
    const now = new Date().toISOString();
    const { error: actionError } = await sb.from('google_task_actions').insert({
      user_id: user.id,
      task_cache_id: task.id,
      source_id: task.source_id,
      google_task_id: task.external_id,
      google_task_list_id: source.external_id,
      action,
    });
    if (actionError) {
      showToast?.(`Could not queue Google task update: ${actionError.message}`);
      await loadAgenda();
      return;
    }
    const { error: cacheError } = await sb
      .from('google_tasks_cache')
      .update({
        is_completed: nextDone,
        status: nextDone ? 'completed' : 'needsAction',
        completed_at: nextDone ? now : null,
        updated_at: now,
      })
      .eq('id', task.id)
      .eq('user_id', user.id);
    if (cacheError) showToast?.(`Task cache update error: ${cacheError.message}`);
    showToast?.(nextDone ? 'Google Task completion queued' : 'Google Task restore queued');
    await loadAgenda();
  };

  const createGoogleTask = async () => {
    const title = taskTitle.trim();
    if (!title) {
      showToast?.('Type a task first');
      return;
    }
    const source = sourcesById.get(taskListId) || sources.find(item => item.source_type === 'task_list' && item.selected);
    if (!source) {
      showToast?.('Sync Agenda once and select a Google Task list first');
      return;
    }
    const payload = {
      title,
      notes: taskNotes.trim(),
      due_date: taskDueDate || null,
    };
    const { error } = await sb.from('google_task_actions').insert({
      user_id: user.id,
      source_id: source.id,
      google_task_list_id: source.external_id,
      action: 'create',
      payload,
    });
    if (error) {
      showToast?.(`Could not queue Google task: ${error.message}`);
      return;
    }
    setTaskTitle('');
    setTaskNotes('');
    setTaskDueDate(today);
    setTaskListId(source.id);
    showToast?.('Google task queued');
    await loadAgenda();
    await triggerWorkerSync();
  };

  const visibleSources = sources.filter(source => source.selected);
  const visibleSourceIds = new Set(visibleSources.map(source => source.id));
  const filteredEvents = events.filter(event => visibleSourceIds.has(event.source_id));
  const filteredTasks = tasks.filter(task => visibleSourceIds.has(task.source_id));

  const overdueTasks = filteredTasks.filter(task => !task.is_completed && task.due_date && task.due_date < today);

  const byDay = days.map(day => {
    const dayEvents = summarizeYutonClassEvents(
      filteredEvents.filter(event => dateKeyFromTimestamp(event.start_at) === day),
      sourcesById,
      expandedClassGroups
    );
    const dayTasks = filteredTasks.filter(task => task.due_date === day);
    return { day, events: dayEvents, tasks: dayTasks };
  });

  const sourceSections = [
    { type: 'calendar', label: 'Calendars', items: sources.filter(source => source.source_type === 'calendar') },
    { type: 'task_list', label: 'Task lists', items: sources.filter(source => source.source_type === 'task_list') },
  ];
  const taskListSources = sources.filter(source => source.source_type === 'task_list' && source.selected);

  const actionErrors = actions.filter(action => action.status === 'error');
  const pendingActions = actions.filter(action => ['pending', 'processing'].includes(action.status));

  return (
    <PageShell
      title="Agenda"
      actions={(
        <div style={{ display: 'flex', gap: 8 }}>
          <IconButton onClick={toggleSettings} title={settingsOpen ? 'Hide Agenda settings' : 'Agenda settings'}><Settings2 size={16} /></IconButton>
          <IconButton onClick={loadAgenda} title="Refresh agenda"><RefreshCw size={16} /></IconButton>
        </div>
      )}
    >
      <Card compact>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: CLAY.surf2, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <CalendarDays size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS.lg, color: CLAY.text, lineHeight: 1.45 }}>
              Local Google worker syncs Calendar and Tasks into SplitEase for the next 7 days.
            </div>
            <div style={{ marginTop: 8, fontSize: FS.lg, color: CLAY.textLt, lineHeight: 1.45 }}>
              {lastSync?.time ? `Last sync ${brisbaneDateTimeLabel(lastSync.time)} Brisbane time` : 'Not synced yet'}
              {` · ${scheduleLabel(scheduleTimes, scheduleTimezone)}`}
              {pendingActions.length ? ` · ${pendingActions.length} task update(s) queued` : ''}
              {status ? ` · ${status}` : ''}
            </div>
          </div>
        </div>

        {settingsOpen && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 18, background: CLAY.surf, border: `1px solid ${CLAY.line}`, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: FS.lg, fontWeight: FW.semibold, color: CLAY.text }}>Agenda settings</div>
                <div style={{ marginTop: 3, fontSize: FS.lg, color: CLAY.textLt }}>Choose calendars/task lists and local sync settings.</div>
              </div>
              <IconButton onClick={() => setSettingsOpen(false)} title="Hide settings"><X size={16} /></IconButton>
            </div>
            <label>
              <div style={s.label}>Local worker URL</div>
              <Field value={draftWorkerUrl} onChange={e => setDraftWorkerUrl(e.target.value)} placeholder={DEFAULT_WORKER_URL} />
            </label>
            <div>
              <div style={s.label}>Scheduled sync times ({draftScheduleTimezone === BRISBANE_TIMEZONE ? 'Brisbane time' : draftScheduleTimezone})</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Field type="time" value={draftScheduleTime} onChange={e => setDraftScheduleTime(e.target.value)} style={{ maxWidth: 150 }} />
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
                    style={{ border: 'none', borderRadius: 999, background: CLAY.surf2, color: CLAY.text, padding: '7px 11px', fontFamily: MONO, fontSize: FS.lg, cursor: 'pointer' }}
                  >
                    {time} x
                  </button>
                ))}
              </div>
            </div>
            <label>
              <div style={s.label}>Schedule timezone</div>
              <Field value={draftScheduleTimezone} onChange={e => setDraftScheduleTimezone(e.target.value)} placeholder={DEFAULT_TIMEZONE} />
              <div style={{ marginTop: 6, fontSize: FS.lg, color: CLAY.textLt }}>
                Use <code style={{ fontFamily: MONO }}>Australia/Brisbane</code> to schedule in Brisbane time.
              </div>
            </label>
            {sourceSections.map(section => (
              <div key={section.type}>
                <div style={s.label}>{section.label}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {section.items.length === 0 ? (
                    <span style={{ fontSize: FS.lg, color: CLAY.textLt }}>Sync once to discover {section.label.toLowerCase()}.</span>
                  ) : section.items.map(source => (
                    <button key={source.id} type="button" onClick={() => toggleSource(source)} style={sourcePillStyle(source)}>
                      {source.source_type === 'calendar' ? 'Cal' : 'Tasks'} · {source.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button style={{ flex: 1 }} onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button variant="primary" style={{ flex: 1 }} onClick={saveSettings}>Save</Button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={triggerWorkerSync} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync now'}
          </Button>
          <Button onClick={loadAgenda}>Refresh</Button>
        </div>
      </Card>

      {actionErrors.length > 0 && (
        <Card compact style={{ border: `1px solid ${CLAY.red}44`, background: '#fff5f5' }}>
          <div style={{ fontSize: FS.lg, color: CLAY.red, lineHeight: 1.45 }}>
            {actionErrors.length} Google Task update failed. Restart the worker or run Sync now, then try again.
          </div>
        </Card>
      )}

      {sources.length === 0 && !loading ? (
        <Card compact>
          <EmptyState>
            No Google Agenda data yet. Run <code style={{ fontFamily: MONO }}>scripts\google_agenda_worker.mjs --auth</code>, start the worker, then press Sync now.
          </EmptyState>
        </Card>
      ) : null}

      <Card compact>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.semibold, color: CLAY.text }}>Add Google Task</div>
            <div style={{ marginTop: 3, fontSize: FS.lg, color: CLAY.textLt }}>Creates in Google Tasks through your local Agenda worker.</div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <Field
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  createGoogleTask();
                }
              }}
              placeholder="Describe a Google task..."
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} />
              <select value={taskListId} onChange={e => setTaskListId(e.target.value)} style={{ ...s.input, fontFamily: MONO, fontSize: FS.lg }}>
                {taskListSources.length === 0 ? (
                  <option value="">No task list synced</option>
                ) : taskListSources.map(source => (
                  <option key={source.id} value={source.id}>{source.name}</option>
                ))}
              </select>
            </div>
            <Field value={taskNotes} onChange={e => setTaskNotes(e.target.value)} placeholder="Notes (optional)" />
            <Button variant="primary" onClick={createGoogleTask} disabled={!taskTitle.trim() || taskListSources.length === 0 || syncing}>
              <Send size={16} /> Add and sync
            </Button>
          </div>
        </div>
      </Card>

      {overdueTasks.length > 0 && (
        <Card compact>
          <button
            type="button"
            onClick={() => setCollapsedOverdue(value => !value)}
            style={{ width: '100%', border: 'none', background: 'transparent', padding: 0, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontFamily: MONO }}
          >
            <span style={{ fontSize: FS.lg, color: CLAY.text }}>Overdue</span>
            <span style={{ fontSize: FS.lg, color: CLAY.textLt }}>{overdueTasks.length} open</span>
          </button>
          {!collapsedOverdue && (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {overdueTasks.map(task => <TaskRow key={task.id} task={task} source={sourcesById.get(task.source_id)} onToggle={() => toggleGoogleTask(task)} />)}
            </div>
          )}
        </Card>
      )}

      {byDay.map(({ day, events: dayEvents, tasks: dayTasks }) => (
        <Card key={day} compact>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.semibold, color: CLAY.text }}>{dayLabel(day)}</div>
            <div style={{ fontSize: FS.lg, color: CLAY.textLt }}>{dayEvents.length} event{dayEvents.length === 1 ? '' : 's'} · {dayTasks.filter(task => !task.is_completed).length} task{dayTasks.length === 1 ? '' : 's'}</div>
          </div>
          {dayEvents.length === 0 && dayTasks.length === 0 ? (
            <div style={{ color: CLAY.textLt, fontSize: FS.lg, padding: '8px 0' }}>Nothing scheduled.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {dayEvents.map(event => (
                <EventRow
                  key={event.id}
                  event={event}
                  source={sourcesById.get(event.source_id)}
                  onToggleSummary={event.is_summary ? () => setExpandedClassGroups(prev => ({ ...prev, [event.id]: !prev[event.id] })) : null}
                  expanded={!!expandedClassGroups[event.id]}
                />
              ))}
              {dayTasks.map(task => <TaskRow key={task.id} task={task} source={sourcesById.get(task.source_id)} onToggle={() => toggleGoogleTask(task)} />)}
            </div>
          )}
        </Card>
      ))}
    </PageShell>
  );
}

function EventRow({ event, source, onToggleSummary = null, expanded = false }) {
  const color = source?.color || CLAY.blueDk;
  const body = (
    <>
      <div style={{ fontSize: FS.lg, color: color, fontVariantNumeric: 'tabular-nums' }}>{timeLabel(event)}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: FS.lg, color: CLAY.text, lineHeight: 1.3 }}>
          {event.title}
          {event.is_summary ? <span style={{ color: CLAY.textLt }}> · {event.summary_period}</span> : null}
        </div>
        <div style={{ marginTop: 3, fontSize: FS.lg, color: CLAY.textLt, lineHeight: 1.35 }}>
          {event.is_summary
            ? `${event.summary_count} class${event.summary_count === 1 ? '' : 'es'} ${expanded ? 'shown' : 'hidden'} · tap to ${expanded ? 'hide' : 'show'}`
            : `${source?.name || 'Calendar'}${event.location ? ` · ${event.location}` : ''}`}
        </div>
      </div>
    </>
  );

  if (event.is_summary) {
    return (
      <button
        type="button"
        onClick={onToggleSummary}
        style={{
          display: 'grid',
          gridTemplateColumns: '82px 1fr',
          gap: 10,
          alignItems: 'start',
          padding: 10,
          borderRadius: 14,
          background: CLAY.surf2,
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: MONO,
        }}
      >
        {body}
      </button>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '82px 1fr', gap: 10, alignItems: 'start', padding: 10, borderRadius: 14, background: CLAY.surf2 }}>
      {body}
    </div>
  );
}

function TaskRow({ task, source, onToggle }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 10, alignItems: 'start', padding: 10, borderRadius: 14, background: task.is_completed ? CLAY.surf : CLAY.surf2, opacity: task.is_completed ? 0.55 : 1 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: 28, height: 28, borderRadius: 999, border: `1.5px solid ${task.is_completed ? CLAY.green : CLAY.textLt}`, background: task.is_completed ? `${CLAY.green}22` : 'transparent', color: task.is_completed ? CLAY.green : CLAY.textLt, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
      >
        {task.is_completed ? <Check size={16} /> : <Circle size={16} />}
      </button>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: FS.lg, color: CLAY.text, lineHeight: 1.3, textDecoration: task.is_completed ? 'line-through' : 'none' }}>{task.title}</div>
        <div style={{ marginTop: 3, fontSize: FS.lg, color: CLAY.textLt, lineHeight: 1.35 }}>
          {source?.name || 'Google Tasks'}{task.notes ? ` · ${task.notes}` : ''}
        </div>
      </div>
    </div>
  );
}
