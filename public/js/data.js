// Модель данных календарика и слияние версий с разных устройств.

export const DAY_MS = 86_400_000;

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = (n) => String(n).padStart(2, '0');

// На сервере дни считаются в часовом поясе телефона, а не сервера.
let zoneFormat = null;
export const setTimeZone = (tz) => {
  try {
    zoneFormat = tz ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }) : null;
  } catch {
    zoneFormat = null;
  }
};

export const dayKey = (d = new Date()) => {
  const x = d instanceof Date ? d : new Date(d);
  if (zoneFormat) return zoneFormat.format(x);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const parseDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (key, n) => {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
// Разница в календарных днях; округление спасает от перехода на летнее время.
export const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
/** День недели 1..7, понедельник = 1. */
export const weekday = (key) => parseDay(key).getDay() || 7;
/** Понедельник недели, в которой лежит день. */
export const weekStart = (key) => addDays(key, 1 - weekday(key));

export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export const dateLabel = (key, withWeekday = false) => {
  const d = parseDay(key);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withWeekday ? `${base}, ${WEEKDAYS[d.getDay()]}` : base;
};
export const dayTitle = (key) => {
  const today = dayKey();
  if (key === today) return 'Сегодня';
  if (key === addDays(today, 1)) return 'Завтра';
  if (key === addDays(today, -1)) return 'Вчера';
  return dateLabel(key, true);
};
export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

export const PALETTE = [
  '#EC407A', '#F48FB1', '#AB47BC', '#7E57C2', '#5C6BC0', '#42A5F5', '#26C6DA', '#26A69A',
  '#66BB6A', '#9CCC65', '#FFCA28', '#FFA726', '#FF7043', '#EF5350', '#8D6E63', '#90A4AE',
];

export const EMOJIS = [
  '📚', '📖', '📝', '✏️', '🖊️', '📐', '📏', '🧮', '🔢', '➗', '🧪', '⚗️', '🔬', '🧬', '🧫', '🦠',
  '🌍', '🗺️', '🏛️', '📜', '⚖️', '💼', '📊', '📈', '💻', '⌨️', '🖥️', '🤖', '🎨', '🎭', '🎵', '🎹',
  '🗣️', '🇬🇧', '🇰🇿', '🇷🇺', '🧠', '💊', '🩺', '⚽', '🏃‍♀️', '🧘‍♀️', '🎓', '🏫', '📅', '⏰', '⭐', '❤️',
  '🌸', '✨', '🎉', '🛒', '☕', '🍰', '🎬', '✈️', '🏠', '🐷', '💅', '🎁', '🧹', '❓',
];

/** Списки документа, которые сливаются по id. */
export const COLLECTIONS = ['subjects', 'lessons', 'overrides', 'items'];

export const newDoc = () => ({
  v: 1,
  settings: {
    theme: 'auto',
    tz: null,
    week: { mode: 'single', anchor: null }, // anchor — понедельник нечётной недели
    breaks: [], // [{ id, from, to, name }] — дни без пар
    notify: { on: false, classBefore: 10, morning: '08:00', evening: '21:00' },
    updatedAt: 0,
  },
  subjects: [],
  lessons: [],
  overrides: [],
  items: [],
});

export const live = (list) => list.filter((x) => !x.deleted);

// ---- Время ----

/** '09:05' → минуты от полуночи. */
export const toMin = (t) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
/** Минуты от полуночи сейчас (в часовом поясе устройства). */
export const nowMin = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
export const durLabel = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
};

// ---- Предметы и расписание ----

export const KINDS = { lecture: 'Лекция', practice: 'Практика', lab: 'Лаба', other: '' };

export const subjects = (doc) => live(doc.subjects).filter((s) => !s.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
export const findSubject = (doc, id) => doc.subjects.find((s) => s.id === id) || null;
export const NO_SUBJECT = { id: null, name: 'Без предмета', emoji: '📌', color: '#90A4AE' };

/** 'odd' | 'even' | null (если недели не чередуются). Неделя с anchor — нечётная. */
export function weekParity(doc, key) {
  const w = doc.settings.week;
  if (w.mode !== 'alternating' || !w.anchor) return null;
  const weeks = Math.round(diffDays(weekStart(w.anchor), weekStart(key)) / 7);
  return Math.abs(weeks) % 2 === 0 ? 'odd' : 'even';
}
export const PARITY_LABEL = { odd: 'нечётная неделя', even: 'чётная неделя' };

export const breakOn = (doc, key) =>
  doc.settings.breaks.find((b) => !b.deleted && b.from <= key && key <= (b.to || b.from)) || null;

/** Переопределение пары на конкретный день (отмена, другое время, перенос). */
export const overrideId = (lessonId, date) => `${lessonId}@${date}`;
const overrideFor = (doc, lessonId, date) =>
  doc.overrides.find((o) => !o.deleted && o.lessonId === lessonId && o.date === date) || null;

function lessonFits(doc, l, key) {
  if (l.weekday !== weekday(key)) return false;
  const p = weekParity(doc, key);
  return !p || !l.weeks || l.weeks === 'all' || l.weeks === p;
}

/**
 * Пары на день: с учётом чётности недели, каникул, отмен и переносов.
 * Возвращает [{ lesson, subject, date, start, end, room, cancelled, movedTo, movedFrom }].
 */
export function lessonsOn(doc, key) {
  const out = [];
  const onBreak = breakOn(doc, key);
  const lessons = live(doc.lessons);
  if (!onBreak) {
    for (const l of lessons) {
      if (!lessonFits(doc, l, key)) continue;
      const o = overrideFor(doc, l.id, key);
      const moved = o?.toDate && o.toDate !== key;
      out.push({
        lesson: l,
        date: key,
        start: (!moved && o?.start) || l.start,
        end: (!moved && o?.end) || l.end,
        room: (!moved && o?.room) || l.room || '',
        cancelled: !!(o?.cancelled || moved),
        movedTo: moved ? o.toDate : null,
        changed: !!(o && !moved && !o.cancelled && (o.start || o.end || o.room)),
      });
    }
  }
  // Пары, перенесённые на этот день с других дней.
  for (const o of doc.overrides) {
    if (o.deleted || o.toDate !== key || o.date === key || o.cancelled) continue;
    const l = lessons.find((x) => x.id === o.lessonId);
    if (!l) continue;
    out.push({ lesson: l, date: key, start: o.start || l.start, end: o.end || l.end, room: o.room || l.room || '', cancelled: false, movedFrom: o.date });
  }
  for (const x of out) x.subject = findSubject(doc, x.lesson.subjectId) || NO_SUBJECT;
  return out.sort((a, b) => toMin(a.start) - toMin(b.start));
}

/** Ближайший день после `from`, когда у предмета есть пара. */
export function nextLessonDate(doc, subjectId, from = dayKey()) {
  if (!subjectId) return null;
  for (let i = 1; i <= 70; i++) {
    const key = addDays(from, i);
    if (lessonsOn(doc, key).some((x) => !x.cancelled && x.lesson.subjectId === subjectId)) return key;
  }
  return null;
}

/** Время пар, которое уже встречается в расписании, — для быстрых кнопок. */
export function usedSlots(doc) {
  const map = new Map();
  for (const l of live(doc.lessons)) {
    const k = `${l.start}–${l.end}`;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.keys()].sort();
}

// ---- Слияние: для каждой записи побеждает более свежая правка ----

function mergeById(a = [], b = []) {
  const map = new Map();
  for (const item of a) map.set(item.id, item);
  for (const item of b) {
    const cur = map.get(item.id);
    if (!cur || (item.updatedAt || 0) >= (cur.updatedAt || 0)) map.set(item.id, item);
  }
  return [...map.values()];
}

const newer = (a, b) => ((b?.updatedAt || 0) > (a?.updatedAt || 0) ? b : a);

export function mergeDocs(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const out = { v: 1, settings: newer(local.settings, remote.settings) };
  for (const key of COLLECTIONS) out[key] = mergeById(local[key], remote[key]);
  return out;
}

/** Приводит импортированный или старый документ к текущей форме. */
export function normalizeDoc(doc) {
  const base = newDoc();
  if (!doc || typeof doc !== 'object') return base;
  const s = doc.settings || {};
  const out = {
    ...base,
    ...doc,
    settings: {
      ...base.settings,
      ...s,
      week: { ...base.settings.week, ...(s.week || {}) },
      notify: { ...base.settings.notify, ...(s.notify || {}) },
      breaks: Array.isArray(s.breaks) ? s.breaks : [],
    },
  };
  for (const key of COLLECTIONS) out[key] = Array.isArray(doc[key]) ? doc[key] : [];
  return out;
}
