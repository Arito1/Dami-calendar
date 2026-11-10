// Push-уведомления: отправка через web-push и рассылка напоминаний по расписанию.
// store: { get, set, del, list(prefix) -> string[] }

import * as webpush from 'web-push';
import { normalizeDoc, remindersBetween, DAY_MS } from '../public/js/data.js';

/** Ключи VAPID из окружения или null, если уведомления не настроены. */
export function vapidFrom(env = {}) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    // Apple требует настоящий адрес: mailto: или https-сайт.
    subject: env.VAPID_SUBJECT || env.URL || 'mailto:noreply@example.com',
  };
}

/** Отправить одно уведомление. gone = подписка больше не действует, её надо забыть. */
export async function sendPush(vapid, sub, payload) {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      vapidDetails: vapid,
      TTL: 60 * 60,
      urgency: 'high',
    });
    return { ok: true };
  } catch (e) {
    const gone = e.statusCode === 404 || e.statusCode === 410;
    if (!gone) console.error('push failed', e.statusCode, e.body || e.message);
    return { ok: false, gone };
  }
}

const MAX_LATE = 30 * 60_000; // старше получаса — уже не досылаем
const FIRST_WINDOW = 5 * 60_000;

/**
 * Разослать напоминания, наступившие с прошлого запуска.
 * Возвращает число отправленных уведомлений.
 */
export async function runReminders(store, vapid, now = Date.now(), send = sendPush) {
  if (!vapid) return 0;
  let total = 0;
  for (const key of await store.list('push/')) {
    const username = key.slice('push/'.length);
    try {
      const rec = await store.get(key);
      if (!rec?.subs?.length) continue;
      const saved = await store.get(`data/${username}`);
      if (!saved?.doc) continue;
      const doc = normalizeDoc(saved.doc);
      const st = (await store.get(`pushstate/${username}`)) || { lastRun: now - FIRST_WINDOW, sent: {} };
      const from = Math.max(st.lastRun || 0, now - MAX_LATE);
      const due = remindersBetween(doc, from, now, doc.settings.tz).filter((r) => !st.sent[r.key]);

      let subs = rec.subs;
      for (const r of due) {
        const payload = { title: r.title, body: r.body, tag: r.tag, url: '/' };
        for (const sub of subs) {
          const res = await send(vapid, sub, payload);
          if (res.ok) total++;
          if (res.gone) subs = subs.filter((s) => s.endpoint !== sub.endpoint);
        }
        st.sent[r.key] = r.at;
      }
      for (const [k, at] of Object.entries(st.sent)) if (at < now - 2 * DAY_MS) delete st.sent[k];
      st.lastRun = now;
      await store.set(`pushstate/${username}`, st);
      if (subs.length !== rec.subs.length) await store.set(key, { ...rec, subs });
    } catch (e) {
      console.error('reminders failed for', username, e);
    }
  }
  return total;
}
