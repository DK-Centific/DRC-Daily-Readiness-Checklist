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
import { historyEvents } from './history-events.js';
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
  formatLongDate,
  formatMonthYear,
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
};

let kitsSerial = 0;
let historySerial = 0;
let settingsSerial = 0;
let taskSeq = 0;
let taskFetchSerial = 0;
let confirmedTaskIds = null;

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
  return `<div class="banner ${kind}" role="${kind === 'err' ? 'alert' : 'status'}">${esc(message)}${code ? `<span class="code">${esc(code)}</span>` : ''}</div>`;
}

async function apiCall(action, params = {}, options = {}) {
  const result = await state.api.call({
    action,
    actor: state.user?.email || '',
    ...params,
  }, options);
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
  const range = defaultHistoryRange(today);
  return {
    userEmail: '',
    kitId: '',
    from: range.from,
    to: range.to,
    mineOnly: !isAdminRole(user?.role),
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
  const config = {
    backend: 'mock',
    FLOW_URL: '',
    ...(window.DRC_CONFIG || {}),
  };
  try {
    const response = await fetch('config.local.js', { cache: 'no-store' });
    if (response.ok) {
      const text = await response.text();
      new Function(text)();
      if (window.DRC_CONFIG) Object.assign(config, window.DRC_CONFIG);
    }
  } catch {
    config._loadError = 'Could not read config.local.js.';
  }
  const params = new URLSearchParams(window.location.search);
  const override = params.get('backend');
  if (override === 'mock' || override === 'pa') config.backend = override;
  else config.backend = config.backend === 'pa' ? 'pa' : 'mock';
  config.FLOW_URL = String(config.FLOW_URL || '').trim();
  const latency = Number(params.get('latency'));
  config.latencyMs = Number.isFinite(latency) && latency > 0 ? latency : 0;
  config.debug = params.get('debug') === '1';
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

function render() {
  captureEditorFromDom();
  document.body.classList.toggle('modal-open', Boolean(state.modal));
  if (!state.ready) {
    app.innerHTML = '<main class="login-screen" id="main"><p>Loading checklist…</p></main>';
    return;
  }
  if (!state.user) {
    app.innerHTML = renderLogin();
    return;
  }
  const shell = document.getElementById('shell');
  const typingHistory = document.activeElement?.closest?.('#history-form');
  if (shell && typingHistory && state.tab === 'history' && document.getElementById('history-results')) {
    const note = document.getElementById('refresh-note');
    if (note) note.hidden = !isRefreshing();
    document.getElementById('history-results').innerHTML = historyResultsHtml();
    syncModal();
    return;
  }
  if (!shell) {
    app.innerHTML = renderShell();
    syncModal();
    return;
  }
  const panel = document.getElementById('panel');
  panel.innerHTML = `${refreshNote()}${state.tab === 'history' ? renderHistory() : state.tab === 'settings' ? renderSettings() : renderChecklist()}`;
  panel.setAttribute('aria-labelledby', `tab-${state.tab}`);
  document.querySelectorAll('#shell [data-action="tab"]').forEach((button) => {
    const on = button.dataset.tab === state.tab;
    button.setAttribute('aria-selected', String(on));
    button.tabIndex = on ? 0 : -1;
  });
  syncModal();
}

function renderLogin() {
  const practice = state.api?.mode !== 'pa';
  const demos = practice ? `
    <div class="demo">
      <p class="hint">Practice sign-in (sample people already on the access list):</p>
      <button type="button" class="secondary" data-action="demo" data-email="jane.doe@centific.com">Sign in as Jane Doe</button>
      <button type="button" class="secondary" data-action="demo" data-email="brian.leong@centific.com">Sign in as Brian Leong (admin)</button>
      <button type="button" class="secondary" data-action="demo" data-email="thaingan.tran@centific.com">Sign in as Annie Tran (admin)</button>
      <button type="button" class="secondary" data-action="demo" data-email="admin-drc">Sign in as admin-drc</button>
      <button type="button" class="secondary" data-action="reset-demo">Reset sample data</button>
    </div>` : '';
  return `
    <main class="login-screen" id="main">
      <section class="card login-card" aria-labelledby="login-title">
        <img class="login-logo" src="assets/centific-logo.png" width="112" height="112" alt="Centific">
        <p class="eyebrow">Centific · Data Collection</p>
        <h1 id="login-title">Daily Readiness Checklist</h1>
        <p>Sign in with your Centific ID. Only people on the access list can continue.</p>
        ${banner('err', state.error, state.errorCode)}
        ${banner('info', state.notice)}
        <form id="login-form" class="stack" method="post" action="#">
          <div>
            <label for="email">Centific ID</label>
            <input id="email" name="email" type="text" autocomplete="username" spellcheck="false" required placeholder="firstName.lastName@centific.com" value="${esc(state.loginEmail)}">
          </div>
          <button class="primary" type="submit" ${state.signingIn ? 'disabled' : ''}>Sign in</button>
        </form>
        <p class="hint mode-note">There is no password in this version. Access is the email list an admin keeps.</p>
        ${demos}
        <p class="mode-note">${practice ? 'Practice mode: sample data stays in this browser.' : 'Connected mode: this page talks to the shared checklist service.'}</p>
      </section>
    </main>`;
}

function renderShell() {
  const tabs = [
    ['checklist', 'Checklist'],
    ['history', 'History'],
  ];
  if (isAdmin()) tabs.push(['settings', 'Settings']);
  const tabButtons = tabs.map(([id, label]) => `
    <button type="button" role="tab" id="tab-${id}" aria-selected="${state.tab === id}" aria-controls="panel-${id}" tabindex="${state.tab === id ? '0' : '-1'}" data-action="tab" data-tab="${id}">${label}</button>
  `).join('');
  const panel = state.tab === 'history'
    ? renderHistory()
    : state.tab === 'settings'
      ? renderSettings()
      : renderChecklist();
  return `
    <div class="shell" id="shell">
      <header class="topbar">
        <div class="brand-lockup">
          <img class="logo-mark" src="assets/centific-logo.png" width="48" height="48" alt="Centific">
          <div class="brand-text">
            <p class="eyebrow">Centific · Data Collection</p>
            <h1 class="brand">Daily Readiness Checklist</h1>
          </div>
        </div>
        <div class="who">
          <p>Signed in as <strong>${esc(state.user.name)}</strong></p>
          <button type="button" class="ghost" data-action="sign-out">Sign out</button>
        </div>
      </header>
      ${isAdmin() ? '<p class="admin-banner">Admin View</p>' : ''}
      <div class="tabs" role="tablist" aria-label="Sections">${tabButtons}</div>
      <div role="tabpanel" id="panel" aria-labelledby="tab-${state.tab}" tabindex="0">
        ${refreshNote()}
        ${panel}
      </div>
      <p class="footer-note">${state.api.mode === 'pa' ? 'Connected mode: changes are sent to the shared checklist service.' : 'Practice mode: sample data stays in this browser.'} Times are Pacific time (PT).</p>
    </div>`;
}

function renderChecklist() {
  const today = pacificDate();
  const cells = calendarCells(state.viewYear, state.viewMonth);
    const tabStop = cells.includes(state.date)
      ? state.date
      : cells.find((ymd) => splitYmd(ymd).month === state.viewMonth);
    const days = cells.map((ymd) => {
    const { day, month } = splitYmd(ymd);
    const outside = month !== state.viewMonth;
    const selected = ymd === state.date;
    const isToday = ymd === today;
    const classes = ['day', outside ? 'outside' : '', selected ? 'selected' : '', isToday ? 'today' : ''].filter(Boolean).join(' ');
    const label = `${formatLongDate(ymd)}${isToday ? ', today' : ''}${selected ? ', selected' : ''}`;
    return `<button type="button" class="${classes}" id="day-${ymd}" data-action="pick-date" data-date="${ymd}" aria-pressed="${selected}" aria-label="${esc(label)}" tabindex="${ymd === tabStop ? '0' : '-1'}">${day}</button>`;
  }).join('');
  const quick = [
    ['today', 'Today', today],
    ['yesterday', 'Yesterday', addDays(today, -1)],
    ['lastweek', 'Last week', addDays(today, -7)],
  ].map(([id, label, ymd]) => `
    <button type="button" data-action="quick-date" data-which="${id}" aria-pressed="${state.date === ymd}">${label}</button>
  `).join('');

  return `
    <div class="workspace">
      <section class="card" aria-labelledby="cal-heading">
        <h2 id="cal-heading" class="visually-hidden">Date</h2>
        <div class="calendar-head">
          <button type="button" class="icon-btn" data-action="prev-month" aria-label="Previous month">‹</button>
          <div class="month-label">${esc(formatMonthYear(state.viewYear, state.viewMonth))}</div>
          <button type="button" class="icon-btn" data-action="next-month" aria-label="Next month">›</button>
        </div>
        <div class="weekdays">${WEEKDAYS.map((day) => `<span>${day}</span>`).join('')}</div>
        <div class="days">${days}</div>
        <div class="quick">${quick}</div>
      </section>
      <div class="stack">
        ${banner('err', state.error, state.errorCode)}
        ${banner('ok', state.message)}
        <section class="card user-section" aria-labelledby="user-heading">
          <h2 id="user-heading">Person</h2>
          <div class="names">
            <div>
              <label for="first-name">First name</label>
              <input id="first-name" type="text" readonly value="${esc(state.user.firstName)}">
            </div>
            <div>
              <label for="last-name">Last name</label>
              <input id="last-name" type="text" readonly value="${esc(state.user.lastName)}">
            </div>
          </div>
          <p class="email-line"><span class="hint">Centific ID</span><br><strong>${esc(state.user.email)}</strong></p>
        </section>
        <section class="card" aria-labelledby="kit-heading">
          <h2 id="kit-heading">Kit</h2>
          ${banner('err', state.kitsError, state.kitsCode)}
          ${state.kits.length ? renderKitPicker() : renderEmptyKits()}
          ${renderCheckButton()}
        </section>
        ${renderTasks()}
      </div>
    </div>`;
}

function renderEmptyKits() {
  if (state.kitsError) return '';
  if (!state.kitsLoaded) return '<p class="refreshing" role="status">Refreshing…</p>';
  if (isAdmin()) {
    return `<p>No kits set up yet.</p><p><button type="button" class="primary" data-action="go-settings-kits">Add kits in Settings</button></p>`;
  }
  return '<p>No kits set up yet, ask a DRC admin.</p>';
}

function kitStatus(kit) {
  const claim = kit.claim;
  if (claim && claim.userEmail === state.user.email) {
    return `<span class="lock-line">${lockIcon()} Locked for others. Checked in by you.</span>`;
  }
  if (claim) {
    return `<span class="lock-line">${lockIcon()} Locked. Claimed by ${esc(claim.userName)}.</span>`;
  }
  if (kit.lastCheckedOut) {
    return `<span class="kit-status">Available. Last checked out by ${esc(kit.lastCheckedOut.userName)} at ${esc(formatPtDateTime(kit.lastCheckedOut.checkOutAt))}.</span>`;
  }
  return '<span class="kit-status">Available.</span>';
}

function renderKitPicker() {
  const options = state.kits.map((kit) => `
    <label class="kit-option">
      <input type="radio" name="kit" value="${kit.id}" ${kit.id === state.selectedKitId ? 'checked' : ''}>
      <span>
        <span class="kit-name">${esc(kit.name)}</span>
        ${kitStatus(kit)}
      </span>
    </label>
  `).join('');
  return `<div class="kit-options" role="radiogroup" aria-labelledby="kit-heading">${options}</div>`;
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
  const checkDisabled = button.disabled || (button.action === 'check-in' && state.pendingCheckIn);
  const release = button.release
    ? `<button type="button" class="secondary" id="release-button" data-action="release" ${state.pendingCheckOut ? 'disabled' : ''}>Release this kit</button>`
    : '';
  return `
    <p id="kit-reason" class="hint">${esc(button.reason || '')}</p>
    <div class="quick">
      <button type="button" class="primary" id="check-button" data-action="${button.action}" ${checkDisabled ? 'disabled' : ''}>${esc(button.label)}</button>
      ${release}
    </div>`;
}

function renderTasks() {
  const kit = selectedKit();
  const claim = myClaim(kit);
  if (!kit) return '';
  if (!claim) {
    const text = kit.claim
      ? 'Tasks stay with the person who has this kit checked in.'
      : 'Check in to this kit to see the task list.';
    return `<section class="card" aria-labelledby="tasks-heading"><h2 id="tasks-heading">Tasks</h2><p>${esc(text)}</p></section>`;
  }
  if (!state.tasks.length) {
    return `<section class="card" aria-labelledby="tasks-heading"><div class="row-between"><h2 id="tasks-heading">Tasks</h2>${refreshTasksButton()}</div>${banner('err', state.tasksError, state.tasksCode)}<p>${state.loading.tasks ? 'Refreshing…' : 'No tasks are set up yet.'}</p></section>`;
  }
  const done = new Set(claim.completedTaskIds || []);
  const completed = state.tasks.filter((task) => done.has(task.id)).length;
  const total = state.tasks.length;
  const width = total ? Math.round((completed / total) * 100) : 0;
  const items = state.tasks.map((task) => `
    <li class="task ${done.has(task.id) ? 'done' : ''}">
      <input class="task-check" id="task-${task.id}" data-task-id="${task.id}" type="checkbox" ${done.has(task.id) ? 'checked' : ''}>
      <label for="task-${task.id}">${esc(task.title)}</label>
    </li>
  `).join('');
  return `
    <section class="card" aria-labelledby="tasks-heading">
      <div class="row-between">
        <h2 id="tasks-heading">Tasks</h2>
        <div class="quick">
          <p id="task-progress"><strong>${completed}/${total}</strong></p>
          ${refreshTasksButton()}
        </div>
      </div>
      ${banner('err', state.tasksError, state.tasksCode)}
      <div class="bar" aria-hidden="true"><span style="width:${width}%"></span></div>
      <ul class="tasks">${items}</ul>
    </section>`;
}

function refreshTasksButton() {
  return `<button type="button" class="secondary" data-action="refresh-tasks" ${state.loading.tasks ? 'disabled' : ''}>Refresh tasks</button>`;
}

function personLabel(name, email) {
  const who = name || email || 'Unknown';
  return email ? `${who} (${email})` : who;
}

function renderHistory() {
  const kitOptions = [...state.kitChoices.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => `<option value="${id}" ${String(state.filters.kitId) === String(id) ? 'selected' : ''}>${esc(name)}</option>`)
    .join('');
  const mine = Boolean(state.filters.mineOnly);
  const people = personChoices()
    .map(([email, name]) => `<option value="${esc(email)}" ${state.filters.userEmail === email ? 'selected' : ''}>${esc(name)}</option>`)
    .join('');
  const events = historyEvents(state.history);
  const cards = events.map((event) => {
    const claimed = event.kind === 'claimed';
    const badge = claimed
      ? `<span class="badge claimed">${lockIcon()} Claimed</span>`
      : '<span class="badge unclaimed">Unclaimed</span>';
    const who = claimed
      ? `Claimed by ${personLabel(event.name, event.email)}`
      : `Unclaimed by ${personLabel(event.name, event.email)}`;
    const when = event.at ? formatPtDateTime(event.at) : 'Time not recorded';
    const tasks = claimed
      ? ''
      : `<p class="meta">Tasks completed ${esc(event.tasksCompleted)}/${esc(event.tasksTotal)}</p>`;
    return `
      <li class="history-card">
        <div class="row-between">
          <h3>${esc(event.kitName)}</h3>
          ${badge}
        </div>
        <p class="who-line">${esc(who)}</p>
        <p class="meta">Claim date ${esc(formatYmdLabel(event.claimDate))}</p>
        <p class="meta">at ${esc(when)}</p>
        ${tasks}
      </li>`;
  }).join('');
  return `
    <section class="card" aria-labelledby="history-heading">
      <h2 id="history-heading">Kit log</h2>
      <p class="hint">Newest first. Each claim and each release is its own line.</p>
      ${banner('err', state.historyError, state.historyCode)}
      ${state.historyHint ? `<p class="hint">${esc(state.historyHint)}</p>` : ''}
      <form id="history-form" class="filters" method="post" action="#">
        <div>
          <label for="filter-user">Person</label>
          <select id="filter-user" name="userEmail" ${mine ? 'disabled' : ''}>
            <option value="">Everyone</option>
            ${people}
          </select>
        </div>
        <div>
          <label for="filter-kit">Kit</label>
          <select id="filter-kit" name="kitId">
            <option value="">All kits</option>
            ${kitOptions}
          </select>
        </div>
        <div>
          <label for="filter-from">From date</label>
          <input id="filter-from" name="from" type="date" value="${esc(state.filters.from)}">
        </div>
        <div>
          <label for="filter-to">To date</label>
          <input id="filter-to" name="to" type="date" value="${esc(state.filters.to)}">
        </div>
        <div class="check-row">
          <input id="filter-mine" name="mineOnly" type="checkbox" ${mine ? 'checked' : ''}>
          <label for="filter-mine">Mine only</label>
        </div>
        <div class="actions">
          <button class="primary" type="submit">Show history</button>
          <button class="secondary" type="button" data-action="clear-filters">Clear</button>
          <button class="secondary" type="button" data-action="load-older">Load older</button>
        </div>
      </form>
      <p class="hint">Showing ${esc(formatYmdLabel(state.filters.from))} through ${esc(formatYmdLabel(state.filters.to))}.</p>
      <div id="history-results">${historyResultsHtml(cards)}</div>
    </section>`;
}

function historyResultsHtml(cards = null) {
  const markup = cards == null
    ? historyEvents(state.history).map(() => '').join('')
    : cards;
  if (cards == null) return historyCardsHtml();
  if (!markup) {
    if (state.historyError) return '';
    if (!state.historyReady || state.loading.history) return '<p class="refreshing" role="status">Refreshing…</p>';
    return '<p>No check-ins for these filters.</p>';
  }
  return `<ul class="history-list">${markup}</ul>`;
}

function historyCardsHtml() {
  const events = historyEvents(state.history);
  const cards = events.map((event) => {
    const claimed = event.kind === 'claimed';
    const badge = claimed
      ? `<span class="badge claimed">${lockIcon()} Claimed</span>`
      : '<span class="badge unclaimed">Unclaimed</span>';
    const who = claimed
      ? `Claimed by ${personLabel(event.name, event.email)}`
      : `Unclaimed by ${personLabel(event.name, event.email)}`;
    const when = event.at ? formatPtDateTime(event.at) : 'Time not recorded';
    const tasks = claimed
      ? ''
      : `<p class="meta">Tasks completed ${esc(event.tasksCompleted)}/${esc(event.tasksTotal)}</p>`;
    return `
      <li class="history-card">
        <div class="row-between">
          <h3>${esc(event.kitName)}</h3>
          ${badge}
        </div>
        <p class="who-line">${esc(who)}</p>
        <p class="meta">Claim date ${esc(formatYmdLabel(event.claimDate))}</p>
        <p class="meta">at ${esc(when)}</p>
        ${tasks}
      </li>`;
  }).join('');
  return historyResultsHtml(cards);
}

function renderSettings() {
  if (!isAdmin()) return '<p>Settings are for admins.</p>';
  return `
    ${banner('err', state.settingsError, state.settingsCode)}
    ${banner('ok', state.settingsNotice)}
    ${renderAccessEditor()}
    ${renderKitEditor()}
    <section class="card section-gap">
      <h2>Practice data</h2>
      ${state.api.mode === 'mock'
        ? '<button type="button" class="secondary" data-action="reset-demo">Reset sample data</button><p class="hint">This clears practice check-ins in this browser and restores the sample people, kits, and tasks.</p>'
        : '<p>Kit and access changes here are sent to the shared checklist service.</p>'}
    </section>`;
}

function renderAccessEditor() {
  const editing = state.editor?.kind === 'access' ? state.editor : null;
  const activeAdmins = state.access.filter((person) => person.active && isAdminRole(person.role)).length;
  const rows = state.access.map((person) => {
    const onlyAdmin = person.active && isAdminRole(person.role) && activeAdmins <= 1;
    const self = person.email === state.user.email && person.active;
    const blocked = onlyAdmin || self;
    const why = self ? 'You are signed in with this account.' : 'At least one admin must stay active.';
    return `
      <li class="manage-card">
        <div class="row-between">
          <h3>${esc(person.name)}</h3>
          <div class="quick">
            <button type="button" class="secondary" data-action="edit-access" data-id="${person.id}">Edit</button>
            <button type="button" class="secondary" data-action="toggle-access" data-id="${person.id}" ${blocked || state.pendingToggle === `access:${person.id}` ? 'disabled' : ''}>${person.active ? 'Deactivate' : 'Activate'}</button>
          </div>
        </div>
        <p class="meta">${esc(person.email)}</p>
        <div class="chips">
          <span class="chip ${isAdminRole(person.role) ? 'admin' : ''}">${esc(roleLabel(person.role))}</span>
          <span class="chip ${person.active ? 'on' : 'off'}">${person.active ? 'Active' : 'Inactive'}</span>
        </div>
        ${blocked && person.active ? `<p class="hint">${esc(why)}</p>` : ''}
      </li>`;
  }).join('');
  const form = editing ? `
    <form id="access-form" class="form-grid" method="post" action="#" novalidate>
      ${fieldError('access-form', state.formErrors.form)}
      <input type="hidden" name="recordId" value="${editing.id ?? ''}">
      <div>
        <label for="person-name">Name</label>
        <input id="person-name" name="name" type="text" value="${esc(editing.name)}" ${invalidAttr('person-name', state.formErrors.name)}>
        ${fieldError('person-name', state.formErrors.name)}
      </div>
      <div>
        <label for="person-email">Email</label>
        <input id="person-email" name="email" type="text" autocomplete="off" value="${esc(editing.email)}" placeholder="firstName.lastName@centific.com" ${invalidAttr('person-email', state.formErrors.email)}>
        ${fieldError('person-email', state.formErrors.email)}
      </div>
      <div class="names">
        <div>
          <label for="person-first">First name</label>
          <input id="person-first" name="firstName" type="text" value="${esc(editing.firstName)}">
        </div>
        <div>
          <label for="person-last">Last name</label>
          <input id="person-last" name="lastName" type="text" value="${esc(editing.lastName)}">
        </div>
      </div>
      <div>
        <label for="person-role">Role</label>
        <select id="person-role" name="role">
          <option value="User" ${isAdminRole(editing.role) ? '' : 'selected'}>User</option>
          <option value="Admin" ${isAdminRole(editing.role) ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="check-row">
        <input id="person-active" name="active" type="checkbox" ${editing.active ? 'checked' : ''}>
        <label for="person-active">Active</label>
      </div>
      <div class="quick">
        <button class="primary" type="submit" ${state.pendingSave === 'access' ? 'disabled' : ''}>${savingButton('Save person', state.pendingSave === 'access')}</button>
        <button class="secondary" type="button" data-action="cancel-editor">Cancel</button>
      </div>
    </form>` : '';
  return `
    <section class="card" aria-labelledby="access-heading">
      <div class="manage-head">
        <h2 id="access-heading">Who can sign in</h2>
        <button type="button" class="primary" data-action="add-access">Add person</button>
      </div>
      <p class="hint">Name, email, role (Admin or User), and whether they can sign in.</p>
      ${form}
      ${state.access.length ? `<ul class="manage-list">${rows}</ul>` : '<p>No one is on the access list yet.</p>'}
    </section>`;
}

function renderKitEditor() {
  const editing = state.editor?.kind === 'kit' ? state.editor : null;
  const rows = state.allKits.map((kit) => `
    <li class="manage-card">
      <div class="row-between">
        <h3>${esc(kit.name)}</h3>
        <div class="quick">
          <button type="button" class="secondary" data-action="edit-kit" data-id="${kit.id}">Edit</button>
          <button type="button" class="secondary" data-action="toggle-kit" data-id="${kit.id}" ${state.pendingToggle === `kit:${kit.id}` ? 'disabled' : ''}>${kit.active ? 'Deactivate' : 'Activate'}</button>
        </div>
      </div>
      <div class="chips">
        <span class="chip">Order ${esc(kit.sortOrder)}</span>
        <span class="chip ${kit.active ? 'on' : 'off'}">${kit.active ? 'Active' : 'Inactive'}</span>
      </div>
      ${kit.notes ? `<p class="meta">${esc(kit.notes)}</p>` : ''}
    </li>
  `).join('');
  const form = editing ? `
    <form id="kit-form" class="form-grid" method="post" action="#" novalidate>
      ${fieldError('kit-form', state.formErrors.form)}
      <input type="hidden" name="recordId" value="${editing.id ?? ''}">
      <div>
        <label for="kit-name">Kit name</label>
        <input id="kit-name" name="name" type="text" value="${esc(editing.name)}" ${invalidAttr('kit-name', state.formErrors.name)}>
        ${fieldError('kit-name', state.formErrors.name)}
      </div>
      <div>
        <label for="kit-order">Sort order</label>
        <input id="kit-order" name="sortOrder" type="text" inputmode="numeric" value="${esc(editing.sortOrder)}" ${invalidAttr('kit-order', state.formErrors.sortOrder)}>
        ${fieldError('kit-order', state.formErrors.sortOrder)}
      </div>
      <div>
        <label for="kit-notes">Notes</label>
        <textarea id="kit-notes" name="notes">${esc(editing.notes || '')}</textarea>
      </div>
      <div class="check-row">
        <input id="kit-active" name="active" type="checkbox" ${editing.active ? 'checked' : ''}>
        <label for="kit-active">Active</label>
      </div>
      <div class="quick">
        <button class="primary" type="submit" ${state.pendingSave === 'kit' ? 'disabled' : ''}>${savingButton('Save kit', state.pendingSave === 'kit')}</button>
        <button class="secondary" type="button" data-action="cancel-editor">Cancel</button>
      </div>
    </form>` : '';
  return `
    <section class="card section-gap" aria-labelledby="kits-heading">
      <div class="manage-head">
        <h2 id="kits-heading">Kits</h2>
        <button type="button" class="primary" data-action="add-kit">Add kit</button>
      </div>
      ${form}
      ${state.allKits.length ? `<ul class="manage-list">${rows}</ul>` : '<p id="kits-empty">No kits yet. Add a kit here so people can check in. Each kit needs a name, whether it is active, and a sort order.</p>'}
    </section>`;
}

function renderModal() {
  const release = state.modal.type === 'release';
  const body = release
    ? 'Release this kit so someone else can check in for this date?'
    : 'Please ensure you have completed the task.';
  return `
    <div class="backdrop" id="backdrop">
      <div class="dialog" id="dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-body">
        <h2 id="modal-title">${release ? 'Release kit' : 'Check out'}</h2>
        <p id="modal-body">${esc(body)}</p>
        <div class="dialog-actions">
          <button type="button" class="secondary" id="modal-cancel" data-action="modal-cancel">Cancel</button>
          <button type="button" class="${release ? 'danger' : 'primary'}" id="modal-confirm" data-action="modal-confirm">Confirm</button>
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
    const user = await apiCall('login', { email: state.loginEmail });
    enterApp(user);
  } catch (error) {
    state.signingIn = false;
    state.error = error.message;
    state.errorCode = error.code || '';
    render();
  }
}

function enterApp(user) {
  state.user = user;
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
  state.filters = defaultFilters(user);
  rememberPerson(user.email, user.name);
  confirmedTaskIds = null;
  taskFlush.cancel();
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
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
  state.date = ymd;
  const parts = splitYmd(ymd);
  state.viewYear = parts.year;
  state.viewMonth = parts.month;
  state.message = '';
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
  if (!kit || kit.claim || state.pendingCheckIn) return;
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
  } catch (error) {
    if (!isAbort(error)) {
      storeKits(date, snapshot);
      state.error = error.message;
      state.errorCode = error.code || '';
      state.message = '';
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
  if (!kit?.claim || kit.claim.pending) return;
  state.modal = {
    type,
    claimId: kit.claim.claimId,
    kitName: kit.name,
    completedTaskIds: kit.claim.completedTaskIds || [],
    returnId: type === 'release' ? 'release-button' : 'check-button',
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
  if (!patchTaskView(taskId)) render();
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
  } catch (error) {
    if (isAbort(error) || serial !== taskSeq) return;
    claim.completedTaskIds = rollback;
    confirmedTaskIds = [...rollback];
    state.tasksError = error.message;
    state.tasksCode = error.code || '';
    render();
  }
}

function historyFiltersFromForm(form) {
  const data = new FormData(form);
  const mineOnly = Boolean(form.querySelector('#filter-mine')?.checked);
  const today = pacificDate();
  const range = defaultHistoryRange(today);
  return {
    userEmail: mineOnly ? '' : String(data.get('userEmail') || ''),
    kitId: String(data.get('kitId') || ''),
    from: String(data.get('from') || '') || range.from,
    to: String(data.get('to') || '') || range.to,
    mineOnly,
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
    render();
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
    render();
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
  if (event.target.id === 'backdrop') {
    closeModal();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
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
  else if (action === 'quick-date') {
    const today = pacificDate();
    const which = button.dataset.which;
    const ymd = which === 'today' ? today : which === 'yesterday' ? addDays(today, -1) : addDays(today, -7);
    setDate(ymd);
  } else if (action === 'go-settings-kits') {
    state.openKitForm = true;
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
  } else if (action === 'load-older') {
    state.filters.from = addDays(state.filters.from || pacificDate(), -14);
    refreshHistory();
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
  } else if (target?.id === 'filter-mine') {
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
  if (!form || !state.editor) return;
  captureEditorFromDom();
});
document.addEventListener('keydown', onKeyDown);

async function init() {
  state.config = await loadConfig();
  state.api = createClient({
    backend: state.config.backend,
    flowUrl: state.config.FLOW_URL,
    storage: window.localStorage,
    latencyMs: state.config.latencyMs,
    debug: state.config.debug,
  });
  document.title = 'Sign in · Daily Readiness Checklist';
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    saved = null;
  }
  state.ready = true;
  if (saved?.email && saved?.name) {
    enterApp(saved);
    apiCall('login', { email: saved.email }).then((user) => {
      if (state.user?.email !== user.email) return;
      state.user = user;
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch { /* ignore */ }
    }).catch((error) => {
      if (state.user?.email !== saved.email) return;
      signOut();
      state.error = error.message;
      state.errorCode = error.code || '';
      render();
    });
    return;
  }
  render();
}

init();
