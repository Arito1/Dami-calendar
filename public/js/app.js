import * as D from './data.js';
import { state, onChange, loadLocal, authenticate, logout, pull, update, replaceDoc, startAutoSync } from './sync.js';
import { pigSvg, PIG_PINK } from './pig.js';
import { parseQuick } from './parse.js';
import { pushSupport, deviceSubscribed, enablePush, disablePush, testPush } from './push.js';

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
  day: D.dayKey(), // выбранный день на вкладке «Сегодня»
  study: 'schedule', // schedule | subjects | exams
  inboxOpen: false,
  pushDevice: null, // подписан ли этот телефон на уведомления (узнаём асинхронно)
  pushBusy: false,
  cal: { month: D.dayKey().slice(0, 7), view: 'month', sel: D.dayKey() },
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
const subjIco = (s, extra = '') => `<span class="ico" style="--c:${esc(s.color)}" ${extra}>${esc(s.emoji)}</span>`;
const WD_FULL = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const WD_SEG = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [7, 'Вс']];
const WEEKS_SHORT = { odd: 'нечёт', even: 'чёт' };

const seg = (act, value, options, cls = '') =>
  `<div class="seg ${cls}" role="group">${options.map(([v, label]) =>
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
    ${ui.tab === 'today' || ui.tab === 'calendar' ? '<button class="fab" data-act="item-new" aria-label="Добавить">+</button>' : ''}
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

// ----- Сегодня: полоска недели и лента дня -----

function dayDots(key) {
  const d = doc();
  const colors = [...new Set([
    ...D.lessonsOn(d, key).filter((x) => !x.cancelled).map((x) => x.subject.color),
    ...D.itemsOn(d, key).filter((i) => !D.isDone(i, key)).map((i) => D.findSubject(d, i.subjectId)?.color || (i.kind === 'exam' ? '#EF5350' : '#EC407A')),
  ])];
  return colors.slice(0, 4).map((c) => `<i style="--c:${esc(c)}"></i>`).join('');
}

function weekStripHtml() {
  const start = D.weekStart(ui.day);
  const today = D.dayKey();
  const mid = D.parseDay(D.addDays(start, 3));
  const days = Array.from({ length: 7 }, (_, i) => D.addDays(start, i));
  return `<div class="week-strip" data-swipe="week">
    <div class="ws-head">
      <button class="icon-btn" data-act="week-shift" data-d="-7" aria-label="Прошлая неделя">‹</button>
      <span>${D.MONTHS_NOM[mid.getMonth()]} ${mid.getFullYear()}</span>
      <button class="icon-btn" data-act="week-shift" data-d="7" aria-label="Следующая неделя">›</button>
    </div>
    <div class="ws-days">${days.map((k) => `
      <button class="ws-day${k === ui.day ? ' on' : ''}${k === today ? ' today' : ''}" data-act="day" data-v="${k}">
        <small>${D.WD_SHORT[D.parseDay(k).getDay()]}</small><b>${D.parseDay(k).getDate()}</b><span class="dots">${dayDots(k)}</span>
      </button>`).join('')}
    </div>
  </div>`;
}

function lessonMeta(x) {
  const parts = [];
  if (D.KINDS[x.lesson.kind]) parts.push(D.KINDS[x.lesson.kind]);
  if (x.room) parts.push(`ауд. ${x.room}`);
  const teacher = x.subject.teacher;
  if (teacher) parts.push(teacher);
  return parts.join(' · ');
}

function lessonRowHtml(x, status = '') {
  const s = x.subject;
  let note = '';
  if (x.movedTo) note = `<span class="tag warn-tag">перенесена на ${esc(D.dateLabel(x.movedTo))}</span>`;
  else if (x.cancelled) note = '<span class="tag warn-tag">отменена</span>';
  else if (x.movedFrom) note = `<span class="tag">перенесена с ${esc(D.dateLabel(x.movedFrom))}</span>`;
  else if (x.changed) note = '<span class="tag">изменена на этот день</span>';
  return `<button class="lesson${x.cancelled ? ' cancelled' : ''}${status ? ` ${status.cls}` : ''}" style="--c:${esc(s.color)}"
      data-act="lesson-day" data-id="${x.lesson.id}" data-date="${x.movedFrom || x.date}">
    <span class="l-time"><b>${x.start}</b><small>${x.end}</small></span>
    <span class="l-main">
      <span class="l-name">${esc(s.emoji)} ${esc(s.name)}</span>
      <span class="l-meta">${esc(lessonMeta(x))}</span>
      ${note}${status?.html || ''}
    </span>
  </button>`;
}

/** Статус пары относительно текущего времени: идёт, скоро, прошла. */
function lessonStatus(x, isToday, nextIdx, i) {
  if (!isToday || x.cancelled) return null;
  const t = D.nowMin();
  const a = D.toMin(x.start);
  const b = D.toMin(x.end);
  if (t >= a && t < b) {
    const pct = Math.round(((t - a) / (b - a)) * 100);
    return { cls: 'now', html: `<span class="l-status">идёт · ещё ${D.durLabel(b - t)}</span><span class="progress"><i style="width:${pct}%"></i></span>` };
  }
  if (t >= b) return { cls: 'past', html: '' };
  if (i === nextIdx) return { cls: 'next', html: `<span class="l-status">через ${D.durLabel(a - t)}</span>` };
  return null;
}

/** Лента дня: пары и дела со временем вперемешку, по порядку. */
function timelineHtml(list, key, timedItems = []) {
  const isToday = key === D.dayKey();
  const t = D.nowMin();
  const nextIdx = list.findIndex((x) => !x.cancelled && D.toMin(x.start) > t);
  const rows = [
    ...list.map((x, i) => ({ at: D.toMin(x.start), lesson: x, i })),
    ...timedItems.map((it) => ({ at: D.toMin(it.time), item: it })),
  ].sort((a, b) => a.at - b.at || (a.lesson ? -1 : 1));
  let prevEnd = null;
  let html = '';
  for (const r of rows) {
    if (r.item) {
      html += itemRowHtml(r.item, key, { hideDate: true });
      continue;
    }
    const x = r.lesson;
    if (!x.cancelled && prevEnd != null) {
      const gap = D.toMin(x.start) - prevEnd;
      if (gap >= 20) html += `<div class="gap">окно ${D.durLabel(gap)}</div>`;
    }
    html += lessonRowHtml(x, lessonStatus(x, isToday, nextIdx, r.i));
    if (!x.cancelled) prevEnd = D.toMin(x.end);
  }
  return `<div class="timeline">${html}</div>`;
}

// ----- Дела -----

function itemMeta(it, key, { hideDate = false } = {}) {
  const parts = [];
  const today = D.dayKey();
  if (it.time) parts.push(`<span>🕑 ${it.time}${it.endTime ? `–${it.endTime}` : ''}</span>`);
  if (it.subjectId) {
    const s = D.findSubject(doc(), it.subjectId);
    if (s) parts.push(`<span class="mini-subj" style="--c:${esc(s.color)}">${esc(s.emoji)} ${esc(s.name)}</span>`);
  }
  if (it.kind !== 'task') parts.push(`<span>${D.ITEM_KINDS[it.kind].emoji} ${D.ITEM_KINDS[it.kind].label}</span>`);
  if (!hideDate && it.date && !it.repeat) {
    const late = it.date < today && !it.done;
    parts.push(`<span class="${late ? 'late' : ''}">${esc(it.date === today ? 'сегодня' : `${D.shortDate(it.date)} · ${D.dueLabel(it.date, today)}`)}</span>`);
  }
  const subs = it.subtasks || [];
  if (subs.length) parts.push(`<span>☑ ${subs.filter((x) => x.done).length}/${subs.length}</span>`);
  if (it.repeat) parts.push(`<span>🔁 ${D.REPEAT_LABEL[it.repeat.freq]}</span>`);
  if (it.remind != null && it.remind !== '') parts.push('<span>🔔</span>');
  if (it.notes) parts.push('<span>📝</span>');
  return parts.join('');
}

function itemRowHtml(it, key = it.date, opts = {}) {
  const done = D.isDone(it, key);
  const s = it.subjectId ? D.findSubject(doc(), it.subjectId) : null;
  const color = s?.color || (it.kind === 'exam' ? '#EF5350' : it.kind === 'event' ? '#AB47BC' : '#EC407A');
  const prio = it.priority ? `<span class="prio p${it.priority}">${it.priority === 2 ? '!!' : '!'}</span>` : '';
  return `<div class="item-wrap" data-swipe-item data-id="${it.id}" data-date="${key || ''}">
    <span class="swipe-hint left">✓ Готово</span><span class="swipe-hint right">На завтра →</span>
    <div class="item${done ? ' done' : ''} k-${it.kind}" style="--c:${esc(color)}">
      <button class="check" data-act="item-toggle" data-id="${it.id}" data-date="${key || ''}" aria-label="${done ? 'Вернуть' : 'Готово'}" aria-pressed="${done}"></button>
      <button class="i-main" data-act="item-open" data-id="${it.id}" data-date="${key || ''}">
        <span class="i-title">${prio}${esc(it.title)}</span>
        <span class="i-meta">${itemMeta(it, key, opts)}</span>
      </button>
    </div>
  </div>`;
}

function examChipsHtml() {
  const today = D.dayKey();
  const exams = D.upcomingExams(doc(), today, 30);
  if (!exams.length) return '';
  return `<div class="exam-strip">${exams.map((e) => {
    const s = e.subjectId ? D.findSubject(doc(), e.subjectId) : null;
    const n = D.diffDays(today, e.date);
    return `<button class="exam-chip" data-act="item-open" data-id="${e.id}" data-date="${e.date}" style="--c:${esc(s?.color || '#EF5350')}">
      <b>${n === 0 ? 'Сегодня' : n}</b><small>${n === 0 ? '' : D.plural(n, 'день', 'дня', 'дней')}</small>
      <span>🎓 ${esc(e.title)}</span></button>`;
  }).join('')}</div>`;
}

function todayHtml() {
  const d = doc();
  const key = ui.day;
  const today = D.dayKey();
  const isToday = key === today;
  const parity = D.weekParity(d, key);
  const br = D.breakOn(d, key);
  const lessons = D.lessonsOn(d, key);
  const items = D.itemsOn(d, key);
  const timed = items.filter((i) => i.time);
  const untimed = items.filter((i) => !i.time);
  const noSchedule = !D.live(d.lessons).length;

  let html = `${weekStripHtml()}
    <div class="day-line">
      <span><b>${esc(D.dayTitle(key))}</b>${isToday || key === D.addDays(today, 1) ? `, ${esc(D.dateLabel(key))}` : ''}</span>
      ${parity ? `<span class="parity ${parity}">${D.PARITY_LABEL[parity]}</span>` : ''}
    </div>
    ${!isToday ? '<button class="chip back-today" data-act="day" data-v="today">← К сегодня</button>' : ''}`;

  if (isToday) {
    html += examChipsHtml();
    const hot = D.hotList(d, today).filter((i) => i.date !== today);
    if (hot.length) {
      html += `<div class="section-title"><h2>🔥 Горит</h2><span>${hot.length}</span></div>
        <div class="items">${hot.map((i) => itemRowHtml(i)).join('')}</div>`;
    }
  }

  if (br && !lessons.length) html += `<div class="break-note">🏖 ${esc(br.name || 'Каникулы')} до ${esc(D.dateLabel(br.to || br.from))}</div>`;

  if (lessons.length || timed.length) {
    const active = lessons.filter((x) => !x.cancelled);
    const span = active.length ? `${active.length} ${D.plural(active.length, 'пара', 'пары', 'пар')} · ${active[0].start}–${active[active.length - 1].end}` : '';
    html += `<div class="section-title"><h2>${lessons.length ? 'Расписание' : 'По времени'}</h2><span>${span}</span></div>
      ${timelineHtml(lessons, key, timed)}`;
  }

  if (untimed.length) {
    const left = untimed.filter((i) => !D.isDone(i, key)).length;
    html += `<div class="section-title"><h2>${isToday ? 'Сделать сегодня' : 'Дела на день'}</h2><span>${left ? `осталось ${left}` : 'всё готово ✨'}</span></div>
      <div class="items">${untimed.map((i) => itemRowHtml(i, key, { hideDate: true })).join('')}</div>`;
  }

  if (!lessons.length && !items.length && !(br && !lessons.length)) {
    html += noSchedule && isToday
      ? `<div class="card cta">
          <b>Заполним расписание?</b>
          <p>Добавь предметы и пары — и здесь каждый день будет видно, что, где и во сколько. А дела и домашки добавляются кнопкой «+».</p>
          <button class="btn" data-act="go-study">Заполнить расписание</button>
        </div>`
      : emptyHtml(isToday ? 'На сегодня ничего — можно отдыхать 🎉' : 'Ничего не запланировано');
  }

  if (isToday) {
    const inbox = D.inbox(d);
    if (inbox.length) {
      html += `<button class="section-title fold" data-act="inbox-toggle" aria-expanded="${ui.inboxOpen}">
          <h2>📥 Входящие</h2><span>${inbox.length} без даты ${ui.inboxOpen ? '▴' : '▾'}</span></button>
        ${ui.inboxOpen ? `<div class="items">${inbox.map((i) => itemRowHtml(i)).join('')}</div>` : ''}`;
    }
    const n = D.doneThisWeek(d, today);
    if (n) html += `<p class="week-done">За эту неделю закрыто: <b>${n}</b> ${n >= 10 ? '🏆' : n >= 5 ? '🔥' : '✨'}</p>`;
  }
  return html;
}

// ----- Календарь -----

function monthGridHtml() {
  const d = doc();
  const today = D.dayKey();
  const first = `${ui.cal.month}-01`;
  const start = D.weekStart(first);
  const [y, m] = ui.cal.month.split('-').map(Number);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const key = D.addDays(start, i);
    if (i >= 35 && key.slice(0, 7) !== ui.cal.month) break;
    cells.push(key);
  }
  return `<div class="month" data-swipe="month">
    <div class="ws-head">
      <button class="icon-btn" data-act="month-shift" data-d="-1" aria-label="Прошлый месяц">‹</button>
      <span>${D.MONTHS_NOM[m - 1]} ${y}</span>
      <button class="icon-btn" data-act="month-shift" data-d="1" aria-label="Следующий месяц">›</button>
    </div>
    <div class="m-grid">
      ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => `<span class="m-wd">${w}</span>`).join('')}
      ${cells.map((key) => {
        const items = D.itemsOn(d, key).filter((i) => !D.isDone(i, key));
        const exam = items.some((i) => i.kind === 'exam');
        const lessons = D.lessonsOn(d, key).filter((x) => !x.cancelled).length;
        const colors = items.slice(0, 3).map((i) => D.findSubject(d, i.subjectId)?.color || (i.kind === 'event' ? '#AB47BC' : '#EC407A'));
        const cls = [
          key.slice(0, 7) !== ui.cal.month && 'out',
          key === today && 'today',
          key === ui.cal.sel && 'on',
          exam && 'exam',
          D.breakOn(d, key) && 'break',
        ].filter(Boolean).join(' ');
        return `<button class="m-day ${cls}" data-act="cal-day" data-v="${key}">
          <b>${D.parseDay(key).getDate()}</b>
          <span class="dots">${colors.map((c) => `<i style="--c:${esc(c)}"></i>`).join('')}</span>
          ${lessons ? `<span class="m-lessons" style="--n:${Math.min(lessons, 5)}"></span>` : ''}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function dayDetailHtml(key) {
  const d = doc();
  const lessons = D.lessonsOn(d, key);
  const items = D.itemsOn(d, key);
  const br = D.breakOn(d, key);
  return `<div class="section-title"><h2>${esc(D.dayTitle(key))}</h2>
      <button class="chip" data-act="item-new" data-date="${key}">+ Добавить</button></div>
    ${br ? `<div class="break-note">🏖 ${esc(br.name || 'Каникулы')}</div>` : ''}
    ${lessons.length ? `<div class="compact-lessons">${lessons.map((x) => `
      <button class="cl${x.cancelled ? ' cancelled' : ''}" style="--c:${esc(x.subject.color)}" data-act="lesson-day" data-id="${x.lesson.id}" data-date="${x.movedFrom || x.date}">
        <b>${x.start}</b> ${esc(x.subject.emoji)} ${esc(x.subject.name)}${x.room ? ` <small>ауд. ${esc(x.room)}</small>` : ''}</button>`).join('')}</div>` : ''}
    ${items.length ? `<div class="items">${items.map((i) => itemRowHtml(i, key, { hideDate: true })).join('')}</div>` : ''}
    ${!lessons.length && !items.length ? '<p class="label center">Ничего нет</p>' : ''}`;
}

function agendaHtml() {
  const d = doc();
  const today = D.dayKey();
  let html = '';
  const overdue = D.hotList(d, today, -1);
  if (overdue.length) {
    html += `<div class="day-head"><span>Просрочено</span><span>${overdue.length}</span></div>
      <div class="items">${overdue.map((i) => itemRowHtml(i)).join('')}</div>`;
  }
  for (let n = 0; n < 21; n++) {
    const key = D.addDays(today, n);
    const items = D.itemsOn(d, key);
    if (!items.length) continue;
    const lessons = D.lessonsOn(d, key).filter((x) => !x.cancelled).length;
    html += `<div class="day-head"><span>${esc(D.dayTitle(key))}${n < 2 ? `, ${esc(D.dateLabel(key))}` : ''}</span>
      <span>${lessons ? `${lessons} ${D.plural(lessons, 'пара', 'пары', 'пар')}` : ''}</span></div>
      <div class="items">${items.map((i) => itemRowHtml(i, key, { hideDate: true })).join('')}</div>`;
  }
  return html || emptyHtml('На три недели вперёд ничего не запланировано');
}

function calendarHtml() {
  return `${seg('cal-view', ui.cal.view, [['month', 'Месяц'], ['list', 'Список на 3 недели']])}
    ${ui.cal.view === 'month' ? `${monthGridHtml()}${dayDetailHtml(ui.cal.sel)}` : agendaHtml()}`;
}

// ----- Учёба: расписание и предметы -----

function templateRowHtml(l) {
  const s = D.findSubject(doc(), l.subjectId) || D.NO_SUBJECT;
  const parity = D.weekParity(doc(), D.dayKey()) !== null && l.weeks && l.weeks !== 'all';
  const meta = [D.KINDS[l.kind], l.room && `ауд. ${l.room}`].filter(Boolean).join(' · ');
  return `<button class="lesson" style="--c:${esc(s.color)}" data-act="lesson-edit" data-id="${l.id}">
    <span class="l-time"><b>${l.start}</b><small>${l.end}</small></span>
    <span class="l-main">
      <span class="l-name">${esc(s.emoji)} ${esc(s.name)}</span>
      <span class="l-meta">${esc(meta)}</span>
      ${parity ? `<span class="tag">${WEEKS_SHORT[l.weeks]}</span>` : ''}
    </span>
  </button>`;
}

function scheduleHtml() {
  const lessons = D.live(doc().lessons);
  const days = [1, 2, 3, 4, 5, 6];
  if (lessons.some((l) => l.weekday === 7)) days.push(7);
  return days.map((wd) => {
    const list = lessons.filter((l) => l.weekday === wd).sort((a, b) => D.toMin(a.start) - D.toMin(b.start));
    return `<div class="section-title"><h2>${WD_FULL[wd]}</h2><span>${list.length ? `${list.length} ${D.plural(list.length, 'пара', 'пары', 'пар')}` : ''}</span></div>
      <div class="timeline">${list.map(templateRowHtml).join('')}
        <button class="add-row" data-act="lesson-new" data-wd="${wd}">+ Пара</button>
      </div>`;
  }).join('');
}

function subjectsHtml() {
  const list = D.subjects(doc());
  const lessons = D.live(doc().lessons);
  return `<div class="set-group">${list.map((s) => {
    const n = lessons.filter((l) => l.subjectId === s.id).length;
    const meta = [n ? `${n} ${D.plural(n, 'пара', 'пары', 'пар')} в неделю` : 'пар нет', s.teacher].filter(Boolean).join(' · ');
    return `<button class="set-row" data-act="subject-edit" data-id="${s.id}">
      ${subjIco(s)}<span class="t">${esc(s.name)}<small>${esc(meta)}</small></span><span class="chev">›</span>
    </button>`;
  }).join('')}
    <button class="set-row add" data-act="subject-new"><span class="ico plus-ico">+</span><span class="t">Новый предмет</span></button>
  </div>`;
}

function examsHtml() {
  const d = doc();
  const today = D.dayKey();
  const upcoming = D.upcomingExams(d, today);
  const past = D.live(d.items).filter((i) => i.kind === 'exam' && i.date && (i.done || i.date < today)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const card = (e) => {
    const s = e.subjectId ? D.findSubject(d, e.subjectId) : null;
    const n = D.diffDays(today, e.date);
    return `<button class="exam-card" data-act="item-open" data-id="${e.id}" data-date="${e.date}" style="--c:${esc(s?.color || '#EF5350')}">
      <span class="ec-count"><b>${n === 0 ? '!' : n}</b><small>${n === 0 ? 'сегодня' : D.plural(n, 'день', 'дня', 'дней')}</small></span>
      <span class="ec-main"><span class="i-title">${esc(e.title)}</span>
        <span class="i-meta"><span>${esc(D.dateLabel(e.date, true))}${e.time ? ` · ${e.time}` : ''}</span>${s ? `<span class="mini-subj" style="--c:${esc(s.color)}">${esc(s.emoji)} ${esc(s.name)}</span>` : ''}</span></span>
    </button>`;
  };
  return `${upcoming.length ? upcoming.map(card).join('') : emptyHtml('Экзаменов впереди нет. Добавь зачёты и экзамены — будет обратный отсчёт')}
    <button class="btn" data-act="item-new" data-kind="exam" style="margin-top:6px">+ Экзамен или зачёт</button>
    ${past.length ? `<div class="section-title"><h2>Прошедшие</h2></div><div class="items">${past.map((i) => itemRowHtml(i)).join('')}</div>` : ''}`;
}

function studyHtml() {
  const views = { schedule: scheduleHtml, subjects: subjectsHtml, exams: examsHtml };
  return `${seg('study-view', ui.study, [['schedule', 'Расписание'], ['subjects', 'Предметы'], ['exams', 'Сессия']])}
    ${views[ui.study]()}`;
}

function notifyHtml() {
  const n = doc().settings.notify;
  const sup = pushSupport();
  if (sup === 'ios-home') {
    return `<div class="set-group"><div class="set-row col"><span class="t">🔔 Уведомления
      <small>На iPhone напоминания приходят, только если открыть Календарик с экрана «Домой»:</small></span>
      <ol class="steps"><li>В Safari нажми «Поделиться» <b>⬆︎</b></li><li>«На экран „Домой“»</li><li>Открой Календарик с иконки и включи уведомления здесь</li></ol></div></div>`;
  }
  if (sup === 'no') {
    return '<div class="set-group"><div class="set-row"><span class="t">🔔 Уведомления<small>Этот браузер не умеет присылать уведомления</small></span></div></div>';
  }
  const on = n.on && ui.pushDevice !== false;
  const time = (key, label, hint) => `<label class="set-row"><span class="t">${label}<small>${hint}</small></span>
    <input class="input time-in" type="time" data-notify="${key}" value="${esc(n[key] || '')}">
    ${n[key] ? `<button type="button" class="icon-btn" data-act="notify-clear" data-v="${key}" aria-label="Выключить">✕</button>` : ''}</label>`;
  return `<div class="set-group">
    <button class="set-row" data-act="notify-toggle" ${ui.pushBusy ? 'disabled' : ''}>
      <span class="t">🔔 Напоминания<small>${ui.pushBusy ? 'Минутку…' : on ? 'Приходят на этот телефон' : 'Пары, дедлайны, утро и вечер'}</small></span>
      <span class="switch" role="switch" aria-checked="${on}"></span>
    </button>
    ${n.on && ui.pushDevice === false ? '<button class="set-row" data-act="notify-toggle"><span class="t warn">На этом устройстве не включены<small>Нажми, чтобы включить и здесь</small></span><span class="chev">›</span></button>' : ''}
    ${on ? `
      <div class="set-row col"><span class="t">Перед парой</span>
        <div class="chips">${[[0, 'Не надо'], [5, 'За 5 мин'], [10, 'За 10'], [15, 'За 15'], [30, 'За 30']].map(([v, l]) =>
          `<button class="chip" data-act="notify-before" data-v="${v}" aria-pressed="${Number(n.classBefore) === v}">${l}</button>`).join('')}</div></div>
      ${time('morning', 'Утренняя сводка', n.morning ? 'Пары и дела на день' : 'Выключена')}
      ${time('evening', 'Вечером — что завтра', n.evening ? 'Что сдать и во сколько первая пара' : 'Выключено')}
      <button class="set-row" data-act="notify-test"><span class="t">Прислать проверочное</span><span class="chev">›</span></button>` : ''}
  </div>`;
}

/** Узнаём, подписано ли это устройство, и перерисовываем настройки, если поменялось. */
async function checkPushDevice() {
  const v = await deviceSubscribed().catch(() => false);
  if (v !== ui.pushDevice) {
    ui.pushDevice = v;
    if (ui.tab === 'settings' && !ui.sheet) render();
  }
}

function setNotify(fields) {
  update((d) => { Object.assign(d.settings.notify, fields); d.settings.updatedAt = now(); });
}

function settingsHtml() {
  checkPushDevice();
  const s = doc().settings;
  const alt = s.week.mode === 'alternating';
  const parity = D.weekParity(doc(), D.dayKey());
  const breaks = s.breaks.filter((b) => !b.deleted);
  return `
    <div class="set-group">
      <button class="set-row" data-act="week-mode">
        <span class="t">Пары чередуются по неделям<small>Числитель и знаменатель: чётная и нечётная неделя</small></span>
        <span class="switch" role="switch" aria-checked="${alt}"></span>
      </button>
      ${alt ? `<div class="set-row col"><span class="t">Эта неделя</span>
        ${seg('week-parity', parity, [['odd', 'Нечётная'], ['even', 'Чётная']])}</div>` : ''}
      <button class="set-row" data-act="breaks"><span class="t">Каникулы и сессия<small>В эти дни пары не показываются</small></span>
        <span class="v">${breaks.length || ''}</span><span class="chev">›</span></button>
    </div>
    ${notifyHtml()}
    <div class="set-group">
      <div class="set-row"><span class="t">Тема</span></div>
      <div style="padding:0 12px 4px">${seg('theme', s.theme, [['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']])}</div>
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

const sheetHead = (title, backAct) => `<div class="sheet-head">
  ${backAct ? `<button class="icon-btn" data-act="${backAct}" aria-label="Назад">‹</button>` : '<span class="icon-btn ghost"></span>'}
  <h3>${esc(title)}</h3>
  <button class="icon-btn" data-act="sheet-close" aria-label="Закрыть">✕</button>
</div>`;

// ----- Предмет -----

function newSubjectSheet(extra = {}) {
  const used = new Set(D.subjects(doc()).map((s) => s.color));
  const color = D.PALETTE.find((c) => !used.has(c)) || D.PALETTE[0];
  return { kind: 'subject', id: null, name: '', emoji: '📚', color, teacher: '', ...extra };
}

function subjectSheetHtml() {
  const s = ui.sheet;
  return `${sheetHead(s.id ? 'Предмет' : 'Новый предмет', s.back ? 'subject-back' : null)}
    <form id="subject-form">
      <div class="preview"><span class="subj-chip" id="subj-preview" style="--c:${esc(s.color)}">${esc(s.emoji)} ${esc(s.name || 'Название')}</span></div>
      <div class="field"><label for="subj-name">Название</label>
        <input class="input" id="subj-name" name="name" value="${esc(s.name)}" placeholder="Например, Матанализ" maxlength="40" required ${s.id ? '' : 'autofocus'}></div>
      <div class="field"><label for="subj-teacher">Преподаватель</label>
        <input class="input" id="subj-teacher" name="teacher" value="${esc(s.teacher)}" placeholder="Необязательно" maxlength="40"></div>
      <div class="field"><label>Значок</label>
        <div class="emoji-grid">${D.EMOJIS.map((e) => `<button type="button" data-act="subj-emoji" data-v="${e}" aria-pressed="${e === s.emoji}">${e}</button>`).join('')}</div></div>
      <div class="field"><label>Цвет</label>
        <div class="swatches">${D.PALETTE.map((c) => `<button type="button" data-act="subj-color" data-v="${c}" style="--c:${c}" aria-pressed="${c === s.color}" aria-label="Цвет"></button>`).join('')}</div></div>
      <button class="btn" type="submit">Сохранить</button>
      ${s.id ? '<button class="btn danger" type="button" data-act="subject-delete" style="margin-top:10px">Удалить предмет</button>' : ''}
    </form>`;
}

function saveSubject(data) {
  const s = ui.sheet;
  const name = data.name.trim();
  if (!name) return toast('Напиши название предмета');
  const id = s.id || `s-${D.uid()}`;
  const fields = { name, teacher: data.teacher.trim(), emoji: s.emoji, color: s.color, updatedAt: now() };
  update((d) => {
    const cur = d.subjects.find((x) => x.id === id);
    if (cur) Object.assign(cur, fields);
    else d.subjects.push({ id, ...fields, createdAt: now() });
  });
  if (s.back) return openSheet({ ...s.back, subjectId: id });
  closeSheet();
  render();
  toast(s.id ? 'Сохранено' : 'Предмет добавлен');
}

// ----- Пара в расписании -----

function lessonSheetHtml() {
  const s = ui.sheet;
  const list = D.subjects(doc());
  const alt = doc().settings.week.mode === 'alternating';
  const slots = D.usedSlots(doc());
  return `${sheetHead(s.id ? 'Пара' : 'Новая пара')}
    <form id="lesson-form">
      <div class="field"><label>Предмет</label>
        <div class="subj-pick">${list.map((x) => `<button type="button" class="subj-chip" style="--c:${esc(x.color)}" data-act="lesson-subj" data-id="${x.id}" aria-pressed="${x.id === s.subjectId}">${esc(x.emoji)} ${esc(x.name)}</button>`).join('')}
          <button type="button" class="subj-chip add" data-act="lesson-subj-new">+ Новый</button></div></div>
      <div class="field"><label>День недели</label>${seg('lesson-wd', s.weekday, WD_SEG)}</div>
      <div class="field"><label>Время</label>
        ${slots.length ? `<div class="chips" style="margin-bottom:8px">${slots.map((t) => `<button type="button" class="chip" data-act="lesson-slot" data-v="${t}" aria-pressed="${t === `${s.start}–${s.end}`}">${t}</button>`).join('')}</div>` : ''}
        <div class="time-pair"><input class="input" type="time" name="start" id="lesson-start" value="${s.start}" required>
          <span>—</span><input class="input" type="time" name="end" id="lesson-end" value="${s.end}" required></div></div>
      <div class="field"><label>Тип</label>${seg('lesson-kind', s.lkind, [['lecture', 'Лекция'], ['practice', 'Практика'], ['lab', 'Лаба'], ['other', 'Другое']])}</div>
      ${alt ? `<div class="field"><label>По каким неделям</label>${seg('lesson-weeks', s.weeks, [['all', 'Каждую'], ['odd', 'Нечётные'], ['even', 'Чётные']])}</div>` : ''}
      <div class="field"><label for="lesson-room">Аудитория</label>
        <input class="input" id="lesson-room" name="room" value="${esc(s.room)}" placeholder="Например, 305 или онлайн" maxlength="30"></div>
      <button class="btn" type="submit">Сохранить</button>
      ${s.id ? '<button class="btn danger" type="button" data-act="lesson-delete" style="margin-top:10px">Удалить из расписания</button>' : ''}
    </form>`;
}

/** Последнее заполненное время пары — подставляем в новую. */
function guessSlot(weekday) {
  const same = D.live(doc().lessons).filter((l) => l.weekday === weekday).sort((a, b) => D.toMin(b.end) - D.toMin(a.end))[0];
  if (!same) return { start: '09:00', end: '10:20' };
  const len = D.toMin(same.end) - D.toMin(same.start);
  const start = D.toMin(same.end) + 10;
  return { start: D.fromMin(start), end: D.fromMin(start + len) };
}

function lessonFromForm() {
  const s = ui.sheet;
  s.start = sheetRoot.querySelector('#lesson-start')?.value || s.start;
  s.end = sheetRoot.querySelector('#lesson-end')?.value || s.end;
  s.room = sheetRoot.querySelector('#lesson-room')?.value ?? s.room;
}

function saveLesson() {
  lessonFromForm();
  const s = ui.sheet;
  if (!s.subjectId) return toast('Выбери предмет');
  if (!s.start || !s.end || D.toMin(s.end) <= D.toMin(s.start)) return toast('Конец пары должен быть позже начала');
  const id = s.id || `l-${D.uid()}`;
  const fields = { subjectId: s.subjectId, weekday: s.weekday, start: s.start, end: s.end, kind: s.lkind, weeks: s.weeks, room: s.room.trim(), updatedAt: now() };
  update((d) => {
    const cur = d.lessons.find((x) => x.id === id);
    if (cur) Object.assign(cur, fields);
    else d.lessons.push({ id, ...fields, createdAt: now() });
  });
  closeSheet();
  render();
  toast(s.id ? 'Сохранено' : 'Пара добавлена');
}

// ----- Пара в конкретный день: отмена, перенос, другое время -----

function ldaySheetHtml() {
  const s = ui.sheet;
  const d = doc();
  const l = d.lessons.find((x) => x.id === s.lessonId);
  const subj = D.findSubject(d, l.subjectId) || D.NO_SUBJECT;
  const o = d.overrides.find((x) => x.id === D.overrideId(l.id, s.date) && !x.deleted);
  const state = o?.cancelled ? 'cancelled' : o?.toDate ? 'moved' : o ? 'changed' : 'normal';
  const stateText = {
    normal: 'Идёт по расписанию',
    cancelled: 'Отменена в этот день',
    moved: `Перенесена на ${D.dateLabel(o?.toDate || s.date, true)}`,
    changed: 'Время или аудитория изменены на этот день',
  }[state];
  return `${sheetHead(`${subj.emoji} ${subj.name}`)}
    <p class="label center" style="margin:-4px 0 12px">${esc(D.dateLabel(s.date, true))} · ${l.start}–${l.end}${l.room ? ` · ауд. ${esc(l.room)}` : ''}</p>
    <div class="state-pill ${state}">${esc(stateText)}</div>
    ${s.mode ? `<form id="lday-form">
        ${s.mode === 'move' ? `<div class="field"><label for="lday-date">Новый день</label>
          <input class="input" type="date" id="lday-date" name="toDate" value="${o?.toDate || s.date}" required></div>` : ''}
        <div class="field"><label>Время</label><div class="time-pair">
          <input class="input" type="time" name="start" value="${o?.start || l.start}" required><span>—</span>
          <input class="input" type="time" name="end" value="${o?.end || l.end}" required></div></div>
        <div class="field"><label for="lday-room">Аудитория</label>
          <input class="input" id="lday-room" name="room" value="${esc(o?.room || l.room || '')}" maxlength="30"></div>
        <div class="btn-row"><button class="btn ghost" type="button" data-act="lday-mode" data-v="">Отмена</button>
          <button class="btn" type="submit">Сохранить</button></div>
      </form>` : `<div class="stack">
        ${state !== 'normal' ? '<button class="btn green" data-act="lday-reset">Вернуть как по расписанию</button>' : ''}
        ${state !== 'cancelled' ? '<button class="btn ghost" data-act="lday-cancel">Отменить в этот день</button>' : ''}
        <button class="btn ghost" data-act="lday-mode" data-v="move">Перенести на другой день</button>
        <button class="btn ghost" data-act="lday-mode" data-v="change">Другое время или аудитория</button>
        <button class="btn ghost" data-act="lesson-edit" data-id="${l.id}">Изменить в расписании</button>
      </div>`}`;
}

function setOverride(fields) {
  const { lessonId, date } = ui.sheet;
  const id = D.overrideId(lessonId, date);
  update((d) => {
    const cur = d.overrides.find((x) => x.id === id);
    const next = { id, lessonId, date, cancelled: false, toDate: null, start: null, end: null, room: null, deleted: false, ...fields, updatedAt: now() };
    if (cur) Object.assign(cur, next);
    else d.overrides.push(next);
  });
  closeSheet();
  render();
}

function saveLday(data) {
  const l = doc().lessons.find((x) => x.id === ui.sheet.lessonId);
  if (D.toMin(data.end) <= D.toMin(data.start)) return toast('Конец пары должен быть позже начала');
  const diff = (v, base) => (v && v !== base ? v : null);
  if (ui.sheet.mode === 'move') {
    if (!data.toDate) return toast('Выбери день');
    setOverride({ toDate: data.toDate === ui.sheet.date ? null : data.toDate, start: data.start, end: data.end, room: data.room.trim() || null });
    return toast(`Перенесено на ${D.dateLabel(data.toDate)}`);
  }
  setOverride({ start: diff(data.start, l.start), end: diff(data.end, l.end), room: diff(data.room.trim(), l.room || '') });
  toast('Изменено на этот день');
}

// ----- Каникулы и сессия -----

function breaksSheetHtml() {
  const list = doc().settings.breaks.filter((b) => !b.deleted).sort((a, b) => a.from.localeCompare(b.from));
  const today = D.dayKey();
  return `${sheetHead('Каникулы и сессия')}
    ${list.length ? `<div class="set-group">${list.map((b) => `
      <div class="set-row"><span class="t">${esc(b.name || 'Без пар')}<small>${esc(D.dateLabel(b.from))} — ${esc(D.dateLabel(b.to || b.from))}</small></span>
        <button class="icon-btn" data-act="break-delete" data-id="${b.id}" aria-label="Удалить">✕</button></div>`).join('')}</div>`
      : '<p class="label center">Пока ничего нет</p>'}
    <form id="break-form" class="card">
      <div class="field"><label for="break-name">Название</label>
        <input class="input" id="break-name" name="name" placeholder="Например, Зимние каникулы" maxlength="40"></div>
      <div class="time-pair"><input class="input" type="date" name="from" value="${today}" required><span>—</span>
        <input class="input" type="date" name="to" value="${today}" required></div>
      <button class="btn" type="submit" style="margin-top:12px">Добавить</button>
    </form>`;
}

function saveBreak(data) {
  if (!data.from || !data.to || data.to < data.from) return toast('Проверь даты: конец не раньше начала');
  update((d) => {
    d.settings.breaks.push({ id: `b-${D.uid()}`, name: data.name.trim(), from: data.from, to: data.to });
    d.settings.updatedAt = now();
  });
  renderSheet();
  toast('Добавлено');
}

// ----- Дело: добавить и изменить -----

const ITEM_FIELDS = ['kind', 'subjectId', 'date', 'time', 'endTime'];

function newItemSheet({ date, kind, subjectId } = {}) {
  const base = {
    kind: kind || 'task',
    subjectId: subjectId || null,
    date: date === undefined ? (ui.tab === 'calendar' ? ui.cal.sel : ui.day) : date,
    time: null,
    endTime: null,
  };
  return {
    kind: 'item', id: null, text: '', title: '', literal: false, base, ikind: base.kind,
    subjectId: base.subjectId, date: base.date, time: null, endTime: null,
    manual: {}, found: [], remind: null, repeat: null, priority: 0, subtasks: [], notes: '', more: false,
  };
}

function openItem(id, occDate) {
  const it = doc().items.find((x) => x.id === id);
  if (!it) return;
  openSheet({
    kind: 'item', id, occDate: occDate || it.date, text: it.title, title: it.title, literal: true,
    base: {}, ikind: it.kind, subjectId: it.subjectId || null, date: it.date || null, time: it.time || null, endTime: it.endTime || null,
    manual: Object.fromEntries(ITEM_FIELDS.map((f) => [f, true])), found: [],
    remind: it.remind ?? null, repeat: it.repeat?.freq || null, priority: it.priority || 0,
    subtasks: (it.subtasks || []).map((x) => ({ ...x })), notes: it.notes || '',
    more: !!(it.notes || it.subtasks?.length || it.repeat || it.priority),
  });
}

/** Применяем разбор быстрого ввода к полям, которые она не трогала руками. */
function applyParse() {
  const s = ui.sheet;
  if (s.id) { s.title = s.text; return; }
  const p = parseQuick(s.text, { today: D.dayKey(), subjects: D.subjects(doc()), doc: doc() });
  s.found = [];
  const map = { kind: p.kind, subjectId: p.subjectId, date: p.date, time: p.time, endTime: p.endTime };
  for (const f of ITEM_FIELDS) {
    if (s.manual[f]) continue;
    const v = map[f];
    if (v !== undefined) s.found.push(f);
    s[f === 'kind' ? 'ikind' : f] = v !== undefined ? v : s.base[f];
  }
  // «к следующей паре» без явной даты — ставим дату по выбранному предмету.
  if (p.nextLesson && !s.manual.date && !p.date && s.subjectId) {
    const k = D.nextLessonDate(doc(), s.subjectId);
    if (k) { s.date = k; s.found.push('date'); }
  }
  s.title = s.literal ? s.text.trim() : p.title || s.text.trim();
}

function remindHint(s) {
  if (s.remind == null || s.remind === '' || !s.date) return '';
  const at = D.itemRemindAt({ remind: s.remind, time: s.time }, s.date);
  if (at == null) return '';
  const d = new Date(at);
  const when = `${D.shortDate(D.dayKey(d))} в ${d.toTimeString().slice(0, 5)}`;
  const off = !doc().settings.notify.on ? ' · включи уведомления в настройках' : '';
  return `🔔 Напомню ${when}${off}`;
}

function foundChipsHtml(s) {
  if (s.id || !s.found.length) return s.id ? '' : '<p class="hint-line">Пиши как удобно: «реферат по истории до пятницы», «кино завтра в 19»</p>';
  const labels = {
    kind: () => `${D.ITEM_KINDS[s.ikind].emoji} ${D.ITEM_KINDS[s.ikind].label}`,
    subjectId: () => { const x = D.findSubject(doc(), s.subjectId); return x ? `${x.emoji} ${x.name}` : ''; },
    date: () => (s.date ? `📅 ${D.shortDate(s.date)}` : ''),
    time: () => (s.time ? `🕑 ${s.time}${s.endTime ? `–${s.endTime}` : ''}` : ''),
  };
  const chips = s.found.filter((f) => labels[f]).map((f) => [f, labels[f]()]).filter(([, t]) => t);
  return `<div class="found"><span>Понял:</span>${chips.map(([f, t]) =>
    `<button type="button" class="found-chip" data-act="found-x" data-f="${f}" aria-label="Убрать">${esc(t)} ✕</button>`).join('')}</div>`;
}

function itemFieldsHtml() {
  const s = ui.sheet;
  const d = doc();
  const today = D.dayKey();
  const subs = D.subjects(d);
  const next = s.subjectId ? D.nextLessonDate(d, s.subjectId) : null;
  const dateChips = [
    [today, 'Сегодня'],
    [D.addDays(today, 1), 'Завтра'],
    ...(next ? [[next, `К паре · ${D.shortDate(next)}`]] : []),
    ['', 'Без даты'],
  ];
  const custom = s.date && !dateChips.some(([k]) => k === s.date);
  return `
    ${foundChipsHtml(s)}
    <div class="field"><label>Что это</label>
      ${seg('it-kind', s.ikind, Object.entries(D.ITEM_KINDS).map(([k, v]) => [k, `<span class="e">${v.emoji}</span>${v.label}`]), 'tall')}</div>
    ${subs.length ? `<div class="field"><label>Предмет</label><div class="subj-pick">
      <button type="button" class="subj-chip none" data-act="it-subj" data-id="" aria-pressed="${!s.subjectId}" style="--c:#90A4AE">Без предмета</button>
      ${subs.map((x) => `<button type="button" class="subj-chip" style="--c:${esc(x.color)}" data-act="it-subj" data-id="${x.id}" aria-pressed="${x.id === s.subjectId}">${esc(x.emoji)} ${esc(x.name)}</button>`).join('')}
    </div></div>` : ''}
    <div class="field"><label>Когда${s.ikind === 'homework' || s.ikind === 'exam' ? ' (срок)' : ''}</label>
      <div class="chips">${dateChips.map(([k, l]) => `<button type="button" class="chip" data-act="it-date" data-v="${k}" aria-pressed="${(s.date || '') === k}">${esc(l)}</button>`).join('')}
        <label class="chip date-chip" aria-pressed="${custom}">📅 ${custom ? esc(D.shortDate(s.date)) : 'Дата'}<input type="date" id="it-date" value="${s.date || ''}"></label></div></div>
    ${s.date ? `<div class="field"><label>Время</label><div class="time-pair">
      <input class="input" type="time" id="it-time" value="${s.time || ''}"><span>—</span>
      <input class="input" type="time" id="it-end" value="${s.endTime || ''}" placeholder="конец"></div></div>
    <div class="field"><label>Напомнить</label><div class="chips">${D.REMIND_OPTIONS.map(([v, l]) =>
      `<button type="button" class="chip" data-act="it-remind" data-v="${v}" aria-pressed="${(s.remind == null ? '' : String(s.remind)) === v}">${l}</button>`).join('')}</div>
      <p class="hint-line" id="it-remind-hint">${esc(remindHint(s))}</p></div>` : ''}
    ${s.more ? `
      ${s.date ? `<div class="field"><label>Повторять</label>${seg('it-repeat', s.repeat || '', [['', 'Нет'], ['day', 'Каждый день'], ['week', 'Неделя'], ['month', 'Месяц']])}</div>` : ''}
      <div class="field"><label>Важность</label>${seg('it-prio', String(s.priority), [['0', 'Обычно'], ['1', '! Важно'], ['2', '!! Срочно']])}</div>
      <div class="field"><label>Подзадачи</label><div class="subtasks">
        ${s.subtasks.map((x, i) => `<div class="subtask"><button type="button" class="check small" data-act="sub-toggle" data-i="${i}" aria-pressed="${!!x.done}"></button>
          <input class="input" data-sub="${i}" value="${esc(x.text)}" maxlength="120"><button type="button" class="icon-btn" data-act="sub-del" data-i="${i}" aria-label="Удалить">✕</button></div>`).join('')}
        <button type="button" class="add-row" data-act="sub-add">+ Подзадача</button></div></div>
      <div class="field"><label for="it-notes">Заметка</label>
        <textarea class="input area" id="it-notes" rows="3" maxlength="2000" placeholder="Ссылки, номера задач, что сказал препод…">${esc(s.notes)}</textarea></div>`
    : '<button type="button" class="more-btn" data-act="it-more">Ещё: повтор, важность, подзадачи, заметка ▾</button>'}`;
}

function itemSheetHtml() {
  const s = ui.sheet;
  return `${sheetHead(s.id ? D.ITEM_KINDS[s.ikind].label : 'Новая запись')}
    <form id="item-form">
      <textarea class="input quick" id="it-text" rows="1" maxlength="300" placeholder="Что нужно сделать?" ${s.id ? '' : 'autofocus'}>${esc(s.text)}</textarea>
      <div id="it-fields">${itemFieldsHtml()}</div>
      <button class="btn" type="submit">${s.id ? 'Сохранить' : 'Добавить'}</button>
      ${s.id ? `<div class="btn-row" style="margin-top:10px">
        <button class="btn ghost" type="button" data-act="it-dup">Копия</button>
        <button class="btn danger" type="button" data-act="it-delete">Удалить</button></div>` : ''}
    </form>`;
}

/** Забираем то, что набрано в полях, в состояние шторки. */
function syncItemForm() {
  const s = ui.sheet;
  if (s?.kind !== 'item') return;
  const v = (id) => sheetRoot.querySelector(id);
  if (v('#it-time')) s.time = v('#it-time').value || null;
  if (v('#it-end')) s.endTime = v('#it-end').value || null;
  if (v('#it-notes')) s.notes = v('#it-notes').value;
  sheetRoot.querySelectorAll('[data-sub]').forEach((el) => { s.subtasks[Number(el.dataset.sub)].text = el.value; });
}

function refreshItemFields(sync = true) {
  if (sync) syncItemForm();
  const box = sheetRoot.querySelector('#it-fields');
  if (box) box.innerHTML = itemFieldsHtml();
}

function setItemField(f, value) {
  syncItemForm();
  const s = ui.sheet;
  s.manual[f] = true;
  s.found = s.found.filter((x) => x !== f);
  s[f === 'kind' ? 'ikind' : f] = value;
  refreshItemFields();
}

function saveItem() {
  syncItemForm();
  const s = ui.sheet;
  if (!s.id) applyParse();
  const title = s.title.trim();
  if (!title) return toast('Напиши, что нужно сделать');
  if (s.time && s.endTime && D.toMin(s.endTime) <= D.toMin(s.time)) s.endTime = null;
  const fields = {
    title, kind: s.ikind, subjectId: s.subjectId || null, date: s.date || null,
    time: s.date ? s.time || null : null, endTime: s.date && s.time ? s.endTime || null : null,
    remind: s.date && s.remind !== '' && s.remind != null ? Number(s.remind) : null,
    priority: Number(s.priority) || 0,
    subtasks: s.subtasks.filter((x) => x.text.trim()).map((x) => ({ ...x, text: x.text.trim() })),
    notes: s.notes.trim(), updatedAt: now(),
  };
  const id = s.id || `i-${D.uid()}`;
  update((d) => {
    const cur = d.items.find((x) => x.id === id);
    const repeat = s.date && s.repeat ? { freq: s.repeat, until: cur?.repeat?.until || null } : null;
    if (cur) Object.assign(cur, fields, { repeat });
    else d.items.push({ id, ...fields, repeat, done: false, doneAt: null, doneDates: [], createdAt: now() });
  });
  closeSheet();
  render();
  const where = fields.date ? D.dayTitle(fields.date).toLowerCase() : 'во входящие';
  toast(s.id ? 'Сохранено' : `Добавлено${fields.date ? ` на ${where}` : ` ${where}`} ✨`);
}

// ----- Отметить сделанным, перенести -----

function toggleItem(id, key) {
  const it = doc().items.find((x) => x.id === id);
  if (!it) return;
  const occ = key || it.date;
  const wasDone = D.isDone(it, occ);
  update((d) => {
    const x = d.items.find((y) => y.id === id);
    if (x.repeat) {
      const set = new Set(x.doneDates || []);
      if (wasDone) set.delete(occ); else set.add(occ);
      x.doneDates = [...set];
    } else {
      x.done = !wasDone;
      x.doneAt = wasDone ? null : now();
    }
    x.updatedAt = now();
  });
  if (!wasDone) {
    buzz();
    const left = D.itemsOn(doc(), D.dayKey()).filter((i) => !D.isDone(i, D.dayKey())).length;
    toast(occ === D.dayKey() && left === 0 ? 'Всё на сегодня сделано! 🎉' : pick(['Готово ✨', 'Умничка! 💖', 'Минус одно дело 🐷', 'Супер! ⭐']), 'Отменить', () => toggleItem(id, key));
  }
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function postponeItem(id) {
  const it = doc().items.find((x) => x.id === id);
  if (!it) return;
  if (it.repeat) return toast('Повторяющееся дело просто отметь, когда сделаешь');
  const today = D.dayKey();
  const prev = it.date;
  const to = D.addDays(prev && prev > today ? prev : today, 1);
  update((d) => Object.assign(d.items.find((x) => x.id === id), { date: to, updatedAt: now() }));
  toast(`Перенесено на ${D.dayTitle(to).toLowerCase()}`, 'Отменить', () =>
    update((d) => Object.assign(d.items.find((x) => x.id === id), { date: prev, updatedAt: now() })));
}

const SHEETS = { subject: subjectSheetHtml, lesson: lessonSheetHtml, lday: ldaySheetHtml, breaks: breaksSheetHtml, item: itemSheetHtml };

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
  'sheet-close': () => closeSheet(),

  // Сегодня
  day: (el) => { ui.day = el.dataset.v === 'today' ? D.dayKey() : el.dataset.v; render(); },
  'week-shift': (el) => { ui.day = D.addDays(ui.day, Number(el.dataset.d)); render(); },
  'go-study': () => { ui.tab = 'study'; ui.study = 'schedule'; render(); },
  'lesson-day': (el) => openSheet({ kind: 'lday', lessonId: el.dataset.id, date: el.dataset.date, mode: null }),
  'lday-mode': (el) => { ui.sheet.mode = el.dataset.v || null; renderSheet(); },
  'lday-cancel': () => { setOverride({ cancelled: true }); toast('Пара отменена на этот день'); },
  'lday-reset': () => { setOverride({ deleted: true }); toast('Вернули как по расписанию'); },

  // Дела
  'item-new': (el) => openSheet(newItemSheet({
    date: el.dataset.date !== undefined ? el.dataset.date : undefined,
    kind: el.dataset.kind,
  })),
  'item-open': (el) => openItem(el.dataset.id, el.dataset.date || null),
  'item-toggle': (el) => toggleItem(el.dataset.id, el.dataset.date || null),
  'inbox-toggle': () => { ui.inboxOpen = !ui.inboxOpen; render(); },
  'found-x': (el) => {
    const s = ui.sheet;
    const f = el.dataset.f;
    syncItemForm();
    s.manual[f] = true;
    s[f === 'kind' ? 'ikind' : f] = s.base[f];
    if (f === 'time') { s.manual.endTime = true; s.endTime = null; }
    // Если дату или время поняли не так — оставляем текст как написан.
    if (f === 'date' || f === 'time') { s.literal = true; s.title = s.text.trim(); }
    s.found = s.found.filter((x) => x !== f && !(f === 'time' && x === 'endTime'));
    refreshItemFields();
  },
  'it-kind': (el) => setItemField('kind', el.dataset.v),
  'it-subj': (el) => setItemField('subjectId', el.dataset.id || null),
  'it-date': (el) => setItemField('date', el.dataset.v || null),
  'it-remind': (el) => { syncItemForm(); ui.sheet.remind = el.dataset.v === '' ? null : Number(el.dataset.v); refreshItemFields(); },
  'it-repeat': (el) => { ui.sheet.repeat = el.dataset.v || null; pressOnly(el); },
  'it-prio': (el) => { ui.sheet.priority = Number(el.dataset.v); pressOnly(el); },
  'it-more': () => { syncItemForm(); ui.sheet.more = true; refreshItemFields(); },
  'sub-add': () => {
    syncItemForm();
    ui.sheet.subtasks.push({ id: D.uid(), text: '', done: false });
    refreshItemFields();
    const inputs = sheetRoot.querySelectorAll('[data-sub]');
    inputs[inputs.length - 1]?.focus();
  },
  'sub-del': (el) => { syncItemForm(); ui.sheet.subtasks.splice(Number(el.dataset.i), 1); refreshItemFields(); },
  'sub-toggle': (el) => {
    const x = ui.sheet.subtasks[Number(el.dataset.i)];
    x.done = !x.done;
    el.setAttribute('aria-pressed', x.done);
    buzz();
  },
  'it-delete': () => {
    const id = ui.sheet.id;
    update((d) => Object.assign(d.items.find((x) => x.id === id), { deleted: true, updatedAt: now() }));
    closeSheet();
    render();
    toast('Удалено', 'Вернуть', () => update((d) => Object.assign(d.items.find((x) => x.id === id), { deleted: false, updatedAt: now() })));
  },
  'it-dup': () => {
    syncItemForm();
    const s = ui.sheet;
    openSheet({ ...s, id: null, base: { kind: s.ikind, subjectId: s.subjectId, date: s.date, time: s.time, endTime: s.endTime }, subtasks: s.subtasks.map((x) => ({ ...x, id: D.uid(), done: false })) });
    toast('Это копия — поменяй, что нужно');
  },

  // Календарь
  'cal-view': (el) => { ui.cal.view = el.dataset.v; render(); },
  'cal-day': (el) => {
    ui.cal.sel = el.dataset.v;
    if (el.dataset.v.slice(0, 7) !== ui.cal.month) ui.cal.month = el.dataset.v.slice(0, 7);
    render();
  },
  'month-shift': (el) => shiftMonth(Number(el.dataset.d)),

  // Учёба
  'study-view': (el) => { ui.study = el.dataset.v; render(); },
  'subject-new': () => openSheet(newSubjectSheet()),
  'subject-edit': (el) => {
    const s = D.findSubject(doc(), el.dataset.id);
    openSheet({ kind: 'subject', id: s.id, name: s.name, emoji: s.emoji, color: s.color, teacher: s.teacher || '' });
  },
  'subject-back': () => openSheet(ui.sheet.back),
  'subj-emoji': (el) => { ui.sheet.emoji = el.dataset.v; pressOnly(el); refreshSubjPreview(); },
  'subj-color': (el) => { ui.sheet.color = el.dataset.v; pressOnly(el); refreshSubjPreview(); },
  'subject-delete': () => {
    const id = ui.sheet.id;
    const n = D.live(doc().lessons).filter((l) => l.subjectId === id).length;
    if (!confirm(n ? `Удалить предмет и ${n} ${D.plural(n, 'пару', 'пары', 'пар')} из расписания?` : 'Удалить предмет?')) return;
    update((d) => {
      Object.assign(d.subjects.find((x) => x.id === id), { deleted: true, updatedAt: now() });
      for (const l of d.lessons) if (l.subjectId === id && !l.deleted) Object.assign(l, { deleted: true, updatedAt: now() });
    });
    closeSheet();
    render();
    toast('Предмет удалён');
  },
  'lesson-new': (el) => {
    const weekday = Number(el.dataset.wd || D.weekday(D.dayKey()));
    const subj = D.subjects(doc());
    openSheet({ kind: 'lesson', id: null, subjectId: subj.length === 1 ? subj[0].id : null, weekday, ...guessSlot(weekday), lkind: 'lecture', weeks: 'all', room: '' });
  },
  'lesson-edit': (el) => {
    const l = doc().lessons.find((x) => x.id === el.dataset.id);
    openSheet({ kind: 'lesson', id: l.id, subjectId: l.subjectId, weekday: l.weekday, start: l.start, end: l.end, lkind: l.kind || 'other', weeks: l.weeks || 'all', room: l.room || '' });
  },
  'lesson-subj': (el) => { ui.sheet.subjectId = el.dataset.id; pressOnly(el); },
  'lesson-subj-new': () => { lessonFromForm(); openSheet(newSubjectSheet({ back: { ...ui.sheet } })); },
  'lesson-wd': (el) => { lessonFromForm(); ui.sheet.weekday = Number(el.dataset.v); pressOnly(el); },
  'lesson-kind': (el) => { ui.sheet.lkind = el.dataset.v; pressOnly(el); },
  'lesson-weeks': (el) => { ui.sheet.weeks = el.dataset.v; pressOnly(el); },
  'lesson-slot': (el) => {
    const [start, end] = el.dataset.v.split('–');
    sheetRoot.querySelector('#lesson-start').value = start;
    sheetRoot.querySelector('#lesson-end').value = end;
    pressOnly(el);
  },
  'lesson-delete': () => {
    const id = ui.sheet.id;
    update((d) => Object.assign(d.lessons.find((x) => x.id === id), { deleted: true, updatedAt: now() }));
    closeSheet();
    render();
    toast('Пара удалена', 'Вернуть', () => update((d) => Object.assign(d.lessons.find((x) => x.id === id), { deleted: false, updatedAt: now() })));
  },

  // Настройки
  'week-mode': () => {
    update((d) => {
      const w = d.settings.week;
      w.mode = w.mode === 'alternating' ? 'single' : 'alternating';
      if (!w.anchor) w.anchor = D.weekStart(D.dayKey());
      d.settings.updatedAt = now();
    });
  },
  'week-parity': (el) => {
    // Нечётной считается неделя с anchor: двигаем его так, чтобы текущая неделя стала выбранной.
    const monday = D.weekStart(D.dayKey());
    update((d) => {
      d.settings.week.anchor = el.dataset.v === 'odd' ? monday : D.addDays(monday, -7);
      d.settings.updatedAt = now();
    });
  },
  'notify-toggle': async () => {
    if (ui.pushBusy) return;
    const n = doc().settings.notify;
    const turnOn = !(n.on && ui.pushDevice);
    ui.pushBusy = true;
    // enablePush() сразу спрашивает разрешение — пока длится нажатие (так требует iPhone).
    const job = turnOn ? enablePush() : disablePush();
    render();
    try {
      await job;
      ui.pushDevice = turnOn;
      setNotify({ on: turnOn });
      toast(turnOn ? 'Уведомления включены 🔔' : 'Уведомления выключены');
    } catch (e) {
      toast(e.message || 'Не получилось');
    } finally {
      ui.pushBusy = false;
      render();
    }
  },
  'notify-before': (el) => setNotify({ classBefore: Number(el.dataset.v) }),
  'notify-clear': (el) => setNotify({ [el.dataset.v]: '' }),
  'notify-test': async () => {
    try {
      await testPush();
      toast('Отправлено! Должно прийти через пару секунд');
    } catch (e) {
      toast(e.message);
    }
  },
  breaks: () => openSheet({ kind: 'breaks' }),
  'break-delete': (el) => {
    update((d) => {
      d.settings.breaks = d.settings.breaks.filter((b) => b.id !== el.dataset.id);
      d.settings.updatedAt = now();
    });
    renderSheet();
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
  if (e.target.closest('[data-swiped]')) return;
  const el = e.target.closest('[data-act]');
  if (!el || el.dataset.act === 'sheet-bg') return;
  actions[el.dataset.act]?.(el, e);
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  if (form.id === 'auth-form') return submitAuth(form);
  if (form.id === 'subject-form') return saveSubject(data);
  if (form.id === 'lesson-form') return saveLesson();
  if (form.id === 'lday-form') return saveLday(data);
  if (form.id === 'break-form') return saveBreak(data);
  if (form.id === 'item-form') return saveItem();
});

function shiftMonth(n) {
  const [y, m] = ui.cal.month.split('-').map(Number);
  const key = D.addMonths(`${y}-${String(m).padStart(2, '0')}-01`, n);
  ui.cal.month = key.slice(0, 7);
  const today = D.dayKey();
  ui.cal.sel = today.slice(0, 7) === ui.cal.month ? today : key;
  render();
}

const growArea = (t) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; };

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.name === 'username' && t.form?.id === 'auth-form') ui.auth.username = t.value;
  else if (t.id === 'subj-name') { ui.sheet.name = t.value; refreshSubjPreview(); }
  else if (t.id === 'subj-teacher') ui.sheet.teacher = t.value;
  else if (t.id === 'it-text') {
    growArea(t);
    syncItemForm();
    ui.sheet.text = t.value;
    applyParse();
    refreshItemFields(false);
  } else if (t.id === 'it-date') {
    if (t.value) setItemField('date', t.value);
  } else if (t.id === 'it-time' || t.id === 'it-end') {
    syncItemForm();
    ui.sheet.manual[t.id === 'it-time' ? 'time' : 'endTime'] = true;
    const hint = sheetRoot.querySelector('#it-remind-hint');
    if (hint) hint.textContent = remindHint(ui.sheet);
  } else if (t.id === 'it-notes') growArea(t);
});

/** В группе кнопок нажата только эта. */
function pressOnly(el) {
  el.parentElement.querySelectorAll('[aria-pressed]').forEach((b) => b.setAttribute('aria-pressed', b === el));
}

function refreshSubjPreview() {
  const p = sheetRoot.querySelector('#subj-preview');
  if (!p) return;
  p.style.setProperty('--c', ui.sheet.color);
  p.textContent = `${ui.sheet.emoji} ${ui.sheet.name || 'Название'}`;
}

// Свайпы на «Сегодня»: по полоске — неделя, по ленте — день.
// По делу: влево — готово, вправо — на завтра. В календаре по сетке — месяцы.
let touch = null;
document.addEventListener('touchstart', (e) => {
  touch = null;
  if (ui.sheet || e.touches.length !== 1) return;
  const wrap = e.target.closest('[data-swipe-item]');
  const zone = wrap ? 'item' : e.target.closest('[data-swipe="week"]') ? 'week'
    : e.target.closest('[data-swipe="month"]') ? 'month' : ui.tab === 'today' ? 'day' : null;
  if (!zone) return;
  touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, zone, wrap, row: wrap?.querySelector('.item'), locked: null };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!touch || touch.zone !== 'item') return;
  const dx = e.touches[0].clientX - touch.x;
  const dy = e.touches[0].clientY - touch.y;
  if (touch.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) touch.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  if (touch.locked !== 'x') return;
  touch.row.style.transition = 'none';
  touch.row.style.transform = `translateX(${Math.max(-120, Math.min(120, dx))}px)`;
  touch.wrap.dataset.dir = dx < 0 ? 'left' : 'right';
  touch.wrap.classList.toggle('armed', Math.abs(dx) > 70);
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!touch) return;
  const t = touch;
  touch = null;
  const dx = e.changedTouches[0].clientX - t.x;
  const dy = e.changedTouches[0].clientY - t.y;
  if (t.zone === 'item') {
    t.row.style.transition = '';
    t.row.style.transform = '';
    t.wrap.classList.remove('armed');
    if (t.locked !== 'x' || Math.abs(dx) < 70) return;
    // Клик после свайпа не должен открывать дело.
    t.wrap.dataset.swiped = '1';
    setTimeout(() => delete t.wrap.dataset.swiped, 350);
    if (dx < 0) toggleItem(t.wrap.dataset.id, t.wrap.dataset.date || null);
    else postponeItem(t.wrap.dataset.id);
    return;
  }
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
  const dir = dx < 0 ? 1 : -1;
  buzz();
  if (t.zone === 'month') return shiftMonth(dir);
  ui.day = D.addDays(ui.day, t.zone === 'week' ? dir * 7 : dir);
  render();
}, { passive: true });

document.addEventListener('change', (e) => {
  if (e.target.id === 'import-file' && e.target.files[0]) importData(e.target.files[0]);
  else if (e.target.dataset.notify) setNotify({ [e.target.dataset.notify]: e.target.value || '' });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet) return closeSheet();
  // Enter в поле быстрого ввода — сохранить, а не перенос строки.
  if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'it-text') {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
  // На компьютере: «n» — новая запись.
  if (e.key === 'n' && !ui.sheet && state.auth && !e.target.matches('input, textarea') && !e.ctrlKey && !e.metaKey) {
    openSheet(newItemSheet());
  }
});

onChange((what) => {
  if (what === 'status') return refreshSyncDot();
  if (what === 'auth' && !state.auth) closeSheet();
  // Пока открыта шторка, не перерисовываем экран под ней, чтобы не сбить ввод.
  if (what === 'doc' && ui.sheet) return;
  render();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// Раз в минуту обновляем «идёт / через 20 мин»; в полночь переходим на новый день.
let lastDay = D.dayKey();
let lastMin = D.nowMin();
setInterval(() => {
  if (!state.auth || ui.sheet || document.activeElement?.matches('input, textarea')) return;
  const day = D.dayKey();
  if (day !== lastDay) {
    if (ui.day === lastDay) ui.day = day;
    lastDay = day;
    render();
  } else if (ui.tab === 'today' && D.nowMin() !== lastMin) {
    lastMin = D.nowMin();
    render();
  }
}, 15_000);

// ---------- Старт ----------

if (state.auth) loadLocal();
render();
if (state.auth) pull();
startAutoSync();

if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('/sw.js');
}
