import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { LOADING_TIMEOUT } from '@/constants/data';

export default function EntryRoute() {
  const router = useRouter();
  const { status, session, accessStatus } = useAuth();

  useEffect(() => {
    if (status === 'loading') {
      const timeoutId = setTimeout(() => {
        router.replace('/(auth)/sign-in');
      }, LOADING_TIMEOUT);
      Alert.alert('Please check your internet connection.');
      return () => clearTimeout(timeoutId);
    }

    if (status === 'error' || status === 'signed_out') {
      router.replace('/(auth)/sign-in');
      return;
    }
    if (session.role === 'ADMIN') {
      router.replace('/(admin)');
      return;
    }
    if (accessStatus === 'approved' && session.consumerId) {
      router.replace('/(consumer)');
      return;
    }
    router.replace('/(auth)/access-status');
  }, [status, session.role, session.consumerId, accessStatus, router]);

  return (
    <View className="bg-background flex-1 items-center justify-center">
      <ActivityIndicator />
      <Text className="text-text-secondary mt-3 text-sm">Preparing your account…</Text>
    </View>
  );
}
