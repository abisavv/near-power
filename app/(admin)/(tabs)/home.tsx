import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Database, Moon, Plus, RefreshCw, Search, Settings2, Sun, Users } from 'lucide-react-native';
import { useApp } from '@/context/AppContext';
import type { BillingRecord, ConsumerModel } from '@/types';
import { supabase } from '@/utils/supabase';
import { compareMeterNumbers } from '@/utils/recordSorting';

const PAGE_SIZE = 20;
const currentMonthLabel = () => {
  const now = new Date();
  return `${now.toLocaleString('en-US', { month: 'short' })}-${String(now.getFullYear()).slice(-2)}`;
};
const money = (value: number) => `Rs. ${Math.round(value).toLocaleString('en-PK')}`;

type HomeRow = { consumer: ConsumerModel; bill?: BillingRecord; units: number; total: number; remaining: number; status: string };

export default function AdminHomeScreen() {
  const router = useRouter();
  const { consumers, billingRecords, isOnline, isLoading, refreshData, isDarkMode, toggleTheme } = useApp();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);

  React.useEffect(() => {
    if (!isOnline) return;
    void supabase.from('access_requests').select('id', { count: 'exact', head: true })
      .eq('status', 'pending').then(({ count }) => setPendingRequests(count ?? 0));
  }, [isOnline]);

  const currentBills = useMemo(() => {
    const label = currentMonthLabel();
    return billingRecords.filter(bill => bill.monthYear === label);
  }, [billingRecords]);
  const billByConsumer = useMemo(() => {
    const map = new Map<string, BillingRecord>();
    for (const bill of currentBills) map.set(bill.consumerId, bill);
    return map;
  }, [currentBills]);

  const allRows = useMemo<HomeRow[]>(() => consumers
    .filter(consumer => showInactive || consumer.isActive)
    .sort((a, b) => compareMeterNumbers(a.meterNumber, b.meterNumber))
    .map(consumer => {
      const bill = billByConsumer.get(consumer.id);
      const total = bill?.totalRupees ?? 0;
      const remaining = Math.max(0, total - (bill?.receivingAmount ?? 0));
      return { consumer, bill, units: bill?.unitsConsumed ?? 0, total, remaining,
        status: !bill ? 'Not billed' : remaining <= 0 ? 'Paid' : bill.receivingAmount > 0 ? 'Partial' : 'Unpaid' };
    }), [consumers, showInactive, billByConsumer]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(row => [row.consumer.fullName, row.consumer.meterNumber, row.consumer.serialNumber]
      .some(value => value.toLowerCase().includes(q)));
  }, [allRows, search]);
  const visibleRows = filteredRows.slice(0, (page + 1) * PAGE_SIZE);

  const totals = useMemo(() => currentBills.reduce((acc, bill) => {
    acc.billed += bill.totalRupees;
    acc.received += bill.receivingAmount;
    acc.remaining += Math.max(0, bill.totalRupees - bill.receivingAmount);
    if (bill.totalRupees - bill.receivingAmount > 0) acc.outstandingBills += 1;
    return acc;
  }, { billed: 0, received: 0, remaining: 0, outstandingBills: 0 }), [currentBills]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshData(true); }
    catch (error) { Alert.alert('Refresh failed', error instanceof Error ? error.message : 'Unable to refresh data.'); }
    finally { setRefreshing(false); }
  }, [refreshData]);

  const renderRow = ({ item }: { item: HomeRow }) => (
    <Pressable onPress={() => router.push({ pathname: '/(admin)/(tabs)/database', params: { consumerId: item.consumer.id } })}
      className="mb-2 rounded-2xl border border-border bg-surface px-3 py-3">
      <View className="flex-row items-center">
        <View className="flex-1 pr-2"><Text numberOfLines={1} className="text-sm font-bold text-text">{item.consumer.fullName}</Text><Text className="mt-1 text-[10px] text-text-muted">Meter {item.consumer.meterNumber}</Text></View>
        <View className="w-[20%]"><Text className="text-[9px] text-text-muted">UNITS</Text><Text className="mt-1 text-sm font-semibold text-text">{item.units.toLocaleString('en-PK')}</Text></View>
        <View className="w-[30%]"><Text className="text-[9px] text-text-muted">TOTAL BILL</Text><Text className="mt-1 text-sm font-semibold text-text">{money(item.total)}</Text></View>
        <View className="w-[19%] items-end"><Text className={`rounded-full px-2 py-1 text-[9px] font-bold ${item.status === 'Paid' ? 'bg-success-bg text-success' : item.status === 'Partial' ? 'bg-warning-bg text-warning' : 'bg-background text-text-secondary'}`}>{item.status}</Text></View>
      </View>
      {item.consumer.isActive ? null : <Text className="mt-2 text-[10px] font-semibold text-warning">INACTIVE CONSUMER</Text>}
    </Pressable>
  );

  return <View className="flex-1 bg-background">
    <View className="px-4 pb-3 pt-5">
      <View className="mb-4 flex-row items-center justify-between">
        <View><Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">NEAR POWER · ADMIN</Text><Text className="mt-1 text-2xl font-bold text-text">Dashboard</Text><Text className="mt-1 text-xs text-text-muted">{currentMonthLabel()} billing overview</Text></View>
        <View className="flex-row gap-2">
          <Pressable onPress={toggleTheme} accessibilityRole="button" accessibilityLabel={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'} className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface">{isDarkMode ? <Sun size={18} color={isDarkMode ? '#E9D9EC' : '#62446A'} /> : <Moon size={18} color="#62446A" />}</Pressable>
          <Pressable onPress={() => router.push('/(admin)/(tabs)/requests')} className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface"><Bell size={18} color="#8A6B8F" />{pendingRequests > 0 ? <View className="absolute -right-1 -top-1 min-w-4 rounded-full bg-danger px-1"><Text className="text-center text-[9px] font-bold text-white">{pendingRequests > 9 ? '9+' : pendingRequests}</Text></View> : null}</Pressable>
          <Pressable onPress={refresh} className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface"><RefreshCw size={17} color="#8A6B8F" /></Pressable>
        </View>
      </View>
      <View className="rounded-3xl bg-hero p-4">
        <Text className="text-xs font-semibold uppercase tracking-widest text-on-hero/75">TOTAL CURRENT-MONTH BILLING · INCLUDING ARREARS</Text>
        <Text className="mt-2 text-3xl font-bold text-on-hero">{money(totals.billed)}</Text>
        <View className="mt-4 flex-row gap-2">
          <View className="flex-1 rounded-2xl bg-hero-overlay p-3"><Text className="text-[10px] text-on-hero/75">REMAINING</Text><Text className="mt-1 text-base font-bold text-on-hero">{money(totals.remaining)}</Text></View>
          <View className="flex-1 rounded-2xl bg-hero-overlay p-3"><Text className="text-[10px] text-on-hero/75">RECEIVED</Text><Text className="mt-1 text-base font-bold text-on-hero">{money(totals.received)}</Text></View>
        </View>
        <View className="mt-3 flex-row items-center justify-between"><Text className="text-xs text-on-hero/80">{currentBills.length} bills · {totals.outstandingBills} with balance</Text><Text className="text-xs font-semibold text-on-hero">{consumers.filter(c => c.isActive).length} active consumers</Text></View>
      </View>
      <View className="mt-3 flex-row gap-2">
        <Pressable onPress={() => router.push('/(admin)/(tabs)/quick-entry')} className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-secondary"><Plus size={16} color="#FFFFFF"/><Text className="text-xs font-bold text-white">Quick Entry</Text></Pressable>
        <Pressable onPress={() => router.push('/(admin)/(tabs)/database')} className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface"><Database size={16} color="#8A6B8F"/><Text className="text-xs font-bold text-text">Database</Text></Pressable>
        <Pressable onPress={() => router.push('/(admin)/(tabs)/settings')} className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface"><Settings2 size={17} color="#8A6B8F"/></Pressable>
      </View>
    </View>
    <View className="px-4 pb-2">
      <View className="mb-2 h-11 flex-row items-center rounded-xl border border-input-border bg-input px-3"><Search size={16} color="#897F85"/><TextInput value={search} onChangeText={value => { setSearch(value); setPage(0); }} placeholder="Search name, meter or serial" placeholderTextColor="#897F85" className="ml-2 flex-1 text-sm text-text"/></View>
      <View className="flex-row items-center justify-between rounded-xl border border-border bg-surface px-3 py-2"><View className="flex-row items-center gap-2"><Users size={16} color="#8A6B8F"/><Text className="text-xs font-semibold text-text">Show inactive consumers</Text></View><Switch value={showInactive} onValueChange={value => { setShowInactive(value); setPage(0); }}/></View>
      <View className="mt-3 flex-row items-center justify-between"><Text className="text-sm font-bold text-text">Consumers <Text className="font-normal text-text-muted">· {filteredRows.length}</Text></Text><Text className="text-[10px] text-text-muted">Sorted by meter number</Text></View>
      <View className="mt-2 flex-row px-3"><Text className="flex-1 text-[9px] font-bold text-text-muted">CONSUMER NAME</Text><Text className="w-[24%] text-[9px] font-bold text-text-muted">UNITS</Text><Text className="w-[30%] text-[9px] font-bold text-text-muted">TOTAL BILL</Text><Text className="w-[18%] text-[9px] font-bold text-text-muted">STATUS</Text></View>
    </View>
    {isLoading && !consumers.length ? <View className="flex-1 items-center justify-center"><ActivityIndicator/></View> : <FlatList data={visibleRows} keyExtractor={item => item.consumer.id} renderItem={({ item }) => <View className="px-4">{renderRow({ item })}</View>} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>} onEndReached={() => { if (visibleRows.length < filteredRows.length) setPage(value => value + 1); }} onEndReachedThreshold={0.4} contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 0 }} ListEmptyComponent={<Text className="px-4 py-8 text-center text-sm text-text-muted">No consumers match this filter.</Text>}/>}
  </View>;
}
