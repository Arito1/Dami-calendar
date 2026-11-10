// Самотест быстрого ввода: node scripts/test-parse.mjs
import { parseQuick } from '../public/js/parse.js';
import { newDoc } from '../public/js/data.js';

const today = '2026-11-10'; // вторник
const doc = newDoc();
doc.settings.week = { mode: 'single', anchor: null };
doc.subjects = [
  { id: 'his', name: 'История Казахстана' },
  { id: 'mat', name: 'Матанализ' },
  { id: 'eng', name: 'Английский' },
  { id: 'phy', name: 'Физика' },
];
doc.lessons = [
  { id: 'l1', subjectId: 'his', weekday: 4, start: '09:00', end: '10:20' },
  { id: 'l2', subjectId: 'mat', weekday: 2, start: '11:00', end: '12:20' },
];
const ctx = { today, subjects: doc.subjects, doc };

const cases = [
  ['реферат по истории до пятницы', { title: 'Реферат по истории', date: '2026-11-13', kind: 'homework', subjectId: 'his' }],
  ['кино завтра в 19', { title: 'Кино', date: '2026-11-11', time: '19:00', kind: 'event' }],
  ['зачёт по матану 15 декабря', { title: 'Зачёт по матану', date: '2026-12-15', kind: 'exam', subjectId: 'mat' }],
  ['дз по английскому к следующей паре', { title: 'Дз по английскому', kind: 'homework', subjectId: 'eng' }],
  ['доклад по истории к следующей паре', { title: 'Доклад по истории', date: '2026-11-12', kind: 'homework', subjectId: 'his' }],
  ['матан задачи 1-5 к паре', { date: '2026-11-17', kind: 'homework', subjectId: 'mat' }],
  ['встреча с Артуром в 18:30', { title: 'Встреча с Артуром', time: '18:30', kind: 'event' }],
  ['маникюр в субботу в 12', { title: 'Маникюр', date: '2026-11-14', time: '12:00', kind: 'event' }],
  ['купить тетради', { title: 'Купить тетради', date: undefined, kind: undefined }],
  ['экзамен физика 20.01', { date: '2027-01-20', kind: 'exam', subjectId: 'phy' }],
  ['кр по физике 25.11', { date: '2026-11-25', kind: 'exam', subjectId: 'phy' }],
  ['созвон послезавтра в 10:15', { title: 'Созвон', date: '2026-11-12', time: '10:15' }],
  ['лаба по физике через 3 дня', { title: 'Лаба по физике', date: '2026-11-13', kind: 'homework' }],
  ['сдать эссе через неделю', { title: 'Сдать эссе', date: '2026-11-17', kind: 'homework' }],
  ['спортзал в понедельник в 7 вечера', { date: '2026-11-16', time: '19:00' }],
  ['пара перенесена во вторник', { date: '2026-11-17' }],
  ['созвон сегодня с 14 до 15:30', { title: 'Созвон', date: '2026-11-10', time: '14:00', endTime: '15:30' }],
  ['др у мамы 3 января', { title: 'Др у мамы', date: '2027-01-03', kind: 'event' }],
  ['презентация 1 дек', { date: '2026-12-01', kind: 'homework' }],
  ['позвонить в 5', { title: 'Позвонить', time: '17:00' }],
  ['выучить 20 слов к среде', { title: 'Выучить 20 слов', date: '2026-11-11' }],
  ['коллоквиум по матанализу в чт', { date: '2026-11-12', kind: 'exam', subjectId: 'mat' }],
  ['конспект ик', { subjectId: 'his', kind: 'homework' }],
  ['врач 12.11 в 9:40', { title: 'Врач', date: '2026-11-12', time: '09:40', kind: 'event' }],
  ['читать главу 5', { title: 'Читать главу 5', time: undefined }],
  ['прочитать 2 главы на завтра', { title: 'Прочитать 2 главы', date: '2026-11-11', time: undefined }],
  ['тест по английскому 15/11', { date: '2026-11-15', kind: 'exam', subjectId: 'eng' }],
  ['сессия с 5 января', { kind: 'exam' }],
  ['ужин в 20:00 в пятницу', { title: 'Ужин', date: '2026-11-13', time: '20:00', kind: 'event' }],
  ['убраться дома в воскресенье', { title: 'Убраться дома', date: '2026-11-15' }],
];

let fail = 0;
for (const [text, want] of cases) {
  const got = parseQuick(text, ctx);
  const bad = Object.entries(want).filter(([k, v]) => got[k] !== v);
  if (bad.length) {
    fail++;
    console.log(`✗ «${text}»`, bad.map(([k, v]) => `${k}: ждали ${v}, получили ${got[k]}`).join('; '));
  }
}
console.log(fail ? `Не прошло: ${fail} из ${cases.length}` : `Все ${cases.length} фраз разобраны верно`);
process.exitCode = fail ? 1 : 0;
