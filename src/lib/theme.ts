// Theme handling: 'light' | 'dark' | 'auto' (follows the OS setting).
// The resolved theme is stamped on <html data-theme="…">, which the dark
// palette in styles.css keys off. index.html re-applies the stored choice in a
// tiny inline script before first paint so there's no flash of the wrong theme.

export type ThemeMode = 'auto' | 'light' | 'dark';

const KEY = 'sq-theme';

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function resolvedTheme(mode: ThemeMode = getThemeMode()): 'light' | 'dark' {
  if (mode === 'auto') return systemDark().matches ? 'dark' : 'light';
  return mode;
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Storage blocked — the choice just won't survive a reload.
  }
  document.documentElement.dataset.theme = resolvedTheme(mode);
}

// Apply on startup and track OS changes while in auto mode.
export function initTheme(): void {
  document.documentElement.dataset.theme = resolvedTheme();
  systemDark().addEventListener('change', () => {
    if (getThemeMode() === 'auto') {
      document.documentElement.dataset.theme = resolvedTheme();
    }
  });
}
