// Логика API, не зависящая от хостинга. Хранилище передаётся снаружи:
// на Netlify это Netlify Blobs, локально — JSON-файл.
//
// store: { get(key) -> object|null, set(key, object), del(key) }

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const MAX_DOC_BYTES = 2_000_000;
const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const err = (status, code, message) => json(status, { error: code, message });

async function hashPassword(password, salt) {
  const buf = await scrypt(password, salt, 64);
  return buf.toString('hex');
}

async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_DOC_BYTES) throw Object.assign(new Error('too big'), { status: 413 });
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error('bad json'), { status: 400 });
  }
}

async function createSession(store, username) {
  const token = randomBytes(32).toString('hex');
  await store.set(`sessions/${token}`, { username, createdAt: Date.now() });
  return token;
}

async function authUser(req, store) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await store.get(`sessions/${token}`);
  return session ? { username: session.username, token } : null;
}

function normalizeCredentials(body) {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  return { username, password };
}

export async function handleApi(req, store, env = {}) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  try {
    if (route === '/register' && method === 'POST') {
      const body = await readBody(req);
      const { username, password } = normalizeCredentials(body);
      if (env.REGISTRATION_CODE && body.code !== env.REGISTRATION_CODE) {
        return err(403, 'bad_code', 'Неверный код приглашения');
      }
      if (!USERNAME_RE.test(username)) {
        return err(400, 'bad_username', 'Логин: 3–32 символа, латиница, цифры, _ . -');
      }
      if (password.length < 4) return err(400, 'bad_password', 'Пароль минимум 4 символа');
      if (await store.get(`users/${username}`)) return err(409, 'taken', 'Такой логин уже занят');

      const salt = randomBytes(16).toString('hex');
      await store.set(`users/${username}`, {
        salt,
        hash: await hashPassword(password, salt),
        createdAt: Date.now(),
      });
      const token = await createSession(store, username);
      return json(200, { token, username });
    }

    if (route === '/login' && method === 'POST') {
      const { username, password } = normalizeCredentials(await readBody(req));
      const user = await store.get(`users/${username}`);
      if (!user) return err(401, 'bad_login', 'Неверный логин или пароль');
      const hash = await hashPassword(password, user.salt);
      const ok = timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
      if (!ok) return err(401, 'bad_login', 'Неверный логин или пароль');
      const token = await createSession(store, username);
      return json(200, { token, username });
    }

    const auth = await authUser(req, store);
    if (!auth) return err(401, 'unauthorized', 'Нужно войти заново');

    if (route === '/logout' && method === 'POST') {
      await store.del(`sessions/${auth.token}`);
      return json(200, { ok: true });
    }

    if (route === '/data' && method === 'GET') {
      const saved = await store.get(`data/${auth.username}`);
      return json(200, { username: auth.username, rev: saved?.rev || 0, doc: saved?.doc || null });
    }

    if (route === '/data' && method === 'PUT') {
      const body = await readBody(req);
      if (!body.doc || typeof body.doc !== 'object') return err(400, 'bad_doc', 'Нет данных');
      const saved = await store.get(`data/${auth.username}`);
      const currentRev = saved?.rev || 0;
      // Оптимистичная блокировка: если данные успели поменяться с другого устройства,
      // клиент получает свежую версию, сливает и отправляет снова.
      if (Number(body.baseRev) !== currentRev) {
        return json(409, { rev: currentRev, doc: saved?.doc || null });
      }
      const rev = currentRev + 1;
      await store.set(`data/${auth.username}`, { rev, doc: body.doc, savedAt: Date.now() });
      return json(200, { rev });
    }

    return err(404, 'not_found', 'Нет такого адреса');
  } catch (e) {
    if (e.status) return err(e.status, 'bad_request', e.message);
    console.error(e);
    return err(500, 'server', 'Ошибка сервера');
  }
}
