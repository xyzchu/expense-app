import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const WIDGET_TOKEN_KEY = 'widget_token:expense-left';

export const padDatePart = (value) => String(value).padStart(2, '0');

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const formatLocalDate = (date) => (
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
);

export const zonedIsoDate = (date = new Date(), timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return `${get('year')}-${padDatePart(get('month'))}-${padDatePart(get('day'))}`;
};

export const parseJsonObject = (value) => {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const setWidgetHeaders = (res, methods = 'GET') => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', `${methods},OPTIONS`);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

export const getRequestBody = (req) => (
  typeof req.body === 'object' && req.body ? req.body : {}
);

export const getRequestToken = (req, body = getRequestBody(req)) => (
  String(req.query.token || body.token || '').trim()
);

export function createWidgetClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function findUserByWidgetToken(supabase, token) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('user_id,value')
    .eq('key', WIDGET_TOKEN_KEY);
  if (error) throw error;
  return (data || [])
    .map((row) => ({ user_id: row.user_id, config: parseJsonObject(row.value) }))
    .find((row) => row.config?.token === token);
}
