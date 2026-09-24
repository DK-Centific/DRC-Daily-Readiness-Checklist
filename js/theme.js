/** Light / Dark / System. The inline script in index.html uses the same key. */

export const THEME_KEY = 'drc_theme';
const LEGACY_THEME_KEY = 'drc.theme';

export function normalizeChoice(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'light' || text === 'dark' || text === 'system') return text;
  return 'system';
}

/** What the page would look like. System follows the OS. */
export function resolveTheme(choice, prefersDark) {
  const picked = normalizeChoice(choice);
  if (picked === 'light' || picked === 'dark') return picked;
  return prefersDark ? 'dark' : 'light';
}

/** System leaves data-theme unset so the prefers-color-scheme block can apply. */
export function themeAttribute(choice) {
  const picked = normalizeChoice(choice);
  return picked === 'system' ? null : picked;
}

export function readThemeChoice() {
  try {
    const current = localStorage.getItem(THEME_KEY);
    if (current) return normalizeChoice(current);
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy) {
      const picked = normalizeChoice(legacy);
      localStorage.setItem(THEME_KEY, picked);
      return picked;
    }
  } catch {
    /* private mode */
  }
  return 'system';
}

export function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true;
}

export function applyTheme(choice = readThemeChoice()) {
  const picked = normalizeChoice(choice);
  const attr = themeAttribute(picked);
  if (attr) document.documentElement.setAttribute('data-theme', attr);
  else document.documentElement.removeAttribute('data-theme');
  document.documentElement.setAttribute('data-theme-choice', picked);
  return { choice: picked, theme: attr || resolveTheme(picked, systemPrefersDark()) };
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
