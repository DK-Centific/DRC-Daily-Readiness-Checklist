import { createClient } from './api.js';
import {
  accessFromForm,
  accessPayload,
  blankAccess,
  blankKit,
  editorAfterSettingsRefresh,
  kitFromForm,
  kitPayload,
  validateAccess,
  validateKit,
} from './editor-state.js';
import { isAdminRole, isTaskVisible, roleLabel } from './flow-shape.js';
import {
  activityForDay,
  activityFromRows,
  monthRange,
  outcomeForKit,
  renderActivityCalendar,
  renderDateChip,
  renderDaySummary,
  renderFilterBanner,
  renderPlainMonth,
  renderWeekStrip,
  weekDates,
} from './calendar-view.js';
import { groupTasks, taskHint } from './task-groups.js';
import { historyEvents } from './history-events.js';
import { applyTheme, saveThemeChoice, watchSystemTheme } from './theme.js';
import { mergeRuntimeConfig, parseLegacyConfigJs, parseLocalConfig } from './config-load.js';
import { acceptedLoginUser, planSessionRestore } from './session-restore.js';
import { toastKindClass } from './toast-kind.js';
import {
  TASK_SAVE_WAIT_MS,
  TASKS_CACHE_KEY,
  createDebouncedFlush,
  defaultHistoryRange,
  readTaskCache,
  writeTaskCache,
} from './requests.js';
import {
  addDays,
  calendarCells,
  formatClaimMessage,
  formatChipDate,
  formatHistoryDay,
  formatLongDate,
  formatMonthDay,
  formatMonthShort,
  formatMonthYear,
  formatPtTime,
  formatShortDay,
  formatPtDateTime,
  formatYmdLabel,
  pacificDate,
  shiftMonth,
  splitYmd,
} from './time.js';

const SESSION_KEY = 'drc.session.v1';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const state = {
  ready: false,
  config: { backend: 'mock', FLOW_URL: '' },
  api: null,
  user: null,
  tab: 'checklist',
  date: '',
  viewYear: 2026,
  viewMonth: 1,
  kits: [],
  kitsError: '',
  kitsCode: '',
  tasks: [],
  tasksLoaded: false,
  tasksError: '',
  tasksCode: '',
  selectedKitId: null,
  message: '',
  error: '',
  errorCode: '',
  notice: '',
  loginEmail: '',
  history: [],
  historyError: '',
  historyCode: '',
  filters: { userEmail: '', kitId: '', from: '', to: '', mineOnly: false },
  people: new Map(),
  historyHint: '',
  access: [],
  allKits: [],
  settingsError: '',
  settingsCode: '',
  settingsNotice: '',
  formErrors: {},
  editor: null,
  modal: null,
  signingIn: false,
  pendingCheckIn: false,
  pendingCheckOut: false,
  pendingSave: '',
  pendingToggle: '',
  kitHold: 0,
  loading: { checklist: false, history: false, settings: false, tasks: false },
  kitsLoaded: false,
  kitsByDate: new Map(),
  historyCache: new Map(),
  historyReady: false,
  kitChoices: new Map(),
  dateOpen: false,
  settingsPane: 'people',
  taskUi: new Map(),
  groupManual: {},
  toast: null,
  conflictKitId: null,
  historyQuery: '',
  monthActivity: {},
  monthRows: {},
  loadedMonths: new Set(),
  adminMonthOpen: false,
};

let kitsSerial = 0;
let historySerial = 0;
let settingsSerial = 0;
let taskSeq = 0;
let taskFetchSerial = 0;
let confirmedTaskIds = null;
let busyCount = 0;
let slowTimer = null;
let toastTimer = null;

const app = document.getElementById('app');
const taskFlush = createDebouncedFlush(TASK_SAVE_WAIT_MS, () => { flushTasks(); });

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function lockIcon() {
  return '<svg class="lock-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z"/></svg>';
}

function isAdmin() {
  return isAdminRole(state.user?.role);
}

function banner(kind, message, code) {
  if (!message) return '';
  const conflict = code === 'KIT_CLAIMED';
  const cls = conflict ? 'banner-conflict' : (kind === 'err' ? 'banner-error' : 'banner-ok');
  const refresh = conflict
    ? '<button type="button" class="btn btn-ghost btn-sm" data-action="refresh-kits">Refresh</button>'
    : '';
  return `<div class="banner ${cls}" role="${kind === 'err' ? 'alert' : 'status'}">${esc(message)}${code && !conflict ? `<span class="code">${esc(code)}</span>` : ''}${refresh}</div>`;
}

function noteBusy(starting) {
  if (starting) {
    busyCount += 1;
    if (busyCount === 1) {
      clearTimeout(slowTimer);
      slowTimer = setTimeout(() => {
        if (busyCount > 0) {
          state.toast = { kind: 'slow', text: 'Still working… the server is slow' };
          render();
        }
      }, 3000);
    }
    return;
  }
  busyCount = Math.max(0, busyCount - 1);
  if (busyCount === 0) {
    clearTimeout(slowTimer);
    if (state.toast?.kind === 'slow') {
      state.toast = null;
      render();
    }
  }
}

function showToast(kind, text) {
  state.toast = { kind: toastKindClass(kind), text };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (state.toast?.text === text) {
      state.toast = null;
      render();
    }
  }, 2800);
  render();
}

async function apiCall(action, params = {}, options = {}) {
  noteBusy(true);
  let result;
  try {
    result = await state.api.call({
      action,
      actor: state.user?.email || '',
      ...params,
    }, options);
  } finally {
    noteBusy(false);
  }
  if (result?.code === 'ABORTED') {
    const error = new Error('Cancelled.');
    error.code = 'ABORTED';
    throw error;
  }
  if (!result || result.ok !== true) {
    const error = new Error((result && result.error) || 'Something went wrong.');
    error.code = result && result.code;
    throw error;
  }
  return result.data;
}

function isAbort(error) {
  return error?.code === 'ABORTED';
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function rememberKit(id, name) {
  if (id == null || !name) return;
  state.kitChoices.set(Number(id), name);
}

function rememberPerson(email, name) {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return;
  const label = String(name || '').trim() || key;
  if (!state.people.has(key) || (name && state.people.get(key) === key)) {
    state.people.set(key, label);
  }
}

function defaultFilters(user = state.user) {
  const today = state.date || pacificDate();
  return {
    userEmail: '',
    kitId: '',
    from: today,
    to: today,
    mineOnly: !isAdminRole(user?.role),
    span: 'today',
  };
}

function rowEmails(row) {
  return [row?.userEmail, row?.checkedOutByEmail, row?.CheckedOutByEmail]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function personChoices() {
  const map = new Map(state.people);
  for (const person of state.access) {
    if (person?.email) map.set(String(person.email).trim().toLowerCase(), person.name || person.email);
  }
  if (state.user?.email) {
    map.set(String(state.user.email).trim().toLowerCase(), state.user.name || state.user.email);
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function selectedKit() {
  return state.kits.find((kit) => kit.id === state.selectedKitId) || null;
}

function myClaim(kit = selectedKit()) {
  if (!kit?.claim) return null;
  if (kit.claim.userEmail !== state.user?.email) return null;
  return kit.claim;
}

async function loadConfig() {
  const built = {
    backend: window.DRC_CONFIG?.backend,
    FLOW_URL: window.DRC_CONFIG?.FLOW_URL,
  };
  let fileConfig = null;
  let loadError = '';
  try {
    const response = await fetch('config.local.json', { cache: 'no-store' });
    if (response.ok) fileConfig = parseLocalConfig(await response.text());
  } catch {
    loadError = 'Could not read config.local.json.';
  }
  if (!fileConfig && !loadError) {
    try {
      const response = await fetch('config.local.js', { cache: 'no-store' });
      if (response.ok) fileConfig = parseLegacyConfigJs(await response.text());
    } catch {
      loadError = 'Could not read config.local.js.';
    }
  }
  const config = mergeRuntimeConfig({
    built,
    fileConfig,
    searchParams: new URLSearchParams(window.location.search),
  });
  if (loadError) config._loadError = loadError;
  return config;
}

function isRefreshing() {
  return (state.tab === 'checklist' && (state.loading.checklist || state.loading.tasks))
    || (state.tab === 'history' && state.loading.history)
    || (state.tab === 'settings' && state.loading.settings);
}

function refreshNote() {
  const on = isRefreshing();
  return `<p id="refresh-note" class="refreshing" role="status"${on ? '' : ' hidden'}>Refreshing…</p>`;
}

function syncModal() {
  const existing = document.getElementById('backdrop');
  if (state.modal && !existing) app.insertAdjacentHTML('beforeend', renderModal());
  else if (!state.modal && existing) existing.remove();
  if (state.modal) {
    const dialog = document.getElementById('dialog');
    if (dialog && !dialog.contains(document.activeElement)) {
      document.getElementById('modal-cancel')?.focus();
    }
  }
}

function captureEditorFromDom() {
  if (!state.editor) return;
  const kitForm = document.getElementById('kit-form');
  if (kitForm && state.editor.kind === 'kit') {
    state.editor = kitFromForm(state.editor, new FormData(kitForm));
  }
  const accessForm = document.getElementById('access-form');
  if (accessForm && state.editor.kind === 'access') {
    state.editor = accessFromForm(state.editor, new FormData(accessForm));
  }
}

function fieldError(id, message) {
  if (!message) return '';
  return `<p class="field-error" id="${id}-error">${esc(message)}</p>`;
}

function invalidAttr(id, message) {
  return message ? `aria-invalid="true" aria-describedby="${id}-error"` : '';
}

function savingButton(label, pending) {
  if (!pending) return label;
  return '<span class="saving-label"><span class="spinner" aria-hidden="true"></span>Saving…</span>';
}

function showFormProblem(formId) {
  const form = document.getElementById(formId);
  form?.scrollIntoView({ block: 'nearest' });
  form?.querySelector('[aria-invalid="true"]')?.focus();
}

function syncView() {
  const saving = Boolean(
    state.pendingSave || state.pendingCheckIn || state.pendingCheckOut || state.pendingToggle
    || [...state.taskUi.values()].includes('saving'),
  );
  const offline = [state.errorCode, state.tasksCode, state.kitsCode, state.historyCode, state.settingsCode].includes('NETWORK');
  if (offline) return { cls: 'error', label: 'Offline', icon: 'dot' };
  if (saving) return { cls: 'saving', label: 'Saving…', icon: 'spin' };
  return { cls: '', label: 'Synced', icon: 'dot' };
}

function syncHeader() {
  const pill = document.querySelector('#shell .sync-pill');
  if (!pill) return;
  const sync = syncView();
  pill.className = `sync-pill ${sync.cls}`.trim();
  const icon = sync.icon === 'spin'
    ? '<span class="spinner" aria-hidden="true"></span>'
    : '<span class="sync-dot" aria-hidden="true"></span>';
  pill.innerHTML = `${icon} ${esc(sync.label)}`;
}

function syncToast() {
  const existing = document.getElementById('toast');
  if (!state.toast) {
    existing?.remove();
    return;
  }
  const kind = toastKindClass(state.toast.kind);
  const html = `<div class="toast${kind ? ` ${kind}` : ''}" id="toast" role="status">${esc(state.toast.text)}</div>`;
  if (!existing) app.insertAdjacentHTML('beforeend', html);
  else existing.outerHTML = html;
}

function render() {
  captureEditorFromDom();
  document.body.classList.toggle('modal-open', Boolean(state.modal));
  const checkedIn = Boolean(state.user && state.tab === 'checklist' && myClaim() && !isPastDate());
  document.body.classList.toggle('has-phone-bar', checkedIn);
  document.body.classList.toggle('sheet-open', Boolean(state.dateOpen && isPhoneLayout() && state.user && !isAdmin()));
  if (!state.ready) {
    app.innerHTML = '<main class="login-wrap" id="main"><p>Loading checklist…</p></main>';
    return;
  }
  if (!state.user) {
    app.innerHTML = renderLogin();
    finishPaint();
    return;
  }
  const shell = document.getElementById('shell');
  const typingHistory = document.activeElement?.closest?.('#history-form');
  if (shell && typingHistory && state.tab === 'history' && document.getElementById('history-results')) {
    const note = document.getElementById('refresh-note');
    if (note) note.hidden = !isRefreshing();
    document.getElementById('history-results').innerHTML = historyResultsHtml();
    syncHeader();
    syncModal();
    syncToast();
    finishPaint();
    return;
  }
  if (!shell) {
    app.innerHTML = renderShell();
    syncModal();
    syncToast();
    finishPaint();
    return;
  }
  const panel = document.getElementById('panel');
  panel.innerHTML = `${refreshNote()}${state.tab === 'history' ? renderHistory() : state.tab === 'settings' ? renderSettings() : renderChecklist()}`;
  panel.setAttribute('aria-labelledby', `tab-${state.tab}`);
  document.querySelectorAll('#shell [data-action="tab"]').forEach((button) => {
    const on = button.dataset.tab === state.tab;
    button.setAttribute('aria-selected', String(on));
    button.classList.toggle('active', on);
    button.tabIndex = on ? 0 : -1;
  });
  syncHeader();
  syncModal();
  syncToast();
  finishPaint();
}

const THEME_ICONS = {
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 14.5A8.5 8.5 0 1110.5 3a7 7 0 0010.5 11.5z"/></svg>',
};

function themeToggle(extraClass = '') {
  const choice = document.documentElement.dataset.themeChoice || 'system';
  const item = (id, label) => {
    const on = choice === id;
    return `<button type="button" data-action="theme" data-theme="${id}" aria-label="${label}" title="${label}" aria-pressed="${on}">${THEME_ICONS[id]}</button>`;
  };
  const cls = extraClass ? `theme-toggle ${extraClass}` : 'theme-toggle';
  return `<div class="${cls}" role="group" aria-label="Theme">${item('light', 'Light')}${item('system', 'System')}${item('dark', 'Dark')}</div>`;
}

function paintThemeToggle() {
  const choice = document.documentElement.dataset.themeChoice || 'system';
  document.querySelectorAll('[data-action="theme"]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.theme === choice));
  });
}

function setAccountMenu(open) {
  const menu = document.getElementById('account-menu');
  const trigger = document.querySelector('.account-trigger');
  if (!menu) return;
  menu.hidden = !open;
  trigger?.setAttribute('aria-expanded', String(open));
}

function accountMenu() {
  const name = state.user?.name || '';
  const first = name.trim().split(/\s+/)[0] || name;
  return `
    <div class="account-menu-wrap">
      <button type="button" class="account-trigger" data-action="account-menu" aria-expanded="false" aria-haspopup="menu" aria-label="Account">
        <span class="account-avatar">${esc(initials(name, state.user?.email))}</span>
        <strong>${esc(first)}</strong>
      </button>
      <div class="account-menu" id="account-menu" hidden role="menu">
        <div class="account-menu-label">Theme</div>
        ${themeToggle()}
        <button type="button" class="account-menu-item" data-action="sign-out" role="menuitem">Sign out</button>
      </div>
    </div>`;
}

function paintProgressBar() {
  const bar = document.getElementById('task-bar');
  if (!bar) return;
  const width = Number(bar.dataset.width);
  bar.style.width = `${Number.isFinite(width) ? width : 0}%`;
}

function finishPaint() {
  paintThemeToggle();
  paintProgressBar();
  scheduleMonthMarks();
}

function renderLogin() {
  const practice = state.config?.backend !== 'pa' && state.api?.mode !== 'pa';
  const demos = practice ? `
    <div class="demo">
      <p class="hint">Practice sign-in (sample people already on the access list):</p>
      <button type="button" class="btn btn-secondary" data-action="demo" data-email="jane.doe@centific.com">Sign in as Jane Doe</button>
      <button type="button" class="btn btn-secondary" data-action="demo" data-email="brian.leong@centific.com">Sign in as Brian Leong (admin)</button>
      <button type="button" class="btn btn-secondary" data-action="demo" data-email="thaingan.tran@centific.com">Sign in as Annie Tran (admin)</button>
      <button type="button" class="btn btn-secondary" data-action="demo" data-email="admin-drc">Sign in as admin-drc</button>
      <button type="button" class="btn btn-ghost" data-action="reset-demo">Reset sample data</button>
    </div>` : '';
  return `
    <main class="login-wrap" id="main">
      <div class="login-theme">${themeToggle()}</div>
      <div class="login-stack">
      <img class="login-logo" src="assets/centific-logo.png" width="72" height="72" alt="Centific">
      <section class="login-card" aria-labelledby="login-title">
        <p class="eyebrow">Centific · Data Collection</p>
        <h1 class="title" id="login-title">Daily Readiness Checklist</h1>
        <p class="login-lead">Sign in with your Centific ID. Only people on the access list can continue.</p>
        ${banner('err', state.error, state.errorCode)}
        ${banner('ok', state.notice)}
        <form id="login-form" method="post" action="#">
          <div class="field">
            <label for="email">Centific ID</label>
            <input id="email" name="email" type="text" autocomplete="username" spellcheck="false" required placeholder="firstName.lastName@centific.com" value="${esc(state.loginEmail)}">
          </div>
          <button class="btn btn-primary btn-block" type="submit" ${state.signingIn ? 'disabled' : ''}>${state.signingIn ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p class="mode-note">There is no password in this version. Access is the email list an admin keeps.</p>
        ${demos}
        <p class="mode-note">${practice ? 'Practice mode: sample data stays in this browser.' : 'Connected mode: this page talks to the shared checklist service.'}</p>
      </section>
      </div>
    </main>`;
}

function renderShell() {
  const tabs = [
    ['checklist', 'Checklist'],
    ['history', 'History'],
  ];
  if (isAdmin()) tabs.push(['settings', 'Settings']);
  const sync = syncView();
  const icon = sync.icon === 'spin'
    ? '<span class="spinner" aria-hidden="true"></span>'
    : '<span class="sync-dot" aria-hidden="true"></span>';
  const tabButtons = tabs.map(([id, label]) => `
    <button type="button" class="tab ${state.tab === id ? 'active' : ''}" role="tab" id="tab-${id}" aria-selected="${state.tab === id}" aria-controls="panel" tabindex="${state.tab === id ? '0' : '-1'}" data-action="tab" data-tab="${id}">${label}</button>
  `).join('');
  const panel = state.tab === 'history'
    ? renderHistory()
    : state.tab === 'settings'
      ? renderSettings()
      : renderChecklist();
  return `
    <div id="shell">
      <header class="header">
        <div class="brand-lockup">
          <img class="logo-mark" src="assets/centific-logo.png" width="36" height="36" alt="Centific">
          <div>
            <p class="eyebrow">Centific · Data Collection</p>
            <h1 class="title">Daily Readiness Checklist</h1>
          </div>
        </div>
        <div class="header-right">
          <span class="sync-pill ${sync.cls}" role="status">${icon} ${esc(sync.label)}</span>
          <span class="user-chip user-chip-desktop">You · <strong>${esc(state.user.name)}</strong></span>
          ${themeToggle('theme-toggle-desktop')}
          <button type="button" class="btn btn-ghost sign-out-desktop" data-action="sign-out">Sign out</button>
          ${accountMenu()}
        </div>
      </header>
      ${isAdmin() ? '<p class="admin-strip">Admin View</p>' : ''}
      <nav class="tabs" role="tablist" aria-label="Sections">${tabButtons}</nav>
      <main class="shell-main" id="panel" role="tabpanel" aria-labelledby="tab-${state.tab}">
        ${refreshNote()}
        ${panel}
      </main>
    </div>`;
}

function isPastDate(ymd = state.date) {
  return Boolean(ymd) && ymd < pacificDate();
}

function isPhoneLayout() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 720px)')?.matches);
}

function monthModel() {
  const today = pacificDate();
  const cells = calendarCells(state.viewYear, state.viewMonth);
  const inMonth = cells.filter((ymd) => splitYmd(ymd).month === state.viewMonth);
  const selectedInView = state.date && splitYmd(state.date).month === state.viewMonth && cells.includes(state.date);
  const tabStop = selectedInView ? state.date : inMonth[0];
  const range = monthRange(state.viewYear, state.viewMonth);
  const loaded = Object.prototype.hasOwnProperty.call(state.monthActivity, range.key);
  return {
    today,
    monthLabel: formatMonthYear(state.viewYear, state.viewMonth),
    range,
    loaded,
    activity: state.monthActivity[range.key] || {},
    days: cells.map((ymd) => {
      const parts = splitYmd(ymd);
      return {
        ymd,
        dayNumber: parts.day,
        outside: parts.month !== state.viewMonth,
        future: ymd > today,
        label: formatLongDate(ymd),
        tabStop: ymd === tabStop,
      };
    }),
  };
}

function selectedDayActivity() {
  if (!state.date) return { loaded: false, day: activityForDay(null, '') };
  const parts = splitYmd(state.date);
  const key = monthRange(parts.year, parts.month).key;
  const loaded = Object.prototype.hasOwnProperty.call(state.monthActivity, key);
  return { loaded, day: activityForDay(state.monthActivity[key], state.date) };
}

function renderAdminCalendar() {
  const model = monthModel();
  const selected = selectedDayActivity();
  return `
    ${renderActivityCalendar({
      monthLabel: model.monthLabel,
      days: model.days,
      selected: state.date,
      today: model.today,
      activity: model.activity,
      loading: !model.loaded,
      weekdays: WEEKDAYS,
    })}
    ${renderDaySummary({
      label: formatShortDay(state.date || model.today),
      activity: selected.day,
      loaded: selected.loaded,
    })}`;
}

function renderAdminWeek() {
  const today = pacificDate();
  const anchor = state.date || today;
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const days = weekDates(anchor).map((ymd) => ({
    ymd,
    dayNumber: splitYmd(ymd).day,
    weekday: letters[new Date(Date.UTC(splitYmd(ymd).year, splitYmd(ymd).month - 1, splitYmd(ymd).day)).getUTCDay()],
  }));
  const strip = renderWeekStrip({
    days,
    selected: state.date,
    today,
    monthLabel: formatMonthShort(state.viewYear, state.viewMonth),
    expanded: state.adminMonthOpen,
  });
  return state.adminMonthOpen ? `${strip}${renderAdminCalendar()}` : strip;
}

function renderDateSection() {
  const today = pacificDate();
  const model = monthModel();
  const picker = state.dateOpen
    ? renderPlainMonth({
      monthLabel: model.monthLabel,
      days: model.days,
      selected: state.date,
      today,
      weekdays: WEEKDAYS,
      layout: isPhoneLayout() ? 'sheet' : 'popover',
    })
    : '';
  return `
    <div class="date-row">
      ${renderDateChip(formatChipDate(state.date || today, today))}
      <button type="button" class="btn btn-ghost" id="change-date" data-action="toggle-date" aria-expanded="${state.dateOpen}">Change date</button>
      ${picker}
    </div>`;
}

function renderPastBanner() {
  const selected = selectedDayActivity();
  return renderFilterBanner({
    label: formatShortDay(state.date),
    kitsLabel: state.kitsLoaded ? String(state.kits.length) : '…',
    claimedLabel: selected.loaded ? String(selected.day.claimed) : '…',
  });
}

function stepRail(step, dateLabel) {
  const items = [[1, dateLabel || 'Date'], [2, 'Kit'], [3, 'Checklist']];
  return `<div class="stepper" aria-label="Progress">${items.map(([number, label], index) => {
    const cls = number < step ? 'done' : number === step ? 'active' : '';
    const mark = number < step ? '✓' : String(number);
    const sep = index < items.length - 1 ? '<div class="step-sep"></div>' : '';
    return `<div class="step ${cls}"><span class="num">${mark}</span> ${label}</div>${sep}`;
  }).join('')}</div>`;
}

function renderChecklist() {
  const past = isPastDate();
  const mine = past ? null : state.kits.find((kit) => kit.claim && kit.claim.userEmail === state.user?.email);
  const step = mine ? 3 : 2;
  const showKits = past || !mine || isAdmin();
  const main = `
    ${past ? renderPastBanner() : ''}
    ${stepRail(step, past ? formatMonthDay(state.date) : '')}
    ${banner('err', state.error, state.errorCode)}
    ${banner('ok', state.message)}
    ${isAdmin() ? '' : `<p class="section-label">1 · Date</p>${renderDateSection()}`}
    ${mine ? renderSession(mine) : ''}
    ${showKits ? `
      <p class="section-label">2 · Kit${past ? ' (read-only)' : ''}</p>
      ${banner('err', state.kitsError, state.kitsCode)}
      ${state.kits.length ? renderKitTiles() : renderEmptyKits()}
      ${past ? '<p class="note-readonly">Past date — view only. Check-in is disabled.</p>' : ''}
      ${past || (mine && state.selectedKitId === mine.id) ? '' : renderCheckButton()}
    ` : ''}
    <p class="section-label">3 · Checklist</p>
    ${renderTasks()}
    ${mine ? renderPhoneBar(mine) : ''}`;
  if (!isAdmin()) return main;
  if (isPhoneLayout()) return `${renderAdminWeek()}${main}`;
  return `<div class="split-layout"><aside>${renderAdminCalendar()}</aside><div>${main}</div></div>`;
}

function renderEmptyKits() {
  if (state.kitsError) return '';
  if (!state.kitsLoaded) {
    return `<div class="kit-grid" aria-hidden="true">${[0, 1, 2, 3].map(() => `
      <div class="kit-tile skeleton"><div class="skel"></div><div class="skel wide"></div></div>
    `).join('')}</div>`;
  }
  if (isAdmin()) {
    return '<p>No kits set up yet.</p><p><button type="button" class="btn btn-primary" data-action="go-settings-kits">Add kits in Settings</button></p>';
  }
  return '<p>No kits set up yet, ask a DRC admin.</p>';
}

function kitTileMeta(kit) {
  if (kit.claim?.userEmail === state.user?.email) return 'Checked in by you';
  if (kit.claim) return `Checked in ${formatPtTime(kit.claim.checkInAt)}`;
  if (kit.lastCheckedOut?.checkOutAt) return `Last out ${formatPtTime(kit.lastCheckedOut.checkOutAt)}`;
  if (kit.notes) return kit.notes;
  return 'No check-in today';
}

function pastKitPresentation(kit) {
  const parts = splitYmd(state.date);
  const key = monthRange(parts.year, parts.month).key;
  const known = Object.prototype.hasOwnProperty.call(state.monthRows, key);
  if (!known) {
    if (kit.claim) {
      const who = kit.claim.userName || kit.claim.userEmail;
      return { badgeClass: 'badge-yours', badge: `Claimed · ${who}`, meta: `Checked in ${formatPtTime(kit.claim.checkInAt)}` };
    }
    if (kit.lastCheckedOut?.checkOutAt) {
      const who = kit.lastCheckedOut.userName || kit.lastCheckedOut.userEmail || 'Checked out';
      return { badgeClass: 'badge-sage', badge: 'Checked out', meta: `${who} · out ${formatPtTime(kit.lastCheckedOut.checkOutAt)}` };
    }
    return { badgeClass: 'badge-available', badge: 'No claim', meta: 'Idle that day' };
  }
  const rows = (state.monthRows[key] || []).filter((row) => row.claimDate === state.date);
  const outcome = outcomeForKit(rows, kit.id);
  if (!outcome) return { badgeClass: 'badge-available', badge: 'No claim', meta: 'Idle that day' };
  if (outcome.kind === 'open') {
    const who = outcome.userName || outcome.userEmail;
    return { badgeClass: 'badge-yours', badge: `Claimed · ${who}`, meta: `Checked in ${formatPtTime(outcome.checkInAt)}` };
  }
  const total = Number.isFinite(outcome.tasksTotal) ? outcome.tasksTotal : 0;
  const done = Number.isFinite(outcome.tasksCompleted) ? outcome.tasksCompleted : 0;
  const fraction = total > 0 ? ` · ${done}/${total}` : '';
  const who = outcome.userName || outcome.userEmail || 'Checked out';
  return {
    badgeClass: outcome.kind === 'incomplete' ? 'badge-amber' : 'badge-sage',
    badge: `Checked out${fraction}`,
    meta: `${who} · out ${formatPtTime(outcome.checkOutAt)}`,
  };
}

function renderKitTiles() {
  const past = isPastDate();
  const tiles = state.kits.map((kit) => {
    if (past) {
      const view = pastKitPresentation(kit);
      return `
        <button type="button" class="kit-tile" disabled>
          <p class="kit-name">${esc(kit.name)}</p>
          <span class="badge ${view.badgeClass}">${esc(view.badge)}</span>
          <span class="kit-meta">${esc(view.meta)}</span>
        </button>`;
    }
    const claim = kit.claim;
    const mine = claim && claim.userEmail === state.user.email;
    const locked = Boolean(claim && !mine);
    const selected = kit.id === state.selectedKitId;
    let badge = '<span class="badge badge-available">Available</span>';
    if (mine) badge = '<span class="badge badge-yours">Yours</span>';
    else if (locked) badge = `<span class="badge badge-locked">${lockIcon()} Locked · ${esc(claim.userName || claim.userEmail)}</span>`;
    const disabled = locked && !isAdmin();
    return `
      <button type="button" class="kit-tile ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}" data-action="select-kit" data-id="${kit.id}" ${disabled ? 'disabled' : ''} aria-pressed="${selected}">
        <p class="kit-name">${esc(kit.name)}</p>
        ${badge}
        <span class="kit-meta">${esc(kitTileMeta(kit))}</span>
      </button>`;
  }).join('');
  return `<div class="kit-grid">${tiles}</div>`;
}

function checkButtonState() {
  const kit = selectedKit();
  if (!kit) return { label: 'Check in', action: 'check-in', disabled: true, reason: 'Choose a kit.' };
  if (kit.claim && kit.claim.userEmail === state.user.email) {
    return {
      label: 'Check out',
      action: 'check-out',
      disabled: Boolean(kit.claim.pending || state.pendingCheckOut),
      reason: kit.claim.pending ? 'Saving check-in…' : 'This kit is locked for other people until you check out.',
    };
  }
  if (kit.claim) {
    return {
      label: 'Check in',
      action: 'check-in',
      disabled: true,
      reason: `${kit.name} is claimed by ${kit.claim.userName} for this date.`,
      release: isAdmin(),
    };
  }
  const mine = state.kits.find((row) => row.claim && row.claim.userEmail === state.user.email);
  if (mine && mine.id !== kit.id) {
    return {
      label: 'Check in',
      action: 'check-in',
      disabled: true,
      reason: `You already have ${mine.name} checked in for this date. Check out before claiming another kit.`,
    };
  }
  return { label: 'Check in', action: 'check-in', disabled: false, reason: 'Check-in locks this kit for other people on the selected date.' };
}

function renderCheckButton() {
  if (!state.kits.length) return '';
  const button = checkButtonState();
  const kit = selectedKit();
  const claiming = button.action === 'check-in' && state.pendingCheckIn;
  const label = claiming
    ? `Claiming ${kit?.name || 'kit'}…`
    : (button.action === 'check-in' && kit ? `Check in to ${kit.name}` : button.label);
  const checkDisabled = button.disabled || claiming;
  const release = button.release
    ? `<button type="button" class="btn btn-secondary" id="release-button" data-action="release" ${state.pendingCheckOut ? 'disabled' : ''}>Release this kit</button>`
    : '';
  return `
    <div class="check-in-row">
      <button type="button" class="btn btn-primary" id="check-button" data-action="${button.action}" ${checkDisabled ? 'disabled' : ''}>${claiming ? '<span class="spinner" aria-hidden="true"></span>' : ''}${esc(label)}</button>
      ${release}
    </div>
    <p class="meta">${esc(button.reason || '')}</p>`;
}

function renderSession(kit) {
  const claim = kit.claim;
  const done = new Set(claim.completedTaskIds || []);
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => done.has(task.id)).length;
  const width = total ? Math.round((completed / total) * 100) : 0;
  const ready = total > 0 && completed === total;
  return `
    <div class="session-bar">
      <div class="session-info">
        <p class="session-title">${esc(kit.name)} <span class="badge badge-yours">Yours</span></p>
        <p class="session-meta">Checked in ${esc(formatPtTime(claim.checkInAt))} · <span class="tabular" id="task-progress">${completed} of ${total}</span> done</p>
        <div class="progress-track" aria-hidden="true"><div class="progress-fill" id="task-bar" data-width="${width}"></div></div>
      </div>
      <div class="session-actions">
        <button type="button" class="btn ${ready ? 'btn-primary' : 'btn-secondary'}" id="check-button" data-action="check-out" ${claim.pending || state.pendingCheckOut ? 'disabled' : ''}>Check out</button>
      </div>
    </div>`;
}

function renderPhoneBar(kit) {
  const pending = kit.claim?.pending || state.pendingCheckOut;
  return `<div class="phone-bar"><button type="button" class="btn btn-primary" id="phone-check-out" data-action="check-out" ${pending ? 'disabled' : ''}>Check out</button></div>`;
}

function taskStatusHtml(taskId) {
  const status = state.taskUi.get(taskId);
  if (status === 'saving') return '<span class="task-status"><span class="spinner" aria-hidden="true"></span> Saving…</span>';
  if (status === 'saved') return '<span class="task-status saved">Saved</span>';
  if (status === 'failed') return '<button type="button" class="task-status failed" data-action="retry-tasks">Failed · Retry</button>';
  return '';
}

function renderTasks() {
  const kit = selectedKit();
  const claim = myClaim();
  const totalTasks = state.tasks.length || 18;
  if (isPastDate()) {
    return `<section class="card preview-disabled"><div class="preview-msg"><strong>Past date — view only</strong>Checklist history is available from the History tab for past check-outs.</div></section>`;
  }
  if (!claim) {
    const text = kit?.claim
      ? 'Tasks stay with the person who has this kit checked in.'
      : `Check in to start ${totalTasks} tasks`;
    const sub = kit?.claim ? '' : 'Camera, power & batteries, cables & mounts, network, kit contents';
    return `<section class="card preview-disabled"><div class="preview-msg"><strong>${esc(text)}</strong>${esc(sub)}</div></section>`;
  }
  if (!state.tasks.length) {
    return `<section class="card">${banner('err', state.tasksError, state.tasksCode)}<p>${state.loading.tasks ? 'Refreshing…' : 'No tasks are set up yet.'}</p><button type="button" class="btn btn-ghost btn-sm" data-action="refresh-tasks">Refresh tasks</button></section>`;
  }
  const done = new Set(claim.completedTaskIds || []);
  const blocks = groupTasks(state.tasks).map((group) => {
    const completed = group.tasks.filter((task) => done.has(task.id)).length;
    const total = group.tasks.length;
    const complete = completed === total;
    const manual = state.groupManual[group.id];
    const collapsed = manual === 'open' ? false : manual === 'closed' ? true : complete;
    const rows = group.tasks.map((task) => {
      const on = done.has(task.id);
      const hint = taskHint(task.title);
      return `
        <li class="task-row ${on ? 'done' : ''}">
          <input class="task-check" id="task-${task.id}" data-task-id="${task.id}" type="checkbox" ${on ? 'checked' : ''} aria-labelledby="task-label-${task.id}">
          <div class="task-body">
            <label class="task-name" id="task-label-${task.id}" for="task-${task.id}">${esc(task.title)}</label>
            ${hint ? `<p class="task-hint">${esc(hint)}</p>` : ''}
          </div>
          ${taskStatusHtml(task.id)}
        </li>`;
    }).join('');
    return `
      <div class="task-group ${complete ? 'complete' : ''} ${collapsed ? 'collapsed' : ''}">
        <button type="button" class="task-group-head" data-action="toggle-group" data-group="${group.id}" aria-expanded="${collapsed ? 'false' : 'true'}">
          ${complete ? '<span class="group-check" aria-hidden="true">✓</span>' : ''}
          <span class="section">${esc(group.label)}</span>
          <span class="group-count tabular">${completed}/${total}</span>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <ul class="task-list">${rows}</ul>
      </div>`;
  }).join('');
  return `
    ${banner('err', state.tasksError, state.tasksCode)}
    ${blocks}
    <p class="meta">Completed groups stay closed. Times are Pacific time (PT). <button type="button" class="btn btn-ghost btn-sm" data-action="refresh-tasks" ${state.loading.tasks ? 'disabled' : ''}>Refresh tasks</button></p>`;
}

function initials(name, email) {
  const source = String(name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function visibleHistoryEvents() {
  const query = state.historyQuery.trim().toLowerCase();
  return historyEvents(state.history).filter((event) => {
    if (!query) return true;
    return `${event.name} ${event.email} ${event.kitName}`.toLowerCase().includes(query);
  });
}

function renderHistory() {
  const span = state.filters.span || 'today';
  const chip = (id, label) => `<button type="button" class="chip ${span === id ? 'active' : ''}" data-action="history-span" data-span="${id}">${label}</button>`;
  const kitOptions = [...state.kitChoices.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => `<option value="${id}" ${String(state.filters.kitId) === String(id) ? 'selected' : ''}>${esc(name)}</option>`)
    .join('');
  const people = personChoices()
    .map(([email, name]) => `<option value="${esc(email)}" ${state.filters.userEmail === email ? 'selected' : ''}>${esc(name)}</option>`)
    .join('');
  return `
    <h2 class="section" id="history-heading">Kit log</h2>
    <p class="meta spaced">Newest first. Each claim and each release is its own line. Times are Pacific time (PT).</p>
    ${banner('err', state.historyError, state.historyCode)}
    ${state.historyHint ? `<p class="hint">${esc(state.historyHint)}</p>` : ''}
    <form id="history-form" class="filters" method="post" action="#">
      <input class="search" id="history-search" type="search" placeholder="Search people or kits…" value="${esc(state.historyQuery)}" aria-label="Search people or kits">
      ${chip('today', 'Today')}
      ${chip('week', '7 days')}
      ${chip('all', 'All')}
      <button type="button" class="chip ${state.filters.mineOnly ? 'active' : ''}" data-action="toggle-mine">Mine</button>
      <select class="select" id="filter-kit" name="kitId" aria-label="Kit filter">
        <option value="">All kits</option>
        ${kitOptions}
      </select>
      <select class="select" id="filter-user" name="userEmail" aria-label="Person" ${state.filters.mineOnly ? 'disabled' : ''}>
        <option value="">Everyone</option>
        ${people}
      </select>
    </form>
    <div id="history-results">${historyCardsHtml()}</div>
    ${span === 'all' ? '<p class="hint">All starts with the last 14 days.</p><button type="button" class="btn btn-ghost" data-action="load-older">Load older</button>' : ''}`;
}

function historyResultsHtml() {
  return historyCardsHtml();
}

function historyCardsHtml() {
  const events = visibleHistoryEvents();
  if (!events.length) {
    if (state.historyError) return '';
    if (!state.historyReady || state.loading.history) return '<p class="refreshing" role="status">Refreshing…</p>';
    return '<div class="card empty-state"><strong>No check-ins for these filters</strong>Try another day, or clear the kit filter.</div>';
  }
  let lastDay = '';
  return events.map((event) => {
    const day = event.at ? pacificDate(new Date(event.at)) : (event.claimDate || '');
    const heading = day && day !== lastDay ? `<p class="date-group-label">${esc(formatHistoryDay(day))}</p>` : '';
    lastDay = day || lastDay;
    const verb = event.kind === 'claimed' ? 'claimed' : 'unclaimed';
    const total = Number(event.tasksTotal) || 0;
    const doneCount = Number(event.tasksCompleted) || 0;
    const pill = total
      ? `<span class="badge ${doneCount >= total ? 'badge-sage' : 'badge-amber'} tabular">${doneCount}/${total}</span>`
      : '';
    const when = event.at ? formatPtTime(event.at) : 'Time not recorded';
    return `
      ${heading}
      <article class="hist-row">
        <span class="avatar" aria-hidden="true">${esc(initials(event.name, event.email))}</span>
        <div class="hist-body">
          <p class="hist-line"><strong>${esc(event.name || event.email || 'Unknown')}</strong> ${verb} <strong>${esc(event.kitName)}</strong></p>
          <p class="hist-time">${esc(when)}${event.email ? ` · ${esc(event.email)}` : ''}${event.claimDate ? ` · claim date ${esc(formatYmdLabel(event.claimDate))}` : ''}</p>
        </div>
        ${pill}
      </article>`;
  }).join('');
}

function renderSettings() {
  if (!isAdmin()) return '<p>Settings are for admins.</p>';
  const peopleOn = state.settingsPane !== 'kits';
  return `
    ${banner('err', state.settingsError, state.settingsCode)}
    ${banner('ok', state.settingsNotice)}
    <div class="subtabs" role="tablist" aria-label="Settings">
      <button type="button" class="subtab ${peopleOn ? 'active' : ''}" data-action="settings-pane" data-pane="people" aria-selected="${peopleOn}">People</button>
      <button type="button" class="subtab ${peopleOn ? '' : 'active'}" data-action="settings-pane" data-pane="kits" aria-selected="${!peopleOn}">Kits</button>
    </div>
    ${peopleOn ? renderAccessEditor() : renderKitEditor()}
    <section class="card section-gap">
      <h2 class="section">Practice data</h2>
      ${state.api.mode === 'mock'
        ? '<button type="button" class="btn btn-secondary" data-action="reset-demo">Reset sample data</button><p class="hint">This clears practice check-ins in this browser and restores the sample people, kits, and tasks.</p>'
        : '<p class="meta">Kit and access changes here are sent to the shared checklist service.</p>'}
    </section>`;
}

function holderToday(kitId) {
  const today = pacificDate();
  const list = state.kitsByDate.get(today) || (state.date === today ? state.kits : []);
  return list.find((row) => row.id === kitId)?.claim || null;
}

function renderAccessEditor() {
  const editing = state.editor?.kind === 'access' ? state.editor : null;
  const activeAdmins = state.access.filter((person) => person.active && isAdminRole(person.role)).length;
  const rows = state.access.map((person) => {
    const onlyAdmin = person.active && isAdminRole(person.role) && activeAdmins <= 1;
    const self = person.email === state.user.email && person.active;
    const blocked = onlyAdmin || self;
    const why = self ? 'You are signed in with this account.' : 'At least one admin must stay active.';
    const saving = state.pendingToggle === `access:${person.id}`;
    return `
      <tr class="${saving ? 'saving' : ''}">
        <td>${esc(person.email)}</td>
        <td>${esc(person.name)}${self ? ' <span class="meta">(you)</span>' : ''}</td>
        <td><span class="badge ${isAdminRole(person.role) ? 'badge-admin' : 'badge-staff'}">${esc(roleLabel(person.role))}</span></td>
        <td><span class="badge ${person.active ? 'badge-active' : 'badge-off'}">${person.active ? 'Active' : 'Inactive'}</span>${saving ? ' <span class="task-status"><span class="spinner" aria-hidden="true"></span> Saving…</span>' : ''}</td>
        <td>
          <button type="button" class="btn btn-ghost btn-sm" data-action="edit-access" data-id="${person.id}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-access" data-id="${person.id}" ${blocked || saving ? 'disabled' : ''}>${person.active ? 'Deactivate' : 'Activate'}</button>
          ${blocked && person.active ? `<p class="hint">${esc(why)}</p>` : ''}
        </td>
      </tr>`;
  }).join('');
  const form = editing ? `
    <form id="access-form" class="add-row" method="post" action="#" novalidate>
      ${fieldError('access-form', state.formErrors.form)}
      <input type="hidden" name="recordId" value="${editing.id ?? ''}">
      <div class="field">
        <label for="person-name">Name</label>
        <input id="person-name" name="name" type="text" placeholder="Display name" value="${esc(editing.name)}" ${invalidAttr('person-name', state.formErrors.name)}>
        ${fieldError('person-name', state.formErrors.name)}
      </div>
      <div class="field">
        <label for="person-email">Email</label>
        <input id="person-email" name="email" type="text" autocomplete="off" placeholder="email@centific.com" value="${esc(editing.email)}" ${invalidAttr('person-email', state.formErrors.email)}>
        ${fieldError('person-email', state.formErrors.email)}
      </div>
      <div class="field">
        <label for="person-first">First name</label>
        <input id="person-first" name="firstName" type="text" value="${esc(editing.firstName)}">
      </div>
      <div class="field">
        <label for="person-last">Last name</label>
        <input id="person-last" name="lastName" type="text" value="${esc(editing.lastName)}">
      </div>
      <div class="field">
        <label for="person-role">Role</label>
        <select class="select" id="person-role" name="role">
          <option value="User" ${isAdminRole(editing.role) ? '' : 'selected'}>Staff</option>
          <option value="Admin" ${isAdminRole(editing.role) ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="check-row">
        <input id="person-active" name="active" type="checkbox" ${editing.active ? 'checked' : ''}>
        <label for="person-active">Active</label>
      </div>
      <button class="btn btn-primary btn-sm" type="submit" ${state.pendingSave === 'access' ? 'disabled' : ''}>${savingButton(editing.id ? 'Save person' : 'Add person', state.pendingSave === 'access')}</button>
      <button class="btn btn-ghost btn-sm" type="button" data-action="cancel-editor">Cancel</button>
    </form>` : `
    <div class="add-row">
      <button type="button" class="btn btn-primary btn-sm" data-action="add-access">Add person</button>
    </div>`;
  return `
    <section class="card" aria-labelledby="access-heading">
      <h2 class="section" id="access-heading">Who can sign in</h2>
      <p class="meta spaced">Name, email, role (Admin or Staff), and whether they can sign in.</p>
      ${form}
      ${state.access.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>No one is on the access list yet.</p>'}
    </section>`;
}

function renderKitEditor() {
  const editing = state.editor?.kind === 'kit' ? state.editor : null;
  const rows = state.allKits.map((kit) => {
    const holder = holderToday(kit.id);
    const held = holder ? `Held by ${holder.userName || holder.userEmail}${holder.checkInAt ? ` · since ${formatPtTime(holder.checkInAt)}` : ''}` : (kit.active ? 'Available' : 'Inactive');
    const saving = state.pendingToggle === `kit:${kit.id}`;
    return `
      <div class="hist-row ${saving ? 'saving' : ''}">
        <div class="hist-body">
          <p class="hist-line"><strong>${esc(kit.name)}</strong>${kit.notes ? ` · ${esc(kit.notes)}` : ''}</p>
          <p class="hist-time">${esc(held)}${saving ? ' · Saving…' : ''} · order ${esc(kit.sortOrder)}</p>
        </div>
        <div class="kit-actions">
          <button type="button" class="toggle ${kit.active ? 'on' : ''}" data-action="toggle-kit" data-id="${kit.id}" aria-label="${kit.active ? 'Enabled' : 'Disabled'}" aria-pressed="${kit.active}" ${saving ? 'disabled' : ''}></button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="edit-kit" data-id="${kit.id}">Rename</button>
        </div>
      </div>`;
  }).join('');
  const form = editing ? `
    <form id="kit-form" class="add-row" method="post" action="#" novalidate>
      ${fieldError('kit-form', state.formErrors.form)}
      <input type="hidden" name="recordId" value="${editing.id ?? ''}">
      <div class="field">
        <label for="kit-name">Kit name</label>
        <input id="kit-name" name="name" type="text" value="${esc(editing.name)}" ${invalidAttr('kit-name', state.formErrors.name)}>
        ${fieldError('kit-name', state.formErrors.name)}
      </div>
      <div class="field">
        <label for="kit-order">Sort order</label>
        <input id="kit-order" name="sortOrder" type="text" inputmode="numeric" value="${esc(editing.sortOrder)}" ${invalidAttr('kit-order', state.formErrors.sortOrder)}>
        ${fieldError('kit-order', state.formErrors.sortOrder)}
      </div>
      <div class="field">
        <label for="kit-notes">Notes</label>
        <textarea id="kit-notes" name="notes">${esc(editing.notes || '')}</textarea>
      </div>
      <div class="check-row">
        <input id="kit-active" name="active" type="checkbox" ${editing.active ? 'checked' : ''}>
        <label for="kit-active">Active</label>
      </div>
      <button class="btn btn-primary btn-sm" type="submit" ${state.pendingSave === 'kit' ? 'disabled' : ''}>${savingButton('Save kit', state.pendingSave === 'kit')}</button>
      <button class="btn btn-ghost btn-sm" type="button" data-action="cancel-editor">Cancel</button>
    </form>` : `
    <div class="add-row">
      <button type="button" class="btn btn-primary btn-sm" data-action="add-kit">Add kit</button>
    </div>`;
  return `
    <section class="card" aria-labelledby="kits-heading">
      <h2 class="section" id="kits-heading">Kits</h2>
      <p class="meta spaced">Enable, rename, and see who holds each kit today. Sort order must be a whole number.</p>
      ${form}
      ${state.allKits.length ? rows : '<p id="kits-empty">No kits yet. Add a kit here so people can check in.</p>'}
    </section>`;
}

function renderModal() {
  const release = state.modal.type === 'release';
  if (release) {
    return `
      <div class="overlay" id="backdrop">
        <div class="dialog" id="dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">Release ${esc(state.modal.kitName)}?</h2>
          <p id="modal-body">Release this kit so someone else can check in for this date?</p>
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel" data-action="modal-cancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="modal-confirm" data-action="modal-confirm">Release kit</button>
          </div>
        </div>
      </div>`;
  }
  const done = new Set(state.modal.completedTaskIds || []);
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => done.has(task.id)).length;
  const remaining = state.tasks.filter((task) => !done.has(task.id));
  const confirmLabel = remaining.length ? 'Check out anyway' : 'Check out';
  return `
    <div class="overlay" id="backdrop">
      <div class="dialog" id="dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">Check out of ${esc(state.modal.kitName)}?</h2>
        <p class="dialog-summary"><span class="tabular">${completed} of ${total}</span> tasks done</p>
        <p class="dialog-warn" id="modal-body">Please ensure you have completed the task.</p>
        ${remaining.length ? `<p class="meta spaced-sm">Still open:</p><ul class="remaining">${remaining.map((task) => `<li>${esc(task.title)}</li>`).join('')}</ul>` : ''}
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" id="modal-cancel" data-action="modal-cancel">Keep working</button>
          <button type="button" class="btn btn-primary" id="modal-confirm" data-action="modal-confirm">${confirmLabel}</button>
        </div>
      </div>
    </div>`;
}
function clearPageError() {
  state.error = '';
  state.errorCode = '';
}

async function signIn(email) {
  if (state.signingIn) return;
  state.loginEmail = String(email || '').trim();
  state.signingIn = true;
  state.notice = '';
  clearPageError();
  render();
  try {
    const user = acceptedLoginUser(await apiCall('login', { email: state.loginEmail }));
    if (!user) {
      const error = new Error('Could not sign in.');
      error.code = 'BAD_RESPONSE';
      throw error;
    }
    enterApp(user);
  } catch (error) {
    state.signingIn = false;
    state.error = error.message;
    state.errorCode = error.code || '';
    render();
  }
}

function enterApp(user) {
  const accepted = acceptedLoginUser(user);
  if (!accepted) return;
  state.user = accepted;
  state.signingIn = false;
  clearPageError();
  state.message = '';
  state.tab = 'checklist';
  state.tasksError = '';
  state.selectedKitId = null;
  state.editor = null;
  state.modal = null;
  state.people = new Map();
  state.historyHint = '';
  state.history = [];
  state.historyReady = false;
  state.historyCache = new Map();
  state.kitsByDate = new Map();
  state.kits = [];
  state.kitsLoaded = false;
  state.filters = defaultFilters(accepted);
  rememberPerson(accepted.email, accepted.name);
  confirmedTaskIds = null;
  taskFlush.cancel();
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(accepted));
  } catch {
    /* session storage can be blocked; the page still works until refresh */
  }
  const cachedTasks = readTaskCache(sessionStorage);
  if (cachedTasks?.fresh) {
    state.tasks = cachedTasks.tasks.filter(isTaskVisible);
    state.tasksLoaded = true;
  } else {
    state.tasks = [];
    state.tasksLoaded = false;
  }
  const today = pacificDate();
  state.date = today;
  const parts = splitYmd(today);
  state.viewYear = parts.year;
  state.viewMonth = parts.month;
  document.title = 'Daily Readiness Checklist';
  render();
  const jobs = [refreshKits(state.date, { preferMine: true })];
  if (!state.tasksLoaded) jobs.push(refreshTasks());
  if (isAdmin()) {
    jobs.push(refreshAccess());
    jobs.push(refreshKitList());
  }
  Promise.all(jobs).catch(() => {});
}

function applyKitSelection(preferMine) {
  const mine = state.kits.find((kit) => kit.claim && kit.claim.userEmail === state.user?.email);
  const stillThere = state.kits.some((kit) => kit.id === state.selectedKitId);
  if (preferMine && mine) state.selectedKitId = mine.id;
  else if (!stillThere) {
    const free = state.kits.find((kit) => !kit.claim);
    state.selectedKitId = mine?.id || free?.id || state.kits[0]?.id || null;
  }
}

function storeKits(date, kits) {
  state.kitsByDate.set(date, kits);
  if (state.date === date) state.kits = kits;
}

async function refreshKits(date, { preferMine = false } = {}) {
  const serial = ++kitsSerial;
  const actor = state.user?.email;
  const cached = state.kitsByDate.get(date);
  if (cached && state.date === date) {
    state.kits = cached;
    state.kitsLoaded = true;
    applyKitSelection(preferMine);
  }
  state.loading.checklist = true;
  state.kitsError = '';
  state.kitsCode = '';
  if (state.tab === 'checklist') render();
  try {
    const kits = await apiCall('getKits', { date }, { lane: 'kits' });
    if (serial !== kitsSerial || state.user?.email !== actor || state.date !== date || state.kitHold > 0) return;
    kits.forEach((kit) => rememberKit(kit.id, kit.name));
    storeKits(date, kits);
    state.kitsLoaded = true;
    applyKitSelection(preferMine);
    if (state.errorCode === 'KIT_CLAIMED' && state.conflictKitId) {
      const taken = kits.find((kit) => kit.id === state.conflictKitId);
      if (taken?.claim?.userName) {
        state.error = `${taken.name} was just claimed by ${taken.claim.userName}. Pick another kit.`;
      }
    }
    const missing = kits.some((kit) => kit.claim && kit.claim.userEmail === actor && !Array.isArray(kit.claim.completedTaskIds));
    if (missing) hydrateTaskIds(date, serial);
  } catch (error) {
    if (isAbort(error) || serial !== kitsSerial || state.date !== date) return;
    state.kitsError = error.message;
    state.kitsCode = error.code || '';
    if (!state.kitsByDate.has(date)) {
      state.kits = [];
      state.kitsLoaded = true;
    }
  } finally {
    if (serial === kitsSerial) {
      state.loading.checklist = false;
      if (state.tab === 'checklist' && state.user?.email === actor) render();
    }
  }
}

async function hydrateTaskIds(date, serial) {
  try {
    const rows = await apiCall('getHistory', { from: date, to: date }, { lane: `claim-tasks:${date}` });
    if (serial !== kitsSerial || state.date !== date || state.kitHold > 0) return;
    for (const kit of state.kits) {
      const claim = kit.claim;
      if (!claim || Array.isArray(claim.completedTaskIds)) continue;
      const row = rows.find((item) => item.id === claim.claimId);
      claim.completedTaskIds = row?.completedTaskIds || [];
    }
    if (state.tab === 'checklist') render();
  } catch (error) {
    if (isAbort(error)) return;
    state.tasksError = error.message;
    state.tasksCode = error.code || '';
  }
}

async function refreshTasks({ force = false } = {}) {
  if (!force && state.tasksLoaded) return;
  const serial = ++taskFetchSerial;
  state.loading.tasks = true;
  if (state.tab === 'checklist') render();
  try {
    const tasks = (await apiCall('getTasks', {}, { lane: 'tasks' })).filter(isTaskVisible);
    if (serial !== taskFetchSerial) return;
    state.tasks = tasks;
    state.tasksLoaded = true;
    state.tasksError = '';
    state.tasksCode = '';
    writeTaskCache(sessionStorage, tasks);
  } catch (error) {
    if (isAbort(error) || serial !== taskFetchSerial) return;
    if (!state.tasksLoaded) state.tasks = [];
    state.tasksError = error.message;
    state.tasksCode = error.code || '';
  } finally {
    if (serial === taskFetchSerial) {
      state.loading.tasks = false;
      if (state.tab === 'checklist') render();
    }
  }
}

function setDate(ymd, { focusDay = false } = {}) {
  if (!ymd || ymd > pacificDate()) return;
  state.date = ymd;
  const parts = splitYmd(ymd);
  state.viewYear = parts.year;
  state.viewMonth = parts.month;
  state.message = '';
  state.dateOpen = false;
  clearPageError();
  const cached = state.kitsByDate.get(ymd);
  if (cached) {
    state.kits = cached;
    state.kitsLoaded = true;
    applyKitSelection(true);
  } else {
    state.kits = [];
    state.kitsLoaded = false;
    state.selectedKitId = null;
  }
  render();
  if (focusDay) document.getElementById(`day-${ymd}`)?.focus();
  refreshKits(ymd, { preferMine: true });
}

async function checkIn() {
  const kit = selectedKit();
  if (!kit || kit.claim || state.pendingCheckIn || isPastDate()) return;
  const date = state.date;
  const snapshot = cloneData(state.kits);
  const checkInAt = new Date().toISOString();
  kit.claim = {
    claimId: null,
    pending: true,
    userEmail: state.user.email,
    userName: state.user.name,
    checkInAt,
    status: 'Claimed',
    completedTaskIds: [],
  };
  state.selectedKitId = kit.id;
  state.message = formatClaimMessage(kit.name, date, checkInAt);
  clearPageError();
  state.pendingCheckIn = true;
  state.kitHold += 1;
  state.historyCache.clear();
  render();
  try {
    const data = await apiCall('checkIn', { kitId: kit.id, date });
    const current = state.kits.find((row) => row.id === kit.id);
    if (current?.claim?.pending) {
      current.claim = {
        claimId: data.claimId,
        userEmail: state.user.email,
        userName: state.user.name,
        checkInAt: data.checkInAt,
        status: 'Claimed',
        completedTaskIds: current.claim.completedTaskIds || [],
      };
    }
    state.message = formatClaimMessage(data.kitName, data.date, data.checkInAt);
    state.selectedKitId = data.kitId;
    storeKits(date, state.kits);
    invalidateMonthActivity();
  } catch (error) {
    if (!isAbort(error)) {
      storeKits(date, snapshot);
      state.errorCode = error.code || '';
      state.message = '';
      state.conflictKitId = error.code === 'KIT_CLAIMED' ? kit.id : null;
      state.error = error.code === 'KIT_CLAIMED'
        ? `${kit.name} was just claimed by someone else. Pick another kit.`
        : error.message;
    }
  } finally {
    state.pendingCheckIn = false;
    state.kitHold = Math.max(0, state.kitHold - 1);
    render();
    if (state.kitHold === 0 && state.date === date) refreshKits(date, { preferMine: false });
  }
}

function openCheckout(type) {
  const kit = selectedKit();
  if (!kit?.claim || kit.claim.pending || isPastDate()) return;
  const phone = window.matchMedia('(max-width: 720px)').matches;
  state.modal = {
    type,
    claimId: kit.claim.claimId,
    kitName: kit.name,
    completedTaskIds: kit.claim.completedTaskIds || [],
    returnId: type === 'release' ? 'release-button' : (phone ? 'phone-check-out' : 'check-button'),
  };
  render();
}

function closeModal() {
  const returnId = state.modal?.returnId;
  state.modal = null;
  render();
  if (returnId) document.getElementById(returnId)?.focus();
}

async function confirmModal() {
  const modal = state.modal;
  if (!modal || state.pendingCheckOut) return;
  const kit = state.kits.find((row) => row.claim?.claimId === modal.claimId) || selectedKit();
  if (!kit?.claim) {
    state.modal = null;
    render();
    return;
  }
  const date = state.date;
  const snapshot = cloneData(state.kits);
  const ids = modal.type === 'checkout'
    ? (myClaim(kit)?.completedTaskIds || modal.completedTaskIds || [])
    : (modal.completedTaskIds || []);
  kit.claim = null;
  kit.lastCheckedOut = {
    claimId: modal.claimId,
    userEmail: state.user.email,
    userName: state.user.name,
    checkOutAt: new Date().toISOString(),
  };
  state.modal = null;
  state.pendingCheckOut = true;
  state.kitHold += 1;
  state.message = modal.type === 'release'
    ? `${modal.kitName} was released for this date.`
    : `${modal.kitName} is checked out. The kit is free for this date.`;
  clearPageError();
  state.historyCache.clear();
  render();
  try {
    await apiCall('checkOut', {
      claimId: modal.claimId,
      completedTaskIds: ids,
      tasksTotal: state.tasks.length,
    });
    storeKits(date, state.kits);
    invalidateMonthActivity();
  } catch (error) {
    if (!isAbort(error)) {
      storeKits(date, snapshot);
      state.error = error.message;
      state.errorCode = error.code || '';
      state.message = '';
    }
  } finally {
    state.pendingCheckOut = false;
    state.kitHold = Math.max(0, state.kitHold - 1);
    render();
    if (state.kitHold === 0 && state.date === date) refreshKits(date, { preferMine: false });
  }
}

function patchTaskView(taskId) {
  const claim = myClaim();
  const box = document.getElementById(`task-${taskId}`);
  if (!box || !claim) return false;
  const done = new Set(claim.completedTaskIds || []);
  box.checked = done.has(taskId);
  box.closest('.task')?.classList.toggle('done', done.has(taskId));
  const completed = state.tasks.filter((task) => done.has(task.id)).length;
  const total = state.tasks.length || 1;
  const progress = document.getElementById('task-progress');
  if (progress) progress.innerHTML = `<strong>${completed}/${state.tasks.length}</strong>`;
  const bar = document.querySelector('#panel .bar span');
  if (bar) bar.style.width = `${Math.round((completed / total) * 100)}%`;
  return true;
}

function toggleTask(taskId, checked) {
  const claim = myClaim();
  if (!claim) return;
  if (confirmedTaskIds == null) confirmedTaskIds = [...(claim.completedTaskIds || [])];
  const next = new Set(claim.completedTaskIds || []);
  if (checked) next.add(taskId);
  else next.delete(taskId);
  claim.completedTaskIds = [...next];
  state.tasksError = '';
  state.tasksCode = '';
  state.taskUi.set(taskId, 'saving');
  render();
  taskFlush.schedule();
}

async function flushTasks() {
  const claim = myClaim();
  if (!claim) return;
  if (claim.pending || !claim.claimId) {
    taskFlush.schedule();
    return;
  }
  const serial = ++taskSeq;
  const ids = [...(claim.completedTaskIds || [])];
  const rollback = confirmedTaskIds ? [...confirmedTaskIds] : ids;
  try {
    const saved = await apiCall('updateTasks', {
      claimId: claim.claimId,
      completedTaskIds: ids,
    }, { lane: `tasks-save:${claim.claimId}` });
    if (serial !== taskSeq) return;
    claim.completedTaskIds = saved.completedTaskIds;
    confirmedTaskIds = [...saved.completedTaskIds];
    state.tasksError = '';
    state.tasksCode = '';
    for (const id of [...state.taskUi.keys()]) {
      if (state.taskUi.get(id) === 'saving') state.taskUi.set(id, 'saved');
    }
    showToast('ok', 'Saved');
  } catch (error) {
    if (isAbort(error) || serial !== taskSeq) return;
    claim.completedTaskIds = rollback;
    confirmedTaskIds = [...rollback];
    state.tasksError = error.message;
    state.tasksCode = error.code || '';
    for (const id of [...state.taskUi.keys()]) {
      if (state.taskUi.get(id) === 'saving') state.taskUi.set(id, 'failed');
    }
    showToast('error', "Couldn't save.");
  }
}

function applyHistorySpan(span) {
  const today = pacificDate();
  state.filters.span = span;
  state.filters.to = today;
  if (span === 'today') state.filters.from = today;
  else if (span === 'week') state.filters.from = addDays(today, -6);
  else state.filters.from = defaultHistoryRange(today).from;
}

function historyFiltersFromForm(form) {
  const data = new FormData(form);
  return {
    userEmail: state.filters.mineOnly ? '' : String(data.get('userEmail') || ''),
    kitId: String(data.get('kitId') || ''),
    from: state.filters.from,
    to: state.filters.to,
    mineOnly: state.filters.mineOnly,
    span: state.filters.span || 'today',
  };
}

function historyKey() {
  const mine = Boolean(state.filters.mineOnly);
  return JSON.stringify({
    userEmail: mine ? state.user?.email || '' : state.filters.userEmail || '',
    kitId: state.filters.kitId || '',
    from: state.filters.from || '',
    to: state.filters.to || '',
    mineOnly: mine,
  });
}

function historyParams() {
  const params = { from: state.filters.from, to: state.filters.to };
  const mine = Boolean(state.filters.mineOnly);
  if (mine && state.user?.email) params.userEmail = state.user.email;
  else if (state.filters.userEmail) params.userEmail = state.filters.userEmail;
  if (state.filters.kitId) params.kitId = Number(state.filters.kitId);
  return params;
}

function showCachedHistory() {
  const cached = state.historyCache.get(historyKey());
  if (!cached) return false;
  state.history = cached.rows;
  state.historyHint = cached.hint || '';
  state.historyReady = true;
  cached.rows.forEach((row) => {
    rememberKit(row.kitId, row.kitName);
    rememberPerson(row.userEmail, row.userName);
    rememberPerson(row.checkedOutByEmail || row.CheckedOutByEmail, row.checkedOutByName || row.CheckedOutByName);
  });
  return true;
}

let marksSerial = 0;
let marksFlight = '';

function monthRangesToLoad() {
  if (!state.user || state.tab !== 'checklist') return [];
  const ranges = [];
  if (isAdmin()) ranges.push(monthRange(state.viewYear, state.viewMonth));
  if (isPastDate()) {
    const parts = splitYmd(state.date);
    ranges.push(monthRange(parts.year, parts.month));
  }
  const seen = new Set();
  return ranges.filter((range) => {
    if (seen.has(range.key) || state.loadedMonths.has(range.key)) return false;
    seen.add(range.key);
    return true;
  });
}

function invalidateMonthActivity() {
  state.loadedMonths = new Set();
  marksFlight = '';
  marksSerial += 1;
}

function scheduleMonthMarks() {
  const pending = monthRangesToLoad().filter((range) => marksFlight !== range.key);
  if (!pending.length) return;
  refreshMonthMarks(pending[0]);
}

async function refreshMonthMarks(range) {
  const serial = ++marksSerial;
  marksFlight = range.key;
  const actor = state.user?.email;
  try {
    const rows = await apiCall('getHistory', { from: range.from, to: range.to }, { lane: 'calendar-marks' });
    if (serial !== marksSerial || state.user?.email !== actor) return;
    state.monthRows[range.key] = rows;
    state.monthActivity[range.key] = activityFromRows(rows);
    state.loadedMonths.add(range.key);
    if (state.tab === 'checklist') render();
  } catch (error) {
    if (isAbort(error) || serial !== marksSerial) return;
    if (!Object.prototype.hasOwnProperty.call(state.monthActivity, range.key)) {
      state.monthRows[range.key] = [];
      state.monthActivity[range.key] = {};
    }
    state.loadedMonths.add(range.key);
    if (state.tab === 'checklist') render();
  } finally {
    if (serial === marksSerial && marksFlight === range.key) marksFlight = '';
  }
}

function rowMatchesFilters(row) {
  const mine = Boolean(state.filters.mineOnly);
  const email = String(mine ? state.user?.email : state.filters.userEmail || '').trim().toLowerCase();
  if (email && !rowEmails(row).includes(email)) return false;
  if (state.filters.kitId && String(row.kitId) !== String(state.filters.kitId)) return false;
  if (state.filters.from && String(row.claimDate || '') < state.filters.from) return false;
  if (state.filters.to && String(row.claimDate || '') > state.filters.to) return false;
  return true;
}

async function refreshHistory() {
  const serial = ++historySerial;
  const key = historyKey();
  const actor = state.user?.email;
  showCachedHistory();
  state.loading.history = true;
  state.historyError = '';
  state.historyCode = '';
  if (state.tab === 'history') render();
  try {
    const rows = await apiCall('getHistory', historyParams(), { lane: 'history' });
    if (serial !== historySerial || state.user?.email !== actor) return;
    rows.forEach((row) => {
      rememberKit(row.kitId, row.kitName);
      rememberPerson(row.userEmail, row.userName);
      rememberPerson(row.checkedOutByEmail || row.CheckedOutByEmail, row.checkedOutByName || row.CheckedOutByName);
    });
    state.kits.forEach((kit) => rememberKit(kit.id, kit.name));
    const mine = Boolean(state.filters.mineOnly);
    const asked = String(state.filters.userEmail || '').trim().toLowerCase();
    const self = String(actor || '').trim().toLowerCase();
    let hint = '';
    if (!mine && asked && asked !== self && !rows.some((row) => rowEmails(row).includes(asked))) {
      hint = 'No rows matched that person. If you expected their check-ins, the shared checklist may still be limited to your own.';
    }
    const visible = rows.filter(rowMatchesFilters);
    state.historyCache.set(key, { rows: visible, hint });
    if (historyKey() === key) {
      state.history = visible;
      state.historyHint = hint;
      state.historyReady = true;
    }
  } catch (error) {
    if (isAbort(error) || serial !== historySerial) return;
    if (!state.historyCache.has(key)) {
      state.history = [];
      state.historyReady = true;
    }
    state.historyError = error.message;
    state.historyCode = error.code || '';
  } finally {
    if (serial === historySerial) {
      state.loading.history = false;
      if (state.tab === 'history' && state.user?.email === actor) render();
    }
  }
}

async function refreshAccess() {
  try {
    const access = await apiCall('listAccess', {}, { lane: 'access' });
    state.access = access;
    access.forEach((person) => rememberPerson(person.email, person.name));
    return access;
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

async function refreshKitList() {
  const kits = await apiCall('listKits', {}, { lane: 'kit-list' });
  state.allKits = kits;
  kits.forEach((kit) => rememberKit(kit.id, kit.name));
  return kits;
}

async function refreshSettings() {
  const serial = ++settingsSerial;
  const actor = state.user?.email;
  state.loading.settings = true;
  state.settingsError = '';
  state.settingsCode = '';
  if (state.tab === 'settings') render();
  const problems = [];
  let openKitForm = false;
  try {
    const [accessResult, kitResult] = await Promise.all([
      refreshAccess().catch((error) => { problems.push(error); return null; }),
      refreshKitList().catch((error) => { problems.push(error); return null; }),
    ]);
    if (serial !== settingsSerial || state.user?.email !== actor) return;
    if (problems.length) {
      state.settingsError = problems.map((error) => error.message).join(' ');
      state.settingsCode = problems[0].code || '';
    }
    if (accessResult) state.access = accessResult;
    if (kitResult) state.allKits = kitResult;
    openKitForm = Boolean(state.openKitForm);
    state.openKitForm = false;
    if (openKitForm) state.settingsPane = 'kits';
    state.editor = editorAfterSettingsRefresh({
      openKitForm,
      editor: state.editor,
      nextSortOrder: state.allKits.length + 1,
    });
  } finally {
    if (serial === settingsSerial) {
      state.loading.settings = false;
      if (state.tab === 'settings' && state.user?.email === actor) render();
      if (openKitForm) {
        document.getElementById('kits-heading')?.scrollIntoView({ block: 'start' });
        document.getElementById('kit-name')?.focus();
      }
    }
  }
}

function setTab(tab, { focus = false } = {}) {
  if (tab === 'settings' && !isAdmin()) tab = 'checklist';
  state.tab = tab;
  clearPageError();
  if (tab === 'history') showCachedHistory();
  render();
  if (focus) document.getElementById(`tab-${tab}`)?.focus();
  if (tab === 'history') refreshHistory();
  else if (tab === 'settings') refreshSettings();
  else refreshKits(state.date, { preferMine: false });
}

function signOut() {
  taskFlush.cancel();
  kitsSerial += 1;
  historySerial += 1;
  settingsSerial += 1;
  taskSeq += 1;
  taskFetchSerial += 1;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  state.user = null;
  state.tab = 'checklist';
  state.kits = [];
  state.kitsLoaded = false;
  state.kitsByDate = new Map();
  state.selectedKitId = null;
  state.message = '';
  state.history = [];
  state.historyReady = false;
  state.historyCache = new Map();
  state.historyHint = '';
  state.filters = defaultFilters(null);
  state.people = new Map();
  state.access = [];
  state.allKits = [];
  state.editor = null;
  state.modal = null;
  state.dateOpen = false;
  state.adminMonthOpen = false;
  state.settingsPane = 'people';
  state.taskUi = new Map();
  state.groupManual = {};
  state.toast = null;
  state.conflictKitId = null;
  state.historyQuery = '';
  state.monthActivity = {};
  state.monthRows = {};
  state.loadedMonths = new Set();
  marksSerial += 1;
  marksFlight = '';
  state.signingIn = false;
  state.pendingCheckIn = false;
  state.pendingCheckOut = false;
  state.pendingSave = '';
  state.pendingToggle = '';
  state.kitHold = 0;
  state.loading = { checklist: false, history: false, settings: false, tasks: false };
  state.notice = 'You are signed out.';
  clearPageError();
  document.title = 'Sign in · Daily Readiness Checklist';
  render();
}

function resetDemo() {
  state.api.reset();
  try { sessionStorage.removeItem(TASKS_CACHE_KEY); } catch { /* ignore */ }
  state.notice = 'Sample data was reset in this browser.';
  state.settingsNotice = state.notice;
  state.kits = [];
  state.kitsLoaded = false;
  state.kitsByDate = new Map();
  state.tasksLoaded = false;
  state.tasks = [];
  state.history = [];
  state.historyReady = false;
  state.historyCache = new Map();
  state.access = [];
  state.allKits = [];
  state.editor = null;
  if (state.user) {
    if (state.tab === 'settings') refreshSettings();
    else if (state.tab === 'history') refreshHistory();
    else refreshKits(state.date, { preferMine: true });
    refreshTasks({ force: true });
    return;
  }
  render();
}

function upsertRow(list, saved) {
  if (!saved) return list;
  const index = list.findIndex((row) => row.id === saved.id);
  if (index >= 0) {
    const next = list.slice();
    next[index] = { ...list[index], ...saved };
    return next;
  }
  return list.concat(saved);
}

async function saveAccess(form) {
  if (state.pendingSave) return;
  captureEditorFromDom();
  if (form) state.editor = accessFromForm(state.editor, new FormData(form));
  const me = state.access.find((person) => person.email === state.user.email);
  if (me && state.editor.id === me.id && !state.editor.active) {
    state.formErrors = { form: 'You cannot turn off the account you are signed in with.' };
    render();
    showFormProblem('access-form');
    return;
  }
  const errors = validateAccess(state.editor);
  if (Object.keys(errors).length) {
    state.formErrors = errors;
    render();
    showFormProblem('access-form');
    return;
  }
  const payload = accessPayload(state.editor);
  state.formErrors = {};
  state.settingsError = '';
  state.openKitForm = false;
  state.pendingSave = 'access';
  render();
  try {
    const saved = await apiCall('upsertAccess', payload);
    state.access = upsertRow(state.access, saved);
    state.editor = null;
    state.pendingSave = '';
    state.settingsNotice = 'Access list saved.';
    showToast('ok', 'Saved');
    refreshAccess().catch(() => {});
  } catch (error) {
    state.pendingSave = '';
    if (isAbort(error)) {
      render();
      return;
    }
    state.formErrors = { form: error.message };
    state.settingsNotice = '';
    render();
    showFormProblem('access-form');
  }
}

async function saveKit(form) {
  if (state.pendingSave) return;
  captureEditorFromDom();
  if (form) state.editor = kitFromForm(state.editor, new FormData(form));
  const errors = validateKit(state.editor);
  if (Object.keys(errors).length) {
    state.formErrors = errors;
    render();
    showFormProblem('kit-form');
    return;
  }
  const payload = kitPayload(state.editor);
  state.formErrors = {};
  state.settingsError = '';
  state.openKitForm = false;
  state.pendingSave = 'kit';
  render();
  try {
    const saved = await apiCall('upsertKit', payload);
    state.allKits = upsertRow(state.allKits, saved);
    state.editor = null;
    state.pendingSave = '';
    state.settingsNotice = 'Kit list saved.';
    state.kitsByDate.clear();
    showToast('ok', 'Saved');
    refreshKitList().catch(() => {});
    refreshKits(state.date, { preferMine: false });
  } catch (error) {
    state.pendingSave = '';
    if (isAbort(error)) {
      render();
      return;
    }
    state.formErrors = { form: error.message };
    state.settingsNotice = '';
    render();
    showFormProblem('kit-form');
  }
}

async function toggleAccess(id) {
  const person = state.access.find((row) => row.id === id);
  if (!person || state.pendingToggle) return;
  const previous = person.active;
  person.active = !previous;
  state.pendingToggle = `access:${id}`;
  state.settingsNotice = previous ? `${person.name} can no longer sign in.` : `${person.name} can sign in again.`;
  state.settingsError = '';
  render();
  try {
    await apiCall('upsertAccess', {
      id: person.id,
      name: person.name,
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
      role: person.role,
      active: person.active,
    });
  } catch (error) {
    if (!isAbort(error)) {
      person.active = previous;
      state.settingsError = error.message;
      state.settingsCode = error.code || '';
      state.settingsNotice = '';
    }
  } finally {
    state.pendingToggle = '';
    render();
  }
}

async function toggleKit(id) {
  const kit = state.allKits.find((row) => row.id === id);
  if (!kit || state.pendingToggle) return;
  const previous = kit.active;
  kit.active = !previous;
  state.pendingToggle = `kit:${id}`;
  state.settingsNotice = previous ? `${kit.name} is hidden from the kit list.` : `${kit.name} is available again.`;
  state.settingsError = '';
  state.kitsByDate.clear();
  render();
  try {
    await apiCall('upsertKit', {
      id: kit.id,
      name: kit.name,
      sortOrder: kit.sortOrder,
      notes: kit.notes || '',
      active: kit.active,
    });
    refreshKits(state.date, { preferMine: false });
  } catch (error) {
    if (!isAbort(error)) {
      kit.active = previous;
      state.settingsError = error.message;
      state.settingsCode = error.code || '';
      state.settingsNotice = '';
    }
  } finally {
    state.pendingToggle = '';
    render();
  }
}

function onClick(event) {
  if (event.target.id === 'backdrop' || event.target.classList?.contains('overlay')) {
    closeModal();
    return;
  }
  let closeDate = false;
  if (state.dateOpen) {
    const pop = document.getElementById('date-popover');
    const sheet = document.getElementById('date-sheet');
    const opener = document.getElementById('change-date');
    if (!pop?.contains(event.target) && !sheet?.contains(event.target) && !opener?.contains(event.target)) {
      state.dateOpen = false;
      closeDate = true;
    }
  }
  const accountWrap = document.querySelector('.account-menu-wrap');
  if (accountWrap && !accountWrap.contains(event.target)) setAccountMenu(false);
  const button = event.target.closest('[data-action]');
  if (!button) {
    if (closeDate) render();
    return;
  }
  const action = button.dataset.action;
  if (action === 'account-menu') {
    setAccountMenu(Boolean(document.getElementById('account-menu')?.hidden));
    return;
  }
  if (action === 'theme') {
    saveThemeChoice(button.dataset.theme);
    paintThemeToggle();
    if (closeDate) render();
    return;
  }
  if (action === 'demo') signIn(button.dataset.email);
  else if (action === 'reset-demo') resetDemo();
  else if (action === 'sign-out') signOut();
  else if (action === 'tab') setTab(button.dataset.tab);
  else if (action === 'prev-month') {
    const next = shiftMonth(state.viewYear, state.viewMonth, -1);
    state.viewYear = next.year;
    state.viewMonth = next.month;
    render();
  } else if (action === 'next-month') {
    const next = shiftMonth(state.viewYear, state.viewMonth, 1);
    state.viewYear = next.year;
    state.viewMonth = next.month;
    render();
  } else if (action === 'pick-date') setDate(button.dataset.date);
  else if (action === 'back-today') setDate(pacificDate());
  else if (action === 'close-date') {
    state.dateOpen = false;
    render();
  } else if (action === 'toggle-admin-month') {
    state.adminMonthOpen = !state.adminMonthOpen;
    render();
  } else if (action === 'go-settings-kits') {
    state.openKitForm = true;
    state.settingsPane = 'kits';
    state.settingsNotice = '';
    setTab('settings');
  } else if (action === 'check-in') checkIn();
  else if (action === 'check-out') openCheckout('checkout');
  else if (action === 'release') openCheckout('release');
  else if (action === 'modal-cancel') closeModal();
  else if (action === 'modal-confirm') confirmModal();
  else if (action === 'clear-filters') {
    state.filters = defaultFilters();
    refreshHistory();
  }   else if (action === 'load-older') {
    state.filters.span = 'all';
    state.filters.from = addDays(state.filters.from || pacificDate(), -14);
    refreshHistory();
  } else if (action === 'toggle-date') {
    state.dateOpen = !state.dateOpen;
    if (state.dateOpen && state.date) {
      const parts = splitYmd(state.date);
      state.viewYear = parts.year;
      state.viewMonth = parts.month;
    }
    render();
  } else if (action === 'select-kit') {
    const id = Number(button.dataset.id);
    const kit = state.kits.find((row) => row.id === id);
    if (!kit) return;
    if (kit.claim && kit.claim.userEmail !== state.user.email && !isAdmin()) return;
    state.selectedKitId = id;
    state.message = '';
    render();
  } else if (action === 'toggle-group') {
    const id = button.dataset.group;
    state.groupManual[id] = button.getAttribute('aria-expanded') === 'true' ? 'closed' : 'open';
    render();
  } else if (action === 'history-span') {
    applyHistorySpan(button.dataset.span);
    refreshHistory();
  } else if (action === 'toggle-mine') {
    state.filters.mineOnly = !state.filters.mineOnly;
    if (state.filters.mineOnly) state.filters.userEmail = '';
    refreshHistory();
  } else if (action === 'settings-pane') {
    captureEditorFromDom();
    state.settingsPane = button.dataset.pane === 'kits' ? 'kits' : 'people';
    render();
  } else if (action === 'refresh-kits') {
    refreshKits(state.date, { preferMine: false });
  } else if (action === 'retry-tasks') {
    for (const [id, status] of state.taskUi) {
      if (status === 'failed') state.taskUi.set(id, 'saving');
    }
    render();
    flushTasks();
  } else if (action === 'refresh-tasks') {
    refreshTasks({ force: true });
  }   else if (action === 'add-access') {
    state.openKitForm = false;
    state.editor = blankAccess();
    state.formErrors = {};
    state.settingsNotice = '';
    render();
    document.getElementById('person-name')?.focus();
  } else if (action === 'edit-access') {
    const person = state.access.find((row) => row.id === Number(button.dataset.id));
    if (!person) return;
    state.editor = { kind: 'access', ...person };
    state.formErrors = {};
    render();
    document.getElementById('person-name')?.focus();
  } else if (action === 'toggle-access') toggleAccess(Number(button.dataset.id));
  else if (action === 'add-kit') {
    state.openKitForm = false;
    state.editor = blankKit(state.allKits.length + 1);
    state.formErrors = {};
    state.settingsNotice = '';
    render();
    document.getElementById('kit-name')?.focus();
  } else if (action === 'edit-kit') {
    const kit = state.allKits.find((row) => row.id === Number(button.dataset.id));
    if (!kit) return;
    state.editor = { kind: 'kit', ...kit };
    state.formErrors = {};
    render();
    document.getElementById('kit-name')?.focus();
  } else if (action === 'toggle-kit') toggleKit(Number(button.dataset.id));
  else if (action === 'cancel-editor') {
    state.openKitForm = false;
    state.editor = null;
    state.formErrors = {};
    render();
  }
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  // Use the attribute. An input named "id" would hide form.id.
  const formId = form.getAttribute('id');
  if (formId === 'login-form') {
    signIn(new FormData(form).get('email'));
  } else if (formId === 'history-form') {
    state.filters = historyFiltersFromForm(form);
    refreshHistory();
  } else if (formId === 'access-form') {
    saveAccess(form);
  } else if (formId === 'kit-form') {
    saveKit(form);
  }
}

function onChange(event) {
  const target = event.target;
  if (target?.name === 'kit') {
    state.selectedKitId = Number(target.value);
    state.message = '';
    clearPageError();
    render();
  } else if (target?.classList?.contains('task-check')) {
    toggleTask(Number(target.dataset.taskId), target.checked);
  } else if (target?.id === 'filter-kit' || target?.id === 'filter-user') {
    const form = document.getElementById('history-form');
    if (!form) return;
    state.filters = historyFiltersFromForm(form);
    refreshHistory();
  }
}

function trapTab(event) {
  const dialog = document.getElementById('dialog');
  if (!dialog) return;
  const focusable = [...dialog.querySelectorAll('button, [href], input, select, textarea')].filter((el) => !el.disabled);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function onKeyDown(event) {
  if (state.modal) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    } else if (event.key === 'Tab') {
      trapTab(event);
    }
    return;
  }
  if (event.key === 'Escape' && state.dateOpen) {
    event.preventDefault();
    state.dateOpen = false;
    render();
    return;
  }
  if (event.target?.dataset?.date && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    setDate(addDays(event.target.dataset.date, step), { focusDay: true });
    return;
  }
  if (event.target?.getAttribute?.('role') === 'tab' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
    event.preventDefault();
    const tabs = ['checklist', 'history'].concat(isAdmin() ? ['settings'] : []);
    const index = Math.max(0, tabs.indexOf(state.tab));
    const next = event.key === 'ArrowRight'
      ? tabs[(index + 1) % tabs.length]
      : tabs[(index - 1 + tabs.length) % tabs.length];
    setTab(next, { focus: true });
  }
}

document.addEventListener('click', onClick);
document.addEventListener('submit', onSubmit);
document.addEventListener('change', onChange);
document.addEventListener('input', (event) => {
  const form = event.target?.closest?.('#kit-form, #access-form');
  if (form && state.editor) captureEditorFromDom();
  if (event.target?.id === 'history-search') {
    state.historyQuery = event.target.value;
    const results = document.getElementById('history-results');
    if (results) results.innerHTML = historyResultsHtml();
  }
});
document.addEventListener('keydown', onKeyDown);

function watchPhoneLayout() {
  const query = window.matchMedia?.('(max-width: 720px)');
  query?.addEventListener?.('change', () => {
    if (state.user) render();
  });
}

async function init() {
  applyTheme();
  watchSystemTheme(() => paintThemeToggle());
  watchPhoneLayout();
  state.config = await loadConfig();
  state.api = createClient({
    backend: state.config.backend,
    flowUrl: state.config.FLOW_URL,
    storage: window.localStorage,
    latencyMs: state.config.latencyMs,
    debug: state.config.debug,
  });
  document.title = 'Sign in · Daily Readiness Checklist';
  const plan = planSessionRestore(readSavedSession());
  if (plan.action === 'revalidate') {
    state.ready = false;
    state.user = null;
    render();
    try {
      const user = acceptedLoginUser(await apiCall('login', { email: plan.email }));
      if (!user) {
        const error = new Error('Could not sign in.');
        error.code = 'BAD_RESPONSE';
        throw error;
      }
      state.ready = true;
      enterApp(user);
    } catch (error) {
      state.ready = true;
      signOut();
      state.notice = '';
      state.error = error.message || 'Could not sign in.';
      state.errorCode = error.code || '';
      state.loginEmail = plan.email;
      render();
    }
    return;
  }
  state.ready = true;
  render();
}

function readSavedSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

init();
