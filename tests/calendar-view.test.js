import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarLayout,
  calendarMarks,
  marksFromRows,
  renderDateChip,
  renderMonthCalendar,
} from '../js/calendar-view.js';

test('each role can use the chip or the full month', () => {
  const config = { calendar: { staff: 'chip', admin: 'month' } };
  assert.equal(calendarLayout(config, false), 'chip');
  assert.equal(calendarLayout(config, true), 'month');
  assert.equal(calendarLayout({}, false), 'chip');
  assert.equal(calendarLayout({ calendar: { admin: 'nope' } }, true), 'chip');
});

test('claim dots prefer an open kit over a finished one', () => {
  const marks = marksFromRows([
    { claimDate: '2026-09-20', userEmail: 'jane.doe@centific.com', checkOutAt: '2026-09-20T18:00:00Z' },
    { claimDate: '2026-09-23', userEmail: 'jane.doe@centific.com', checkOutAt: '' },
    { claimDate: '2026-09-23', userEmail: 'brian.leong@centific.com', checkOutAt: '' },
    { claimDate: '2026-09-22', userEmail: 'brian.leong@centific.com', checkOutAt: '' },
  ], 'jane.doe@centific.com');
  assert.equal(marks['2026-09-20'], 'closed');
  assert.equal(marks['2026-09-23'], 'mine');
  assert.equal(marks['2026-09-22'], 'open');
});

test('the kit list for the selected day replaces a stale open dot', () => {
  const historyMarks = { '2026-09-23': 'mine' };
  const cleared = calendarMarks({
    historyMarks,
    kits: [{ claim: null }],
    date: '2026-09-23',
    email: 'jane.doe@centific.com',
    kitsLoaded: true,
  });
  assert.equal(cleared['2026-09-23'], 'closed');
  const live = calendarMarks({
    historyMarks: {},
    kits: [{ claim: { userEmail: 'brian.leong@centific.com' } }],
    date: '2026-09-23',
    email: 'jane.doe@centific.com',
    kitsLoaded: true,
  });
  assert.equal(live['2026-09-23'], 'open');
});

test('the chip and the month calendar are separate markup', () => {
  const chip = renderDateChip('Today · Wed, Sep 23');
  assert.match(chip, /date-chip/);
  assert.match(chip, /Today · Wed, Sep 23/);
  assert.equal(chip.includes('date-popover'), false);

  const month = renderMonthCalendar({
    monthLabel: 'September 2026',
    layout: 'panel',
    selected: '2026-09-23',
    today: '2026-09-23',
    marks: { '2026-09-23': 'mine' },
    days: [
      { ymd: '2026-09-23', dayNumber: 23, label: 'Wednesday, September 23, 2026', tabStop: true },
    ],
    quick: [{ id: 'today', label: 'Today', pressed: true }],
  });
  assert.match(month, /month-panel/);
  assert.equal(month.includes('date-chip'), false);
  assert.match(month, /day-mark mine/);
  assert.match(month, /you have a kit/);
  assert.match(month, /Previous month/);
});
