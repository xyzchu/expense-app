/**
 * Reusable scheduler framework for the Futu local listener.
 *
 * To add a new scheduled task:
 *   1. Write getEligibleXxxUsers() — query user_settings, filter by isInTimeWindow + isInCooldown
 *   2. Write runXxxForUser(userCtx) — do the actual work
 *   3. Call scheduler.register({ name, checkIntervalMs, getEligibleUsers, run })
 *
 * The scheduler calls tick() from the main loop every 15s; it only runs a task when
 * checkIntervalMs has elapsed, and it never starts a second concurrent run for the
 * same user+task while one is in progress.
 *
 * Standard settings keys per task:
 *   {task}_schedule_times  JSON array of "HH:MM" — or a legacy single-time string
 *   news_fetch_timezone    shared IANA timezone (default: 'Asia/Hong_Kong')
 *   {task}_last_auto_run   JSON { status: 'success'|'failed', time: ISO, ...extra }
 */

export const SCHEDULE_WINDOW_MINUTES = 15;
export const DEFAULT_COOLDOWN_MS = 20 * 60 * 1000;

/**
 * Returns true if the current local time falls within windowMinutes of any entry in times[].
 * @param {string[]} times          "HH:MM" strings
 * @param {string}   tz             IANA timezone
 * @param {number}   windowMinutes  how long the window stays open (default 15)
 */
export function isInTimeWindow(times, tz, windowMinutes = SCHEDULE_WINDOW_MINUTES) {
  if (!times?.length) return false;
  try {
    const local = new Date().toLocaleString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const [hh, mm] = local.split(':').map(Number);
    const cur = hh * 60 + mm;
    return times.some(t => {
      const [th, tm] = t.split(':').map(Number);
      const target = th * 60 + tm;
      return cur >= target && cur < target + windowMinutes;
    });
  } catch { return false; }
}

/**
 * Returns true if the last run was successful and occurred within cooldownMs.
 * Use this inside getEligibleUsers() to skip users who just ran.
 * @param {{ status?: string, time?: string } | null} lastRun
 * @param {number} cooldownMs  default 20 minutes
 */
export function isInCooldown(lastRun, cooldownMs = DEFAULT_COOLDOWN_MS) {
  if (!lastRun?.time || lastRun?.status !== 'success') return false;
  return Date.now() - new Date(lastRun.time).getTime() < cooldownMs;
}

/**
 * Returns true if any scheduled time's window has already passed today (in user's timezone).
 * Use this on startup to detect missed scheduled runs.
 * @param {string[]} times          "HH:MM" strings
 * @param {string}   tz             IANA timezone
 * @param {number}   windowMinutes  how long the window stays open (default 15)
 */
export function hasScheduledTimePassed(times, tz, windowMinutes = SCHEDULE_WINDOW_MINUTES) {
  if (!times?.length) return false;
  try {
    const local = new Date().toLocaleString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const [hh, mm] = local.split(':').map(Number);
    const cur = hh * 60 + mm;
    return times.some(t => {
      const [th, tm] = t.split(':').map(Number);
      const target = th * 60 + tm;
      return cur >= target + windowMinutes;
    });
  } catch { return false; }
}

/**
 * Returns true if lastRun was successful and occurred today in the given timezone.
 * @param {{ status?: string, time?: string } | null} lastRun
 * @param {string} tz  IANA timezone
 */
export function wasRunSuccessfullyToday(lastRun, tz) {
  if (!lastRun?.time || lastRun?.status !== 'success') return false;
  try {
    const runDate = new Date(lastRun.time).toLocaleDateString('en-CA', { timeZone: tz });
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    return runDate === today;
  } catch { return false; }
}

/**
 * Parse a schedule-times setting value into an array of "HH:MM" strings.
 * Accepts:
 *   - JSON array  '["08:00","22:00"]'
 *   - Single time "08:00"
 *   - null / undefined / empty string → []
 */
export function parseScheduleTimes(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (typeof parsed === 'string' && parsed) return [parsed];
  } catch {}
  if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value.trim())) return [value.trim()];
  return [];
}

/**
 * Scheduler — register tasks, call tick() from your main loop.
 *
 * Task interface:
 * {
 *   name:             string         unique identifier shown in logs
 *   checkIntervalMs:  number         how often to evaluate eligibility (e.g. 5 * 60 * 1000)
 *   getEligibleUsers: () => Promise<Array<{ userId: string, ...extra }>>
 *                                    query DB + filter; return only users ready to run now
 *   run:              (ctx) => Promise<void>
 *                                    do the work for one user; throw on failure
 * }
 *
 * Guarantees:
 *   - getEligibleUsers() is called at most every checkIntervalMs
 *   - A user will not have two concurrent runs of the same task
 *   - Errors in run() are caught and logged; they don't affect other users
 */
export class Scheduler {
  constructor() {
    this._tasks = [];
  }

  register(task) {
    this._tasks.push({
      ...task,
      _lastCheckAt: 0,
      _running: new Set(),
    });
  }

  async tick() {
    const now = Date.now();
    for (const task of this._tasks) {
      if (now - task._lastCheckAt < task.checkIntervalMs) continue;
      task._lastCheckAt = now;

      let users;
      try {
        users = await task.getEligibleUsers();
      } catch (err) {
        console.error(`[scheduler:${task.name}] getEligibleUsers failed: ${err.message}`);
        continue;
      }

      for (const userCtx of users) {
        const { userId } = userCtx;
        if (task._running.has(userId)) continue;
        task._running.add(userId);
        task.run(userCtx)
          .catch(err => console.error(`[scheduler:${task.name}:${userId}] run failed: ${err.message}`))
          .finally(() => task._running.delete(userId));
      }
    }
  }
}
