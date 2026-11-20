import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';
import { useApp } from '@/context/AppContext';
import { formatRupees } from '@/utils/billing';

export default function ConsumerHomeScreen() {
  const { session, consumers, billingRecords, isOnline, isLoading, refreshData, isDarkMode, toggleTheme } = useApp();
  const consumer = consumers.find(item => item.id === session.consumerId);
  const bills = useMemo(() => billingRecords.filter(bill => bill.consumerId === session.consumerId)
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.billId.localeCompare(a.billId, undefined, { numeric: true })), [billingRecords, session.consumerId]);
  const latest = bills[0];
  const outstanding = latest ? Math.max(0, latest.totalRupees - latest.receivingAmount) : 0;
  const status = !latest ? 'No bill yet' : outstanding <= 0 ? 'Paid' : latest.receivingAmount > 0 ? 'Partially paid' : 'Unpaid';

  if (isLoading && !consumer) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator/></View>;
  return <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-32 pt-6" refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refreshData(true)}/> }>
    <View className="flex-row items-start justify-between">
      <View className="flex-1 pr-3">
        <Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">NEAR POWER · CONSUMER</Text>
        <Text className="mt-2 text-2xl font-bold text-text">Assalam-o-Alaikum, {consumer?.fullName?.split(' ')[0] ?? 'Consumer'}</Text>
        <Text className="mt-1 text-sm text-text-secondary">Your electricity account overview</Text>
      </View>
      <Pressable onPress={toggleTheme} accessibilityRole="button" accessibilityLabel={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'} className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface">
        {isDarkMode ? <Sun size={19} color="#E9D9EC" /> : <Moon size={19} color="#62446A" />}
      </Pressable>
    </View>
    <View className="mt-5 rounded-3xl bg-hero p-5">
      <Text className="text-xs font-semibold uppercase tracking-widest text-on-hero/75">OUTSTANDING BALANCE</Text>
      <Text className="mt-2 text-3xl font-bold text-on-hero">{formatRupees(outstanding)}</Text>
      <View className="mt-4 flex-row items-center justify-between"><Text className="text-xs text-on-hero/80">{latest?.monthYear ?? 'No billing period'}</Text><Text className="rounded-full bg-hero-overlay px-3 py-1 text-xs font-bold text-on-hero">{status}</Text></View>
    </View>
    <View className="mt-3 flex-row gap-3">
      <View className="flex-1 rounded-2xl border border-border bg-surface p-4"><Text className="text-[10px] font-semibold text-text-muted">TOTAL BILL</Text><Text className="mt-2 text-lg font-bold text-text">{formatRupees(latest?.totalRupees ?? 0)}</Text></View>
      <View className="flex-1 rounded-2xl border border-border bg-surface p-4"><Text className="text-[10px] font-semibold text-text-muted">AMOUNT PAID</Text><Text className="mt-2 text-lg font-bold text-success">{formatRupees(latest?.receivingAmount ?? 0)}</Text></View>
    </View>
    <View className="mt-3 rounded-2xl border border-border bg-surface p-4">
      <Text className="text-sm font-bold text-text">Current meter reading</Text>
      <View className="mt-3 flex-row justify-between"><Text className="text-xs text-text-muted">Units this month</Text><Text className="text-sm font-semibold text-text">{latest?.unitsConsumed ?? 0} kWh</Text></View>
      <View className="mt-2 flex-row justify-between"><Text className="text-xs text-text-muted">Due date</Text><Text className="text-sm font-semibold text-text">{latest?.dueDate ?? '—'}</Text></View>
      <View className="mt-2 flex-row justify-between"><Text className="text-xs text-text-muted">Connection</Text><Text className="text-sm font-semibold text-text">{consumer?.isActive ? 'Active' : 'Inactive'}</Text></View>
    </View>
    <View className="mt-4 flex-row items-center justify-between"><Text className="text-base font-bold text-text">Recent bills</Text><Text className="text-xs text-text-muted">{bills.length} records</Text></View>
    {bills.slice(0, 3).map(bill => <View key={bill.billId} className="mt-2 flex-row items-center justify-between rounded-xl border border-border bg-surface p-3"><View><Text className="text-sm font-semibold text-text">{bill.monthYear}</Text><Text className="mt-1 text-xs text-text-muted">{bill.unitsConsumed} units · {bill.status}</Text></View><Text className="text-sm font-bold text-text">{formatRupees(bill.totalRupees)}</Text></View>)}
    {!isOnline ? <Text className="mt-4 text-center text-xs text-warning">Offline · Showing the latest saved account data.</Text> : null}
  </ScrollView>;
}
