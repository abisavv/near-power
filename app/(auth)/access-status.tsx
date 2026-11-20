import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function AccessStatusScreen() {
  const router = useRouter();
  const { accessStatus, refreshAccess, logout } = useAuth();

  const title = accessStatus === 'approved' ? 'Access approved'
    : accessStatus === 'rejected' ? 'Request not approved'
    : accessStatus === 'pending' ? 'Request pending review'
    : 'Account not linked yet';

  const description = accessStatus === 'pending'
    ? 'Your account has been created. An administrator must review and approve your consumer access.'
    : accessStatus === 'rejected'
      ? 'Your access request was not approved. Contact the station administrator for clarification.'
      : accessStatus === 'approved'
        ? 'Your access is approved. Continue to your account.'
        : 'We could not find an approved consumer link for this account. Ask the station administrator to review it.';

  const continueAction = async () => {
    try {
      await refreshAccess();
      router.replace('/');
    } catch (error) {
      Alert.alert('Unable to refresh access', error instanceof Error ? error.message : 'Try again later.');
    }
  };

  const signOut = async () => {
    try {
      await logout();
      router.replace('/(auth)/sign-in');
    } catch (error) {
      Alert.alert('Cannot sign out yet', error instanceof Error ? error.message : 'Try again.');
    }
  };

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <View className="rounded-3xl border border-border bg-surface p-6">
        <Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">NEAR POWER</Text>
        <Text className="mt-4 font-jakarta text-2xl text-text">{title}</Text>
        <Text className="mt-3 text-base leading-6 text-text-secondary">{description}</Text>
        <Pressable onPress={continueAction} className="mt-6 min-h-12 items-center justify-center rounded-2xl bg-primary px-5">
          <Text className="font-semibold text-on-primary">Check access status</Text>
        </Pressable>
        <Pressable onPress={signOut} className="mt-3 min-h-12 items-center justify-center rounded-2xl bg-secondary px-5">
          <Text className="font-semibold text-on-secondary">Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}
