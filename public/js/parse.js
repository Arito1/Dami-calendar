// Разбор быстрого ввода по-русски: «реферат по истории до пятницы», «кино завтра в 19».
// Возвращает найденные дату, время, тип и предмет, а также название без слов про дату.

import { addDays, diffDays, nextLessonDate, weekday } from './data.js';

const WEEKDAYS = [
  [1, 'понедельник[а-я]*|пн'],
  [2, 'вторник[а-я]*|вт'],
  [3, 'сред[аеуы]|ср'],
  [4, 'четверг[а-я]*|чт'],
  [5, 'пятниц[аеуы]|пт'],
  [6, 'суббот[аеуы]|сб'],
  [7, 'воскресень[еяю]|вс'],
];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма[яй]', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const NUMS = { один: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, неделю: 7 };

const EXAM_RE = /(^|\s)(экзамен[а-яёa-z]*|зач[её]т[а-яёa-z]*|кр|к\/р|контрольн[а-яёa-z]*|коллоквиум[а-яёa-z]*|рубежк[а-яёa-z]*|рубежн[а-яёa-z]*|тест[а-яёa-z]*|мидтерм[а-яёa-z]*|midterm|финал[а-яёa-z]*|сессия)(?=\s|$)/;
const HOMEWORK_RE = /(^|\s)(дз|д\/з|домашк[а-яёa-z]*|реферат[а-яёa-z]*|доклад[а-яёa-z]*|эссе|презентаци[а-яёa-z]*|лаб[а-яёa-z]*|лабораторн[а-яёa-z]*|задани[а-яёa-z]*|срс|сро|срсп|курсов[а-яёa-z]*|конспект[а-яёa-z]*|упражнени[а-яёa-z]*|задач[а-яёa-z]*|проект[а-яёa-z]*|отч[её]т[а-яёa-z]*)(?=\s|$)/;
const EVENT_RE = /(^|\s)(встреч[а-яёa-z]*|кино|свидани[а-яёa-z]*|др|день рождения|вечеринк[а-яёa-z]*|концерт[а-яёa-z]*|поход[а-яёa-z]*|ужин[а-яёa-z]*|обед[а-яёa-z]*|кафе|спорт[а-яёa-z]*|трениров[а-яёa-z]*|зал|врач[а-яёa-z]*|салон[а-яёa-z]*|маникюр[а-яёa-z]*)(?=\s|$)/;

const B = '(?<=^|\\s)'; // начало слова
const E = '(?=\\s|$|[,.!?])'; // конец слова

/** Убираем найденный кусок из текста. */
function cut(state, re, fn) {
  const m = state.rest.match(re);
  if (!m) return false;
  const ok = fn(m);
  if (ok === false) return false;
  state.rest = (state.rest.slice(0, m.index) + ' ' + state.rest.slice(m.index + m[0].length)).replace(/\s+/g, ' ');
  return true;
}

const stem = (w) => w.slice(0, Math.max(3, Math.min(5, w.length - 1)));

/** Ищем предмет по началу слов названия: «матан» → «Матанализ», «истории» → «История». */
export function findSubjectIn(text, subjects) {
  const words = text.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/i).filter(Boolean);
  let best = null;
  for (const s of subjects) {
    const name = s.name.toLowerCase().replace(/ё/g, 'е');
    const nameWords = name.split(/[^a-zа-я0-9]+/i).filter((w) => w.length >= 3);
    let score = 0;
    for (const nw of nameWords) {
      const st = stem(nw);
      if (words.some((w) => w.length >= 3 && (w.startsWith(st) || (nw.startsWith(w) && w.length >= 4)))) score += nw.length;
    }
    // Аббревиатуры: «ик» → «История Казахстана», «англ» → «Английский».
    const abbr = nameWords.map((w) => w[0]).join('');
    if (abbr.length >= 2 && words.includes(abbr)) score += 3;
    if (score && (!best || score > best.score)) best = { subject: s, score };
  }
  return best?.subject || null;
}

/**
 * @param {string} text
 * @param {{ today: string, subjects: Array, doc?: object }} ctx
 * @returns {{ title, date, time, endTime, kind, subjectId, nextLesson, found: string[] }}
 */
export function parseQuick(text, { today, subjects = [], doc = null }) {
  const out = { title: '', date: undefined, time: undefined, endTime: undefined, kind: undefined, subjectId: undefined, nextLesson: false };
  const st = { rest: ` ${text.trim()} ` };
  const low = () => st.rest.toLowerCase().replace(/ё/g, 'е');
  if (!text.trim()) return out;

  // --- Время: «с 10 до 12», «в 19:30», «19:30», «в 7 вечера» ---
  const timeOf = (h, m, part) => {
    let hh = Number(h);
    const mm = Number(m || 0);
    if (part && /веч|дня|ночи/.test(part) && hh < 12) hh += 12;
    if (part && /утра/.test(part) && hh === 12) hh = 0;
    // «в 5» без уточнения у студентки скорее 17:00, чем 5 утра.
    if (!part && m == null && hh >= 1 && hh <= 6) hh += 12;
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };
  const PART = '(?:\\s*(утра|дня|вечера|ночи))?';
  cut(st, new RegExp(`${B}с\\s+(\\d{1,2})(?:[:.](\\d{2}))?\\s+до\\s+(\\d{1,2})(?:[:.](\\d{2}))?${PART}${E}`, 'i'), (m) => {
    const a = timeOf(m[1], m[2], m[5]);
    const b = timeOf(m[3], m[4], m[5]);
    if (!a || !b) return false;
    out.time = a;
    out.endTime = b;
  });
  if (!out.time) {
    cut(st, new RegExp(`${B}(?:в|к|на)\\s+(\\d{1,2})(?:[:.](\\d{2}))?${PART}${E}`, 'i'), (m) => {
      // «к 5 занятию» / «на 2 пары» — не время.
      const t = timeOf(m[1], m[2], m[3]);
      if (!t || (!m[2] && !m[3] && Number(m[1]) < 7 && !/^в/i.test(m[0].trim()))) return false;
      out.time = t;
    }) ||
    cut(st, new RegExp(`${B}(\\d{1,2})[:](\\d{2})${PART}${E}`, 'i'), (m) => {
      const t = timeOf(m[1], m[2], m[3]);
      if (!t) return false;
      out.time = t;
    });
  }

  // --- Дата ---
  const setDate = (k) => { out.date = k; };
  const words = low();
  const rel = [
    ['послезавтра', 2],
    ['завтра', 1],
    ['сегодня', 0],
  ];
  for (const [w, n] of rel) {
    if (out.date !== undefined) break;
    cut(st, new RegExp(`${B}(?:до|к|на)?\\s*${w}${E}`, 'i'), () => setDate(addDays(today, n)));
  }
  if (out.date === undefined) {
    cut(st, new RegExp(`${B}через\\s+(\\d+|${Object.keys(NUMS).join('|')})?\\s*(дн\[а-яёa-z]*|день|недел\[а-яёa-z]*|месяц\[а-яёa-z]*)${E}`, 'i'), (m) => {
      const n = m[1] ? Number(m[1]) || NUMS[m[1].toLowerCase()] : 1;
      const unit = m[2].toLowerCase();
      if (unit.startsWith('недел')) setDate(addDays(today, (m[1] && m[1] !== 'неделю' ? n : 1) * 7));
      else if (unit.startsWith('месяц')) setDate(addDays(today, 30 * n));
      else setDate(addDays(today, n));
    });
  }
  if (out.date === undefined) {
    // «15 декабря», «15 дек», «до 3 января»
    cut(st, new RegExp(`${B}(?:до|к|на)?\\s*(\\d{1,2})\\s+(${MONTHS.join('|')})[а-я]*\\.?(?:\\s+(\\d{4}))?${E}`, 'i'), (m) => {
      const mi = MONTHS.findIndex((p) => new RegExp(`^${p}`, 'i').test(m[2]));
      return setAbsDate(Number(m[1]), mi + 1, m[3]);
    }) ||
    // «15.12», «15.12.2026», «15/12»
    cut(st, new RegExp(`${B}(?:до|к|на)?\\s*(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?${E}`, 'i'), (m) => setAbsDate(Number(m[1]), Number(m[2]), m[3]));
  }
  function setAbsDate(d, mo, y) {
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return false;
    let year = y ? Number(y.length === 2 ? `20${y}` : y) : Number(today.slice(0, 4));
    let key = `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!y && diffDays(today, key) < -14) key = `${year + 1}${key.slice(4)}`;
    setDate(key);
    return true;
  }
  if (out.date === undefined) {
    for (const [wd, names] of WEEKDAYS) {
      const re = new RegExp(`${B}(?:до|к|ко|в|во|на|в эт\[а-яёa-z]+|в следующ\[а-яёa-z]+|на следующ\[а-яёa-z]+|след\[а-яёa-z]*)?\\s*(${names})${E}`, 'i');
      if (cut(st, re, (m) => {
        const n = (wd - weekday(today) + 7) % 7 || 7; // ближайший такой день после сегодня
        setDate(addDays(today, n));
      })) break;
    }
  }
  if (out.date === undefined && /(^|\s)(на\s+)?(этой|эту)\s+неделе?(\s|$)/i.test(words)) {
    cut(st, /(?<=^|\s)(?:на\s+)?(?:этой|эту)\s+недел[а-яёa-z]*(?=\s|$)/i, () => setDate(addDays(today, 7 - weekday(today))));
  }

  // --- Предмет ---
  const subj = findSubjectIn(st.rest, subjects);
  if (subj) out.subjectId = subj.id;

  // --- «к следующей паре» ---
  if (cut(st, /(?<=^|\s)(?:к|на|до)\s+(?:следующ[а-яёa-z]+|след[а-яёa-z]*|ближайш[а-яёa-z]+)?\s*(?:пар[а-яёa-z]*|занят[а-яёa-z]*|семинар[а-яёa-z]*|урок[а-яёa-z]*)(?=\s|$|[,.!?])/i, () => {})) {
    out.nextLesson = true;
    if (subj && doc) {
      const k = nextLessonDate(doc, subj.id, today);
      if (k) out.date = k;
    }
  }

  // --- Тип ---
  const l = ` ${low()} `;
  if (EXAM_RE.test(l)) out.kind = 'exam';
  else if (HOMEWORK_RE.test(l) || out.nextLesson) out.kind = 'homework';
  else if (EVENT_RE.test(l)) out.kind = 'event';

  // --- Название ---
  let title = st.rest.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
  title = title.replace(/(^|\s)(до|к|ко|в|во|на|с)$/i, '').replace(/^[,.\s]+|[,\s]+$/g, '').trim();
  out.title = title ? title[0].toUpperCase() + title.slice(1) : '';
  return out;
}
