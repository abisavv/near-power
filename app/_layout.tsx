import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppProvider } from '@/context/AppContext';
import './global.css';
import { SafeAreaView } from 'react-native-safe-area-context';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AppProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(admin)" />
          <Stack.Screen name="(consumer)" />
        </Stack>
      </AppProvider>
    </SafeAreaView>
  );
}
