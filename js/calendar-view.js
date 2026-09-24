/**
 * Two date controls. config.calendar picks one per role:
 *   staff: 'chip' | 'month'
 *   admin: 'chip' | 'month'
 * chip = compact Today chip; Change date opens the month.
 * month = the full month stays on the page.
 * Anything else falls back to chip.
 */

const MARK_RANK = { closed: 1, open: 2, mine: 3 };

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function calendarLayout(config, isAdmin) {
  const calendar = config?.calendar || {};
  const choice = isAdmin ? calendar.admin : calendar.staff;
  return choice === 'month' ? 'month' : 'chip';
}

function stronger(current, next) {
  if (!next) return current || '';
  if (!current) return next;
  return (MARK_RANK[next] || 0) >= (MARK_RANK[current] || 0) ? next : current;
}

/** Dots for the month grid. mine = you still have a kit. open = someone else does. closed = only finished claims. */
export function marksFromRows(rows, selfEmail) {
  const self = String(selfEmail || '').trim().toLowerCase();
  const byDay = new Map();
  for (const row of rows || []) {
    const day = row?.claimDate;
    if (!day) continue;
    const bucket = byDay.get(day) || { mineOpen: false, otherOpen: false };
    const mine = Boolean(self) && String(row.userEmail || '').trim().toLowerCase() === self;
    const open = !row.checkOutAt;
    if (open && mine) bucket.mineOpen = true;
    else if (open) bucket.otherOpen = true;
    else bucket.anyClosed = true;
    byDay.set(day, bucket);
  }
  const marks = {};
  for (const [day, bucket] of byDay) {
    if (bucket.mineOpen) marks[day] = 'mine';
    else if (bucket.otherOpen) marks[day] = 'open';
    else marks[day] = 'closed';
  }
  return marks;
}

export function markForKits(kits, selfEmail) {
  const self = String(selfEmail || '').trim().toLowerCase();
  let mark = '';
  for (const kit of kits || []) {
    if (!kit?.claim) continue;
    const mine = Boolean(self) && String(kit.claim.userEmail || '').trim().toLowerCase() === self;
    mark = stronger(mark, mine ? 'mine' : 'open');
  }
  return mark;
}

/**
 * History dots, with today's kits winning for the selected day.
 * A checkout clears a stale "still open" dot as soon as the kit list reloads.
 */
export function calendarMarks({ historyMarks, kits, date, email, kitsLoaded }) {
  const marks = { ...(historyMarks || {}) };
  if (!date || !kitsLoaded) {
    const live = markForKits(kits, email);
    if (date && live) marks[date] = stronger(marks[date], live);
    return marks;
  }
  const live = markForKits(kits, email);
  if (live) marks[date] = live;
  else if (marks[date] === 'mine' || marks[date] === 'open') marks[date] = 'closed';
  return marks;
}

export function renderDateChip(label) {
  return `<span class="date-chip">${esc(label)}</span>`;
}

const MARK_LABEL = {
  mine: ', you have a kit',
  open: ', a kit is checked in',
  closed: ', a kit was checked in',
};

/** days: { ymd, dayNumber, outside, label, tabStop }. layout is 'popover' or 'panel'. */
export function renderMonthCalendar({
  monthLabel,
  days,
  selected,
  today,
  marks = {},
  layout = 'popover',
  weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  quick = [],
}) {
  const buttons = (days || []).map((cell) => {
    const selectedDay = cell.ymd === selected;
    const isToday = cell.ymd === today;
    const mark = marks[cell.ymd] || '';
    const classes = ['day', cell.outside ? 'outside' : '', selectedDay ? 'selected' : '', isToday ? 'today' : ''].filter(Boolean).join(' ');
    const claim = MARK_LABEL[mark] || '';
    const label = `${cell.label || cell.ymd}${isToday ? ', today' : ''}${selectedDay ? ', selected' : ''}${claim}`;
    const dot = mark ? `<span class="day-mark ${esc(mark)}" aria-hidden="true"></span>` : '';
    return `<button type="button" class="${classes}" id="day-${esc(cell.ymd)}" data-action="pick-date" data-date="${esc(cell.ymd)}" aria-pressed="${selectedDay}" aria-label="${esc(label)}" tabindex="${cell.tabStop ? '0' : '-1'}">${cell.dayNumber}${dot}</button>`;
  }).join('');
  const jumps = (quick || []).map((item) => `
    <button type="button" class="btn btn-ghost btn-sm" data-action="quick-date" data-which="${esc(item.id)}" aria-pressed="${item.pressed ? 'true' : 'false'}">${esc(item.label)}</button>
  `).join('');
  const body = `
    <div class="calendar-head">
      <button type="button" class="icon-btn" data-action="prev-month" aria-label="Previous month">‹</button>
      <div class="month-label">${esc(monthLabel)}</div>
      <button type="button" class="icon-btn" data-action="next-month" aria-label="Next month">›</button>
    </div>
    <div class="weekdays">${weekdays.map((day) => `<span>${esc(day)}</span>`).join('')}</div>
    <div class="days">${buttons}</div>
    <div class="quick">${jumps}</div>`;
  if (layout === 'panel') {
    return `<section class="month-panel" aria-label="Calendar">${body}</section>`;
  }
  return `<div class="date-popover" id="date-popover">${body}</div>`;
}
