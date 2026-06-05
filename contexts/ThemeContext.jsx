'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { THEMES, DARK_THEME, DEFAULT_THEME_INDEX } from '@/lib/themes';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeIdx, setThemeIdx] = useState(DEFAULT_THEME_INDEX);
  const [isDark, setIsDarkState] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('color_theme');
    if (saved !== null) {
      const idx = parseInt(saved);
      if (idx >= 0 && idx < THEMES.length) setThemeIdx(idx);
    }
    const dark = localStorage.getItem('dark_mode') === 'true';
    if (dark) {
      setIsDarkState(true);
      document.documentElement.setAttribute('data-dark', 'true');
    }
  }, []);

  const setTheme = (idx) => {
    setThemeIdx(idx);
    localStorage.setItem('color_theme', String(idx));
  };

  const setIsDark = (val) => {
    setIsDarkState(val);
    localStorage.setItem('dark_mode', String(val));
    if (val) {
      document.documentElement.setAttribute('data-dark', 'true');
    } else {
      document.documentElement.removeAttribute('data-dark');
    }
  };

  const activeTheme = isDark ? DARK_THEME : THEMES[themeIdx];

  return (
    <ThemeContext.Provider value={{ themeIdx, setTheme, theme: activeTheme, isDark, setIsDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  return ctx ?? {
    themeIdx: DEFAULT_THEME_INDEX,
    setTheme: () => {},
    theme: THEMES[DEFAULT_THEME_INDEX],
    isDark: false,
    setIsDark: () => {},
  };
}
