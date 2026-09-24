/** Light / Dark / System. The inline script in index.html uses the same key and values. */

export const THEME_KEY = 'drc.theme';

export function normalizeChoice(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'light' || text === 'dark' || text === 'system') return text;
  return 'system';
}

/** choice is light, dark, or system. prefersDark is the OS setting. */
export function resolveTheme(choice, prefersDark) {
  const picked = normalizeChoice(choice);
  if (picked === 'light' || picked === 'dark') return picked;
  return prefersDark ? 'dark' : 'light';
}

export function readThemeChoice() {
  try {
    return normalizeChoice(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

export function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true;
}

export function applyTheme(choice = readThemeChoice()) {
  const picked = normalizeChoice(choice);
  const theme = resolveTheme(picked, systemPrefersDark());
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-theme-choice', picked);
  return { choice: picked, theme };
}

export function saveThemeChoice(choice) {
  const picked = normalizeChoice(choice);
  try { localStorage.setItem(THEME_KEY, picked); } catch { /* private mode */ }
  return applyTheme(picked);
}

export function watchSystemTheme(onChange) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!media?.addEventListener) return () => {};
  const listener = () => {
    if (readThemeChoice() === 'system') onChange(applyTheme('system'));
  };
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
