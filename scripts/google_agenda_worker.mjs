import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { isInCooldown, isInTimeWindow, parseScheduleTimes } from './scheduler.mjs';

const ENV_PATH = path.resolve(process.cwd(), '.env');
const DEFAULT_TOKEN_FILE = path.resolve(process.cwd(), '.local_state', 'google-agenda-token.json');
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:3848/oauth2callback';
const DEFAULT_WORKER_PORT = 3867;
const DEFAULT_TIMEZONE = 'Australia/Brisbane';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks',
].join(' ');

function timestamp() {
  return new Date().toLocaleString('en-CA', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(',', '');
}

function installTimestampedConsole() {
  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const first = args[0];
      if (typeof first === 'string' && first.startsWith('[agenda]')) {
        original(`[${timestamp()}] ${first}`, ...args.slice(1));
      } else {
        original(...args);
      }
    };
  }
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function requireConfig(value, name) {
  if (!value) throw new Error(`Missing ${name}. Add it to .env or pass it as an argument.`);
  return value;
}

function saveJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, () => {});
  } else if (process.platform === 'darwin') {
    execFile('open', [url], () => {});
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function localDateInZone(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => String(parts.find((part) => part.type === type)?.value || '').padStart(2, '0');
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateRange(timeZone = DEFAULT_TIMEZONE) {
  const today = localDateInZone(new Date(), timeZone);
  const end = addDays(today, 8);
  return {
    today,
    end,
    timeMin: new Date(`${today}T00:00:00`).toISOString(),
    timeMax: new Date(`${end}T00:00:00`).toISOString(),
  };
}

function googleDateTime(value) {
  if (value?.date) return { at: new Date(`${value.date}T00:00:00`).toISOString(), allDay: true };
  return { at: value?.dateTime ? new Date(value.dateTime).toISOString() : null, allDay: false };
}

function taskDueDate(task) {
  if (!task?.due) return null;
  return new Date(task.due).toISOString().slice(0, 10);
}

async function exchangeCodeForToken({ clientId, clientSecret, redirectUri, code }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || 'Token exchange failed');
  return { ...json, expires_at: Date.now() + Number(json.expires_in || 3600) * 1000 };
}

async function refreshAccessToken({ clientId, clientSecret, token }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || 'Token refresh failed');
  return { ...token, ...json, expires_at: Date.now() + Number(json.expires_in || 3600) * 1000 };
}

async function runAuthFlow({ clientId, clientSecret, redirectUri, tokenFile }) {
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/oauth2callback') return;
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400);
        res.end('Invalid state');
        reject(new Error('Invalid OAuth state'));
        server.close();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Google Agenda connected.</h2><p>You can close this window.</p>');
      resolve(url.searchParams.get('code'));
      server.close();
    });
    server.listen(new URL(redirectUri).port || 3848, '127.0.0.1', () => {
      console.log(`Open this URL if your browser does not open automatically:\n${authUrl.toString()}\n`);
      openBrowser(authUrl.toString());
    });
  });

  const token = await exchangeCodeForToken({ clientId, clientSecret, redirectUri, code });
  saveJson(tokenFile, token);
  console.log(`[agenda] Saved Google Agenda token to ${tokenFile}`);
}

async function getAccessToken({ clientId, clientSecret, tokenFile }) {
  let token = readJson(tokenFile);
  if (!token?.refresh_token) {
    throw new Error(`No Google Agenda token found at ${tokenFile}. Run: node scripts/google_agenda_worker.mjs --auth`);
  }
  if (!token.access_token || Date.now() > Number(token.expires_at || 0) - 60000) {
    token = await refreshAccessToken({ clientId, clientSecret, token });
    saveJson(tokenFile, token);
  }
  return token.access_token;
}

async function googleFetch(token, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || json.error || `Google ${res.status}`);
  return json;
}

async function fetchPages(token, firstUrl, itemKey) {
  const items = [];
  let url = firstUrl;
  while (url) {
    const json = await googleFetch(token, url);
    items.push(...(json[itemKey] || []));
    const nextPageToken = json.nextPageToken;
    if (!nextPageToken) break;
    const nextUrl = new URL(url);
    nextUrl.searchParams.set('pageToken', nextPageToken);
    url = nextUrl.toString();
  }
  return items;
}

async function resolveUserId(supabase, configuredUserId, configuredEmail) {
  if (configuredUserId) return configuredUserId;
  if (!configuredEmail) throw new Error('Set GOOGLE_AGENDA_USER_ID, GOOGLE_AGENDA_USER_EMAIL, MAIL_USER_ID, or MAIL_USER_EMAIL in .env');
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Could not list Supabase users: ${error.message}`);
  const found = data?.users?.find(user => String(user.email || '').toLowerCase() === configuredEmail.toLowerCase());
  if (!found) throw new Error(`No Supabase user found for ${configuredEmail}`);
  return found.id;
}

async function upsertSources(supabase, userId, calendars, taskLists) {
  const rows = [
    ...calendars.map(calendar => ({
      user_id: userId,
      source_type: 'calendar',
      external_id: calendar.id,
      name: calendar.summaryOverride || calendar.summary || calendar.id,
      color: calendar.backgroundColor || calendar.foregroundColor || null,
      raw: calendar,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    ...taskLists.map(list => ({
      user_id: userId,
      source_type: 'task_list',
      external_id: list.id,
      name: list.title || list.id,
      color: null,
      raw: list,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  ];
  if (!rows.length) return [];
  const { error } = await supabase
    .from('google_agenda_sources')
    .upsert(rows, { onConflict: 'user_id,source_type,external_id', ignoreDuplicates: false });
  if (error) throw new Error(`Saving Google sources failed: ${error.message}`);

  const { data, error: selectError } = await supabase
    .from('google_agenda_sources')
    .select('*')
    .eq('user_id', userId)
    .in('source_type', ['calendar', 'task_list']);
  if (selectError) throw new Error(`Loading Google sources failed: ${selectError.message}`);
  return data || [];
}

async function syncCalendarEvents(config, token, userId, sources, range) {
  const selectedCalendars = sources.filter(source => source.source_type === 'calendar' && source.selected);
  let saved = 0;
  for (const source of selectedCalendars) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.external_id)}/events`);
    url.searchParams.set('timeMin', range.timeMin);
    url.searchParams.set('timeMax', range.timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');
    const events = await fetchPages(token, url.toString(), 'items');
    const rows = events
      .filter(event => event.status !== 'cancelled' && (event.start?.date || event.start?.dateTime))
      .map(event => {
        const start = googleDateTime(event.start);
        const end = googleDateTime(event.end);
        return {
          user_id: userId,
          source_id: source.id,
          external_id: event.id,
          title: event.summary || '(No title)',
          description: event.description || null,
          location: event.location || null,
          start_at: start.at,
          end_at: end.at,
          all_day: start.allDay,
          status: event.status || null,
          html_link: event.htmlLink || null,
          raw: event,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });
    if (rows.length) {
      const { error } = await config.supabase
        .from('google_calendar_events')
        .upsert(rows, { onConflict: 'user_id,source_id,external_id' });
      if (error) throw new Error(`Saving events for ${source.name} failed: ${error.message}`);
      saved += rows.length;
    }
  }
  return saved;
}

async function syncGoogleTasks(config, token, userId, sources) {
  const selectedTaskLists = sources.filter(source => source.source_type === 'task_list' && source.selected);
  let saved = 0;
  for (const source of selectedTaskLists) {
    const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(source.external_id)}/tasks`);
    url.searchParams.set('maxResults', '100');
    url.searchParams.set('showCompleted', 'true');
    url.searchParams.set('showHidden', 'false');
    const tasks = await fetchPages(token, url.toString(), 'items');
    const rows = tasks.map(task => ({
      user_id: userId,
      source_id: source.id,
      external_id: task.id,
      title: task.title || '(No title)',
      notes: task.notes || null,
      due_date: taskDueDate(task),
      status: task.status || null,
      is_completed: task.status === 'completed',
      completed_at: task.completed || null,
      raw: task,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await config.supabase
        .from('google_tasks_cache')
        .upsert(rows, { onConflict: 'user_id,source_id,external_id' });
      if (error) throw new Error(`Saving tasks for ${source.name} failed: ${error.message}`);
      saved += rows.length;
    }
  }
  return saved;
}

async function processPendingTaskActions(config, token, userId) {
  const { data, error } = await config.supabase
    .from('google_task_actions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(25);
  if (error) throw new Error(`Loading task actions failed: ${error.message}`);
  let processed = 0;
  for (const action of data || []) {
    const now = new Date().toISOString();
    await config.supabase
      .from('google_task_actions')
      .update({ status: 'processing', updated_at: now })
      .eq('id', action.id)
      .eq('user_id', userId);
    try {
      const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(action.google_task_list_id)}/tasks/${encodeURIComponent(action.google_task_id)}`;
      const body = action.action === 'complete'
        ? { status: 'completed', completed: now }
        : { status: 'needsAction', completed: null };
      const updated = await googleFetch(token, url, { method: 'PATCH', body: JSON.stringify(body) });
      await config.supabase
        .from('google_tasks_cache')
        .update({
          status: updated.status || body.status,
          is_completed: (updated.status || body.status) === 'completed',
          completed_at: updated.completed || null,
          raw: updated,
          synced_at: now,
          updated_at: now,
        })
        .eq('id', action.task_cache_id)
        .eq('user_id', userId);
      await config.supabase
        .from('google_task_actions')
        .update({ status: 'done', error: null, processed_at: now, updated_at: now })
        .eq('id', action.id)
        .eq('user_id', userId);
      processed += 1;
    } catch (err) {
      await config.supabase
        .from('google_task_actions')
        .update({ status: 'error', error: err.message, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', action.id)
        .eq('user_id', userId);
      console.error(`[agenda] Task action failed: ${err.message}`);
    }
  }
  return processed;
}

async function syncOnce(config) {
  const userId = config.resolvedUserId || await resolveUserId(config.supabase, config.userId, config.userEmail);
  config.resolvedUserId = userId;
  const token = await getAccessToken(config);
  const range = dateRange(config.timezone);
  console.log(`[agenda] Syncing ${range.today} to ${range.end}`);

  const processedActions = await processPendingTaskActions(config, token, userId);
  const calendars = await fetchPages(token, 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', 'items');
  const taskLists = await fetchPages(token, 'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100', 'items');
  const sources = await upsertSources(config.supabase, userId, calendars, taskLists);
  const eventCount = await syncCalendarEvents(config, token, userId, sources, range);
  const taskCount = await syncGoogleTasks(config, token, userId, sources);

  await config.supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      key: 'google_agenda_last_sync',
      value: JSON.stringify({ status: 'success', time: new Date().toISOString(), events: eventCount, tasks: taskCount, actions: processedActions }),
    }, { onConflict: 'user_id,key' });

  console.log(`[agenda] Sync complete: ${eventCount} events, ${taskCount} tasks, ${processedActions} actions`);
  return { eventCount, taskCount, processedActions };
}

function startWorkerServer(config) {
  const state = {
    running: false,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
    lastResult: null,
  };

  const run = async () => {
    if (state.running) return state;
    state.running = true;
    state.lastStartedAt = new Date().toISOString();
    state.lastError = null;
    try {
      state.lastResult = await syncOnce(config);
      state.lastFinishedAt = new Date().toISOString();
    } catch (err) {
      state.lastError = err.message;
      state.lastFinishedAt = new Date().toISOString();
      console.error(`[agenda] Sync failed: ${err.message}`);
    } finally {
      state.running = false;
    }
    return state;
  };

  const server = http.createServer((req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${config.port}`);
    if (url.pathname === '/status') {
      sendJson(res, 200, state);
      return;
    }
    if (url.pathname === '/sync' && req.method === 'POST') {
      run();
      sendJson(res, 202, { ok: true, message: 'Google Agenda sync started', lastStartedAt: state.lastStartedAt });
      return;
    }
    if (url.pathname === '/auth' && req.method === 'POST') {
      runAuthFlow(config)
        .then(() => sendJson(res, 200, { ok: true, message: 'Google Agenda connected' }))
        .catch(err => sendJson(res, 500, { error: err.message }));
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
  });

  server.listen(config.port, '127.0.0.1', () => {
    console.log(`[agenda] Local worker API listening at http://127.0.0.1:${config.port}`);
  });

  return { run, state };
}

async function upsertUserSetting(supabase, userId, key, value) {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' });
  if (error) throw new Error(`Saving ${key} failed: ${error.message}`);
}

async function getAgendaSchedule(config) {
  const userId = config.resolvedUserId || await resolveUserId(config.supabase, config.userId, config.userEmail);
  config.resolvedUserId = userId;
  const { data, error } = await config.supabase
    .from('user_settings')
    .select('key,value')
    .eq('user_id', userId)
    .in('key', ['google_agenda_sync_times', 'google_agenda_sync_timezone', 'google_agenda_last_auto_run']);
  if (error) throw new Error(`Loading agenda schedule failed: ${error.message}`);
  const settings = Object.fromEntries((data || []).map(row => [row.key, row.value]));
  let lastRun = null;
  try { lastRun = JSON.parse(settings.google_agenda_last_auto_run || 'null'); } catch {}
  return {
    userId,
    times: parseScheduleTimes(settings.google_agenda_sync_times),
    timezone: settings.google_agenda_sync_timezone || config.timezone,
    lastRun,
  };
}

async function main() {
  installTimestampedConsole();
  loadDotEnv(ENV_PATH);
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const config = {
    clientId: requireConfig(args.clientId || process.env.GOOGLE_AGENDA_CLIENT_ID || process.env.GMAIL_CLIENT_ID, 'GOOGLE_AGENDA_CLIENT_ID or GMAIL_CLIENT_ID'),
    clientSecret: requireConfig(args.clientSecret || process.env.GOOGLE_AGENDA_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET, 'GOOGLE_AGENDA_CLIENT_SECRET or GMAIL_CLIENT_SECRET'),
    redirectUri: args.redirectUri || process.env.GOOGLE_AGENDA_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    tokenFile: path.resolve(args.tokenFile || process.env.GOOGLE_AGENDA_TOKEN_FILE || DEFAULT_TOKEN_FILE),
    userId: args.userId || process.env.GOOGLE_AGENDA_USER_ID || process.env.MAIL_USER_ID || '',
    userEmail: args.userEmail || process.env.GOOGLE_AGENDA_USER_EMAIL || process.env.MAIL_USER_EMAIL || '',
    timezone: args.timezone || process.env.GOOGLE_AGENDA_TIMEZONE || DEFAULT_TIMEZONE,
    port: Number(args.port || process.env.GOOGLE_AGENDA_WORKER_PORT || DEFAULT_WORKER_PORT),
    supabase: createClient(
      requireConfig(supabaseUrl, 'SUPABASE_URL or VITE_SUPABASE_URL'),
      requireConfig(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } }
    ),
  };

  if (args.auth) {
    await runAuthFlow(config);
    return;
  }

  if (args.daemon) {
    console.log('[agenda] Starting daemon. Scheduled sync uses Agenda page settings.');
    const workerServer = startWorkerServer(config);
    const checkSchedule = async () => {
      try {
        const schedule = await getAgendaSchedule(config);
        if (!schedule.times.length) return;
        if (!isInTimeWindow(schedule.times, schedule.timezone)) return;
        if (isInCooldown(schedule.lastRun)) return;
        await upsertUserSetting(
          config.supabase,
          schedule.userId,
          'google_agenda_last_auto_run',
          JSON.stringify({ status: 'success', time: new Date().toISOString() })
        );
        console.log(`[agenda] Scheduled sync window matched (${schedule.times.join(', ')} ${schedule.timezone})`);
        workerServer.run();
      } catch (err) {
        console.error(`[agenda] Schedule check failed: ${err.message}`);
      }
    };
    await checkSchedule();
    setInterval(checkSchedule, Math.max(30, Number(process.env.GOOGLE_AGENDA_SCHEDULE_CHECK_SECONDS || 60)) * 1000);
    return;
  }

  await syncOnce(config);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
