// Аккаунт, локальная копия данных и фоновая синхронизация с сервером.
// Всё работает офлайн: изменения сразу пишутся в localStorage и уходят на сервер, когда есть сеть.

import { COLLECTIONS, mergeDocs, newDoc, normalizeDoc } from './data.js';

const AUTH_KEY = 'damical.auth';
const docKey = (user) => `damical.doc.${user}`;

const read = (key) => {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* переполнено — живём в памяти */ }
};

export const state = {
  auth: read(AUTH_KEY), // { token, username }
  doc: null,
  rev: 0,
  dirty: false,
  status: 'idle', // idle | syncing | offline | error
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = (what) => listeners.forEach((fn) => fn(what));

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (state.auth?.token) headers.authorization = `Bearer ${state.auth.token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function persistLocal() {
  if (!state.auth) return;
  write(docKey(state.auth.username), { doc: state.doc, rev: state.rev, dirty: state.dirty });
}

export function loadLocal() {
  if (!state.auth) return false;
  const saved = read(docKey(state.auth.username));
  state.doc = normalizeDoc(saved?.doc);
  state.rev = saved?.rev || 0;
  state.dirty = !!saved?.dirty;
  return true;
}

export async function authenticate(mode, username, password, code) {
  const res = await api(`/${mode}`, { method: 'POST', body: { username, password, code } });
  if (!res.ok) {
    throw Object.assign(new Error(res.data.message || 'Не получилось, попробуй ещё раз'), { code: res.data.error });
  }
  state.auth = { token: res.data.token, username: res.data.username };
  write(AUTH_KEY, state.auth);
  loadLocal();
  await pull();
  return state.auth;
}

export async function logout() {
  if (state.dirty) await push().catch(() => {});
  api('/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem(AUTH_KEY);
  if (state.auth) localStorage.removeItem(docKey(state.auth.username));
  state.auth = null;
  state.doc = null;
  state.rev = 0;
  state.dirty = false;
  emit('auth');
}

function setStatus(status) {
  if (state.status !== status) {
    state.status = status;
    emit('status');
  }
}

function handleUnauthorized() {
  localStorage.removeItem(AUTH_KEY);
  state.auth = null;
  emit('auth');
}

export async function pull() {
  if (!state.auth) return;
  setStatus('syncing');
  try {
    const res = await api('/data');
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) throw new Error(res.data.message);
    const { doc, rev } = res.data;
    if (rev > state.rev || !doc) {
      if (doc) {
        state.doc = normalizeDoc(state.dirty ? mergeDocs(state.doc, doc) : doc);
        state.rev = rev;
      } else {
        state.dirty = true; // на сервере пусто — отправим то, что есть локально
      }
      persistLocal();
      emit('doc');
    }
    setStatus('idle');
    if (state.dirty) await push();
  } catch {
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
}

let pushing = null;
let changeCounter = 0;

export async function push() {
  if (!state.auth || !state.dirty) return;
  if (pushing) return pushing;
  pushing = (async () => {
    setStatus('syncing');
    try {
      for (let attempt = 0; attempt < 4 && state.dirty; attempt++) {
        const sentAt = changeCounter;
        const res = await api('/data', { method: 'PUT', body: { doc: state.doc, baseRev: state.rev } });
        if (res.status === 401) return handleUnauthorized();
        if (res.status === 409) {
          state.doc = normalizeDoc(mergeDocs(state.doc, res.data.doc));
          state.rev = res.data.rev;
          persistLocal();
          emit('doc');
          continue;
        }
        if (!res.ok) throw new Error(res.data.message);
        state.rev = res.data.rev;
        if (sentAt === changeCounter) state.dirty = false;
        persistLocal();
      }
      setStatus('idle');
    } catch {
      setStatus(navigator.onLine ? 'error' : 'offline');
    } finally {
      pushing = null;
    }
  })();
  return pushing;
}

let pushTimer = null;
/** Изменить документ: mutator правит черновик, дальше — сохранение и отправка. */
export function update(mutator) {
  mutator(state.doc);
  state.dirty = true;
  changeCounter++;
  persistLocal();
  emit('doc');
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 700);
}

export function replaceDoc(doc) {
  update((d) => {
    const fresh = normalizeDoc(doc);
    const stamp = Date.now();
    // Метки времени, чтобы импорт перебил версии на других устройствах.
    fresh.settings.updatedAt = stamp;
    for (const key of COLLECTIONS) {
      for (const item of fresh[key]) item.updatedAt = stamp;
      // Записи, которых нет в импорте, помечаем удалёнными, чтобы слияние их не вернуло.
      for (const old of d[key]) {
        if (!fresh[key].some((x) => x.id === old.id)) fresh[key].push({ ...old, deleted: true, updatedAt: stamp });
      }
    }
    Object.assign(d, fresh);
  });
}

export function startAutoSync() {
  window.addEventListener('online', () => pull());
  window.addEventListener('offline', () => setStatus('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pull();
    else if (state.dirty) push();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') pull();
  }, 60_000);
}

export { newDoc };
