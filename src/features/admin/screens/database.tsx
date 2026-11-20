import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, Switch, Text,
  TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, Check, ChevronDown, ContactRound, Database, Pencil, ReceiptText, RefreshCw,
  Search, ShieldAlert, Users, X,
} from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { useApp } from '@/context/AppContext';
import { adminDataDownloadService, type AdminDatabaseSnapshot } from '@/services/adminDataDownloadService';
import { DatabaseRowsTable } from '@/features/admin/database/components/DatabaseRowsTable';
import { paymentService, type PaymentRecord } from '@/services/paymentService';

type TableName = 'consumers' | 'profiles' | 'ledgers';
type DbRow = Record<string, unknown>;
type FieldDraft = Record<string, string | boolean>;
const TABLES = [
  { key: 'consumers' as const, label: 'Consumers', primaryKey: 'id', icon: Users },
  { key: 'ledgers' as const, label: 'Ledgers', primaryKey: 'bill_id', icon: ReceiptText },
  { key: 'profiles' as const, label: 'Profiles', primaryKey: 'id', icon: ContactRound },
];
const LOCKED_FIELDS = new Set(['id', 'bill_id', 'role', 'created_at', 'updated_at']);
const HIDDEN_FIELDS = new Set(['password', 'encrypted_password', 'confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current']);
const PAGE_SIZE = 150;

const labelOf = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const displayValue = (value: unknown) => value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const isBoolean = (value: unknown) => typeof value === 'boolean';
const isNumber = (value: unknown) => typeof value === 'number';

export default function AdminDatabaseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ consumerId?: string }>();
  const appliedConsumerParam = useRef(false);
  const { isDarkMode, isOnline, refreshData } = useApp();
  const [table, setTable] = useState<TableName>('consumers');
  const [rows, setRows] = useState<DbRow[]>([]);
  const [consumers, setConsumers] = useState<DbRow[]>([]);
  const [selectedConsumer, setSelectedConsumer] = useState<DbRow | null>(null);
  const [consumerMenuOpen, setConsumerMenuOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [consumerSearch, setConsumerSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<DbRow | null>(null);
  const [draft, setDraft] = useState<FieldDraft>({});
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AdminDatabaseSnapshot | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');

  const fetchConsumers = useCallback(async () => {
    const { data: authData } = await supabase.auth.getSession();
    const userId = authData.session?.user.id;
    if (userId) {
      const local = await adminDataDownloadService.getSnapshot(userId);
      if (local) { setSnapshot(local); setConsumers([...(local.consumers as DbRow[])].sort((a, b) => String(a.meter_number ?? '').localeCompare(String(b.meter_number ?? ''), undefined, { numeric: true, sensitivity: 'base' }))); return; }
    }
    const { data, error: queryError } = await supabase.from('consumers')
      .select('id,serial_number,meter_number,full_name,is_active');
    if (queryError) throw queryError;
    setConsumers([...(data ?? []) as DbRow[]].sort((a, b) => String(a.meter_number ?? '').localeCompare(String(b.meter_number ?? ''), undefined, { numeric: true, sensitivity: 'base' })));
  }, []);

  const fetchTable = useCallback(async (target: TableName, consumerId?: string | null, pageIndex = 0, append = false, includeInactive = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;
      const local = userId ? await adminDataDownloadService.getSnapshot(userId) : null;
      if (local) {
        setSnapshot(local);
        let localRows = local[target] as DbRow[];
        const activeConsumerIds = new Set((local.consumers as DbRow[]).filter(row => row.is_active !== false).map(row => String(row.id)));
        if (!includeInactive && target === 'consumers') localRows = localRows.filter(row => row.is_active !== false);
        if (!includeInactive && target === 'ledgers') localRows = localRows.filter(row => activeConsumerIds.has(String(row.consumer_id)));
        if (target === 'consumers') localRows = [...localRows].sort((a, b) => String(a.meter_number ?? '').localeCompare(String(b.meter_number ?? ''), undefined, { numeric: true, sensitivity: 'base' }));
        if (target === 'ledgers') {
          const meterByConsumer = new Map((local.consumers as DbRow[]).map(row => [String(row.id), String(row.meter_number ?? '')]));
          localRows = localRows.map(row => ({ ...row, meter_number: meterByConsumer.get(String(row.consumer_id)) ?? '' }));
          localRows.sort((a, b) => String(a.meter_number ?? '').localeCompare(String(b.meter_number ?? ''), undefined, { numeric: true, sensitivity: 'base' }) || String(b.issue_date ?? '').localeCompare(String(a.issue_date ?? '')) || String(b.bill_id ?? '').localeCompare(String(a.bill_id ?? ''), undefined, { numeric: true }));
        }
        if (consumerId && target === 'consumers') localRows = localRows.filter(row => row.id === consumerId);
        if (consumerId && target === 'ledgers') localRows = localRows.filter(row => row.consumer_id === consumerId);
        const start = pageIndex * PAGE_SIZE;
        const pageRows = localRows.slice(start, start + PAGE_SIZE);
        setRows(previous => append ? [...previous, ...pageRows] : pageRows);
        setHasMore(localRows.length > start + PAGE_SIZE);
        setPage(pageIndex);
        setError(null);
        return;
      }
      // Fetch only the requested page. Downloading every ledger row before rendering page one caused long UI stalls.
      const start = pageIndex * PAGE_SIZE;
      let query: any = target === 'ledgers'
        ? supabase.from('ledgers').select('*, consumers!inner(meter_number,is_active)')
        : supabase.from(target).select('*');
      if (consumerId && target === 'consumers') query = query.eq('id', consumerId);
      if (consumerId && target === 'ledgers') query = query.eq('consumer_id', consumerId);
      if (target === 'consumers') { if (!includeInactive) query = query.eq('is_active', true); query = query.order('meter_number', { ascending: true }); }
      else if (target === 'ledgers') { if (!includeInactive) query = query.eq('consumers.is_active', true); query = query.order('meter_number', { ascending: true, foreignTable: 'consumers' }).order('issue_date', { ascending: false }).order('bill_id', { ascending: false }); }
      else query = query.order('created_at', { ascending: false });
      const { data, error: queryError } = await query.range(start, start + PAGE_SIZE - 1);
      if (queryError) throw queryError;
      let pageRows = (data ?? []) as DbRow[];
      if (target === 'consumers') pageRows.sort((a, b) => String(a.meter_number ?? '').localeCompare(String(b.meter_number ?? ''), undefined, { numeric: true, sensitivity: 'base' }));
      else if (target === 'ledgers') {
        pageRows = pageRows.map(row => {
          const related = row.consumers as DbRow | null;
          const { consumers: _relatedConsumers, ...ledgerRow } = row;
          return { ...ledgerRow, meter_number: related?.meter_number ?? '' };
        });
        pageRows.sort((a, b) => String(a.meter_number ?? '').localeCompare(String(b.meter_number ?? ''), undefined, { numeric: true, sensitivity: 'base' }) || String(b.issue_date ?? '').localeCompare(String(a.issue_date ?? '')) || String(b.bill_id ?? '').localeCompare(String(a.bill_id ?? ''), undefined, { numeric: true }));
      }
      setRows(previous => append ? [...previous, ...pageRows] : pageRows);
      setHasMore(pageRows.length === PAGE_SIZE);
      setPage(pageIndex);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load this table.';
      setError(message);
      setRows([]);
    } finally { setLoading(false); setLoadingMore(false); }
  }, []);

  useEffect(() => {
    void Promise.all([fetchConsumers(), fetchTable(table, selectedConsumer?.id as string | undefined, 0, false, showInactive)]).catch(cause => {
      setError(cause instanceof Error ? cause.message : 'Unable to load database data.');
    });
  }, [fetchConsumers, fetchTable, table, showInactive, selectedConsumer]);

  useEffect(() => {
    const paramId = Array.isArray(params.consumerId) ? params.consumerId[0] : params.consumerId;
    if (!paramId || appliedConsumerParam.current || !consumers.length) return;
    const match = consumers.find(row => String(row.id) === paramId);
    if (!match) return;
    appliedConsumerParam.current = true;
    setTable('consumers');
    setSelectedConsumer(match);
    setShowInactive(match.is_active === false);
    setPage(0);
    void fetchTable('consumers', paramId, 0, false, match.is_active === false);
  }, [params.consumerId, consumers, fetchTable]);

  const downloadAllData = async () => {
    if (!isOnline) { Alert.alert('Internet required', 'Connect to the internet to download the latest complete database.'); return; }
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) { Alert.alert('Session expired', 'Sign in again before downloading database data.'); return; }
    setDownloading(true);
    setDownloadProgress('Preparing download…');
    try {
      const saved = await adminDataDownloadService.downloadAll(userId, tableName => setDownloadProgress(`Downloading ${tableName}…`));
      setSnapshot(saved);
      setConsumers(saved.consumers as DbRow[]);
      setPage(0);
      await fetchTable(table, selectedConsumer?.id as string | undefined, 0, false, showInactive);
      Alert.alert('Download complete', `${saved.consumers.length} consumers, ${saved.profiles.length} profiles and ${saved.ledgers.length} billing records are now stored on this device.`);
    } catch (cause) {
      Alert.alert('Download failed', cause instanceof Error ? cause.message : 'The database snapshot could not be saved.');
    } finally { setDownloading(false); setDownloadProgress(''); }
  };

  const changeTable = (next: TableName) => {
    setTable(next);
    setSelectedConsumer(null);
    setSearch('');
    setPage(0);
  };

  const refresh = async () => {
    if (snapshot && isOnline) {
      await downloadAllData();
      return;
    }
    setRefreshing(true);
    try {
      await fetchConsumers();
      setPage(0);
      await fetchTable(table, selectedConsumer?.id as string | undefined, 0, false, showInactive);
    } catch (cause) {
      Alert.alert('Refresh failed', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setRefreshing(false); }
  };

  const visibleColumns = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach(row => Object.keys(row).forEach(key => { if (!HIDDEN_FIELDS.has(key)) keys.add(key); }));
    const all = [...keys];
    const preferred = table === 'consumers'
      ? ['serial_number', 'meter_number', 'full_name', 'cnic', 'phone', 'address', 'security_deposit', 'is_active', 'left_date', 'connection_date', 'phase_type']
      : table === 'ledgers'
        ? ['meter_number', 'bill_id', 'consumer_id', 'month_year', 'issue_date', 'due_date', 'old_unit', 'new_unit', 'units_consumed', 'rate_per_unit', 'arrears', 'fine', 'adjustment_rupees', 'total_rupees', 'receiving_amount', 'status', 'paid_date', 'payment_method', 'remarks']
        : ['id', 'role', 'full_name', 'phone', 'consumer_id', 'status', 'created_at'];
    return [...preferred.filter(key => all.includes(key)), ...all.filter(key => !preferred.includes(key))];
  }, [rows, table]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const activeFiltered = table === 'consumers' && !showInactive ? rows.filter(row => row.is_active !== false) : rows;
    if (!q) return activeFiltered;
    return activeFiltered.filter(row => visibleColumns.some(key => displayValue(row[key]).toLowerCase().includes(q)));
  }, [rows, search, visibleColumns, table, showInactive]);

  const filteredConsumers = useMemo(() => {
    const q = consumerSearch.trim().toLowerCase();
    return consumers.filter(row => (showInactive || row.is_active !== false) && (!q || [row.full_name, row.serial_number, row.meter_number].some(value => displayValue(value).toLowerCase().includes(q)))).sort((a, b) => String(a.meter_number ?? '').localeCompare(String(b.meter_number ?? ''), undefined, { numeric: true, sensitivity: 'base' }));
  }, [consumers, consumerSearch, showInactive]);

  const openEditor = (row: DbRow) => {
    if (!isOnline) { Alert.alert('Offline', 'Connect to the internet before editing database records.'); return; }
    const next: FieldDraft = {};
    Object.entries(row).forEach(([key, value]) => {
      if (HIDDEN_FIELDS.has(key) || LOCKED_FIELDS.has(key) || (table === 'ledgers' && key === 'meter_number')) return;
      next[key] = isBoolean(value) ? value : value === null || value === undefined ? '' : String(value);
    });
    setEditing(row);
    setDraft(next);
    setPaymentHistory([]);
    setPaymentHistoryError(null);
    if (table === 'ledgers' && row.bill_id) {
      setPaymentHistoryLoading(true);
      void paymentService.listForBill(String(row.bill_id))
        .then(setPaymentHistory)
        .catch(error => setPaymentHistoryError(error instanceof Error ? error.message : 'Payment history is unavailable.'))
        .finally(() => setPaymentHistoryLoading(false));
    }
  };

  const updateDraft = (key: string, value: string | boolean) => setDraft(previous => ({ ...previous, [key]: value }));

  const saveChanges = async () => {
    if (!editing) return;
    if (!isOnline) { Alert.alert('Offline', 'Database edits require an active internet connection.'); return; }
    const primaryKey = TABLES.find(item => item.key === table)!.primaryKey;
    const id = editing[primaryKey];
    if (id === null || id === undefined) {
      Alert.alert('Cannot save', `The row has no ${primaryKey} value.`);
      return;
    }
    const payload: DbRow = {};
    for (const [key, raw] of Object.entries(draft)) {
      if (LOCKED_FIELDS.has(key) || HIDDEN_FIELDS.has(key) || (table === 'ledgers' && key === 'meter_number')) continue;
      const original = editing[key];
      if (isBoolean(original)) { payload[key] = Boolean(raw); continue; }
      if (isNumber(original)) {
        if (String(raw).trim() === '') { payload[key] = null; continue; }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) { Alert.alert('Invalid value', `${labelOf(key)} must be a valid number.`); return; }
        payload[key] = parsed;
      } else {
        payload[key] = String(raw).trim() === '' ? null : String(raw).trim();
      }
    }
    if (!Object.keys(payload).length) { setEditing(null); return; }
    setSaving(true);
    try {
      const { data, error: updateError } = await supabase.from(table).update(payload).eq(primaryKey, id).select('*').single();
      if (updateError) throw updateError;
      setRows(previous => previous.map(row => row[primaryKey] === id ? data as DbRow : row));
      if (snapshot) {
        const updatedSnapshot = { ...snapshot, [table]: (snapshot[table] as DbRow[]).map(row => row[primaryKey] === id ? data as DbRow : row) };
        await adminDataDownloadService.saveSnapshot(updatedSnapshot);
        setSnapshot(updatedSnapshot);
      }
      setEditing(null);
      Alert.alert('Changes saved', 'The database row has been updated successfully.');
      if (table === 'consumers') await fetchConsumers();
      await refreshData(true);
    } catch (cause) {
      Alert.alert('Update failed', cause instanceof Error ? cause.message : 'The database rejected this update.');
    } finally { setSaving(false); }
  };

  const chooseConsumer = (consumer: DbRow | null) => {
    setSelectedConsumer(consumer);
    setConsumerMenuOpen(false);
    setPage(0);
  };

  const lockedNote = table === 'profiles'
    ? 'Profile IDs and roles are locked here. Change access roles only through a trusted, server-authorized admin workflow.'
    : 'Primary keys and system timestamps are read-only.';

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border bg-surface px-4 pb-4 pt-5">
        <View className="mb-4 flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-xl border border-border"><ArrowLeft size={19} color={isDarkMode ? '#E8DDEB' : '#38233F'} /></Pressable>
          <View className="flex-1 px-3"><Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">NEAR POWER · ADMIN</Text><Text className="mt-1 text-xl font-bold text-text">Database explorer</Text></View>
          <View className="flex-row gap-2">
            <Pressable onPress={downloadAllData} disabled={downloading || !isOnline} className="h-10 flex-row items-center justify-center gap-1 rounded-xl bg-primary px-3 disabled:opacity-50">{downloading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Database size={15} color="#FFFFFF" />}<Text className="text-xs font-semibold text-on-primary">{downloading ? 'Saving…' : 'Download'}</Text></Pressable>
            <Pressable onPress={refresh} disabled={refreshing} className="h-10 w-10 items-center justify-center rounded-xl border border-border">{refreshing ? <ActivityIndicator size="small" /> : <RefreshCw size={18} color={isDarkMode ? '#C7ACCE' : '#62446A'} />}</Pressable>
          </View>
        </View>
        <Pressable onPress={() => setConsumerMenuOpen(true)} className="mb-3 min-h-12 flex-row items-center justify-between rounded-2xl border border-border bg-background px-4">
          <View className="flex-row items-center gap-3"><Users size={18} color={isDarkMode ? '#C7ACCE' : '#62446A'} /><View><Text className="text-xs text-text-muted">Consumer filter</Text><Text className="text-sm font-semibold text-text">{selectedConsumer ? `${displayValue(selectedConsumer.full_name)} · Meter ${displayValue(selectedConsumer.meter_number)}` : 'All consumers'}</Text></View></View><ChevronDown size={18} color={isDarkMode ? '#C7ACCE' : '#62446A'} />
        </Pressable>
        {table !== 'profiles' ? <View className="mb-3 flex-row items-center justify-between rounded-xl border border-border bg-surface px-3 py-2"><Text className="text-xs font-semibold text-text">Include inactive consumers</Text><Switch value={showInactive} onValueChange={value => { setShowInactive(value); if (!value && selectedConsumer?.is_active === false) setSelectedConsumer(null); }} /></View> : null}
        <View className="flex-row gap-2 rounded-2xl border border-border bg-background p-1">
          {TABLES.map(item => { const Icon = item.icon; const active = table === item.key; return <Pressable key={item.key} onPress={() => changeTable(item.key)} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl px-2 py-3 ${active ? 'bg-primary' : 'bg-transparent'}`}><Icon size={15} color={active ? '#FFFFFF' : (isDarkMode ? '#B7A9BA' : '#625B63')}/><Text className={`text-xs font-semibold ${active ? 'text-on-primary' : 'text-text-secondary'}`}>{item.label}</Text></Pressable>; })}
        </View>
      </View>

      <View className="px-4 pt-4">
        {!isOnline ? <Text className="mb-2 text-xs font-medium text-warning">Offline mode: edits are disabled until the connection is restored.</Text> : null}
        {downloading ? <Text className="mb-2 text-xs font-semibold text-tertiary">{downloadProgress}</Text> : null}
        {snapshot ? <Text className="mb-2 text-[11px] text-text-muted">Local database · downloaded {new Date(snapshot.downloadedAt).toLocaleString('en-PK')}</Text> : <Text className="mb-2 text-[11px] text-warning">No complete local database yet. Download it to enable instant offline browsing.</Text>}
        <View className="mb-3 h-11 flex-row items-center rounded-xl border border-input-border bg-input px-3"><Search size={16} color={isDarkMode ? '#A99BAE' : '#897F85'} /><TextInput value={search} onChangeText={setSearch} placeholder={`Search ${table}...`} placeholderTextColor="#897F85" className="ml-2 flex-1 text-sm text-text" /></View>
        <View className="mb-2 flex-row items-center justify-between"><Text className="text-sm font-semibold text-text">{labelOf(table)} <Text className="font-normal text-text-muted">· {filteredRows.length}{hasMore ? '+' : ''} rows</Text></Text><View className="flex-row items-center gap-1"><Pencil size={13} color={isDarkMode ? '#C7ACCE' : '#62446A'} /><Text className="text-xs text-text-muted">Tap a row to edit</Text></View></View>
      </View>

      {error ? <View className="mx-4 mb-3 rounded-xl border border-danger/30 bg-danger-bg p-3"><Text className="text-sm text-danger">{error}</Text></View> : null}
      {table === 'profiles' ? <View className="mx-4 mb-3 flex-row items-start gap-2 rounded-xl border border-warning/30 bg-warning-bg p-3"><ShieldAlert size={16} color={isDarkMode ? '#E8BE78' : '#94621F'} /><Text className="flex-1 text-xs leading-5 text-warning">{lockedNote}</Text></View> : null}
      {table !== 'profiles' ? <Text className="mx-4 mb-3 text-xs text-text-muted">{lockedNote}</Text> : null}

      <DatabaseRowsTable
        loading={loading}
        isDarkMode={isDarkMode}
        columns={visibleColumns}
        rows={filteredRows}
        hasMore={hasMore && !search.trim()}
        loadingMore={loadingMore}
        pageSize={PAGE_SIZE}
        primaryKey={TABLES.find(item => item.key === table)!.primaryKey}
        onSelectRow={openEditor}
        onLoadMore={() => void fetchTable(table, selectedConsumer?.id as string | undefined, page + 1, true, showInactive)}
      />

      <Modal visible={consumerMenuOpen} transparent animationType="fade" onRequestClose={() => setConsumerMenuOpen(false)}>
        <View className="flex-1 bg-black/25">
          <Pressable className="absolute inset-0" onPress={() => setConsumerMenuOpen(false)} />
          <View className="absolute left-4 right-4 top-[150px] max-h-[65%] rounded-2xl border border-border bg-surface p-4 shadow-2xl">
            <View className="mb-3 flex-row items-center justify-between"><View><Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">FILTER RECORDS</Text><Text className="mt-1 text-lg font-bold text-text">Choose consumer</Text></View><Pressable onPress={() => setConsumerMenuOpen(false)} className="h-9 w-9 items-center justify-center rounded-xl border border-border"><X size={18} color={isDarkMode ? '#E8DDEB' : '#38233F'} /></Pressable></View>
            <View className="mb-3 h-11 flex-row items-center rounded-xl border border-input-border bg-input px-3"><Search size={16} color={isDarkMode ? '#A99BAE' : '#897F85'} /><TextInput value={consumerSearch} onChangeText={setConsumerSearch} placeholder="Search consumer or meter" placeholderTextColor="#897F85" className="ml-2 flex-1 text-sm text-text" /></View>
            <Pressable onPress={() => chooseConsumer(null)} className={`mb-2 rounded-xl border p-3 ${!selectedConsumer ? 'border-tertiary bg-tertiary-container' : 'border-border'}`}><Text className="font-semibold text-text">All consumers</Text><Text className="mt-1 text-xs text-text-muted">Show the complete selected table</Text></Pressable>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {filteredConsumers.slice(0, 100).map(consumer => <Pressable key={String(consumer.id)} onPress={() => chooseConsumer(consumer)} className={`mb-2 rounded-xl border p-3 ${selectedConsumer?.id === consumer.id ? 'border-tertiary bg-tertiary-container' : 'border-border bg-background'}`}><View className="flex-row items-center justify-between"><Text numberOfLines={1} className="flex-1 font-semibold text-text">{displayValue(consumer.full_name)}</Text>{selectedConsumer?.id === consumer.id ? <Check size={17} color={isDarkMode ? '#C7ACCE' : '#62446A'} /> : null}</View><Text className="mt-1 text-xs text-text-muted">{displayValue(consumer.serial_number)} · Meter {displayValue(consumer.meter_number)} · {consumer.is_active ? 'Active' : 'Inactive'}</Text></Pressable>)}
              {!filteredConsumers.length ? <Text className="p-4 text-sm text-text-muted">No matching consumers.</Text> : null}
              {filteredConsumers.length > 100 ? <Text className="p-2 text-center text-xs text-text-muted">Showing first 100 matches. Refine your search.</Text> : null}
            </ScrollView>
            <Text className="pt-2 text-xs text-text-muted">{filteredConsumers.length} matching consumers</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="max-h-[88%] rounded-t-3xl bg-surface px-5 pb-8 pt-5">
            <View className="mb-4 flex-row items-center justify-between"><View className="flex-1 pr-3"><Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">EDIT DATABASE ROW</Text><Text className="mt-1 text-lg font-bold text-text">{table === 'consumers' ? displayValue(editing?.full_name) : table === 'ledgers' ? displayValue(editing?.bill_id) : displayValue(editing?.id)}</Text></View><Pressable onPress={() => setEditing(null)} className="h-9 w-9 items-center justify-center rounded-xl border border-border"><X size={18} color={isDarkMode ? '#E8DDEB' : '#38233F'} /></Pressable></View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {editing ? Object.entries(draft).map(([key, value]) => {
                const original = editing[key];
                return <View key={key} className="mb-4"><Text className="mb-2 text-xs font-semibold text-text-secondary">{labelOf(key)}</Text>
                  {isBoolean(original) ? <View className="min-h-12 flex-row items-center justify-between rounded-xl border border-input-border bg-input px-3"><Text className="text-sm text-text">{value ? 'Enabled' : 'Disabled'}</Text><Switch value={Boolean(value)} onValueChange={next => updateDraft(key, next)} trackColor={{ false: '#777078', true: '#8A6B8F' }} /></View>
                    : <TextInput value={String(value)} onChangeText={next => updateDraft(key, next)} keyboardType={isNumber(original) ? 'decimal-pad' : 'default'} multiline={key === 'address' || key === 'remarks'} placeholder={`Enter ${labelOf(key).toLowerCase()}`} placeholderTextColor="#897F85" className="min-h-12 rounded-xl border border-input-border bg-input px-3 py-3 text-sm text-text" />}
                </View>;
              }) : null}
              {table === 'ledgers' ? <View className="mb-4 rounded-2xl border border-border bg-background p-3"><Text className="mb-2 text-sm font-bold text-text">Payment history</Text>{paymentHistoryLoading ? <ActivityIndicator/> : paymentHistoryError ? <Text className="text-xs text-warning">{paymentHistoryError}. Apply the supplied database migration if the payments table has not been created.</Text> : paymentHistory.length ? paymentHistory.map(payment => <View key={payment.id} className="mb-2 border-b border-divider pb-2"><View className="flex-row justify-between"><Text className="text-xs font-semibold text-text">{payment.payment_method}</Text><Text className="text-xs font-bold text-text">Rs. {payment.amount.toLocaleString('en-PK')}</Text></View><Text className="mt-1 text-[10px] text-text-muted">{payment.payment_date} · {payment.remarks ?? 'No remarks'}</Text></View>) : <Text className="text-xs text-text-muted">No payment transactions recorded for this bill.</Text>}</View> : null}
            </ScrollView>
            <View className="mt-2 flex-row gap-3"><Pressable onPress={() => setEditing(null)} disabled={saving} className="min-h-12 flex-1 items-center justify-center rounded-xl border border-border"><Text className="font-semibold text-text">Cancel</Text></Pressable><Pressable onPress={saveChanges} disabled={saving} className="min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary">{saving ? <ActivityIndicator color="#FFFFFF" /> : <Check size={17} color="#FFFFFF" />}<Text className="font-semibold text-on-primary">{saving ? 'Saving…' : 'Save changes'}</Text></Pressable></View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
