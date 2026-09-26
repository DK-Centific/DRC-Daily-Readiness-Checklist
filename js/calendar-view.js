/**
 * Variant A date controls.
 * Admins see a month with per-day activity. Staff see a compact date chip.
 */

import { CHECKOUT_STATUS_LABEL, INCOMPLETE_CHECKOUT_LABEL } from './checklist-view.js';
import { normalizeHistoryRows } from './flow-shape.js';
import { addDays, shiftMonth, splitYmd } from './time.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function field(row, camel, pascal) {
  if (!row) return undefined;
  if (row[camel] != null && row[camel] !== '') return row[camel];
  if (row[pascal] != null && row[pascal] !== '') return row[pascal];
  return row[camel] ?? row[pascal];
}

function checkoutAt(row) {
  return String(field(row, 'checkOutAt', 'CheckOutAt') || '');
}

function asCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

export function emptyDay() {
  return { claimed: 0, complete: 0, incomplete: 0, open: 0 };
}

/** Today's kit list has painted. Month history must not start before this. */
export function checklistReadyForMonthMarks({ kitsLoaded = false, checklistLoading = false } = {}) {
  return Boolean(kitsLoaded) && !checklistLoading;
}

/**
 * Admin Layout A loads the month on screen, and also the selected past day
 * when that day sits in a different month. Staff load a month only while
 * viewing a past day. Today's staff checklist does not need one.
 */
export function monthMarkTargets({ isAdmin = false, pastDate = false } = {}) {
  if (isAdmin && pastDate) return ['view-month', 'selected-month'];
  if (isAdmin) return ['view-month'];
  if (pastDate) return ['selected-month'];
  return [];
}

/** First and last Pacific day of a calendar month, plus a cache key. */
export function monthRange(year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const from = `${key}-01`;
  const next = shiftMonth(year, month, 1);
  const to = addDays(`${next.year}-${String(next.month).padStart(2, '0')}-01`, -1);
  return { key, from, to };
}

export function weekDates(ymd) {
  const { year, month, day } = splitYmd(ymd);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const start = addDays(ymd, -weekday);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function preferRow(current, next) {
  if (!current) return next;
  const currentOpen = !checkoutAt(current);
  const nextOpen = !checkoutAt(next);
  if (nextOpen !== currentOpen) return nextOpen ? next : current;
  const currentAt = currentOpen ? String(current.checkInAt || '') : checkoutAt(current);
  const nextAt = nextOpen ? String(next.checkInAt || '') : checkoutAt(next);
  return nextAt >= currentAt ? next : current;
}

/** One outcome per kit: open claim wins over an earlier check-out the same day. */
export function outcomeForKit(rows, kitId) {
  let best = null;
  for (const row of rows || []) {
    if (String(row?.kitId) !== String(kitId)) continue;
    best = preferRow(best, row);
  }
  if (!best) return null;
  const done = asCount(field(best, 'tasksCompleted', 'TasksCompleted'));
  const total = asCount(field(best, 'tasksTotal', 'TasksTotal'));
  const base = {
    tasksCompleted: done,
    tasksTotal: total,
    userName: field(best, 'userName', 'UserName') || '',
    userEmail: field(best, 'userEmail', 'UserEmail') || '',
    checkInAt: field(best, 'checkInAt', 'CheckInAt') || '',
    checkOutAt: checkoutAt(best),
  };
  if (!base.checkOutAt) return { ...base, kind: 'open' };
  const incomplete = Number.isFinite(done) && Number.isFinite(total) && total > 0 && done < total;
  return { ...base, kind: incomplete ? 'incomplete' : 'complete' };
}

/**
 * Per day, from history rows:
 * claimed = kits with any claim, open or checked out
 * complete = check-outs where tasksCompleted === tasksTotal (or not a short list)
 * incomplete = check-outs where tasksCompleted < tasksTotal
 * open = still checked in (navy dot only)
 */
export function activityFromRows(rows) {
  const byDay = new Map();
  for (const row of normalizeHistoryRows(rows) || []) {
    const day = row?.claimDate || row?.ClaimDate;
    if (!day || row?.kitId == null) continue;
    if (!byDay.has(day)) byDay.set(day, new Map());
    const kits = byDay.get(day);
    const id = String(row.kitId);
    kits.set(id, preferRow(kits.get(id), row));
  }
  const activity = {};
  for (const [day, kits] of byDay) {
    const bucket = emptyDay();
    bucket.claimed = kits.size;
    for (const row of kits.values()) {
      const outcome = outcomeForKit([row], row.kitId);
      if (outcome?.kind === 'open') bucket.open += 1;
      else if (outcome?.kind === 'incomplete') bucket.incomplete += 1;
      else bucket.complete += 1;
    }
    activity[day] = bucket;
  }
  return activity;
}

export function activityForDay(activity, ymd) {
  return activity?.[ymd] || emptyDay();
}

function dotsHtml(bucket, loading) {
  if (loading) return '<span class="cal-dots" aria-hidden="true"><span class="placeholder"></span></span>';
  if (!bucket?.claimed) return '';
  const parts = [];
  if (bucket.open) parts.push('<span class="open"></span>');
  if (bucket.complete) parts.push('<span class="out"></span>');
  if (bucket.incomplete) parts.push('<span class="inc"></span>');
  if (!parts.length) return '';
  return `<span class="cal-dots" aria-hidden="true">${parts.join('')}</span>`;
}

function dayButton(cell, { selected, today, activity, loading, showActivity }) {
  const bucket = activity?.[cell.ymd];
  const classes = ['cal-day'];
  if (cell.outside) classes.push('muted');
  if (cell.ymd === today) classes.push('today');
  if (cell.ymd === selected) classes.push('selected');
  const disabled = cell.outside || cell.future;
  const showDots = showActivity && !disabled;
  const count = showDots && !loading && bucket?.claimed
    ? `<span class="cal-count">${bucket.claimed}</span>`
    : '';
  const dots = showDots ? dotsHtml(bucket, loading) : '';
  const bits = [cell.label || cell.ymd];
  if (cell.ymd === today) bits.push('today');
  if (cell.ymd === selected) bits.push('selected');
  if (showDots && loading) bits.push('activity loading');
  else if (showDots && bucket?.claimed) bits.push(`${bucket.claimed} claimed`);
  return `<button type="button" class="${classes.join(' ')}" id="day-${esc(cell.ymd)}" data-action="pick-date" data-date="${esc(cell.ymd)}" aria-pressed="${cell.ymd === selected}" aria-label="${esc(bits.join(', '))}" tabindex="${cell.tabStop ? '0' : '-1'}" ${disabled ? 'disabled' : ''}><span>${cell.dayNumber}</span>${count}${dots}</button>`;
}

function monthHead(monthLabel, weekdays) {
  const labels = (weekdays || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).map((day) => day.slice(0, 2));
  return `
    <div class="cal-head">
      <p class="section">${esc(monthLabel)}</p>
      <div class="cal-nav">
        <button type="button" data-action="prev-month" aria-label="Previous month">‹</button>
        <button type="button" data-action="next-month" aria-label="Next month">›</button>
      </div>
    </div>
    <div class="cal-weekdays">${labels.map((day) => `<span>${esc(day)}</span>`).join('')}</div>`;
}

export function renderDateChip(label) {
  return `<span class="date-chip">${esc(label)}</span>`;
}

export function renderActivityCalendar({
  monthLabel,
  days,
  selected,
  today,
  activity = {},
  loading = false,
  weekdays,
}) {
  const buttons = (days || []).map((cell) => dayButton(cell, {
    selected,
    today,
    activity,
    loading,
    showActivity: true,
  })).join('');
  return `
    <section class="cal-card" aria-label="Calendar">
      ${monthHead(monthLabel, weekdays)}
      <div class="cal-grid">${buttons}</div>
      <div class="cal-legend">
        <span><i class="claimed"></i> Claimed</span>
        <span><i class="checkedout"></i> ${esc(CHECKOUT_STATUS_LABEL)}</span>
        <span><i class="incomplete"></i> Incomplete</span>
      </div>
    </section>`;
}

/** Confirm copy before an admin clears one kit, or every kit, for a date. */
export function resetDayConfirm({ kitLabel, dateLabel }) {
  return `Clear all check-ins and check-outs for ${kitLabel} on ${dateLabel}? The kit stays in Settings.`;
}

export function renderDaySummary({ label, activity, loaded, resetAll = false, resetDisabled = false }) {
  const number = (value) => (loaded ? String(value || 0) : '–');
  const day = activity || emptyDay();
  const reset = resetAll
    ? `<div class="day-summary-actions"><button type="button" class="btn btn-secondary btn-sm" id="reset-day-all" data-action="reset-day" ${resetDisabled ? 'disabled' : ''}>Reset all kits for this date</button></div>`
    : '';
  return `
    <section class="day-summary" aria-label="Day summary">
      <h3>Day summary · ${esc(label)}</h3>
      <div class="day-summary-row"><span>Claimed</span><span class="n-claimed tabular">${number(day.claimed)}</span></div>
      <div class="day-summary-row"><span>${esc(CHECKOUT_STATUS_LABEL)}</span><span class="n-out tabular">${number(day.complete)}</span></div>
      <div class="day-summary-row"><span>${esc(INCOMPLETE_CHECKOUT_LABEL)}</span><span class="n-inc tabular">${number(day.incomplete)}</span></div>
      ${reset}
    </section>`;
}

export function renderFilterBanner({ label, kitsLabel, claimedLabel }) {
  return `
    <div class="filter-banner">
      Showing <strong>${esc(label)}</strong> · ${esc(kitsLabel)} kits · ${esc(claimedLabel)} claimed
      <button type="button" class="link" data-action="back-today">Back to today</button>
    </div>`;
}

function plainFooter(layout) {
  if (layout === 'sheet') {
    return `
      <div class="popover-footer">
        <button type="button" class="btn btn-ghost" data-action="close-date">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="back-today">Today</button>
      </div>`;
  }
  return `
    <div class="popover-footer">
      <button type="button" class="btn btn-ghost btn-sm" data-action="close-date">Clear</button>
      <button type="button" class="btn btn-primary btn-sm" data-action="back-today">Today</button>
    </div>`;
}

/** Staff month. No activity dots. layout is 'popover' or 'sheet'. */
export function renderPlainMonth({
  monthLabel,
  days,
  selected,
  today,
  weekdays,
  layout = 'popover',
}) {
  const buttons = (days || []).map((cell) => dayButton(cell, {
    selected,
    today,
    showActivity: false,
  })).join('');
  const body = `
    ${monthHead(monthLabel, weekdays)}
    <div class="cal-grid">${buttons}</div>
    ${plainFooter(layout)}`;
  if (layout === 'sheet') {
    return `
      <div class="sheet-backdrop" data-action="close-date"></div>
      <div class="bottom-sheet" id="date-sheet" role="dialog" aria-label="Choose date">
        <div class="sheet-handle"></div>
        ${body}
      </div>`;
  }
  return `<div class="date-popover" id="date-popover" role="dialog" aria-label="Choose date">${body}</div>`;
}

export function renderWeekStrip({ days, selected, today, monthLabel, expanded }) {
  const buttons = (days || []).map((cell) => {
    const classes = ['week-day'];
    if (cell.ymd === today) classes.push('today');
    if (cell.ymd === selected) classes.push('selected');
    const future = cell.ymd > today;
    return `<button type="button" class="${classes.join(' ')}" data-action="pick-date" data-date="${esc(cell.ymd)}" aria-pressed="${cell.ymd === selected}" ${future ? 'disabled' : ''}><span>${esc(cell.weekday)}</span><span class="d">${cell.dayNumber}</span></button>`;
  }).join('');
  return `
    <div class="week-strip">
      <button type="button" class="month-toggle" data-action="toggle-admin-month" aria-expanded="${expanded ? 'true' : 'false'}">${esc(monthLabel)} ${expanded ? '▴' : '▾'}</button>
      <div class="week-days">${buttons}</div>
    </div>`;
}
