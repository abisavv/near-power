import React from 'react';
import { ThemeProvider, useTheme } from './ThemeContext';
import { AuthProvider, useAuth } from './AuthContext';
import { UtilityDataProvider, useUtilityData } from './UtilityDataContext';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <AuthProvider>
      <UtilityDataProvider>{children}</UtilityDataProvider>
    </AuthProvider>
  </ThemeProvider>
);

export const useApp = () => ({
  ...useTheme(),
  ...useAuth(),
  ...useUtilityData(),
});

export { useTheme } from './ThemeContext';
export { useAuth } from './AuthContext';
export { useUtilityData } from './UtilityDataContext';
