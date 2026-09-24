/** Pacific Time helpers. Claim days are YYYY-MM-DD in America/Los_Angeles. */

const ZONE = 'America/Los_Angeles';

export function pacificDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(ymd, days) {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${mm}-${dd}`;
}

export function splitYmd(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  return { year, month, day };
}

/** Noon-UTC anchor so a calendar date does not slip across a timezone boundary. */
function dateAnchor(ymd) {
  const { year, month, day } = splitYmd(ymd);
  return new Date(Date.UTC(year, month - 1, day, 20, 0, 0));
}

export function formatYmdLabel(ymd) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dateAnchor(ymd));
}

export function formatLongDate(ymd) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(dateAnchor(ymd));
}

export function formatChipDate(ymd, today) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dateAnchor(ymd));
  if (ymd === today) return `Today · ${label}`;
  if (today && ymd === addDays(today, -1)) return `Yesterday · ${label}`;
  return label;
}

export function formatHistoryDay(ymd) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dateAnchor(ymd));
}

export function formatMonthYear(year, month) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1, 20, 0, 0)));
}

export function formatPtTime(iso) {
  if (!iso) return '';
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
  return `${formatted} PT`;
}

export function formatPtDateTime(iso) {
  if (!iso) return '';
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
  return `${formatted} PT`;
}

export function formatClaimMessage(kitName, claimDate, checkInAtIso) {
  return `${kitName} claimed on ${formatYmdLabel(claimDate)} at ${formatPtTime(checkInAtIso)}`;
}

export function calendarCells(year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const { year: y, month: m, day } = splitYmd(first);
  const weekday = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  const start = addDays(first, -weekday);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function shiftMonth(year, month, delta) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
