import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = 'near_power_theme';
type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  isDarkMode: boolean;
  themeMode: ThemeMode;
  isThemeHydrated: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [isThemeHydrated, setIsThemeHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(saved => {
        if (mounted && (saved === 'light' || saved === 'dark')) setThemeMode(saved);
      })
      .catch(error => console.warn('Failed to load theme preference:', error))
      .finally(() => {
        if (mounted) setIsThemeHydrated(true);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(themeMode);
    if (isThemeHydrated) {
      AsyncStorage.setItem(THEME_STORAGE_KEY, themeMode)
        .catch(error => console.warn('Failed to save theme preference:', error));
    }
  }, [themeMode, isThemeHydrated]);

  const setTheme = useCallback((mode: ThemeMode) => setThemeMode(mode), []);
  const toggleTheme = useCallback(() => {
    setThemeMode(current => current === 'dark' ? 'light' : 'dark');
  }, []);

  const value = useMemo(() => ({
    isDarkMode: themeMode === 'dark',
    themeMode,
    isThemeHydrated,
    toggleTheme,
    setTheme,
  }), [themeMode, isThemeHydrated, toggleTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
