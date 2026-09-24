const TOAST_KINDS = new Set(['ok', 'error', 'slow']);

/** Class name for a toast. Anything else is dropped so it cannot become a class. */
export function toastKindClass(kind) {
  const text = String(kind ?? '').trim().toLowerCase();
  return TOAST_KINDS.has(text) ? text : '';
}
