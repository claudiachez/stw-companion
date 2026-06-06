import { create } from 'zustand';

export type Theme = 'dark' | 'light';

function applyTheme(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

const initial = (localStorage.getItem('theme') as Theme) || 'dark';
applyTheme(initial);

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  /** Set theme explicitly (used when hydrating from the user's saved profile prefs). */
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  toggle: () =>
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      applyTheme(next);
      return { theme: next };
    }),
  setTheme: (theme) =>
    set(() => {
      localStorage.setItem('theme', theme);
      applyTheme(theme);
      return { theme };
    }),
}));
