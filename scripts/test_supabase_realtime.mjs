import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ENV_PATH = path.resolve(process.cwd(), '.env');

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

loadDotEnv(ENV_PATH);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const TEST_USER_ID = process.env.TEST_USER_ID || process.argv[2] || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase env vars. Need SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY.');
}

function log(message, extra) {
  const stamp = new Date().toLocaleString();
  if (extra === undefined) {
    console.log(`[${stamp}] ${message}`);
    return;
  }
  console.log(`[${stamp}] ${message}`, extra);
}

function buildRealtimeWsUrl(apiUrl, apikey) {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/realtime/v1/websocket';
  url.searchParams.set('apikey', apikey);
  url.searchParams.set('log_level', 'debug');
  url.searchParams.set('vsn', '1.0.0');
  return url.toString();
}

async function testRawWebSocket() {
  const url = buildRealtimeWsUrl(SUPABASE_URL, SUPABASE_ANON_KEY);
  log(`Opening raw websocket to ${url}`);
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Raw websocket timed out before opening'));
    }, 10000);

    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      log('Raw websocket opened successfully');
      socket.close(1000, 'diagnostic complete');
      resolve();
    });
    socket.addEventListener('error', (event) => {
      clearTimeout(timeout);
      reject(new Error(`Raw websocket error: ${event?.message || 'unknown error'}`));
    });
    socket.addEventListener('close', (event) => {
      log(`Raw websocket closed code=${event.code} reason=${event.reason || '(none)'}`);
    });
  });
}

function createRealtimeClient(apikey) {
  return createClient(SUPABASE_URL, apikey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      params: { eventsPerSecond: 2 },
    },
    global: {
      headers: {
        apikey,
        Authorization: `Bearer ${apikey}`,
      },
    },
  });
}

async function testChannelSubscription(clientLabel, apikey) {
  const client = createRealtimeClient(apikey);
  const channelName = `diagnostic-${clientLabel}-${Date.now()}`;

  log(`Creating ${clientLabel} subscription on channel ${channelName}`);

  const channel = client
    .channel(channelName)
    .on('system', {}, (payload) => {
      log(`${clientLabel} system event`, payload);
    })
    .on('presence', { event: 'sync' }, () => {
      log(`${clientLabel} presence sync`);
    })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'futu_refresh_requests',
        ...(TEST_USER_ID ? { filter: `user_id=eq.${TEST_USER_ID}` } : {}),
      },
      (payload) => {
        log(`${clientLabel} postgres_changes event`, payload);
      }
    );

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(async () => {
      await client.removeChannel(channel);
      reject(new Error(`${clientLabel} subscription timed out`));
    }, 15000);

    channel.subscribe(async (status, error) => {
      log(`${clientLabel} subscribe status: ${status}`, error || '');
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        await client.removeChannel(channel);
        resolve();
      }
      if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        clearTimeout(timeout);
        await client.removeChannel(channel);
        reject(new Error(`${clientLabel} failed with status ${status}${error ? `: ${JSON.stringify(error)}` : ''}`));
      }
    });
  });
}

async function main() {
  log('Starting Supabase Realtime diagnostics');
  log(`Supabase URL: ${SUPABASE_URL}`);
  if (TEST_USER_ID) log(`Using test user filter: ${TEST_USER_ID}`);

  try {
    await testRawWebSocket();
  } catch (error) {
    log('Raw websocket test failed');
    throw error;
  }

  try {
    await testChannelSubscription('anon', SUPABASE_ANON_KEY);
  } catch (error) {
    log('Anon channel test failed');
    throw error;
  }

  try {
    await testChannelSubscription('service_role', SUPABASE_SERVICE_ROLE_KEY);
  } catch (error) {
    log('Service-role channel test failed');
    throw error;
  }

  log('Realtime diagnostics completed successfully');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
