import * as D from './data.js';
import { state, onChange, loadLocal, authenticate, logout, pull, update, replaceDoc, startAutoSync } from './sync.js';
import { pigSvg, PIG_PINK } from './pig.js';

const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');
const toastEl = document.getElementById('toast');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const buzz = () => navigator.vibrate?.(8);
const doc = () => state.doc;
const now = () => Date.now();

const ui = {
  tab: 'today',
  auth: { mode: 'login', error: '', needCode: false, busy: false, username: '' },
  sheet: null,
};

// ---------- Общие куски разметки ----------

const ICONS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17h.01M12 17h.01"/>',
  study: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const TABS = {
  today: { title: 'Сегодня', nav: 'Сегодня' },
  calendar: { title: 'Календарь', nav: 'Календарь' },
  study: { title: 'Учёба', nav: 'Учёба' },
  settings: { title: 'Настройки', nav: 'Настройки' },
};
const SYNC_TEXT = { idle: 'Сохранено', syncing: 'Сохраняю…', offline: 'Офлайн', error: 'Нет связи' };

const emptyHtml = (text) => `<div class="empty">${pigSvg('', PIG_PINK)}${esc(text)}</div>`;

const seg = (act, value, options) =>
  `<div class="seg" role="group">${options.map(([v, label]) =>
    `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${v === value}">${label}</button>`).join('')}</div>`;

// ---------- Тема ----------

function applyTheme() {
  const theme = doc()?.settings.theme || 'auto';
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#160D12' : '#FFF4F8';
}

// ---------- Главный рендер ----------

function render() {
  applyTheme();
  if (!state.auth) return renderAuth();
  if (!state.doc) loadLocal();
  rememberTimeZone();
  renderMain();
}

// Часовой пояс нужен серверу, чтобы присылать напоминания вовремя.
function rememberTimeZone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && doc().settings.tz !== tz) {
    update((d) => { d.settings.tz = tz; d.settings.updatedAt = now(); });
  }
}

function renderMain() {
  const pages = { today: todayHtml, calendar: calendarHtml, study: studyHtml, settings: settingsHtml };
  app.innerHTML = `
    <header class="topbar">
      ${pigSvg('logo', PIG_PINK, { pencil: false })}
      <h1>${TABS[ui.tab].title}</h1>
      <span class="spacer"></span>
      <span class="sync-dot" data-s="${state.status}">${SYNC_TEXT[state.status]}</span>
    </header>
    <main class="page ${ui.tab}">${pages[ui.tab]()}</main>
    <nav class="nav">${Object.keys(pages).map((t) => `
      <button data-act="tab" data-v="${t}" ${ui.tab === t ? 'aria-current="page"' : ''}>
        <span class="pill">${icon(t)}</span>${TABS[t].nav}
      </button>`).join('')}
    </nav>`;
}

function refreshSyncDot() {
  const dot = app.querySelector('.sync-dot');
  if (dot) {
    dot.dataset.s = state.status;
    dot.textContent = SYNC_TEXT[state.status];
  }
  const row = app.querySelector('[data-sync-text]');
  if (row) row.textContent = SYNC_TEXT[state.status];
}

// ---------- Вход ----------

function renderAuth() {
  const a = ui.auth;
  const reg = a.mode === 'register';
  app.innerHTML = `<div class="center-page">
    <div class="brand">${pigSvg('', PIG_PINK)}<h1>Календарик</h1><p>Пары, домашки и планы</p></div>
    ${seg('auth-mode', a.mode, [['login', 'Вход'], ['register', 'Регистрация']])}
    <form id="auth-form" class="stack" autocomplete="on">
      <input class="input" name="username" placeholder="Логин" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${esc(a.username)}">
      <input class="input" name="password" type="password" placeholder="Пароль" required
        autocomplete="${reg ? 'new-password' : 'current-password'}">
      ${reg && a.needCode ? '<input class="input" name="code" placeholder="Код приглашения" autocomplete="off">' : ''}
      <div class="error">${esc(a.error)}</div>
      <button class="btn" type="submit" ${a.busy ? 'disabled' : ''}>${a.busy ? 'Минутку…' : reg ? 'Создать аккаунт' : 'Войти'}</button>
    </form>
  </div>`;
}

async function submitAuth(form) {
  const data = Object.fromEntries(new FormData(form));
  const a = ui.auth;
  a.username = data.username;
  a.busy = true;
  a.error = '';
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Минутку…';
  try {
    await authenticate(a.mode, data.username, data.password, data.code);
    a.busy = false;
    ui.tab = 'today';
    render();
  } catch (e) {
    a.busy = false;
    if (e.code === 'bad_code') a.needCode = true;
    a.error = e.code ? e.message : 'Нет связи с сервером';
    renderAuth();
  }
}

// ---------- Экраны ----------

function todayHtml() {
  const today = D.dayKey();
  return `<p class="date-line">${esc(D.dateLabel(today, true))}</p>
    ${emptyHtml('Пока пусто. Скоро здесь будут пары и дела на сегодня')}`;
}

function calendarHtml() {
  return emptyHtml('Здесь будет календарь на месяц');
}

function studyHtml() {
  return emptyHtml('Здесь будут предметы и расписание пар');
}

function settingsHtml() {
  const s = doc().settings;
  return `
    <div class="set-group">
      <div class="set-row"><span class="t">Тема</span></div>
      <div style="padding:0 12px 4px">${seg('theme', s.theme, [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']])}</div>
    </div>
    <div class="set-group">
      <button class="set-row" data-act="export"><span class="t">Скачать мои данные<small>Файл JSON со всеми записями</small></span><span class="chev">›</span></button>
      <button class="set-row" data-act="import"><span class="t">Загрузить из файла<small>Заменит текущие данные</small></span><span class="chev">›</span></button>
    </div>
    <div class="set-group">
      <div class="set-row"><span class="t">Аккаунт<small>${esc(state.auth.username)}</small></span><span class="v" data-sync-text>${SYNC_TEXT[state.status]}</span></div>
      <button class="set-row danger" data-act="logout"><span class="t">Выйти</span></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
    <p class="empty" style="padding:8px">Календарик Dami 🐷 v1.0</p>`;
}

// ---------- Шторки ----------

const SHEETS = {};

function renderSheet() {
  if (!ui.sheet) {
    sheetRoot.innerHTML = '';
    return;
  }
  const body = SHEETS[ui.sheet.kind]();
  let sheet = sheetRoot.querySelector('.sheet-body');
  if (!sheet) {
    sheetRoot.innerHTML = `<div class="overlay" data-act="sheet-bg"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sheet-body"></div></div></div>`;
    sheet = sheetRoot.querySelector('.sheet-body');
  }
  sheet.innerHTML = body;
  sheet.querySelector('[autofocus]')?.focus();
}

function openSheet(s) {
  ui.sheet = s;
  renderSheet();
}

function closeSheet() {
  ui.sheet = null;
  renderSheet();
}

// ---------- Тост ----------

let toastTimer = null;
let toastAction = null;
function toast(text, actionLabel, onAction) {
  toastEl.innerHTML = `<span>${esc(text)}</span>${actionLabel ? `<button data-act="toast-action">${esc(actionLabel)}</button>` : ''}`;
  toastAction = onAction || null;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), actionLabel ? 4500 : 2200);
}

// ---------- Данные ----------

function exportData() {
  const blob = new Blob([JSON.stringify(doc(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kalendarik-${state.auth.username}-${D.dayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.subjects)) throw new Error();
    if (!confirm('Заменить все текущие данные данными из файла?')) return;
    replaceDoc(parsed);
    render();
    toast('Данные загружены');
  } catch {
    toast('Это не файл Календарика');
  }
}

// ---------- События ----------

const actions = {
  tab: (el) => { ui.tab = el.dataset.v; window.scrollTo(0, 0); render(); },
  'auth-mode': (el) => { ui.auth.mode = el.dataset.v; ui.auth.error = ''; renderAuth(); },
  theme: (el) => {
    update((d) => { d.settings.theme = el.dataset.v; d.settings.updatedAt = now(); });
  },
  export: () => exportData(),
  import: () => document.getElementById('import-file').click(),
  logout: () => {
    if (confirm('Выйти из аккаунта на этом устройстве?')) logout();
  },
  'toast-action': () => {
    toastAction?.();
    toastEl.classList.remove('show');
    toastAction = null;
  },
};

document.addEventListener('click', (e) => {
  if (e.target.matches('.overlay')) return closeSheet();
  const el = e.target.closest('[data-act]');
  if (!el || el.dataset.act === 'sheet-bg') return;
  actions[el.dataset.act]?.(el, e);
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'auth-form') return submitAuth(form);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.name === 'username' && t.form?.id === 'auth-form') ui.auth.username = t.value;
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'import-file' && e.target.files[0]) importData(e.target.files[0]);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet) closeSheet();
});

onChange((what) => {
  if (what === 'status') return refreshSyncDot();
  if (what === 'auth' && !state.auth) closeSheet();
  // Пока открыта шторка, не перерисовываем экран под ней, чтобы не сбить ввод.
  if (what === 'doc' && ui.sheet) return;
  render();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// Наступил новый день — обновить «Сегодня».
let lastDay = D.dayKey();
setInterval(() => {
  if (D.dayKey() !== lastDay) {
    lastDay = D.dayKey();
    if (!ui.sheet && state.auth) render();
  }
}, 30_000);

// ---------- Старт ----------

if (state.auth) loadLocal();
render();
if (state.auth) pull();
startAutoSync();

if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('/sw.js');
}
