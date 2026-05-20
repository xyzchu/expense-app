import {
  createWidgetClient,
  findUserByWidgetToken,
  formatLocalDate,
  getRequestBody,
  getRequestToken,
  setWidgetHeaders,
  zonedIsoDate as zonedDate,
} from './_shared.js';

const TASK_TIME_ZONE = 'Australia/Brisbane';
const TASK_ACTIONS = new Set(['toggle', 'complete', 'cancel', 'delay']);

const zonedIsoDate = (date = new Date(), timeZone = TASK_TIME_ZONE) => zonedDate(date, timeZone);

const addDays = (dateStr, days) => {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
};

const addMonths = (dateStr, months) => {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return formatLocalDate(date);
};

const endOfMonthFor = (dateStr) => {
  const [year, month] = String(dateStr || zonedIsoDate()).split('-').map(Number);
  const now = new Date();
  return formatLocalDate(new Date(year || now.getFullYear(), month || now.getMonth() + 1, 0));
};

const nextDueDate = (fromDate, recurrence) => {
  const safe = normalizeRecurrence(recurrence);
  if (!safe) return fromDate || zonedIsoDate();
  if (safe.dateMode === 'month-end') return endOfMonthFor(addMonths(endOfMonthFor(fromDate), safe.count));
  if (safe.unit === 'weeks') return addDays(fromDate, safe.count * 7);
  if (safe.unit === 'months') return addMonths(fromDate, safe.count);
  if (safe.unit === 'years') return addMonths(fromDate, safe.count * 12);
  return addDays(fromDate, safe.count);
};

const normalizeRecurrence = (recurrence) => {
  if (!recurrence || typeof recurrence !== 'object') return null;
  const dateMode = recurrence.dateMode === 'month-end' ? 'month-end' : 'date';
  let unit = String(recurrence.unit || 'days').toLowerCase();
  if (unit === 'day') unit = 'days';
  if (unit === 'week') unit = 'weeks';
  if (unit === 'month') unit = 'months';
  if (unit === 'year') unit = 'years';
  if (!['days', 'weeks', 'months', 'years'].includes(unit)) unit = 'days';
  const count = Math.max(1, Number(recurrence.count || 1));
  return {
    count: dateMode === 'month-end' ? 1 : count,
    unit: dateMode === 'month-end' ? 'months' : unit,
    dateMode,
  };
};

const toWidgetTask = (task, today) => {
  const recurrence = normalizeRecurrence(task.recurrence);
  return {
    id: task.id,
    title: task.title || 'Untitled task',
    group: task.group_name || 'Todo',
    dueDate: task.due_date || null,
    isDone: Boolean(task.is_done),
    isOverdue: Boolean(task.due_date && task.due_date < today && !task.is_done),
    isRecurring: Boolean(recurrence),
    recurrence,
  };
};

async function completeRecurringTask(supabase, task, userId) {
  const recurrence = normalizeRecurrence(task.recurrence);
  if (!recurrence) return null;
  const nextDate = nextDueDate(task.due_date || zonedIsoDate(), recurrence);
  const { error } = await supabase
    .from('tasks')
    .update({
      due_date: nextDate,
      recurrence,
      is_done: false,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id)
    .eq('user_id', userId);
  if (error) throw error;
  return nextDate;
}

export default async function handler(req, res) {
  setWidgetHeaders(res, 'GET,POST');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = getRequestBody(req);
  const token = getRequestToken(req, body);
  if (!token) return res.status(401).json({ error: 'Missing token' });
  const supabase = createWidgetClient();
  if (!supabase) return res.status(500).json({ error: 'Widget API is not configured' });
  let matched;
  try {
    matched = await findUserByWidgetToken(supabase, token);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!matched) return res.status(403).json({ error: 'Invalid token' });

  if (req.method === 'POST') {
    const taskId = String(body.taskId || req.query.taskId || '').trim();
    const action = String(body.action || req.query.action || 'toggle').trim();
    if (!taskId) return res.status(400).json({ error: 'Missing taskId' });
    if (!TASK_ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid action' });

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', matched.user_id)
      .single();
    if (taskError) return res.status(500).json({ error: taskError.message });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    try {
      if (action === 'delay') {
        const nextDate = addDays(task.due_date || zonedIsoDate(), 1);
        const { error: delayError } = await supabase
          .from('tasks')
          .update({
            due_date: nextDate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', task.id)
          .eq('user_id', matched.user_id);
        if (delayError) throw delayError;
        return res.status(200).json({ ok: true, action, taskId, dueDate: nextDate });
      }

      if (action === 'complete' && task.recurrence) {
        const nextDate = await completeRecurringTask(supabase, task, matched.user_id);
        return res.status(200).json({ ok: true, action, taskId, nextDate });
      }

      const nextDone = action === 'cancel' ? false : action === 'complete' ? true : !task.is_done;
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          is_done: nextDone,
          completed_at: nextDone ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id)
        .eq('user_id', matched.user_id);
      if (updateError) throw updateError;
      return res.status(200).json({ ok: true, action, taskId, isDone: nextDone });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  const today = zonedIsoDate();
  const scope = String(req.query.scope || req.query.view || 'today').trim().toLowerCase();
  const includeAllIncomplete = scope === 'all';
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', matched.user_id)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const rows = (tasks || []).filter((task) => {
    if (task.is_done) return false;
    if (includeAllIncomplete) return true;
    if (!task.due_date) return false;
    return task.due_date <= today;
  });

  const todayTasks = rows
    .filter((task) => !task.recurrence)
    .map((task) => toWidgetTask(task, today));

  const recurringTasks = rows
    .filter((task) => task.recurrence && !task.is_done)
    .map((task) => toWidgetTask(task, today));

  return res.status(200).json({
    title: 'SplitEase Tasks',
    updatedAt: new Date().toISOString(),
    today,
    scope: includeAllIncomplete ? 'all' : 'today',
    tabs: [
      { key: 'today', title: includeAllIncomplete ? 'Tasks' : 'Today', count: todayTasks.filter((task) => !task.isDone).length, tasks: todayTasks },
      { key: 'recurring', title: 'Recurring', count: recurringTasks.length, tasks: recurringTasks },
    ],
  });
}
