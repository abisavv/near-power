import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { LogOut, Moon, Sun } from 'lucide-react-native';
import { useApp } from '@/context/AppContext';

export default function ConsumerProfileScreen() {
  const { session, consumers, isDarkMode, toggleTheme, logout } = useApp();
  const consumer = consumers.find(item => item.id === session.consumerId);
  const confirmLogout = () => Alert.alert('Sign out?', 'You will need to sign in again to access this account.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => { void logout(); } },
  ]);
  const fields = [
    ['Consumer ID', consumer?.id], ['Meter number', consumer?.meterNumber], ['Serial number', consumer?.serialNumber],
    ['CNIC', consumer?.cnic], ['Phone', consumer?.phone], ['Address', consumer?.address],
    ['Phase', consumer?.phaseType], ['Connection date', consumer?.connectionDate],
  ];
  return <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-32 pt-6">
    <View className="mb-5 flex-row items-center justify-between"><View><Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">NEAR POWER</Text><Text className="mt-2 text-2xl font-bold text-text">My profile</Text></View><Pressable onPress={toggleTheme} className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface">{isDarkMode ? <Sun size={19} color="#E9D9EC"/> : <Moon size={19} color="#62446A"/>}</Pressable></View>
    <View className="rounded-2xl border border-border bg-surface p-4"><Text className="text-lg font-bold text-text">{consumer?.fullName ?? 'Consumer account'}</Text><Text className="mt-1 text-xs text-text-muted">{consumer?.isActive ? 'Active connection' : 'Inactive connection'}</Text></View>
    <Text className="mb-2 mt-5 text-sm font-bold text-text">Registered information</Text>
    {fields.map(([label, value]) => <View key={label} className="mb-2 rounded-xl border border-border bg-surface px-3 py-3"><Text className="text-[10px] font-semibold uppercase text-text-muted">{label}</Text><Text className="mt-1 text-sm font-medium text-text">{value || '—'}</Text></View>)}
    <Pressable onPress={confirmLogout} className="mt-6 min-h-12 flex-row items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger-bg"><LogOut size={17} color="#B34B54"/><Text className="font-semibold text-danger">Sign out</Text></Pressable>
  </ScrollView>;
}
