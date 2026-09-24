import { createClient } from './api.js';
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
  filters: { userEmail: '', kitId: '', from: '', to: '' },
  access: [],
  allKits: [],
  settingsError: '',
  settingsCode: '',
  settingsNotice: '',
  editor: null,
  modal: null,
  busy: false,
  kitChoices: new Map(),
};

let loadSerial = 0;

const app = document.getElementById('app');

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
  return state.user?.role === 'Admin';
}

function banner(kind, message, code) {
  if (!message) return '';
  return `<div class="banner ${kind}" role="${kind === 'err' ? 'alert' : 'status'}">${esc(message)}${code ? `<span class="code">${esc(code)}</span>` : ''}</div>`;
}

async function apiCall(action, params = {}) {
  const result = await state.api.call({
    action,
    actor: state.user?.email || '',
    ...params,
  });
  if (!result || result.ok !== true) {
    const error = new Error((result && result.error) || 'Something went wrong.');
    error.code = result && result.code;
    throw error;
  }
  return result.data;
}

function rememberKit(id, name) {
  if (id == null || !name) return;
  state.kitChoices.set(Number(id), name);
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
  const override = new URLSearchParams(window.location.search).get('backend');
  if (override === 'mock' || override === 'pa') config.backend = override;
  else config.backend = config.backend === 'pa' ? 'pa' : 'mock';
  config.FLOW_URL = String(config.FLOW_URL || '').trim();
  return config;
}

function render() {
  document.body.classList.toggle('modal-open', Boolean(state.modal));
  if (!state.ready) {
    app.innerHTML = '<main class="login-screen" id="main"><p>Loading checklist…</p></main>';
    return;
  }
  app.innerHTML = state.user ? renderShell() : renderLogin();
  if (state.modal) {
    const dialog = document.getElementById('dialog');
    if (dialog && !dialog.contains(document.activeElement)) {
      document.getElementById('modal-cancel')?.focus();
    }
  }
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
          <button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>Sign in</button>
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
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Centific · Data Collection</p>
          <h1 class="brand">Daily Readiness Checklist</h1>
        </div>
        <div class="who">
          <p>Signed in as <strong>${esc(state.user.name)}</strong></p>
          <button type="button" class="ghost" data-action="sign-out">Sign out</button>
        </div>
      </header>
      ${isAdmin() ? '<p class="admin-banner">Admin View</p>' : ''}
      <div class="tabs" role="tablist" aria-label="Sections">${tabButtons}</div>
      <div role="tabpanel" id="panel-${state.tab}" aria-labelledby="tab-${state.tab}" tabindex="0">
        ${panel}
      </div>
      <p class="footer-note">${state.api.mode === 'pa' ? 'Connected mode: changes are sent to the shared checklist service.' : 'Practice mode: sample data stays in this browser.'} Times are Pacific time (PT).</p>
    </div>
    ${state.modal ? renderModal() : ''}`;
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
          ${state.kits.length ? renderKitPicker() : (state.kitsError ? '' : '<p>No kits are available.</p>')}
          ${renderCheckButton()}
        </section>
        ${renderTasks()}
      </div>
    </div>`;
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
    return { label: 'Check out', action: 'check-out', disabled: false, reason: 'This kit is locked for other people until you check out.' };
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
  const release = button.release ? `<button type="button" class="secondary" id="release-button" data-action="release">Release this kit</button>` : '';
  return `
    <p id="kit-reason" class="hint">${esc(button.reason || '')}</p>
    <div class="quick">
      <button type="button" class="primary" id="check-button" data-action="${button.action}" ${button.disabled || state.busy ? 'disabled' : ''}>${esc(button.label)}</button>
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
  if (state.tasksError) {
    return `<section class="card" aria-labelledby="tasks-heading"><h2 id="tasks-heading">Tasks</h2>${banner('err', state.tasksError, state.tasksCode)}</section>`;
  }
  if (!state.tasks.length) {
    return `<section class="card" aria-labelledby="tasks-heading"><h2 id="tasks-heading">Tasks</h2><p>No tasks are set up yet.</p></section>`;
  }
  const done = new Set(claim.completedTaskIds || []);
  const completed = state.tasks.filter((task) => done.has(task.id)).length;
  const total = state.tasks.length;
  const width = total ? Math.round((completed / total) * 100) : 0;
  const items = state.tasks.map((task) => `
    <li class="task ${done.has(task.id) ? 'done' : ''}">
      <input class="task-check" id="task-${task.id}" data-task-id="${task.id}" type="checkbox" ${done.has(task.id) ? 'checked' : ''} ${state.busy ? 'disabled' : ''}>
      <label for="task-${task.id}">${esc(task.title)}</label>
    </li>
  `).join('');
  return `
    <section class="card" aria-labelledby="tasks-heading">
      <div class="row-between">
        <h2 id="tasks-heading">Tasks</h2>
        <p id="task-progress"><strong>${completed}/${total}</strong></p>
      </div>
      <div class="bar" aria-hidden="true"><span style="width:${width}%"></span></div>
      <ul class="tasks">${items}</ul>
    </section>`;
}

function renderHistory() {
  const kitOptions = [...state.kitChoices.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => `<option value="${id}" ${String(state.filters.kitId) === String(id) ? 'selected' : ''}>${esc(name)}</option>`)
    .join('');
  const userFilter = isAdmin() ? `
    <div>
      <label for="filter-user">Person</label>
      <select id="filter-user" name="userEmail">
        <option value="">Everyone</option>
        ${state.access.map((person) => `<option value="${esc(person.email)}" ${state.filters.userEmail === person.email ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}
      </select>
    </div>` : '';
  const cards = state.history.map((row) => `
    <li class="history-card">
      <h3>${esc(row.kitName)}</h3>
      <p class="meta">${esc(formatYmdLabel(row.claimDate))}${isAdmin() ? ` · ${esc(row.userName)}` : ''}</p>
      <dl class="facts">
        <div><dt>Check-in (PT)</dt><dd>${esc(formatPtDateTime(row.checkInAt))}</dd></div>
        <div><dt>Check-out (PT)</dt><dd>${row.checkOutAt ? esc(formatPtDateTime(row.checkOutAt)) : 'Still checked in'}</dd></div>
        <div><dt>Tasks completed</dt><dd>${esc(row.tasksCompleted)}/${esc(row.tasksTotal)}</dd></div>
        <div><dt>Status</dt><dd>${row.status === 'CheckedOut' ? 'Checked out' : 'Checked in'}</dd></div>
      </dl>
    </li>
  `).join('');
  const empty = state.historyError
    ? ''
    : '<p>No check-ins for these filters.</p>';
  return `
    <section class="card" aria-labelledby="history-heading">
      <h2 id="history-heading">${isAdmin() ? 'History for everyone' : 'Your history'}</h2>
      ${banner('err', state.historyError, state.historyCode)}
      <form id="history-form" class="filters" method="post" action="#">
        ${userFilter}
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
        <div class="actions">
          <button class="primary" type="submit">Show history</button>
          <button class="secondary" type="button" data-action="clear-filters">Clear</button>
        </div>
      </form>
      ${state.history.length ? `<ul class="history-list">${cards}</ul>` : empty}
    </section>`;
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
  const activeAdmins = state.access.filter((person) => person.active && person.role === 'Admin').length;
  const rows = state.access.map((person) => {
    const onlyAdmin = person.active && person.role === 'Admin' && activeAdmins <= 1;
    const self = person.email === state.user.email && person.active;
    const blocked = onlyAdmin || self;
    const why = self ? 'You are signed in with this account.' : 'At least one admin must stay active.';
    return `
      <li class="manage-card">
        <div class="row-between">
          <h3>${esc(person.name)}</h3>
          <div class="quick">
            <button type="button" class="secondary" data-action="edit-access" data-id="${person.id}">Edit</button>
            <button type="button" class="secondary" data-action="toggle-access" data-id="${person.id}" ${blocked ? 'disabled' : ''}>${person.active ? 'Deactivate' : 'Activate'}</button>
          </div>
        </div>
        <p class="meta">${esc(person.email)}</p>
        <div class="chips">
          <span class="chip ${person.role === 'Admin' ? 'admin' : ''}">${esc(person.role)}</span>
          <span class="chip ${person.active ? 'on' : 'off'}">${person.active ? 'Active' : 'Inactive'}</span>
        </div>
        ${blocked && person.active ? `<p class="hint">${esc(why)}</p>` : ''}
      </li>`;
  }).join('');
  const form = editing ? `
    <form id="access-form" class="form-grid" method="post" action="#">
      <input type="hidden" name="recordId" value="${editing.id ?? ''}">
      <div>
        <label for="person-name">Name</label>
        <input id="person-name" name="name" type="text" required value="${esc(editing.name)}">
      </div>
      <div>
        <label for="person-email">Email</label>
        <input id="person-email" name="email" type="text" required autocomplete="off" value="${esc(editing.email)}" placeholder="firstName.lastName@centific.com">
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
          <option value="User" ${editing.role === 'User' ? 'selected' : ''}>User</option>
          <option value="Admin" ${editing.role === 'Admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="check-row">
        <input id="person-active" name="active" type="checkbox" ${editing.active ? 'checked' : ''}>
        <label for="person-active">Active</label>
      </div>
      <div class="quick">
        <button class="primary" type="submit">Save person</button>
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
          <button type="button" class="secondary" data-action="toggle-kit" data-id="${kit.id}">${kit.active ? 'Deactivate' : 'Activate'}</button>
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
    <form id="kit-form" class="form-grid" method="post" action="#">
      <input type="hidden" name="recordId" value="${editing.id ?? ''}">
      <div>
        <label for="kit-name">Kit name</label>
        <input id="kit-name" name="name" type="text" required value="${esc(editing.name)}">
      </div>
      <div>
        <label for="kit-order">Sort order</label>
        <input id="kit-order" name="sortOrder" type="number" value="${esc(editing.sortOrder)}">
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
        <button class="primary" type="submit">Save kit</button>
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
      ${state.allKits.length ? `<ul class="manage-list">${rows}</ul>` : '<p>No kits yet.</p>'}
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
  state.loginEmail = String(email || '').trim();
  state.busy = true;
  state.notice = '';
  clearPageError();
  render();
  try {
    const user = await apiCall('login', { email: state.loginEmail });
    await enterApp(user);
  } catch (error) {
    state.busy = false;
    state.error = error.message;
    state.errorCode = error.code || '';
    render();
  }
}

async function enterApp(user) {
  state.user = user;
  state.busy = false;
  clearPageError();
  state.message = '';
  state.tab = 'checklist';
  state.tasks = [];
  state.tasksLoaded = false;
  state.tasksError = '';
  state.selectedKitId = null;
  state.editor = null;
  state.modal = null;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* session storage can be blocked; the page still works until refresh */
  }
  const today = pacificDate();
  state.date = today;
  const parts = splitYmd(today);
  state.viewYear = parts.year;
  state.viewMonth = parts.month;
  document.title = 'Daily Readiness Checklist';
  await loadKits({ preferMine: true });
}

async function loadKits({ preferMine = false } = {}) {
  const serial = ++loadSerial;
  state.kitsError = '';
  state.kitsCode = '';
  try {
    const kits = await apiCall('getKits', { date: state.date });
    if (serial !== loadSerial) return;
    state.kits = kits;
    kits.forEach((kit) => rememberKit(kit.id, kit.name));
    await hydrateTaskIds();
    await ensureTasks();
    if (serial !== loadSerial) return;
    const mine = state.kits.find((kit) => kit.claim && kit.claim.userEmail === state.user.email);
    const stillThere = state.kits.some((kit) => kit.id === state.selectedKitId);
    if (preferMine && mine) state.selectedKitId = mine.id;
    else if (!stillThere) {
      const free = state.kits.find((kit) => !kit.claim);
      state.selectedKitId = mine?.id || free?.id || state.kits[0]?.id || null;
    }
  } catch (error) {
    if (serial !== loadSerial) return;
    state.kits = [];
    state.kitsError = error.message;
    state.kitsCode = error.code || '';
  } finally {
    if (serial === loadSerial) {
      state.busy = false;
      render();
    }
  }
}

async function hydrateTaskIds() {
  for (const kit of state.kits) {
    const claim = kit.claim;
    if (!claim || claim.userEmail !== state.user.email || Array.isArray(claim.completedTaskIds)) continue;
    try {
      const rows = await apiCall('getHistory', { from: state.date, to: state.date, kitId: kit.id });
      const row = rows.find((item) => item.id === claim.claimId);
      claim.completedTaskIds = row?.completedTaskIds || [];
    } catch (error) {
      claim.completedTaskIds = [];
      state.tasksError = error.message;
      state.tasksCode = error.code || '';
    }
  }
}

async function ensureTasks() {
  if (state.tasksLoaded) return;
  try {
    state.tasks = await apiCall('getTasks');
    state.tasksLoaded = true;
    state.tasksError = '';
    state.tasksCode = '';
  } catch (error) {
    state.tasks = [];
    state.tasksLoaded = false;
    state.tasksError = error.message;
    state.tasksCode = error.code || '';
  }
}

async function setDate(ymd, { focusDay = false } = {}) {
  state.date = ymd;
  const parts = splitYmd(ymd);
  state.viewYear = parts.year;
  state.viewMonth = parts.month;
  state.message = '';
  clearPageError();
  await loadKits({ preferMine: true });
  if (focusDay) document.getElementById(`day-${ymd}`)?.focus();
}

async function checkIn() {
  const kit = selectedKit();
  if (!kit) return;
  state.busy = true;
  clearPageError();
  render();
  try {
    const data = await apiCall('checkIn', { kitId: kit.id, date: state.date });
    state.message = formatClaimMessage(data.kitName, data.date, data.checkInAt);
    state.selectedKitId = data.kitId;
    await loadKits({ preferMine: false });
  } catch (error) {
    state.busy = false;
    state.error = error.message;
    state.errorCode = error.code || '';
    render();
  }
}

function openCheckout(type) {
  const kit = selectedKit();
  if (!kit?.claim) return;
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
  if (!modal) return;
  const kit = selectedKit();
  const ids = modal.type === 'checkout'
    ? (myClaim(kit)?.completedTaskIds || modal.completedTaskIds || [])
    : (modal.completedTaskIds || []);
  state.modal = null;
  state.busy = true;
  render();
  try {
    await apiCall('checkOut', {
      claimId: modal.claimId,
      completedTaskIds: ids,
      tasksTotal: state.tasks.length,
    });
    state.message = modal.type === 'release'
      ? `${modal.kitName} was released for this date.`
      : `${modal.kitName} is checked out. The kit is free for this date.`;
    clearPageError();
    await loadKits({ preferMine: false });
  } catch (error) {
    state.busy = false;
    state.error = error.message;
    state.errorCode = error.code || '';
    render();
  }
}

async function toggleTask(taskId, checked) {
  const claim = myClaim();
  if (!claim) return;
  const next = new Set(claim.completedTaskIds || []);
  if (checked) next.add(taskId);
  else next.delete(taskId);
  state.busy = true;
  try {
    const saved = await apiCall('updateTasks', {
      claimId: claim.claimId,
      completedTaskIds: [...next],
    });
    claim.completedTaskIds = saved.completedTaskIds;
    state.tasksError = '';
    state.tasksCode = '';
  } catch (error) {
    state.tasksError = error.message;
    state.tasksCode = error.code || '';
  } finally {
    state.busy = false;
    render();
    document.getElementById(`task-${taskId}`)?.focus();
  }
}

async function loadHistory() {
  state.historyError = '';
  state.historyCode = '';
  try {
    if (isAdmin()) state.access = await apiCall('listAccess');
    const params = {};
    if (state.filters.userEmail) params.userEmail = state.filters.userEmail;
    if (state.filters.kitId) params.kitId = Number(state.filters.kitId);
    if (state.filters.from) params.from = state.filters.from;
    if (state.filters.to) params.to = state.filters.to;
    state.history = await apiCall('getHistory', params);
    state.history.forEach((row) => rememberKit(row.kitId, row.kitName));
    state.kits.forEach((kit) => rememberKit(kit.id, kit.name));
  } catch (error) {
    state.history = [];
    state.historyError = error.message;
    state.historyCode = error.code || '';
  }
  render();
}

async function loadSettings() {
  state.settingsError = '';
  state.settingsCode = '';
  const problems = [];
  try {
    state.access = await apiCall('listAccess');
  } catch (error) {
    problems.push(error);
  }
  try {
    state.allKits = await apiCall('listKits');
    state.allKits.forEach((kit) => rememberKit(kit.id, kit.name));
  } catch (error) {
    problems.push(error);
  }
  if (problems.length) {
    state.settingsError = problems.map((error) => error.message).join(' ');
    state.settingsCode = problems[0].code || '';
  }
  render();
}

async function setTab(tab, { focus = false } = {}) {
  if (tab === 'settings' && !isAdmin()) tab = 'checklist';
  state.tab = tab;
  clearPageError();
  if (tab === 'history') await loadHistory();
  else if (tab === 'settings') await loadSettings();
  else render();
  if (focus) document.getElementById(`tab-${tab}`)?.focus();
}

function signOut() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  state.user = null;
  state.tab = 'checklist';
  state.kits = [];
  state.tasks = [];
  state.tasksLoaded = false;
  state.selectedKitId = null;
  state.message = '';
  state.history = [];
  state.access = [];
  state.allKits = [];
  state.editor = null;
  state.modal = null;
  state.notice = 'You are signed out.';
  clearPageError();
  document.title = 'Sign in · Daily Readiness Checklist';
  render();
}

function resetDemo() {
  state.api.reset();
  state.notice = 'Sample data was reset in this browser.';
  state.settingsNotice = state.notice;
  state.kits = [];
  state.tasksLoaded = false;
  state.history = [];
  state.access = [];
  state.allKits = [];
  state.editor = null;
  if (state.user) {
    state.tasksLoaded = false;
    if (state.tab === 'settings') loadSettings();
    else if (state.tab === 'history') loadHistory();
    else loadKits({ preferMine: true });
    return;
  }
  render();
}

function personFromForm(form) {
  const data = new FormData(form);
  return {
    id: data.get('recordId') ? Number(data.get('recordId')) : undefined,
    name: String(data.get('name') || '').trim(),
    email: String(data.get('email') || '').trim(),
    firstName: String(data.get('firstName') || '').trim(),
    lastName: String(data.get('lastName') || '').trim(),
    role: data.get('role'),
    active: data.get('active') === 'on',
  };
}

async function saveAccess(form) {
  const payload = personFromForm(form);
  state.editor = { kind: 'access', ...payload, id: payload.id ?? null };
  const me = state.access.find((person) => person.email === state.user.email);
  if (me && payload.id === me.id && !payload.active) {
    state.settingsError = 'You cannot turn off the account you are signed in with.';
    state.settingsCode = '';
    render();
    return;
  }
  state.settingsError = '';
  state.settingsNotice = '';
  try {
    await apiCall('upsertAccess', payload);
    state.access = await apiCall('listAccess');
    state.editor = null;
    state.settingsNotice = 'Access list saved.';
  } catch (error) {
    state.settingsError = error.message;
    state.settingsCode = error.code || '';
  }
  render();
}

async function saveKit(form) {
  const data = new FormData(form);
  const payload = {
    id: data.get('recordId') ? Number(data.get('recordId')) : undefined,
    name: String(data.get('name') || '').trim(),
    sortOrder: data.get('sortOrder') === '' ? undefined : Number(data.get('sortOrder')),
    notes: String(data.get('notes') || ''),
    active: data.get('active') === 'on',
  };
  state.editor = { kind: 'kit', ...payload, id: payload.id ?? null, sortOrder: payload.sortOrder ?? '' };
  state.settingsError = '';
  state.settingsNotice = '';
  try {
    await apiCall('upsertKit', payload);
    state.allKits = await apiCall('listKits');
    state.editor = null;
    state.settingsNotice = 'Kit list saved.';
    state.tasksLoaded = state.tasksLoaded;
  } catch (error) {
    state.settingsError = error.message;
    state.settingsCode = error.code || '';
  }
  render();
}

async function toggleAccess(id) {
  const person = state.access.find((row) => row.id === id);
  if (!person) return;
  try {
    await apiCall('upsertAccess', {
      id: person.id,
      name: person.name,
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
      role: person.role,
      active: !person.active,
    });
    state.access = await apiCall('listAccess');
    state.settingsNotice = person.active ? `${person.name} can no longer sign in.` : `${person.name} can sign in again.`;
    state.settingsError = '';
  } catch (error) {
    state.settingsError = error.message;
    state.settingsCode = error.code || '';
  }
  render();
}

async function toggleKit(id) {
  const kit = state.allKits.find((row) => row.id === id);
  if (!kit) return;
  try {
    await apiCall('upsertKit', {
      id: kit.id,
      name: kit.name,
      sortOrder: kit.sortOrder,
      notes: kit.notes || '',
      active: !kit.active,
    });
    state.allKits = await apiCall('listKits');
    state.settingsNotice = kit.active ? `${kit.name} is hidden from the kit list.` : `${kit.name} is available again.`;
    state.settingsError = '';
  } catch (error) {
    state.settingsError = error.message;
    state.settingsCode = error.code || '';
  }
  render();
}

function onClick(event) {
  if (event.target.id === 'backdrop') {
    closeModal();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (state.busy && !['modal-cancel', 'sign-out'].includes(action)) return;
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
  } else if (action === 'check-in') checkIn();
  else if (action === 'check-out') openCheckout('checkout');
  else if (action === 'release') openCheckout('release');
  else if (action === 'modal-cancel') closeModal();
  else if (action === 'modal-confirm') confirmModal();
  else if (action === 'clear-filters') {
    state.filters = { userEmail: '', kitId: '', from: '', to: '' };
    loadHistory();
  } else if (action === 'add-access') {
    state.editor = { kind: 'access', id: null, name: '', email: '', firstName: '', lastName: '', role: 'User', active: true };
    state.settingsNotice = '';
    render();
    document.getElementById('person-name')?.focus();
  } else if (action === 'edit-access') {
    const person = state.access.find((row) => row.id === Number(button.dataset.id));
    if (!person) return;
    state.editor = { kind: 'access', ...person };
    render();
    document.getElementById('person-name')?.focus();
  } else if (action === 'toggle-access') toggleAccess(Number(button.dataset.id));
  else if (action === 'add-kit') {
    state.editor = { kind: 'kit', id: null, name: '', sortOrder: state.allKits.length + 1, notes: '', active: true };
    state.settingsNotice = '';
    render();
    document.getElementById('kit-name')?.focus();
  } else if (action === 'edit-kit') {
    const kit = state.allKits.find((row) => row.id === Number(button.dataset.id));
    if (!kit) return;
    state.editor = { kind: 'kit', ...kit };
    render();
    document.getElementById('kit-name')?.focus();
  } else if (action === 'toggle-kit') toggleKit(Number(button.dataset.id));
  else if (action === 'cancel-editor') {
    state.editor = null;
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
    const data = new FormData(form);
    state.filters = {
      userEmail: String(data.get('userEmail') || ''),
      kitId: String(data.get('kitId') || ''),
      from: String(data.get('from') || ''),
      to: String(data.get('to') || ''),
    };
    loadHistory();
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
document.addEventListener('keydown', onKeyDown);

async function init() {
  state.config = await loadConfig();
  state.api = createClient({
    backend: state.config.backend,
    flowUrl: state.config.FLOW_URL,
    storage: window.localStorage,
  });
  document.title = 'Sign in · Daily Readiness Checklist';
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    saved = null;
  }
  state.ready = true;
  if (saved?.email) {
    try {
      const user = await apiCall('login', { email: saved.email });
      await enterApp(user);
      return;
    } catch (error) {
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      state.error = error.message;
      state.errorCode = error.code || '';
    }
  }
  render();
}

init();
