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
// Календарная арифметика через UTC: не зависит от часового пояса устройства или сервера.
const utcOf = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const keyOfUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (key, n) => keyOfUtc(utcOf(key) + n * DAY_MS);
export const diffDays = (a, b) => Math.round((utcOf(b) - utcOf(a)) / DAY_MS);
/** День недели 1..7, понедельник = 1. */
export const weekday = (key) => new Date(utcOf(key)).getUTCDay() || 7;
/** Тот же день через n месяцев (31-е → последний день короткого месяца). */
export const addMonths = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return keyOfUtc(Date.UTC(y, m - 1 + n, Math.min(d, last)));
};
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

// ---- Дела: домашки, задачи, события, экзамены ----

export const ITEM_KINDS = {
  homework: { label: 'Домашка', emoji: '📚' },
  task: { label: 'Дело', emoji: '✅' },
  event: { label: 'Событие', emoji: '🎉' },
  exam: { label: 'Экзамен', emoji: '🎓' },
};
export const REPEAT_LABEL = { day: 'каждый день', week: 'каждую неделю', month: 'каждый месяц' };
export const REMIND_OPTIONS = [['', 'Нет'], ['0', 'В срок'], ['15', 'За 15 мин'], ['60', 'За час'], ['1440', 'За день']];
/** Время, от которого считается напоминание, если у дела нет своего времени. */
export const DEFAULT_REMIND_TIME = '09:00';

/** Случается ли дело (в том числе повторяющееся) в этот день. */
export function occursOn(item, key) {
  if (!item.date) return false;
  if (!item.repeat) return item.date === key;
  if (key < item.date || (item.repeat.until && key > item.repeat.until)) return false;
  const f = item.repeat.freq;
  if (f === 'day') return true;
  if (f === 'week') return weekday(key) === weekday(item.date);
  if (f === 'month') {
    const months = (Number(key.slice(0, 4)) - Number(item.date.slice(0, 4))) * 12 + Number(key.slice(5, 7)) - Number(item.date.slice(5, 7));
    return addMonths(item.date, months) === key;
  }
  return false;
}

export const isDone = (item, key = item.date) => (item.repeat ? (item.doneDates || []).includes(key) : !!item.done);

const byTime = (a, b) =>
  (toMin(a.time) ?? 9999) - (toMin(b.time) ?? 9999) || (b.priority || 0) - (a.priority || 0) || (a.createdAt || 0) - (b.createdAt || 0);

/** Дела на день (включая повторы). */
export const itemsOn = (doc, key) => live(doc.items).filter((i) => occursOn(i, key)).sort(byTime);

/** Входящие: без даты и не сделаны. */
export const inbox = (doc) =>
  live(doc.items).filter((i) => !i.date && !i.done)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.createdAt || 0) - (a.createdAt || 0));

/**
 * «Горит»: просроченные несделанные дела и дедлайны на ближайшие дни.
 * Повторяющиеся и события сюда не попадают — они и так на ленте дня. Экзамены — отдельным отсчётом.
 */
export function hotList(doc, today = dayKey(), days = 3) {
  const limit = addDays(today, days);
  return live(doc.items)
    .filter((i) => i.date && !i.repeat && !i.done && i.kind !== 'event' && i.date <= limit && !(i.kind === 'exam' && i.date >= today))
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
}

/** Ближайшие экзамены. */
export const upcomingExams = (doc, today = dayKey(), days = 400) =>
  live(doc.items)
    .filter((i) => i.kind === 'exam' && i.date && !i.done && i.date >= today && diffDays(today, i.date) <= days)
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));

/** Сколько дел закрыто на этой неделе. */
export function doneThisWeek(doc, today = dayKey()) {
  const from = weekStart(today);
  let n = 0;
  for (const i of live(doc.items)) {
    if (i.repeat) n += (i.doneDates || []).filter((k) => k >= from && k <= today).length;
    else if (i.done && i.doneAt && dayKey(i.doneAt) >= from) n++;
  }
  return n;
}

/** «через 2 дня», «завтра», «просрочено на 3 дня». */
export function dueLabel(key, today = dayKey()) {
  const n = diffDays(today, key);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === 2) return 'послезавтра';
  if (n < 0) return `просрочено на ${-n} ${plural(-n, 'день', 'дня', 'дней')}`;
  return `через ${n} ${plural(n, 'день', 'дня', 'дней')}`;
}

export const shortDate = (key) => {
  const d = parseDay(key);
  return `${WD_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};

// ---- Напоминания (считаются одинаково на сервере и в браузере) ----

/** Смещение часового пояса в минутах в момент ms. */
function tzOffsetMin(ms, tz) {
  if (!tz) return -new Date(ms).getTimezoneOffset();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
}

/** Момент времени (ms) для местных даты и времени в поясе tz. */
export function zonedTime(key, hhmm, tz) {
  const guess = utcOf(key) + toMin(hhmm) * 60000;
  const off = tzOffsetMin(guess, tz);
  const ms = guess - off * 60000;
  const off2 = tzOffsetMin(ms, tz); // поправка на переход летнего времени
  return off2 === off ? ms : guess - off2 * 60000;
}

/** Момент напоминания дела в конкретный день или null. */
export function itemRemindAt(item, key, tz) {
  if (item.remind == null || item.remind === '' || !key) return null;
  return zonedTime(key, item.time || DEFAULT_REMIND_TIME, tz) - Number(item.remind) * 60000;
}

/**
 * Все напоминания с моментом в (fromMs, toMs]. Ключ уникален — по нему сервер не шлёт дубли.
 * Возвращает [{ key, at, title, body, tag }].
 */
export function remindersBetween(doc, fromMs, toMs, tz = doc.settings.tz) {
  const n = doc.settings.notify;
  if (!n?.on) return [];
  const out = [];
  const add = (r) => { if (r.at > fromMs && r.at <= toMs) out.push(r); };
  // Дни в поясе пользователя, которые могут дать напоминание в окне (с запасом на «за день»).
  setTimeZone(tz);
  const firstDay = dayKey(new Date(fromMs));
  const lastDay = dayKey(new Date(toMs));
  setTimeZone(null);
  for (let key = addDays(firstDay, -1); key <= addDays(lastDay, 1); key = addDays(key, 1)) {
    const lessons = lessonsOn(doc, key).filter((x) => !x.cancelled);
    if (Number(n.classBefore) > 0) {
      for (const x of lessons) {
        add({
          key: `l:${x.lesson.id}:${key}`,
          at: zonedTime(key, x.start, tz) - n.classBefore * 60000,
          title: `${x.subject.emoji} ${x.subject.name} в ${x.start}`,
          body: [`Через ${n.classBefore} мин`, KINDS[x.lesson.kind], x.room && `ауд. ${x.room}`].filter(Boolean).join(' · '),
          tag: `lesson-${x.lesson.id}`,
        });
      }
    }
    const dayItems = itemsOn(doc, key);
    // Дела со своим напоминанием.
    for (const i of dayItems) {
      if (isDone(i, key)) continue;
      const at = itemRemindAt(i, key, tz);
      if (at == null) continue;
      const subj = i.subjectId ? findSubject(doc, i.subjectId) : null;
      const r = Number(i.remind);
      const when = r >= 1440 ? `Завтра${i.time ? ` в ${i.time}` : ''}` : i.time ? `В ${i.time}` : 'Сегодня';
      add({
        key: `i:${i.id}:${key}:${r}`,
        at,
        title: `${subj?.emoji || ITEM_KINDS[i.kind]?.emoji || '🔔'} ${i.title}`,
        body: [when, subj?.name, ITEM_KINDS[i.kind]?.label].filter(Boolean).join(' · '),
        tag: `item-${i.id}`,
      });
    }
    const todo = dayItems.filter((i) => !isDone(i, key) && i.kind !== 'event');
    const overdue = live(doc.items).filter((i) => i.date && !i.repeat && !i.done && i.kind !== 'event' && i.date < key);
    // Утренняя сводка.
    if (n.morning && (lessons.length || todo.length || overdue.length)) {
      const parts = [];
      if (lessons.length) parts.push(`${lessons.length} ${plural(lessons.length, 'пара', 'пары', 'пар')} с ${lessons[0].start}`);
      if (todo.length) parts.push(`дел: ${todo.length}`);
      if (overdue.length) parts.push(`просрочено: ${overdue.length}`);
      add({
        key: `m:${key}`,
        at: zonedTime(key, n.morning, tz),
        title: 'Доброе утро ☀️',
        body: `Сегодня ${parts.join(', ')}${todo.length ? `. ${todo.slice(0, 3).map((i) => i.title).join(', ')}` : ''}`,
        tag: 'digest',
      });
    }
    // Вечером — что завтра.
    const tomorrow = addDays(key, 1);
    const tLessons = lessonsOn(doc, tomorrow).filter((x) => !x.cancelled);
    const tTodo = itemsOn(doc, tomorrow).filter((i) => !isDone(i, tomorrow));
    if (n.evening && (tTodo.length || tLessons.length)) {
      const parts = [];
      if (tTodo.length) parts.push(`${tTodo.slice(0, 3).map((i) => i.title).join(', ')}${tTodo.length > 3 ? '…' : ''}`);
      if (tLessons.length) parts.push(`первая пара в ${tLessons[0].start}`);
      add({ key: `e:${key}`, at: zonedTime(key, n.evening, tz), title: 'На завтра 🌙', body: parts.join(' · '), tag: 'digest' });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
