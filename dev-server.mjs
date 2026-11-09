// Локальный сервер для разработки: раздаёт public/ и API.
// Данные хранятся в data/db.json. Запуск: npm run dev
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { handleApi } from './server/core.mjs';

const PORT = Number(process.env.PORT) || 8889;
const ROOT = join(import.meta.dirname, 'public');
const DB_FILE = join(import.meta.dirname, 'data', 'db.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let db = {};
if (existsSync(DB_FILE)) db = JSON.parse(await readFile(DB_FILE, 'utf8'));
const persist = async () => {
  await mkdir(join(import.meta.dirname, 'data'), { recursive: true });
  await writeFile(DB_FILE, JSON.stringify(db, null, 2));
};

const store = {
  get: async (key) => db[key] ?? null,
  set: async (key, value) => { db[key] = value; await persist(); },
  del: async (key) => { delete db[key]; await persist(); },
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const response = await handleApi(request, store, { REGISTRATION_CODE: process.env.REGISTRATION_CODE });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!path || path.endsWith('/') || path.endsWith('\\')) path = join(path, 'index.html');
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    const body = await readFile(join(ROOT, 'index.html'));
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(body);
  }
}).listen(PORT, () => console.log(`Календарик: http://localhost:${PORT}`));
