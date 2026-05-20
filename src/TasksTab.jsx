import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Plus, RefreshCw, Search, Send, Trash2, X } from 'lucide-react';
import { MONO, FS, FW, CLAY } from './theme';
import { s, SHELL_HEADING_STYLE } from './appConstants';

const TASK_GROUPS = [
  { name: 'Today', emoji: '☀️', color: '#3b82f6' },
  { name: 'Recurring', emoji: '🔁', color: '#10b981' },
  { name: 'Shopping', emoji: '🛒', color: '#f59e0b' },
  { name: 'Later', emoji: '🌙', color: '#8b5cf6' },
  { name: 'Home', emoji: '🏠', color: '#ec4899' },
  { name: 'Travel', emoji: '✈️', color: '#06b6d4' },
  { name: 'Admin', emoji: '📎', color: '#64748b' },
  { name: 'Research', emoji: '🔎', color: '#0ea5e9' },
  { name: 'Think', emoji: '💭', color: '#a855f7' },
  { name: 'Todo', emoji: '✅', color: '#14b8a6' },
];

const GROUP_BY_NAME = Object.fromEntries(TASK_GROUPS.map((group) => [group.name, group]));
const PINNED_FILTERS = ['Today', 'Recurring', 'Shopping', 'Home', 'Research', 'Think', 'Todo'];
const MANAGED_CATEGORIES = ['Recurring', 'Shopping', 'Home', 'Research', 'Think', 'Todo'];
const REMOVED_CATEGORIES = new Set(['Today', 'Later', 'Travel', 'Admin']);
const DEFAULT_GROUP = 'Todo';
const GROUP_KEYWORDS = [
  ['Shopping', /\b(shop|shopping|buy|purchase|grocer|grocery|milk|bread|supermarket|list)\b/i],
  ['Research', /\b(research|look up|investigate|compare|find out|study)\b/i],
  ['Think', /\b(think|brainstorm|consider|decide|plan|reflect)\b/i],
  ['Todo', /\b(todo|to do|task|follow up|follow-up)\b/i],
  ['Travel', /\b(travel|trip|flight|hotel|passport|visa|luggage|booking)\b/i],
  ['Home', /\b(home|house|clean|repair|garden|laundry|bin|rubbish|recycle|kitchen)\b/i],
  ['Admin', /\b(admin|tax|bill|paperwork|document|renew|insurance|appointment)\b/i],
  ['Later', /\b(later|someday|non urgent|non-urgent|eventually|whenever)\b/i],
];
const TASK_CATEGORY_NAMES = MANAGED_CATEGORIES.map((name) => name.toLowerCase());
const COLLAPSED_SECTION_PREFIX = '__collapsed__';

const todayIso = () => new Date().toISOString().slice(0, 10);
const MONTH_LOOKUP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};
const addDays = (date, days) => {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return formatLocalDate(next);
};
const addMonths = (date, months) => {
  const next = new Date(`${date}T00:00:00`);
  next.setMonth(next.getMonth() + months);
  return formatLocalDate(next);
};
const endOfMonthFor = (date = todayIso()) => {
  const [year, month] = String(date || todayIso()).split('-').map(Number);
  const now = new Date();
  return formatLocalDate(new Date(year || now.getFullYear(), month || (now.getMonth() + 1), 0));
};
const shortDate = (date) => {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
};
const sectionDate = (date) => {
  if (!date) return 'No date';
  const today = todayIso();
  const tomorrow = addDays(today, 1);
  if (date < today) return 'Overdue';
  if (date === today) return 'Today';
  if (date === tomorrow) return 'Tomorrow';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' });
};
const groupMeta = (name) => GROUP_BY_NAME[name] || { name, emoji: '📝', color: CLAY.textMid };

const sq = (style) => ({ fontFamily: MONO, ...style });

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normaliseYearMonthDay(year, month, day) {
  const now = new Date();
  const parsedYear = year || now.getFullYear();
  const date = new Date(parsedYear, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (!year && date < new Date(todayIso() + 'T00:00:00')) date.setFullYear(date.getFullYear() + 1);
  return formatLocalDate(date);
}

function parseLooseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const today = todayIso();
  if (/^today$/i.test(raw)) return today;
  if (/^tomorrow$/i.test(raw)) return addDays(today, 1);
  if (/^next\s+week$/i.test(raw)) return addDays(today, 7);

  const iso = raw.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return normaliseYearMonthDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = raw.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](20\d{2}))?$/);
  if (slash) return normaliseYearMonthDay(slash[3] ? Number(slash[3]) : null, Number(slash[2]), Number(slash[1]));

  const monthName = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(20\d{2}))?$/i)
    || raw.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(20\d{2}))?$/i);
  if (monthName) {
    const firstIsMonth = Number.isNaN(Number(monthName[1]));
    const day = firstIsMonth ? Number(monthName[2]) : Number(monthName[1]);
    const monthWord = (firstIsMonth ? monthName[1] : monthName[2]).toLowerCase();
    const month = MONTH_LOOKUP[monthWord];
    const year = monthName[3] ? Number(monthName[3]) : null;
    if (month && day) return normaliseYearMonthDay(year, month, day);
  }

  return null;
}

function nextDueDate(fromDate, recurrence) {
  if (recurrence?.dateMode === 'month-end') {
    return endOfMonthFor(addMonths(endOfMonthFor(fromDate), Math.max(1, Number(recurrence?.count || 1))));
  }
  const count = Math.max(1, Number(recurrence?.count || 1));
  const unit = recurrence?.unit || 'days';
  if (unit === 'weeks') return addDays(fromDate, count * 7);
  if (unit === 'months') return addMonths(fromDate, count);
  if (unit === 'years') return addMonths(fromDate, count * 12);
  return addDays(fromDate, count);
}

function normalizeRecurrence(recurrence, title = '') {
  if (!recurrence) return null;
  const titleMatch = String(title || '').match(/\bevery\s+(\d+)\s*(day|days|week|weeks|month|months|year|years)\b/i);
  let count = Math.max(1, Number(recurrence.count || 1));
  let unit = recurrence.unit || 'days';
  if (titleMatch) {
    count = Math.max(1, Number(titleMatch[1] || count));
    unit = titleMatch[2].toLowerCase();
  }
  if (unit === 'day') unit = 'days';
  if (unit === 'week') unit = 'weeks';
  if (unit === 'month') unit = 'months';
  if (unit === 'year') unit = 'years';
  if (!['days', 'weeks', 'months', 'years'].includes(unit)) unit = 'days';
  const dateMode = recurrence.dateMode === 'month-end' ? 'month-end' : 'date';
  return { count: dateMode === 'month-end' ? 1 : count, unit: dateMode === 'month-end' ? 'months' : unit, dateMode };
}

function parseDateHint(text) {
  let next = text;
  let dueDate = null;
  const today = todayIso();

  const startingMatch = next.match(/\b(?:starting|start(?:s)?|from)\s+((?:today|tomorrow|next\s+week)|(?:20\d{2}-\d{1,2}-\d{1,2})|(?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-]20\d{2})?)|(?:\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+20\d{2})?)|(?:[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+20\d{2})?))/i);
  if (startingMatch) {
    dueDate = parseLooseDate(startingMatch[1]);
    next = next.replace(startingMatch[0], ' ');
  }

  if (/\btoday\b/i.test(next)) {
    dueDate = today;
    next = next.replace(/\btoday\b/ig, ' ');
  } else if (/\btomorrow\b/i.test(next)) {
    dueDate = addDays(today, 1);
    next = next.replace(/\btomorrow\b/ig, ' ');
  } else if (/\bnext\s+week\b/i.test(next)) {
    dueDate = addDays(today, 7);
    next = next.replace(/\bnext\s+week\b/ig, ' ');
  }

  const isoMatch = next.match(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/);
  if (isoMatch) {
    dueDate = parseLooseDate(isoMatch[1]);
    next = next.replace(isoMatch[0], ' ');
  }

  const looseDateMatch = next.match(/\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)(?:\s+20\d{2})?)\b/i)
    || next.match(/\b((?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+20\d{2})?)\b/i)
    || next.match(/\b(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]20\d{2})?)\b/);
  if (!dueDate && looseDateMatch) {
    dueDate = parseLooseDate(looseDateMatch[1]);
    next = next.replace(looseDateMatch[0], ' ');
  }

  return { text: next, dueDate };
}

function parseRecurrenceHint(text) {
  let next = text;
  const eomMatch = next.match(/\b(?:eom|month\s*end|end\s+of\s+(?:each\s+|every\s+|the\s+)?month|last\s+day\s+of\s+(?:each\s+|every\s+|the\s+)?month)\b/i);
  if (eomMatch) {
    next = next.replace(eomMatch[0], ' ');
    return { text: next, recurrence: { count: 1, unit: 'months', dateMode: 'month-end' } };
  }
  const match = next.match(/\b(?:every|each)\s+(\d+)?\s*(day|days|week|weeks|month|months|year|years)\b/i)
    || next.match(/\b(daily|weekly|monthly|yearly|annually|annual)\b/i);
  if (!match) return { text: next, recurrence: null };

  let count = Number(match[1] || 1);
  let unit = (match[2] || match[1] || 'days').toLowerCase();
  if (unit === 'daily') unit = 'days';
  if (unit === 'weekly') unit = 'weeks';
  if (unit === 'monthly') unit = 'months';
  if (unit === 'yearly' || unit === 'annually' || unit === 'annual') unit = 'years';
  if (unit === 'day') unit = 'days';
  if (unit === 'week') unit = 'weeks';
  if (unit === 'month') unit = 'months';
  if (unit === 'year') unit = 'years';
  if (!Number.isFinite(count) || count < 1) count = 1;

  next = next.replace(match[0], ' ');
  return { text: next, recurrence: { count, unit, dateMode: 'date' } };
}

function parseGroupHint(text, recurrence) {
  let next = text;
  let group = recurrence ? 'Recurring' : DEFAULT_GROUP;

  const hashMatch = next.match(/(^|\s)#([A-Za-z][\w-]*)/);
  if (hashMatch) {
    group = hashMatch[2].replace(/[-_]/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
    next = next.replace(hashMatch[0], ' ');
  }

  const groupMatch = next.match(/\b(?:group|category|cat|in)\s*[:=]\s*([A-Za-z][\w -]{1,24})$/i)
    || next.match(/\b(?:group|category|cat)\s+([A-Za-z][\w -]{1,24})$/i);
  if (groupMatch) {
    group = groupMatch[1].trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
    next = next.replace(groupMatch[0], ' ');
  }

  const trailingCategoryMatch = next.match(/\b([A-Za-z]+)\s*$/);
  if (!hashMatch && !groupMatch && trailingCategoryMatch) {
    const category = TASK_CATEGORY_NAMES.find((name) => name === trailingCategoryMatch[1].toLowerCase());
    if (category) {
      group = MANAGED_CATEGORIES.find((name) => name.toLowerCase() === category) || group;
      next = next.slice(0, trailingCategoryMatch.index).trim();
    }
  }

  if (!hashMatch && !groupMatch) {
    const detected = GROUP_KEYWORDS.find(([, pattern]) => pattern.test(next));
    if (detected) group = detected[0];
  }

  return { text: next, group };
}

function parseTaskInput(raw) {
  let text = String(raw || '').trim();
  if (!text) return null;

  const recurrenceResult = parseRecurrenceHint(text);
  text = recurrenceResult.text;
  const dateResult = parseDateHint(text);
  text = dateResult.text;
  const groupResult = parseGroupHint(text, recurrenceResult.recurrence);
  text = groupResult.text;

  const title = text
    .replace(/\b(please|task|todo|to do|remind me to|need to)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title: title || raw.trim(),
    group_name: groupResult.group,
    due_date: dateResult.dueDate || (recurrenceResult.recurrence ? todayIso() : null),
    recurrence: recurrenceResult.recurrence,
  };
}

export default function TasksTab({ user, sb, showToast, focusRequest = 0 }) {
  const [tasks, setTasks] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeGroup, setActiveGroup] = useState('All');
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(['Today', 'Recurring', 'Shopping', 'Later']));
  const [editingTask, setEditingTask] = useState(null);
  const [recurrenceChoiceTask, setRecurrenceChoiceTask] = useState(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [previewEditor, setPreviewEditor] = useState(null);
  const [previewDueOverride, setPreviewDueOverride] = useState(null);
  const [previewRecurrenceOverride, setPreviewRecurrenceOverride] = useState(null);
  const [lastCompletedTask, setLastCompletedTask] = useState(null);
  const [completingTaskId, setCompletingTaskId] = useState(null);
  const inputRef = useRef(null);
  const [customCategories, setCustomCategories] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('splitease_task_categories') || '[]');
    } catch {
      return [];
    }
  });

  const normalizeTaskGroup = (task) => {
    if (!REMOVED_CATEGORIES.has(task.group_name)) return task.group_name || 'Home';
    return task.recurrence ? 'Recurring' : 'Home';
  };

  const loadTasks = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await sb
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('is_done', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) showToast?.(`Could not load tasks: ${error.message}`);
    const rows = data || [];
    const staleGroupRows = rows.filter((task) => REMOVED_CATEGORIES.has(task.group_name));
    const repairRows = rows.filter((task) => {
      const fixed = normalizeRecurrence(task.recurrence, task.title);
      return fixed && (
        Number(task.recurrence?.count || 1) !== fixed.count ||
        String(task.recurrence?.unit || 'days') !== fixed.unit
      );
    });
    if (repairRows.length || staleGroupRows.length) {
      await Promise.all([
        ...repairRows.map((task) => sb
        .from('tasks')
        .update({ recurrence: normalizeRecurrence(task.recurrence, task.title), updated_at: new Date().toISOString() })
        .eq('id', task.id)
        .eq('user_id', user.id)
        ),
        ...staleGroupRows.map((task) => sb
          .from('tasks')
          .update({ group_name: normalizeTaskGroup(task), updated_at: new Date().toISOString() })
          .eq('id', task.id)
          .eq('user_id', user.id)
        ),
      ]);
      const repairedById = new Map(repairRows.map((task) => [task.id, normalizeRecurrence(task.recurrence, task.title)]));
      setTasks(rows.map((task) => ({
        ...task,
        recurrence: repairedById.has(task.id) ? repairedById.get(task.id) : task.recurrence,
        group_name: REMOVED_CATEGORIES.has(task.group_name) ? normalizeTaskGroup(task) : task.group_name,
      })));
    } else {
      setTasks(rows);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTasks();
  }, [user]);

  useEffect(() => {
    localStorage.setItem('splitease_task_categories', JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => {
    if (!focusRequest) return;
    window.setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      inputRef.current?.focus();
    }, 120);
  }, [focusRequest]);

  useEffect(() => {
    setPreviewEditor(null);
    setPreviewDueOverride(null);
    setPreviewRecurrenceOverride(null);
  }, [input]);

  const parsedPreview = useMemo(() => {
    const parsed = parseTaskInput(input);
    if (!parsed) return null;
    return {
      ...parsed,
      due_date: (previewRecurrenceOverride ?? parsed.recurrence)?.dateMode === 'month-end'
        ? endOfMonthFor(previewDueOverride ?? parsed.due_date ?? todayIso())
        : previewDueOverride ?? parsed.due_date,
      recurrence: previewRecurrenceOverride ?? parsed.recurrence,
      group_name: previewRecurrenceOverride ? 'Recurring' : parsed.group_name,
    };
  }, [input, previewDueOverride, previewRecurrenceOverride]);
  const groupNames = useMemo(() => {
    const names = [...PINNED_FILTERS, ...tasks.map((task) => task.group_name).filter(Boolean)]
      .filter((name) => name === 'Today' || !REMOVED_CATEGORIES.has(name));
    return ['All', ...Array.from(new Set(names))];
  }, [tasks]);
  const categoryNames = useMemo(() => {
    const names = [...MANAGED_CATEGORIES, ...customCategories, ...tasks.map((task) => task.group_name).filter(Boolean)];
    return Array.from(new Set(names))
      .filter((name) => name && !REMOVED_CATEGORIES.has(name))
      .sort((a, b) => a.localeCompare(b));
  }, [tasks, customCategories]);

  const visibleTasks = useMemo(() => {
    const rows = activeGroup === 'All'
      ? tasks
      : activeGroup === 'Today'
        ? tasks.filter((task) => task.due_date === todayIso() && !task.is_done)
        : tasks.filter((task) => task.group_name === activeGroup);
    const query = searchTerm.trim().toLowerCase();
    const searchedRows = query
      ? rows.filter((task) => [
        task.title,
        task.notes,
        task.group_name,
        task.due_date,
        shortDate(task.due_date),
        task.recurrence?.dateMode === 'month-end' ? 'end of each month' : task.recurrence ? `every ${task.recurrence.count || 1} ${task.recurrence.unit || 'days'}` : '',
      ].filter(Boolean).join(' ').toLowerCase().includes(query))
      : rows;
    return searchedRows.slice().sort((a, b) => {
      if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
      if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date && !b.due_date) return -1;
      if (!a.due_date && b.due_date) return 1;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }, [tasks, activeGroup, searchTerm]);

  const datedTasks = useMemo(() => {
    const map = new Map();
    visibleTasks.forEach((task) => {
      const section = task.is_done ? 'Completed' : sectionDate(task.due_date);
      if (!map.has(section)) map.set(section, []);
      map.get(section).push(task);
    });
    return [...map.entries()];
  }, [visibleTasks]);

  const addTask = async () => {
    const parsed = parsedPreview;
    if (!parsed) return;
    const { error } = await sb.from('tasks').insert({
      user_id: user.id,
      title: parsed.title,
      group_name: parsed.group_name,
      due_date: parsed.due_date,
      recurrence: parsed.recurrence,
    });
    if (error) {
      showToast?.(`Could not add task: ${error.message}`);
      return;
    }
    setInput('');
    showToast?.('Task added');
    await loadTasks();
  };

  const advanceRecurringTask = async (task, baseDate) => {
    const recurrence = normalizeRecurrence(task.recurrence, task.title);
    const nextDate = nextDueDate(baseDate || task.due_date || todayIso(), recurrence);
    const { error } = await sb.from('tasks').update({
      due_date: nextDate,
      recurrence,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', task.id).eq('user_id', user.id);
    if (error) showToast?.(`Could not update recurring task: ${error.message}`);
    else showToast?.(`Moved to ${shortDate(nextDate)}`);
    setRecurrenceChoiceTask(null);
    await loadTasks();
  };

  const completeTask = async (task) => {
    if (task.is_done) {
      await restoreTask(task);
      return;
    }
    if (task.recurrence) {
      setRecurrenceChoiceTask(task);
      return;
    } else {
      setCompletingTaskId(task.id);
      const nextDone = !task.is_done;
      const { error } = await sb.from('tasks').update({
        is_done: nextDone,
        completed_at: task.is_done ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', task.id).eq('user_id', user.id);
      if (error) showToast?.(`Could not update task: ${error.message}`);
      else setLastCompletedTask(nextDone ? { id: task.id, title: task.title } : null);
    }
    await loadTasks();
    setCompletingTaskId(null);
  };

  const restoreTask = async (task) => {
    const { error } = await sb.from('tasks').update({
      is_done: false,
      completed_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id).eq('user_id', user.id);
    if (error) {
      showToast?.(`Could not undo task: ${error.message}`);
      return;
    }
    setLastCompletedTask(null);
    showToast?.(`${task.title || 'Task'} restored`);
    await loadTasks();
  };

  const undoCompleteTask = async () => {
    if (!lastCompletedTask) return;
    await restoreTask(lastCompletedTask);
  };

  const saveTask = async (task) => {
    const recurrence = normalizeRecurrence(task.recurrence, task.title);
    const { error } = await sb.from('tasks').update({
      title: task.title,
      group_name: task.group_name || DEFAULT_GROUP,
      due_date: task.due_date || null,
      recurrence,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id).eq('user_id', user.id);
    if (error) showToast?.(`Could not save task: ${error.message}`);
    else {
      setEditingTask(null);
      showToast?.('Task saved');
      await loadTasks();
    }
  };

  const deleteTask = async (task) => {
    const { error } = await sb.from('tasks').delete().eq('id', task.id).eq('user_id', user.id);
    if (error) showToast?.(`Could not delete task: ${error.message}`);
    else {
      setDeleteConfirmId(null);
      showToast?.('Task deleted');
      await loadTasks();
    }
  };

  const requestDeleteTask = (task) => {
    if (deleteConfirmId === task.id) {
      deleteTask(task);
      return;
    }
    setDeleteConfirmId(task.id);
  };

  const delayTaskOneDay = async (task) => {
    const nextDate = addDays(task.due_date || todayIso(), 1);
    const { error } = await sb.from('tasks').update({
      due_date: nextDate,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id).eq('user_id', user.id);
    if (error) showToast?.(`Could not delay task: ${error.message}`);
    else {
      showToast?.(`Delayed to ${shortDate(nextDate)}`);
      await loadTasks();
    }
  };

  const addCategory = () => {
    const name = newCategoryName.trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
    if (!name) return;
    if (REMOVED_CATEGORIES.has(name)) {
      showToast?.(`${name} is a filter, not a task category`);
      setNewCategoryName('');
      return;
    }
    if (!categoryNames.includes(name)) {
      setCustomCategories((items) => [...items, name].sort((a, b) => a.localeCompare(b)));
      showToast?.(`Category ${name} added`);
    }
    setNewCategoryName('');
  };

  const renameCategory = async (from, to) => {
    const name = String(to || '').trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
    if (!name || name === from) return;
    if (REMOVED_CATEGORIES.has(name)) {
      showToast?.(`${name} is a filter, not a task category`);
      return;
    }
    setCustomCategories((items) => items.map((item) => item === from ? name : item));
    const { error } = await sb.from('tasks').update({
      group_name: name,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('group_name', from);
    if (error) showToast?.(`Could not rename category: ${error.message}`);
    else {
      showToast?.('Category renamed');
      if (activeGroup === from) setActiveGroup(name);
      await loadTasks();
    }
  };

  const deleteCategory = async (name) => {
    const fallback = name === 'Home' ? 'Recurring' : 'Home';
    setCustomCategories((items) => items.filter((item) => item !== name));
    const { error } = await sb.from('tasks').update({
      group_name: fallback,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('group_name', name);
    if (error) showToast?.(`Could not delete category: ${error.message}`);
    else {
      showToast?.(`Moved ${name} tasks to ${fallback}`);
      if (activeGroup === name) setActiveGroup('All');
      await loadTasks();
    }
  };

  const toggleGroup = (group) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      const collapsedKey = `${COLLAPSED_SECTION_PREFIX}${group}`;
      const isExpanded = next.has(group) || (group !== 'Overdue' && !next.has(collapsedKey));
      if (isExpanded) {
        next.delete(group);
        next.add(collapsedKey);
      } else {
        next.add(group);
        next.delete(collapsedKey);
      }
      return next;
    });
  };

  const RecurringChoiceModal = recurrenceChoiceTask && (() => {
    const recurrence = normalizeRecurrence(recurrenceChoiceTask.recurrence, recurrenceChoiceTask.title);
    const dueBase = recurrenceChoiceTask.due_date || todayIso();
    const todayBase = todayIso();
    const dueNext = nextDueDate(dueBase, recurrence);
    const todayNext = nextDueDate(todayBase, recurrence);
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,36,32,0.25)', zIndex: 90, display: 'grid', placeItems: 'center', padding: 18 }}>
        <div style={{ background: CLAY.surface, borderRadius: 22, boxShadow: CLAY.shadow, padding: 18, width: '100%', maxWidth: 420 }}>
          <div style={sq({ fontSize: FS.lg, color: CLAY.text, marginBottom: 6 })}>Complete recurring task?</div>
          <div style={sq({ fontSize: FS.lg, color: CLAY.textMid, marginBottom: 14 })}>
            {recurrenceChoiceTask.title}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <button
              onClick={() => advanceRecurringTask(recurrenceChoiceTask, dueBase)}
              style={{ ...s.btnDark, textAlign: 'left' }}
            >
              Keep schedule · next {shortDate(dueNext)}
            </button>
            <button
              onClick={() => advanceRecurringTask(recurrenceChoiceTask, todayBase)}
              style={{ ...s.btnOutline, background: CLAY.surface, boxShadow: CLAY.btn, textAlign: 'left' }}
            >
              Shift from today · next {shortDate(todayNext)}
            </button>
            <button
              onClick={() => setRecurrenceChoiceTask(null)}
              style={{ ...s.ghost, padding: 10 }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  })();

  const renderTaskCard = (task) => {
    const meta = groupMeta(task.group_name);
    const editing = editingTask?.id === task.id;
    if (editing) {
      return (
        <div key={task.id} style={{ background: CLAY.surface, borderRadius: 18, boxShadow: CLAY.shadowSm, padding: 14, marginBottom: 10 }}>
          <input value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} style={{ ...s.input, marginBottom: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <select value={editingTask.group_name || DEFAULT_GROUP} onChange={(e) => setEditingTask({ ...editingTask, group_name: e.target.value })} style={s.input}>
              {categoryNames.map((category) => <option key={category} value={category}>{groupMeta(category).emoji} {category}</option>)}
            </select>
            <input type="date" value={editingTask.due_date || ''} onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })} style={s.input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <input type="number" min="1" value={editingTask.recurrence?.count || ''} onChange={(e) => setEditingTask({ ...editingTask, recurrence: e.target.value ? { count: e.target.value, unit: editingTask.recurrence?.unit || 'days', dateMode: editingTask.recurrence?.dateMode || 'date' } : null })} placeholder="Repeat every" style={s.input} />
            <select value={editingTask.recurrence?.unit || 'days'} onChange={(e) => setEditingTask({ ...editingTask, recurrence: { count: editingTask.recurrence?.count || 1, unit: e.target.value, dateMode: editingTask.recurrence?.dateMode || 'date' } })} style={s.input}>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
              <option value="years">years</option>
            </select>
          </div>
          <select
            value={editingTask.recurrence?.dateMode || 'date'}
            onChange={(e) => {
              const mode = e.target.value;
              setEditingTask({
                ...editingTask,
                due_date: mode === 'month-end' ? endOfMonthFor(editingTask.due_date || todayIso()) : editingTask.due_date,
                recurrence: mode === 'month-end'
                  ? { count: 1, unit: 'months', dateMode: 'month-end' }
                  : { count: editingTask.recurrence?.count || 1, unit: editingTask.recurrence?.unit || 'days', dateMode: 'date' },
              });
            }}
            style={{ ...s.input, marginBottom: 10 }}
          >
            <option value="date">Selected date repeat</option>
            <option value="month-end">End of each month</option>
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditingTask(null)} style={{ ...s.sm(false), flex: 1 }}>Cancel</button>
            <button onClick={() => saveTask(editingTask)} style={{ ...s.sm(true), flex: 1 }}>Save</button>
          </div>
        </div>
      );
    }

    const confirmingDelete = deleteConfirmId === task.id;
    const showingCompleteTick = task.is_done || completingTaskId === task.id;

    return (
      <div key={task.id} style={{ background: task.is_done ? CLAY.surf2 : CLAY.surface, borderRadius: 18, boxShadow: task.is_done ? CLAY.inset : CLAY.shadowSm, padding: 14, marginBottom: 10, opacity: task.is_done ? 0.55 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <button
            onClick={() => completeTask(task)}
            aria-label={task.is_done ? 'Restore task' : 'Complete task'}
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              border: `1.6px solid ${showingCompleteTick ? CLAY.sageDk : CLAY.textLt}`,
              background: showingCompleteTick ? CLAY.sage : 'transparent',
              color: showingCompleteTick ? CLAY.sageDk : 'transparent',
              boxShadow: showingCompleteTick ? CLAY.btn : 'none',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              transition: 'background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease',
              transform: completingTaskId === task.id ? 'scale(0.94)' : 'scale(1)',
            }}
          >
            {showingCompleteTick && <Check size={17} strokeWidth={2.4} />}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={sq({ fontSize: FS.lg, color: CLAY.text, textDecoration: task.is_done ? 'line-through' : 'none', marginBottom: 7 })}>{task.title}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...s.tag(`${meta.color}18`, meta.color), fontSize: FS.compact }}>{meta.emoji} {task.group_name}</span>
              {task.due_date && <span style={{ ...s.tag(CLAY.surf2, CLAY.textMid), fontSize: FS.compact }}>{shortDate(task.due_date)}</span>}
              {task.recurrence && <span style={{ ...s.tag(`${CLAY.green}18`, CLAY.green), fontSize: FS.compact }}>{task.recurrence.dateMode === 'month-end' ? 'end of each month' : `every ${task.recurrence.count || 1} ${task.recurrence.unit || 'days'}`}</span>}
            </div>
          </div>
          {task.is_done ? (
            <button onClick={() => restoreTask(task)} style={{ ...s.sm(false), padding: '6px 10px', flexShrink: 0 }}>Undo</button>
          ) : (
            <button onClick={() => delayTaskOneDay(task)} style={{ ...s.ghost, padding: 4, flexShrink: 0 }}>+1d</button>
          )}
          <button onClick={() => setEditingTask(task)} style={{ ...s.ghost, padding: 4, flexShrink: 0 }}>Edit</button>
          {confirmingDelete && (
            <button onClick={() => setDeleteConfirmId(null)} style={{ ...s.ghost, padding: 4, flexShrink: 0 }}>Cancel</button>
          )}
          <button
            onClick={() => requestDeleteTask(task)}
            style={{
              ...s.ghost,
              padding: confirmingDelete ? '4px 8px' : 4,
              flexShrink: 0,
              color: CLAY.red,
              background: confirmingDelete ? `${CLAY.red}14` : 'transparent',
              borderRadius: 999,
            }}
          >
            {confirmingDelete ? 'Delete?' : <Trash2 size={16} />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ ...s.page, padding: '38px 16px 96px' }}>
      {RecurringChoiceModal}
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={SHELL_HEADING_STYLE}>Tasks</h1>

        {lastCompletedTask && (
          <div style={{ background: CLAY.surface, borderRadius: 16, boxShadow: CLAY.shadowSm, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={sq({ flex: 1, minWidth: 0, color: CLAY.textMid, fontSize: FS.md })}>
              Completed {lastCompletedTask.title}
            </div>
            <button onClick={undoCompleteTask} style={{ ...s.sm(false), flexShrink: 0 }}>Undo</button>
            <button onClick={() => setLastCompletedTask(null)} style={{ ...s.ghost, padding: 4, flexShrink: 0 }}><X size={16} /></button>
          </div>
        )}

        <div style={{ background: CLAY.surface, borderRadius: 20, boxShadow: CLAY.shadow, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: CLAY.surface, boxShadow: CLAY.inset, borderRadius: 14, padding: '4px 6px 4px 12px', marginBottom: 10 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
              placeholder="Describe a task..."
              style={{ ...s.input, background: 'transparent', boxShadow: 'none', padding: '9px 0', margin: 0, flex: 1 }}
            />
            <button
              onClick={addTask}
              disabled={!input.trim()}
              aria-label="Add task"
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                border: 'none',
                display: 'grid',
                placeItems: 'center',
                background: input.trim() ? CLAY.text : CLAY.surf2,
                color: input.trim() ? CLAY.surface : CLAY.textLt,
                boxShadow: input.trim() ? '3px 3px 8px rgba(44,36,32,0.28)' : CLAY.btn,
                cursor: input.trim() ? 'pointer' : 'default',
                flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
          {parsedPreview && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ ...s.tag(CLAY.surf2, CLAY.textMid), fontSize: FS.compact }}>{parsedPreview.title}</span>
                <span style={{ ...s.tag(`${groupMeta(parsedPreview.group_name).color}18`, groupMeta(parsedPreview.group_name).color), fontSize: FS.compact }}>{parsedPreview.group_name}</span>
                {parsedPreview.due_date && (
                  <button
                    type="button"
                    onClick={() => setPreviewEditor(previewEditor === 'date' ? null : 'date')}
                    style={{ ...s.tag(CLAY.surf2, CLAY.textMid), border: 'none', cursor: 'pointer', fontSize: FS.compact }}
                  >
                    {shortDate(parsedPreview.due_date)}
                  </button>
                )}
                {parsedPreview.recurrence && (
                  <button
                    type="button"
                    onClick={() => setPreviewEditor(previewEditor === 'recurrence' ? null : 'recurrence')}
                    style={{ ...s.tag(`${CLAY.green}18`, CLAY.green), border: 'none', cursor: 'pointer', fontSize: FS.compact }}
                  >
                    {parsedPreview.recurrence.dateMode === 'month-end' ? 'end of each month' : `every ${parsedPreview.recurrence.count} ${parsedPreview.recurrence.unit}`}
                  </button>
                )}
              </div>
              {previewEditor === 'date' && parsedPreview.due_date && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 10 }}>
                  <input
                    type="date"
                    value={parsedPreview.due_date}
                    onChange={(e) => setPreviewDueOverride(e.target.value || null)}
                    style={s.input}
                  />
                  <button type="button" onClick={() => setPreviewDueOverride(todayIso())} style={s.sm(false)}>Today</button>
                </div>
              )}
              {previewEditor === 'recurrence' && parsedPreview.recurrence && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <input
                    type="number"
                    min="1"
                    value={parsedPreview.recurrence.count || 1}
                    onChange={(e) => setPreviewRecurrenceOverride({
                      count: Math.max(1, Number(e.target.value || 1)),
                      unit: parsedPreview.recurrence.unit || 'days',
                      dateMode: parsedPreview.recurrence.dateMode || 'date',
                    })}
                    disabled={parsedPreview.recurrence.dateMode === 'month-end'}
                    style={s.input}
                  />
                  <select
                    value={parsedPreview.recurrence.unit || 'days'}
                    onChange={(e) => setPreviewRecurrenceOverride({
                      count: parsedPreview.recurrence.count || 1,
                      unit: e.target.value,
                      dateMode: parsedPreview.recurrence.dateMode || 'date',
                    })}
                    disabled={parsedPreview.recurrence.dateMode === 'month-end'}
                    style={s.input}
                  >
                    <option value="days">days</option>
                    <option value="weeks">weeks</option>
                    <option value="months">months</option>
                    <option value="years">years</option>
                  </select>
                  <select
                    value={parsedPreview.recurrence.dateMode || 'date'}
                    onChange={(e) => {
                      const mode = e.target.value;
                      setPreviewRecurrenceOverride(mode === 'month-end'
                        ? { count: 1, unit: 'months', dateMode: 'month-end' }
                        : { count: parsedPreview.recurrence.count || 1, unit: parsedPreview.recurrence.unit || 'days', dateMode: 'date' });
                      if (mode === 'month-end') setPreviewDueOverride(endOfMonthFor(parsedPreview.due_date || todayIso()));
                    }}
                    style={{ ...s.input, gridColumn: '1 / -1' }}
                  >
                    <option value="date">Selected date repeat</option>
                    <option value="month-end">End of each month</option>
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 8, marginBottom: 10 }}>
          {groupNames.map((group) => (
            <button key={group} onClick={() => setActiveGroup(group)} style={{ ...s.chip(activeGroup === group), flexShrink: 0 }}>
              {group === 'All' ? 'All' : `${groupMeta(group).emoji} ${group}`}
            </button>
          ))}
          <button onClick={() => setShowCategoryManager((value) => !value)} style={{ ...s.chip(showCategoryManager), flexShrink: 0 }}>Categories</button>
          <button onClick={() => setShowSearch((value) => !value)} style={{ ...s.chip(showSearch || !!searchTerm), flexShrink: 0 }}><Search size={14} /></button>
          <button onClick={loadTasks} style={{ ...s.chip(false), flexShrink: 0 }}><RefreshCw size={14} /></button>
        </div>

        {showSearch && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: CLAY.surface, borderRadius: 18, boxShadow: CLAY.shadowSm, padding: '8px 10px 8px 14px', marginBottom: 14 }}>
            <Search size={16} color={CLAY.textLt} />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tasks..."
              style={{ ...s.input, background: 'transparent', boxShadow: 'none', padding: '8px 0', margin: 0, flex: 1 }}
            />
            {(searchTerm || showSearch) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setShowSearch(false);
                }}
                aria-label="Close task search"
                style={{ ...s.ghost, padding: 6 }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {showCategoryManager && (
          <div style={{ background: CLAY.surface, borderRadius: 20, boxShadow: CLAY.shadowSm, padding: 14, marginBottom: 14 }}>
            <div style={sq({ fontSize: FS.lg, color: CLAY.textMid, marginBottom: 10 })}>Task categories</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 12 }}>
              <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category" style={s.input} />
              <button onClick={addCategory} style={{ ...s.sm(true), minWidth: 64 }}><Plus size={15} /></button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {categoryNames.map((category) => (
                <div key={category} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
                  <input
                    defaultValue={category}
                    onBlur={(e) => renameCategory(category, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    style={s.input}
                  />
                  <span style={sq({ color: CLAY.textLt, fontSize: FS.sm })}>{tasks.filter((task) => task.group_name === category).length}</span>
                  <button onClick={() => deleteCategory(category)} style={{ ...s.ghost, color: CLAY.red, padding: 6 }}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && <div style={sq({ textAlign: 'center', color: CLAY.textLt, padding: 30, fontSize: FS.lg })}>Loading tasks...</div>}
        {!loading && datedTasks.length === 0 && (
          <div style={sq({ textAlign: 'center', color: CLAY.textLt, padding: 46, fontSize: FS.lg })}>
            No tasks yet. Add one above.
          </div>
        )}

        {!loading && datedTasks.map(([section, rows]) => {
          const openCount = rows.filter((task) => !task.is_done).length;
          const collapsedKey = `${COLLAPSED_SECTION_PREFIX}${section}`;
          const expanded = activeGroup !== 'All' || expandedGroups.has(section) || (section !== 'Overdue' && !expandedGroups.has(collapsedKey));
          return (
            <div key={section} style={{ marginBottom: 12 }}>
              <button onClick={() => toggleGroup(section)} style={{ display: 'flex', alignItems: 'center', width: '100%', border: 'none', background: 'transparent', padding: '7px 2px', color: CLAY.text, cursor: 'pointer' }}>
                <span style={sq({ fontSize: FS.lg, flex: 1, textAlign: 'left' })}>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {section}</span>
                <span style={sq({ fontSize: FS.lg, color: CLAY.textMid })}>{openCount} open</span>
              </button>
              {expanded && rows.map((task) => renderTaskCard(task))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
