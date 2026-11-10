// Подписка этого устройства на push-уведомления.
import { api } from './sync.js';

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** 'ok' | 'ios-home' (нужно открыть с экрана «Домой») | 'no' (браузер не умеет). */
export function pushSupport() {
  if (isIos() && !isStandalone()) return 'ios-home';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'no';
  return 'ok';
}

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const sameKey = (buf, b64) => {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  const b = b64ToBytes(b64);
  return a.length === b.length && a.every((x, i) => x === b[i]);
};

async function currentSub() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Включены ли уведомления именно на этом устройстве. */
export async function deviceSubscribed() {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false;
  return !!(await currentSub().catch(() => null));
}

/** Вызывать прямо из нажатия: iPhone спрашивает разрешение только в ответ на тап. */
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(perm === 'denied'
      ? 'Уведомления запрещены. Разреши их в настройках телефона для Календарика'
      : 'Нужно разрешить уведомления');
  }
  const keyRes = await api('/push/key');
  if (!keyRes.ok) throw new Error(keyRes.data.message || 'Нет связи с сервером');
  await navigator.serviceWorker.register('/sw.js');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, keyRes.data.key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(keyRes.data.key) });
  const res = await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  if (!res.ok) throw new Error(res.data.message || 'Нет связи с сервером');
}

export async function disablePush() {
  const sub = await currentSub().catch(() => null);
  if (!sub) return;
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function testPush() {
  const res = await api('/push/test', { method: 'POST', body: {} });
  if (!res.ok) throw new Error(res.data.message || 'Нет связи с сервером');
}
