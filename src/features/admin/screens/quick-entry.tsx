import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  Search,
  Wallet,
} from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { useApp } from '@/context/AppContext';
import { billingSettingsService, DEFAULT_BILLING_SETTINGS, type BillingSettings } from '@/services/billingSettingsService';
import { QuickEntryField as Field } from '@/features/admin/quick-entry/components/QuickEntryField';
import { paymentService, PAYMENT_METHODS, type PaymentMethod } from '@/services/paymentService';

type ConsumerRow = {
  id: string;
  serial_number: string;
  meter_number: string;
  full_name: string;
  is_active: boolean;
};

type PreviousBill = {
  bill_id: string;
  consumer_id: string;
  new_unit: number | string;
  rate_per_unit: number | string;
  total_rupees: number | string;
  receiving_amount: number | string;
  issue_date: string;
};

type Entry = {
  consumer: ConsumerRow;
  oldUnit: string;
  newUnit: string;
  rate: string;
  fine: string;
  adjustment: string;
  arrears: string;
  receivingAmount: string;
  status: 'PAID' | 'UNPAID';
  paymentMethod: string;
  remarks: string;
  previousBillId: string | null;
  alreadyBilled: boolean;
  currentBill: { billId: string; total: number; received: number; status: string } | null;
};


const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const calculateTotal = (units: number, rate: number, minimum: number, arrears: number, fine: number, adjustment: number) => Math.max(units * rate, minimum) + arrears + fine + adjustment;
const money = (value: number) => `Rs. ${value.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const numeric = (value: string) => {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};
const dateOnly = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const monthLabel = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1]}-${String(year).slice(-2)}`;
};
const previousMonthEnd = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return dateOnly(new Date(year, month - 1, 0));
};
const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const moveMonth = (key: string, amount: number) => {
  const [year, month] = key.split('-').map(Number);
  const next = new Date(year, month - 1 + amount, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
};
const makeNextBillId = (consumer: ConsumerRow, previousBillId: string | null) => {
  const previousMatch = previousBillId?.match(/^(.*-)(\d+)$/);
  if (previousMatch) return `${previousMatch[1]}${Number(previousMatch[2]) + 1}`;
  const serialPart = consumer.serial_number.match(/\d+/)?.[0] ?? consumer.serial_number.replace(/[^a-zA-Z0-9]/g, '');
  return `BILL-${serialPart || consumer.id}-${1}`;
};

export default function AdminQuickEntryScreen() {
  const router = useRouter();
  const { isDarkMode, isOnline, refreshData } = useApp();
  const [period, setPeriod] = useState(currentMonthKey);
  const [consumers, setConsumers] = useState<ConsumerRow[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingSettings, setBillingSettings] = useState<BillingSettings>(DEFAULT_BILLING_SETTINGS);
  const [paymentTarget, setPaymentTarget] = useState<{ billId: string; consumerName: string; total: number; received: number } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentSaving, setPaymentSaving] = useState(false);

  const calculateEntryAmounts = (entry: Entry) => {
    const units = numeric(entry.newUnit) - numeric(entry.oldUnit);
    const rate = numeric(entry.rate);
    const arrears = numeric(entry.arrears);
    const adjustment = numeric(entry.adjustment);
    const received = Math.max(0, numeric(entry.receivingAmount));
    const base = calculateTotal(units, rate, billingSettings.min_bill_amount, arrears, 0, adjustment);
    const underpaymentBase = billingSettings.underpayment_fine_basis === 'TOTAL_BILL' ? base : Math.max(0, base - received);
    const underpaymentFine = received < base ? Math.round(underpaymentBase * billingSettings.underpayment_fine_percent / 100) : 0;
    const due = new Date(`${previousMonthEnd(period)}T00:00:00`);
    const today = new Date(`${dateOnly(new Date())}T00:00:00`);
    const lateDays = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000) - billingSettings.grace_period_days);
    const lateFine = lateDays > 0
      ? billingSettings.late_fine_type === 'FIXED' ? billingSettings.fixed_late_fine : billingSettings.per_day_late_fine * lateDays
      : 0;
    let fine = Math.max(0, numeric(entry.fine)) + underpaymentFine + lateFine;
    if (billingSettings.fine_cap_enabled && billingSettings.fine_cap !== null) fine = Math.min(fine, billingSettings.fine_cap);
    return { units, base, fine, total: calculateTotal(units, rate, billingSettings.min_bill_amount, arrears, fine, adjustment) };
  };

  const calculateFullPaymentTotal = (entry: Entry) => {
    const base = calculateTotal(numeric(entry.newUnit) - numeric(entry.oldUnit), numeric(entry.rate), billingSettings.min_bill_amount, numeric(entry.arrears), 0, numeric(entry.adjustment));
    return calculateEntryAmounts({ ...entry, receivingAmount: String(base) }).total;
  };

  const loadData = useCallback(async () => {
    if (!isOnline) {
      setError('Connect to the internet to load current meter readings and submit billing entries.');
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;
      if (!userId) throw new Error('Your session has expired. Sign in again.');
      const settingsPromise = billingSettingsService.get(userId, true).catch(() => DEFAULT_BILLING_SETTINGS);

      const { data: consumerData, error: consumerError } = await supabase
        .from('consumers')
        .select('id,serial_number,meter_number,full_name,is_active')
        .eq('is_active', true);
      if (consumerError) throw consumerError;
      const currentSettings = await settingsPromise;
      setBillingSettings(currentSettings);
      const activeConsumers = ((consumerData ?? []) as ConsumerRow[]).sort((a, b) => String(a.meter_number ?? '').localeCompare(String(b.meter_number ?? ''), undefined, { numeric: true, sensitivity: 'base' }));

      // Prefer one database-side DISTINCT ON query instead of issuing one network
      // request per consumer. Keep a fallback for projects that have not applied
      // the new migration yet.
      let latestByConsumer = new Map<string, PreviousBill | null>();
      const latestRpc = await supabase.rpc('get_latest_consumer_bills');
      if (!latestRpc.error) {
        latestByConsumer = new Map(((latestRpc.data ?? []) as PreviousBill[]).map(row => [row.consumer_id, row]));
      } else if (['PGRST202', '42883'].includes(latestRpc.error.code ?? '')) {
        const latestResults = await Promise.all(activeConsumers.map(async consumer => {
          const { data, error: billError } = await supabase
            .from('ledgers')
            .select('bill_id,consumer_id,new_unit,rate_per_unit,total_rupees,receiving_amount,issue_date')
            .eq('consumer_id', consumer.id)
            .order('issue_date', { ascending: false })
            .order('bill_id', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (billError) throw billError;
          return [consumer.id, (data ?? null) as PreviousBill | null] as const;
        }));
        latestByConsumer = new Map(latestResults);
      } else {
        throw latestRpc.error;
      }

      const { data: periodData, error: periodError } = await supabase
        .from('ledgers')
        .select('bill_id,consumer_id,total_rupees,receiving_amount,status')
        .eq('month_year', monthLabel(period));
      if (periodError) throw periodError;
      const billByConsumer = new Map((periodData ?? []).map(row => [String(row.consumer_id), row]));
      const billedIds = new Set(billByConsumer.keys());

      const nextEntries: Record<string, Entry> = {};
      for (const consumer of activeConsumers) {
        const previous = latestByConsumer.get(consumer.id);
        const previousArrears = previous
          ? Number(previous.total_rupees) - Number(previous.receiving_amount)
          : 0;
        nextEntries[consumer.id] = {
          consumer,
          oldUnit: previous ? String(previous.new_unit) : '0',
          newUnit: '',
          rate: String(currentSettings.rate_per_unit),
          fine: '0',
          adjustment: '0',
          arrears: String(previousArrears),
          receivingAmount: '0',
          status: 'UNPAID',
          paymentMethod: 'Cash',
          remarks: '',
          previousBillId: previous?.bill_id ?? null,
          alreadyBilled: billedIds.has(consumer.id),
          currentBill: billByConsumer.has(consumer.id) ? { billId: String(billByConsumer.get(consumer.id)!.bill_id), total: Number(billByConsumer.get(consumer.id)!.total_rupees), received: Number(billByConsumer.get(consumer.id)!.receiving_amount), status: String(billByConsumer.get(consumer.id)!.status) } : null,
        };
      }
      setConsumers(activeConsumers);
      setEntries(nextEntries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load consumers and previous meter readings.');
    } finally {
      setLoading(false);
    }
  }, [isOnline, period]);

  useEffect(() => { void loadData(); }, [loadData]);

  const updateEntry = (consumerId: string, patch: Partial<Entry>) => {
    setEntries(previous => {
      const current = previous[consumerId];
      if (!current) return previous;
      const next = { ...current, ...patch };
      const billingFieldsChanged = ['oldUnit', 'newUnit', 'rate', 'fine', 'adjustment', 'arrears']
        .some(key => Object.prototype.hasOwnProperty.call(patch, key));
      if (next.status === 'PAID' && billingFieldsChanged && !Object.prototype.hasOwnProperty.call(patch, 'receivingAmount')) {
        const total = calculateFullPaymentTotal(next);
        if (Number.isFinite(total)) next.receivingAmount = String(Math.max(0, total));
      }
      return { ...previous, [consumerId]: next };
    });
  };

  const filteredConsumers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return consumers;
    return consumers.filter(consumer =>
      [consumer.full_name, consumer.serial_number, consumer.meter_number]
        .some(value => value.toLowerCase().includes(query)),
    );
  }, [consumers, search]);

  const prepared = useMemo(() => consumers.filter(consumer => {
    const entry = entries[consumer.id];
    return entry && !entry.alreadyBilled && entry.newUnit.trim() !== '';
  }), [consumers, entries]);

  const changePeriod = (amount: number) => {
    const apply = () => setPeriod(value => moveMonth(value, amount));
    if (prepared.length > 0) {
      Alert.alert('Discard unsaved entries?', `Changing the billing period will discard ${prepared.length} unsaved meter entries.`, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard and change', style: 'destructive', onPress: apply },
      ]);
    } else {
      apply();
    }
  };

  const summary = useMemo(() => {
    let total = 0;
    let paid = 0;
    for (const consumer of prepared) {
      const entry = entries[consumer.id];
      const amount = calculateEntryAmounts(entry).total;
      total += amount;
      if (entry.status === 'PAID') paid += 1;
    }
    return { count: prepared.length, total, paid };
  }, [prepared, entries, billingSettings]);

  const setStatus = (consumerId: string, status: 'PAID' | 'UNPAID') => {
    const entry = entries[consumerId];
    const total = status === 'PAID' ? calculateFullPaymentTotal(entry) : 0;
    updateEntry(consumerId, {
      status,
      receivingAmount: status === 'PAID' && Number.isFinite(total) ? String(Math.max(0, total)) : '0',
      paymentMethod: entry.paymentMethod || 'Cash',
    });
  };

  const refresh = async () => {
    const reload = async () => {
      setRefreshing(true);
      try { await loadData(); }
      finally { setRefreshing(false); }
    };
    if (prepared.length > 0) {
      Alert.alert('Discard unsaved entries?', `Refreshing will reload the meter list and discard ${prepared.length} unsaved entries.`, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard and refresh', style: 'destructive', onPress: () => { void reload(); } },
      ]);
    } else {
      await reload();
    }
  };

  const saveEntries = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Quick billing requires an internet connection.');
      return;
    }
    if (!prepared.length) {
      Alert.alert('No readings entered', 'Enter a new meter reading for at least one consumer before saving.');
      return;
    }

    const payloads: Record<string, unknown>[] = [];
    for (const consumer of prepared) {
      const entry = entries[consumer.id];
      const oldUnit = numeric(entry.oldUnit);
      const newUnit = numeric(entry.newUnit);
      const rate = numeric(entry.rate);
      const adjustment = numeric(entry.adjustment);
      const arrears = numeric(entry.arrears);
      const receivingAmount = numeric(entry.receivingAmount);
      const fine = numeric(entry.fine);
      const total = calculateEntryAmounts(entry).total;

      if (![oldUnit, newUnit, rate, fine, adjustment, receivingAmount, arrears].every(Number.isFinite)) {
        Alert.alert('Invalid number', `Check the numeric fields for ${consumer.full_name}.`);
        return;
      }
      if (newUnit < oldUnit) {
        Alert.alert('Reading is too low', `New reading for ${consumer.full_name} cannot be lower than the previous reading.`);
        return;
      }
      if (rate <= 0 || fine < 0 || receivingAmount < 0) {
        Alert.alert('Invalid amount', `Rate must be greater than zero; fine and received amount cannot be negative for ${consumer.full_name}.`);
        return;
      }
      if (total < 0) {
        Alert.alert('Negative bill total', `The calculated bill for ${consumer.full_name} is negative. Review arrears and adjustments.`);
        return;
      }
      if (receivingAmount > total) {
        Alert.alert('Payment exceeds bill', `For ${consumer.full_name}, the received amount cannot exceed ${money(total)}.`);
        return;
      }
      if (entry.status === 'PAID' && receivingAmount < total) {
        Alert.alert('Payment amount is short', `For ${consumer.full_name}, a PAID bill must have received amount at least equal to ${money(total)}. Use UNPAID for partial payments.`);
        return;
      }
      if (receivingAmount > 0 && !entry.paymentMethod.trim()) {
        Alert.alert('Payment method required', `Select a payment method for ${consumer.full_name}.`);
        return;
      }

      const billId = makeNextBillId(consumer, entry.previousBillId);
      const billDate = previousMonthEnd(period);
      const paid = entry.status === 'PAID';
      payloads.push({
        bill_id: billId,
        consumer_id: consumer.id,
        month_year: monthLabel(period),
        issue_date: billDate,
        due_date: billDate,
        old_unit: oldUnit,
        new_unit: newUnit,
        units_consumed: newUnit - oldUnit,
        rate_per_unit: rate,
        arrears,
        fine,
        adjustment_rupees: adjustment,
        total_rupees: total,
        receiving_amount: receivingAmount,
        status: paid ? 'PAID' : 'UNPAID',
        paid_date: paid ? dateOnly(new Date()) : null,
        payment_method: receivingAmount > 0 ? entry.paymentMethod : null,
        remarks: entry.remarks.trim() || null,
      });
    }

    Alert.alert(
      'Confirm billing entries',
      `Create ${payloads.length} bills for ${monthLabel(period)}? The database validates readings, calculates the bill and records any initial payment in one transaction.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save bills', onPress: async () => {
          setSaving(true);
          try {
            const { data: createdCount, error: insertError } = await supabase.rpc('create_monthly_bills', { p_bills: payloads });
            if (insertError) throw insertError;
            Alert.alert('Saved', `${Number(createdCount ?? payloads.length)} billing records were created successfully.`);
            await Promise.all([loadData(), refreshData(true)]);
          } catch (cause) {
            Alert.alert('Save failed', cause instanceof Error ? cause.message : 'Supabase rejected the billing records. No success was reported.');
          } finally {
            setSaving(false);
          }
        } },
      ],
    );
  };

  const openPayment = (entry: Entry) => {
    if (!entry.currentBill) return;
    const remaining = Math.max(0, entry.currentBill.total - entry.currentBill.received);
    if (remaining <= 0) { Alert.alert('Already paid', 'This bill has no outstanding balance.'); return; }
    setPaymentTarget({ billId: entry.currentBill.billId, consumerName: entry.consumer.full_name, total: entry.currentBill.total, received: entry.currentBill.received });
    setPaymentAmount(String(remaining));
    setPaymentMethod('Cash');
  };

  const submitPayment = async () => {
    if (!paymentTarget || !isOnline) return;
    const amount = Number(paymentAmount);
    const remaining = Math.max(0, paymentTarget.total - paymentTarget.received);
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      Alert.alert('Invalid payment', `Enter an amount greater than zero and no more than ${money(remaining)}.`);
      return;
    }
    setPaymentSaving(true);
    try {
      await paymentService.record({ billId: paymentTarget.billId, amount, method: paymentMethod });
      setPaymentTarget(null);
      Alert.alert('Payment recorded', `${money(amount)} received from ${paymentTarget.consumerName} via ${paymentMethod}.`);
      await Promise.all([loadData(), refreshData(true)]);
    } catch (cause) {
      Alert.alert('Payment failed', cause instanceof Error ? cause.message : 'The payment could not be recorded.');
    } finally { setPaymentSaving(false); }
  };

  const accent = isDarkMode ? '#C7ACCE' : '#62446A';

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border bg-surface px-4 pb-4 pt-5">
        <View className="mb-4 flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-xl border border-border">
            <ArrowLeft size={19} color={accent} />
          </Pressable>
          <View className="flex-1 px-3">
            <Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">NEAR POWER · ADMIN</Text>
            <Text className="mt-1 text-xl font-bold text-text">Quick billing entry</Text>
          </View>
          <Pressable onPress={refresh} disabled={refreshing || loading} className="h-10 w-10 items-center justify-center rounded-xl border border-border">
            {refreshing ? <ActivityIndicator size="small" /> : <RefreshCw size={18} color={accent} />}
          </Pressable>
        </View>

        <View className="mb-3 rounded-xl border border-tertiary/30 bg-tertiary-container px-3 py-2"><Text className="text-xs font-semibold text-text">Billing rules: minimum {money(billingSettings.min_bill_amount)} · {money(billingSettings.rate_per_unit)}/unit · underpayment fine {billingSettings.underpayment_fine_percent}% · {billingSettings.underpayment_fine_basis === 'TOTAL_BILL' ? 'total bill' : 'unpaid balance'}</Text></View>
        <View className="rounded-2xl border border-border bg-background p-3">
          <View className="mb-2 flex-row items-center gap-2">
            <CalendarDays size={16} color={accent} />
            <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">Billing period</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Pressable onPress={() => changePeriod(-1)} className="h-10 w-10 items-center justify-center rounded-xl border border-border">
              <ChevronLeft size={18} color={accent} />
            </Pressable>
            <View className="items-center">
              <Text className="text-lg font-bold text-text">{monthLabel(period)}</Text>
              <Text className="text-xs text-text-muted">{period}</Text>
            </View>
            <Pressable onPress={() => changePeriod(1)} className="h-10 w-10 items-center justify-center rounded-xl border border-border">
              <ChevronRight size={18} color={accent} />
            </Pressable>
          </View>
        </View>
      </View>

      <View className="px-4 pt-3">
        {!isOnline ? <Text className="mb-2 text-xs font-medium text-warning">Offline: loading and saving billing entries are disabled.</Text> : null}
        <View className="mb-3 h-11 flex-row items-center rounded-xl border border-input-border bg-input px-3">
          <Search size={16} color={accent} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search consumer, serial or meter" placeholderTextColor="#897F85" className="ml-2 flex-1 text-sm text-text" />
        </View>
        <View className="mb-3 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-semibold text-text">Active meters</Text>
            <Text className="mt-0.5 text-xs text-text-muted">{consumers.length} consumers · {prepared.length} readings ready</Text>
          </View>
          <View className="items-end">
            <Text className="text-xs text-text-muted">Estimated total</Text>
            <Text className="text-sm font-bold text-text">{money(summary.total)}</Text>
          </View>
        </View>
      </View>

      {error ? <View className="mx-4 mb-3 rounded-xl border border-danger/30 bg-danger-bg p-3"><Text className="text-sm text-danger">{error}</Text></View> : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={accent} />
          <Text className="mt-3 text-sm text-text-muted">Loading active meters and previous readings…</Text>
        </View>
      ) : (
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerClassName="px-4 pb-32">
          {filteredConsumers.length === 0 ? (
            <View className="items-center rounded-2xl border border-border bg-surface p-8">
              <ClipboardList size={28} color={accent} />
              <Text className="mt-3 text-sm font-semibold text-text">No matching meters</Text>
            </View>
          ) : filteredConsumers.map(consumer => {
            const entry = entries[consumer.id];
            if (!entry) return null;
            const oldUnit = numeric(entry.oldUnit);
            const newUnit = numeric(entry.newUnit);
            const rate = numeric(entry.rate);
            const arrears = numeric(entry.arrears);
            const { units, fine: calculatedFine, total } = calculateEntryAmounts(entry);
            const validTotal = Number.isFinite(total) ? total : 0;
            return (
              <View key={consumer.id} className={`mb-3 rounded-2xl border ${entry.alreadyBilled ? 'border-success/30 bg-success-bg' : 'border-border bg-surface'} p-3`}>
                <View className="mb-3 flex-row items-start justify-between">
                  <View className="flex-1 pr-2">
                    <Text numberOfLines={1} className="text-sm font-bold text-text">{consumer.full_name}</Text>
                    <Text className="mt-1 text-xs text-text-muted">{consumer.serial_number} · Meter {consumer.meter_number}</Text>
                    <Text className="mt-1 text-[11px] text-text-muted">Previous bill: {entry.previousBillId ?? 'No previous bill'}</Text>
                  </View>
                  {entry.alreadyBilled ? (
                    <View className="flex-row items-center gap-1 rounded-full bg-success-bg px-2 py-1"><Check size={12} color="#347052" /><Text className="text-[10px] font-semibold text-success">Already billed</Text></View>
                  ) : (
                    <Text className="text-[10px] font-semibold text-text-muted">{entry.newUnit.trim() ? 'READY' : 'PENDING'}</Text>
                  )}
                </View>

                {!entry.alreadyBilled ? <>
                  <View className="mb-3 flex-row gap-2">
                    <Field label="Previous reading" value={entry.oldUnit} onChangeText={value => updateEntry(consumer.id, { oldUnit: value })} keyboardType="decimal-pad" />
                    <Field label="New reading" value={entry.newUnit} onChangeText={value => updateEntry(consumer.id, { newUnit: value })} keyboardType="decimal-pad" placeholder="Enter units" />
                    <Field label="Rate / unit" value={entry.rate} onChangeText={value => updateEntry(consumer.id, { rate: value })} keyboardType="decimal-pad" placeholder="Rate" />
                  </View>
                  <View className="mb-3 flex-row gap-2">
                    <Field label="Fine (manual)" value={entry.fine} onChangeText={value => updateEntry(consumer.id, { fine: value })} keyboardType="decimal-pad" />
                    <Field label="Adjustment" value={entry.adjustment} onChangeText={value => updateEntry(consumer.id, { adjustment: value })} keyboardType="decimal-pad" />
                  </View>
                  <View className="mb-3 rounded-xl bg-background p-3">
                    <View className="flex-row justify-between"><Text className="text-xs text-text-muted">Units consumed</Text><Text className="text-xs font-semibold text-text">{Number.isFinite(units) ? units.toLocaleString('en-PK') : '—'}</Text></View>
                    <View className="mt-1 flex-row items-center justify-between"><Text className="text-xs text-text-muted">Previous balance</Text><View className="w-28"><TextInput value={entry.arrears} onChangeText={value => updateEntry(consumer.id, { arrears: value })} keyboardType="decimal-pad" selectTextOnFocus className=" rounded-lg border border-input-border bg-input px-2 text-right text-xs text-text" /></View></View>
                    <View className="mt-1 flex-row justify-between"><Text className="text-[11px] text-text-muted">Energy charge floor</Text><Text className="text-[11px] text-text-muted">{money(Math.max(units * rate, billingSettings.min_bill_amount))}</Text></View>
                    <View className="mt-1 flex-row justify-between"><Text className="text-[11px] text-text-muted">Calculated fine (manual + configured)</Text><Text className="text-[11px] font-semibold text-text">{money(calculatedFine)}</Text></View><View className="mt-2 flex-row justify-between border-t border-divider pt-2"><Text className="text-xs font-semibold text-text">Calculated bill</Text><Text className="text-sm font-bold text-text">{money(validTotal)}</Text></View>
                  </View>
                  <Text className="mb-2 text-[11px] font-semibold text-text-muted">PAYMENT STATUS</Text>
                  <View className="mb-3 flex-row gap-2">
                    {(['UNPAID', 'PAID'] as const).map(status => <Pressable key={status} onPress={() => setStatus(consumer.id, status)} className={`flex-1 items-center rounded-xl border py-2.5 ${entry.status === status ? status === 'PAID' ? 'border-success bg-success-bg' : 'border-warning bg-warning-bg' : 'border-border bg-background'}`}><Text className={`text-xs font-bold ${entry.status === status ? status === 'PAID' ? 'text-success' : 'text-warning' : 'text-text-secondary'}`}>{status}</Text></Pressable>)}
                  </View>
                  <View className="mb-3 flex-row gap-2">
                    <View className="flex-1">
                      <Text className="mb-1 text-[11px] font-semibold text-text-muted">PAYMENT METHOD</Text>
                      <View className="flex-row flex-wrap gap-1.5">
                        {PAYMENT_METHODS.map(method => <Pressable key={method} onPress={() => updateEntry(consumer.id, { paymentMethod: method })} className={`rounded-lg border px-2 py-2 ${entry.paymentMethod === method ? 'border-tertiary bg-tertiary-container' : 'border-border bg-background'}`}><Text className="text-[10px] font-semibold text-text">{method}</Text></Pressable>)}
                      </View>
                    </View>
                  </View>
                  <View className="mb-2 flex-row gap-2">
                    <Field label="Amount received" value={entry.receivingAmount} onChangeText={value => updateEntry(consumer.id, { receivingAmount: value })} keyboardType="decimal-pad" />
                    <View className="flex-1 justify-end"><Text className="mb-1 text-[11px] font-semibold text-text-muted">BALANCE AFTER PAYMENT</Text><View className="h-11 justify-center rounded-xl border border-border bg-background px-3"><Text className="text-sm font-semibold text-text">{money(Math.max(0, validTotal - numeric(entry.receivingAmount)))}</Text></View></View>
                  </View>
                  <View>
                    <Text className="mb-1 text-[11px] font-semibold text-text-muted">REMARKS (OPTIONAL)</Text>
                    <TextInput value={entry.remarks} onChangeText={value => updateEntry(consumer.id, { remarks: value })} placeholder="Additional note" placeholderTextColor="#897F85" className="h-10 rounded-xl border border-input-border bg-input px-3 text-sm text-text" />
                  </View>
                </> : <View><Text className="text-xs text-success">A bill already exists for this consumer in {monthLabel(period)}. This entry is locked to prevent a duplicate.</Text><View className="mt-3 flex-row items-center justify-between"><View><Text className="text-xs text-text-muted">Bill {entry.currentBill?.billId}</Text><Text className="mt-1 text-sm font-bold text-text">Remaining: {money(Math.max(0, (entry.currentBill?.total ?? 0) - (entry.currentBill?.received ?? 0)))}</Text></View><Pressable onPress={() => openPayment(entry)} disabled={!entry.currentBill || (entry.currentBill.total <= entry.currentBill.received)} className="rounded-xl bg-primary px-4 py-3 disabled:opacity-40"><Text className="text-xs font-bold text-on-primary">Record / mark paid</Text></Pressable></View></View>}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!paymentTarget} transparent animationType="fade" onRequestClose={() => setPaymentTarget(null)}>
        <View className="flex-1 justify-center bg-black/50 px-5">
          <View className="rounded-3xl border border-border bg-surface p-5">
            <Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">RECEIVE PAYMENT</Text>
            <Text className="mt-2 text-lg font-bold text-text">{paymentTarget?.consumerName}</Text>
            <Text className="mt-1 text-xs text-text-muted">Bill {paymentTarget?.billId}</Text>
            <View className="mt-4 rounded-xl bg-background p-3"><View className="flex-row justify-between"><Text className="text-xs text-text-muted">Bill total</Text><Text className="text-xs font-semibold text-text">{money(paymentTarget?.total ?? 0)}</Text></View><View className="mt-2 flex-row justify-between"><Text className="text-xs text-text-muted">Already received</Text><Text className="text-xs font-semibold text-text">{money(paymentTarget?.received ?? 0)}</Text></View><View className="mt-2 flex-row justify-between"><Text className="text-xs font-bold text-text">Outstanding</Text><Text className="text-sm font-bold text-text">{money(Math.max(0, (paymentTarget?.total ?? 0) - (paymentTarget?.received ?? 0)))}</Text></View></View>
            <Text className="mb-1 mt-4 text-xs font-semibold text-text-muted">PAYMENT AMOUNT (RS.)</Text>
            <TextInput value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" className="h-12 rounded-xl border border-input-border bg-input px-3 text-base font-semibold text-text" />
            <Text className="mb-2 mt-2 text-[11px] text-text-muted">Save the full outstanding amount to mark this bill paid. A smaller amount records a partial payment.</Text><Text className="mb-2 mt-4 text-xs font-semibold text-text-muted">PAYMENT SOURCE</Text>
            <View className="flex-row flex-wrap gap-2">{PAYMENT_METHODS.map(method => <Pressable key={method} onPress={() => setPaymentMethod(method)} className={`rounded-xl border px-3 py-2.5 ${paymentMethod === method ? 'border-tertiary bg-tertiary-container' : 'border-border bg-background'}`}><Text className="text-xs font-semibold text-text">{method}</Text></Pressable>)}</View>
            <View className="mt-5 flex-row gap-2"><Pressable onPress={() => setPaymentTarget(null)} disabled={paymentSaving} className="min-h-12 flex-1 items-center justify-center rounded-xl border border-border"><Text className="font-semibold text-text">Cancel</Text></Pressable><Pressable onPress={submitPayment} disabled={paymentSaving || !isOnline} className="min-h-12 flex-1 items-center justify-center rounded-xl bg-primary">{paymentSaving ? <ActivityIndicator color="#FFFFFF"/> : <Text className="font-bold text-on-primary">Save payment</Text>}</Pressable></View>
          </View>
        </View>
      </Modal>

      <View className="border-t border-border bg-surface px-4 pb-24 pt-3">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-xs text-text-muted">{summary.count} entries · {summary.paid} marked paid</Text>
          <Text className="text-sm font-bold text-text">{money(summary.total)}</Text>
        </View>
        <Pressable onPress={saveEntries} disabled={saving || loading || !isOnline || !prepared.length} className="h-12 flex-row items-center justify-center gap-2 rounded-xl bg-primary disabled:opacity-50">
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <><Wallet size={17} color="#FFFFFF" /><Text className="text-sm font-bold text-on-primary">Save {prepared.length} billing {prepared.length === 1 ? 'entry' : 'entries'}</Text></>}
        </Pressable>
        <Text className="mt-2 text-center text-[10px] text-text-muted">Only rows with a new reading are submitted. Already-billed meters are skipped.</Text>
      </View>
    </View>
  );
}
