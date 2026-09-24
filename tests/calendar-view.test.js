import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityForDay,
  activityFromRows,
  monthRange,
  outcomeForKit,
  renderActivityCalendar,
  renderDateChip,
  renderDaySummary,
  resetDayConfirm,
  renderFilterBanner,
  renderPlainMonth,
  renderWeekStrip,
} from '../js/calendar-view.js';

const day = (ymd, dayNumber, extra = {}) => ({
  ymd,
  dayNumber,
  label: ymd,
  tabStop: extra.tabStop || false,
  outside: extra.outside || false,
  future: extra.future || false,
});

test('a month range is the first and last day of that month', () => {
  assert.deepEqual(monthRange(2026, 9), {
    key: '2026-09',
    from: '2026-09-01',
    to: '2026-09-30',
  });
  assert.equal(monthRange(2026, 2).to, '2026-02-28');
});

test('activity counts claimed, complete, and incomplete checkouts', () => {
  const activity = activityFromRows([
    { claimDate: '2026-09-22', kitId: 1, checkOutAt: '2026-09-22T18:00:00Z', tasksCompleted: 18, tasksTotal: 18 },
    { claimDate: '2026-09-22', kitId: 2, checkOutAt: '2026-09-22T17:00:00Z', tasksCompleted: 15, tasksTotal: 18 },
    { claimDate: '2026-09-23', kitId: 1, checkOutAt: '', tasksCompleted: 4, tasksTotal: 18 },
    { claimDate: '2026-09-23', kitId: 3, checkOutAt: '2026-09-23T16:00:00Z', tasksCompleted: 18, tasksTotal: 18 },
  ]);
  assert.deepEqual(activity['2026-09-22'], { claimed: 2, complete: 1, incomplete: 1, open: 0 });
  assert.deepEqual(activity['2026-09-23'], { claimed: 2, complete: 1, incomplete: 0, open: 1 });
  assert.deepEqual(activityForDay(activity, '2026-09-01'), { claimed: 0, complete: 0, incomplete: 0, open: 0 });
});

test('an open claim replaces an earlier checkout for the same kit', () => {
  const rows = [
    { claimDate: '2026-09-22', kitId: 1, checkOutAt: '2026-09-22T15:00:00Z', tasksCompleted: 10, tasksTotal: 18 },
    { claimDate: '2026-09-22', kitId: 1, checkOutAt: '', checkInAt: '2026-09-22T20:00:00Z', tasksCompleted: 0, tasksTotal: 18 },
  ];
  const activity = activityFromRows(rows);
  assert.deepEqual(activity['2026-09-22'], { claimed: 1, complete: 0, incomplete: 0, open: 1 });
  assert.equal(outcomeForKit(rows, 1).kind, 'open');
  assert.equal(outcomeForKit(rows, 9), null);
});

test('a finished list is complete and a short list is incomplete', () => {
  const complete = outcomeForKit([
    { kitId: 2, checkOutAt: '2026-09-22T18:00:00Z', tasksCompleted: 18, tasksTotal: 18, userName: 'Jane Doe' },
  ], 2);
  const incomplete = outcomeForKit([
    { kitId: 3, checkOutAt: '2026-09-22T18:00:00Z', tasksCompleted: 15, tasksTotal: 18 },
  ], 3);
  assert.equal(complete.kind, 'complete');
  assert.equal(incomplete.kind, 'incomplete');
});

test('the admin month shows counts and dots, and future days stay closed', () => {
  const html = renderActivityCalendar({
    monthLabel: 'September 2026',
    selected: '2026-09-22',
    today: '2026-09-23',
    loading: false,
    activity: {
      '2026-09-22': { claimed: 3, complete: 2, incomplete: 1, open: 0 },
      '2026-09-23': { claimed: 1, complete: 0, incomplete: 0, open: 1 },
    },
    days: [
      day('2026-09-22', 22, { tabStop: true }),
      day('2026-09-23', 23),
      day('2026-09-24', 24, { future: true }),
      day('2026-08-31', 31, { outside: true }),
    ],
  });
  assert.match(html, /cal-card/);
  assert.match(html, /cal-count">3/);
  assert.match(html, /class="out"/);
  assert.match(html, /class="inc"/);
  assert.match(html, /class="open"/);
  assert.match(html, /Claimed/);
  assert.match(html, /Checked out/);
  assert.match(html, /Incomplete/);
  assert.match(html, /id="day-2026-09-24"[^>]*disabled/);
  assert.match(html, /id="day-2026-08-31"[^>]*disabled/);
  assert.equal(html.includes('date-chip'), false);
});

test('placeholder dots show while the month is still loading', () => {
  const html = renderActivityCalendar({
    monthLabel: 'September 2026',
    selected: '2026-09-23',
    today: '2026-09-23',
    loading: true,
    days: [day('2026-09-23', 23, { tabStop: true }), day('2026-09-24', 24, { future: true })],
  });
  assert.match(html, /placeholder/);
  assert.match(html, /activity loading/);
  assert.equal(html.includes('cal-count'), false);
});

test('the staff month has no activity and offers Clear and Today', () => {
  const chip = renderDateChip('Today · Wed, Sep 23');
  assert.match(chip, /date-chip/);
  assert.match(chip, /Today · Wed, Sep 23/);

  const popover = renderPlainMonth({
    monthLabel: 'September 2026',
    layout: 'popover',
    selected: '2026-09-23',
    today: '2026-09-23',
    days: [day('2026-09-23', 23, { tabStop: true })],
  });
  assert.match(popover, /date-popover/);
  assert.match(popover, />Clear</);
  assert.match(popover, />Today</);
  assert.equal(popover.includes('cal-count'), false);
  assert.equal(popover.includes('cal-dots'), false);

  const sheet = renderPlainMonth({
    monthLabel: 'September 2026',
    layout: 'sheet',
    selected: '2026-09-23',
    today: '2026-09-23',
    days: [day('2026-09-23', 23)],
  });
  assert.match(sheet, /bottom-sheet/);
  assert.match(sheet, /sheet-handle/);
  assert.match(sheet, />Cancel</);
  assert.match(sheet, />Today</);
});

test('the phone week strip and the past-day banner use the chosen copy', () => {
  const strip = renderWeekStrip({
    monthLabel: 'Sep',
    expanded: false,
    selected: '2026-09-23',
    today: '2026-09-23',
    days: [{ ymd: '2026-09-23', dayNumber: 23, weekday: 'W' }, { ymd: '2026-09-24', dayNumber: 24, weekday: 'T' }],
  });
  assert.match(strip, /week-strip/);
  assert.match(strip, /Sep ▾/);
  assert.match(strip, /data-date="2026-09-24"[^>]*disabled/);

  const summary = renderDaySummary({
    label: 'Wed, Sep 23',
    loaded: true,
    activity: { claimed: 1, complete: 0, incomplete: 0, open: 1 },
  });
  assert.match(summary, /Day summary · Wed, Sep 23/);
  assert.match(summary, /n-claimed tabular">1/);
  assert.match(summary, /n-inc tabular">0/);

  assert.equal(summary.includes('Reset all kits'), false);

  const withReset = renderDaySummary({
    label: 'Wed, Sep 23',
    loaded: true,
    activity: { claimed: 1, complete: 0, incomplete: 0, open: 1 },
    resetAll: true,
  });
  assert.match(withReset, /Reset all kits for this date/);
  assert.match(withReset, /data-action="reset-day"/);
  assert.equal(resetDayConfirm({ kitLabel: 'Kit 01', dateLabel: 'Wed, Sep 23' }), 'Clear all check-ins and check-outs for Kit 01 on Wed, Sep 23? The kit stays in Settings.');
  assert.equal(resetDayConfirm({ kitLabel: 'all kits', dateLabel: 'Wed, Sep 23' }), 'Clear all check-ins and check-outs for all kits on Wed, Sep 23? The kit stays in Settings.');

  const banner = renderFilterBanner({ label: 'Tue, Sep 22', kitsLabel: '4', claimedLabel: '3' });
  assert.match(banner, /Showing <strong>Tue, Sep 22<\/strong> · 4 kits · 3 claimed/);
  assert.match(banner, /Back to today/);
});
