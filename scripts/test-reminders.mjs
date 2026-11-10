// Самотест рассылки напоминаний: node scripts/test-reminders.mjs
import { runReminders } from '../server/push.mjs';
import { newDoc, zonedTime } from '../public/js/data.js';

const tz = 'Asia/Almaty';
const doc = newDoc();
doc.settings.tz = tz;
doc.settings.notify = { on: true, classBefore: 10, morning: '08:00', evening: '21:00' };
doc.subjects = [{ id: 'm', name: 'Матанализ', emoji: '🧮', color: '#EC407A' }];
doc.lessons = [{ id: 'l', subjectId: 'm', weekday: 3, start: '09:00', end: '10:20', kind: 'lecture', room: '305' }]; // среда
doc.items = [
  { id: 'a', kind: 'homework', title: 'Реферат', date: '2026-11-11', time: '12:00', remind: 15, subjectId: 'm' },
  { id: 'b', kind: 'task', title: 'Уже сделано', date: '2026-11-11', time: '12:00', remind: 15, done: true },
  { id: 'c', kind: 'homework', title: 'Сдать лабу', date: '2026-11-12' },
];

const db = {
  'data/dami': { rev: 1, doc },
  'push/dami': { subs: [{ endpoint: 'https://push.example/ok', keys: {} }, { endpoint: 'https://push.example/gone', keys: {} }] },
  'push/nobody': { subs: [] },
};
const store = {
  get: async (k) => db[k] ?? null,
  set: async (k, v) => { db[k] = structuredClone(v); },
  del: async (k) => { delete db[k]; },
  list: async (p) => Object.keys(db).filter((k) => k.startsWith(p)),
};
const sent = [];
const send = async (_v, sub, payload) => {
  if (sub.endpoint.endsWith('gone')) return { ok: false, gone: true };
  sent.push(payload.title);
  return { ok: true };
};
const vapid = { publicKey: 'x', privateKey: 'y', subject: 'mailto:t@t.test' };
const at = (day, time) => zonedTime(day, time, tz);

let fail = 0;
const check = (name, cond) => { if (!cond) { fail++; console.log('✗', name); } };

// Прогон раз в 2 минуты с 07:58 до 12:02 по Алматы.
for (let t = at('2026-11-11', '07:58'); t <= at('2026-11-11', '12:02'); t += 120_000) {
  await runReminders(store, vapid, t, send);
}
check('утренняя сводка', sent.some((s) => s.startsWith('Доброе утро')));
check('пара за 10 минут', sent.filter((s) => s.includes('Матанализ в 09:00')).length === 1);
check('дело за 15 минут, один раз', sent.filter((s) => s.includes('Реферат')).length === 1);
check('сделанное не напоминаем', !sent.some((s) => s.includes('Уже сделано')));
check('мёртвая подписка удалена', db['push/dami'].subs.length === 1);

// Сервер «спал» 3 часа: старое не досылаем, вечернее приходит.
const before = sent.length;
await runReminders(store, vapid, at('2026-11-11', '21:01'), send);
check('после простоя не шлём старьё', sent.slice(before).every((s) => s.startsWith('На завтра')));
check('вечерняя сводка', sent.slice(before).length === 1);
await runReminders(store, vapid, at('2026-11-11', '21:03'), send);
check('без повторов', sent.length === before + 1);

// Уведомления выключены — тишина.
doc.settings.notify.on = false;
const n = sent.length;
await runReminders(store, vapid, at('2026-11-12', '08:01'), send);
check('выключено — не шлём', sent.length === n);

console.log(fail ? `Не прошло проверок: ${fail}` : `Напоминания работают: отправлено ${sent.length}, дублей нет`);
process.exitCode = fail ? 1 : 0;
