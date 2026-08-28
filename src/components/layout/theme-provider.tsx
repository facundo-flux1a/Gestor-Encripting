"use client";

import * as React from 'react';

type Theme = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  attribute?: 'class';
  disableTransitionOnChange?: boolean;
};

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  enableSystem = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light');

  const setTheme = React.useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem('muvail-theme', nextTheme);
    } catch {
      /* El tema sigue funcionando aunque el navegador bloquee almacenamiento. */
    }
  }, []);

  React.useEffect(() => {
    let storedTheme: Theme | null = null;
    try {
      const value = localStorage.getItem('muvail-theme');
      if (value === 'light' || value === 'dark' || value === 'system') storedTheme = value;
    } catch {
      /* ignore */
    }
    if (storedTheme) setThemeState(storedTheme);
  }, []);

  React.useEffect(() => {
    const effectiveTheme = resolveTheme(enableSystem ? theme : theme === 'system' ? 'light' : theme);
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
    root.style.colorScheme = effectiveTheme;
    setResolvedTheme(effectiveTheme);

    if (theme !== 'system' || !enableSystem) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = resolveTheme('system');
      root.classList.remove('light', 'dark');
      root.classList.add(next);
      root.style.colorScheme = next;
      setResolvedTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [enableSystem, theme]);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [resolvedTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider.');
  return context;
}
