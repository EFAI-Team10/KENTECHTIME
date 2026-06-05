'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { THEMES, DEFAULT_THEME_INDEX } from '@/lib/themes';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeIdx, setThemeIdx] = useState(DEFAULT_THEME_INDEX);

  useEffect(() => {
    const saved = localStorage.getItem('color_theme');
    if (saved !== null) {
      const idx = parseInt(saved);
      if (idx >= 0 && idx < THEMES.length) setThemeIdx(idx);
    }
  }, []);

  const setTheme = (idx) => {
    setThemeIdx(idx);
    localStorage.setItem('color_theme', String(idx));
  };

  return (
    <ThemeContext.Provider value={{ themeIdx, setTheme, theme: THEMES[themeIdx] }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  return ctx ?? { themeIdx: DEFAULT_THEME_INDEX, setTheme: () => {}, theme: THEMES[DEFAULT_THEME_INDEX] };
}
