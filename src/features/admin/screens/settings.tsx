import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, LogOut, Save, SlidersHorizontal } from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { useApp } from '@/context/AppContext';
import { billingSettingsService, DEFAULT_BILLING_SETTINGS, type BillingSettings } from '@/services/billingSettingsService';
import { NumericField } from '@/features/admin/settings/components/NumericField';

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} className={`flex-1 items-center rounded-xl border px-3 py-3 ${selected ? 'border-tertiary bg-tertiary-container' : 'border-border bg-background'}`}><Text className={`text-xs font-semibold ${selected ? 'text-tertiary' : 'text-text-secondary'}`}>{label}</Text></Pressable>;
}

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { isDarkMode, isOnline, logout } = useApp();
  const accent = isDarkMode ? '#C7ACCE' : '#62446A';
  const [settings, setSettings] = useState<BillingSettings>(DEFAULT_BILLING_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<BillingSettings>) => setSettings(previous => ({ ...previous, ...patch }));

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session?.user.id) return;
        const loaded = await billingSettingsService.get(data.session.user.id, isOnline);
        if (active) setSettings(loaded);
      } catch (error) {
        Alert.alert('Settings unavailable', error instanceof Error ? error.message : 'Could not load billing settings.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [isOnline]);

  const save = async () => {
    if (!isOnline) { Alert.alert('Offline', 'Connect to the internet to change station-wide billing settings.'); return; }
    const numericValues = [settings.min_bill_amount, settings.rate_per_unit, settings.underpayment_fine_percent,
      settings.fixed_late_fine, settings.per_day_late_fine, settings.grace_period_days];
    if (numericValues.some(value => !Number.isFinite(value) || value < 0) || settings.rate_per_unit <= 0 ||
      (settings.fine_cap_enabled && (settings.fine_cap === null || !Number.isFinite(settings.fine_cap) || settings.fine_cap < 0))) {
      Alert.alert('Invalid settings', 'Amounts, percentage, grace period and fine cap must be valid non-negative numbers. Rate per unit must be greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const userId = data.session?.user.id;
      if (!userId) throw new Error('Your session has expired. Sign in again.');
      const saved = await billingSettingsService.save(userId, settings);
      setSettings(saved);
      Alert.alert('Settings saved', 'New bills will use these settings. Existing issued bills and their fines will remain unchanged.');
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Could not save billing settings. Run the supplied SQL migration first if billing_settings does not exist.');
    } finally { setSaving(false); }
  };

  const signOut = () => Alert.alert('Sign out?', 'You will need to sign in again to access the admin account.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => { void logout(); } }]);

  return <View className="flex-1 bg-background">
    <View className="flex-row items-center border-b border-border bg-surface px-4 pb-4 pt-5"><Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-xl border border-border"><ArrowLeft size={19} color={accent}/></Pressable><View className="ml-3 flex-1"><Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">NEAR POWER · ADMIN</Text><Text className="mt-1 text-xl font-bold text-text">Billing settings</Text></View><SlidersHorizontal size={20} color={accent}/></View>
    {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={accent}/></View> : <ScrollView contentContainerClassName="px-4 pb-32 pt-5" keyboardShouldPersistTaps="handled">
      <Text className="mb-1 text-base font-bold text-text">Base billing rules</Text><Text className="mb-4 text-sm leading-5 text-text-secondary">These values are used for newly generated bills. Issued bills are immutable unless an admin explicitly edits them in Database.</Text>
      <NumericField label="Minimum energy charge (Rs.)" value={String(settings.min_bill_amount)} onChangeText={value => update({ min_bill_amount: Number(value) || 0 })} helper="Minimum charge applied to the current month's energy usage, before arrears and fines."/>
      <NumericField label="Rate per unit (Rs.)" value={String(settings.rate_per_unit)} onChangeText={value => update({ rate_per_unit: Number(value) || 0 })} helper="Tariff per unit consumed."/>
      <View className="mb-4 rounded-2xl border border-border bg-surface p-4"><Text className="mb-2 text-sm font-bold text-text">Underpayment percentage fine</Text><NumericField label="Fine percentage (%)" value={String(settings.underpayment_fine_percent)} onChangeText={value => update({ underpayment_fine_percent: Number(value) || 0 })} helper="Applied when a bill is not fully paid."/><Text className="mb-2 mt-2 text-xs font-semibold text-text-muted">CALCULATE PERCENTAGE ON</Text><View className="flex-row gap-2"><Choice label="Unpaid balance" selected={settings.underpayment_fine_basis === 'UNPAID_BALANCE'} onPress={() => update({ underpayment_fine_basis: 'UNPAID_BALANCE' })}/><Choice label="Total bill" selected={settings.underpayment_fine_basis === 'TOTAL_BILL'} onPress={() => update({ underpayment_fine_basis: 'TOTAL_BILL' })}/></View></View>
      <View className="mb-4 rounded-2xl border border-border bg-surface p-4"><Text className="mb-3 text-sm font-bold text-text">Late payment fine</Text><View className="mb-3 flex-row gap-2"><Choice label="Fixed amount" selected={settings.late_fine_type === 'FIXED'} onPress={() => update({ late_fine_type: 'FIXED' })}/><Choice label="Per day" selected={settings.late_fine_type === 'PER_DAY'} onPress={() => update({ late_fine_type: 'PER_DAY' })}/></View>{settings.late_fine_type === 'FIXED' ? <NumericField label="Fixed late fine (Rs.)" value={String(settings.fixed_late_fine)} onChangeText={value => update({ fixed_late_fine: Number(value) || 0 })} helper="Applied once after the due date and grace period."/> : <NumericField label="Fine per late day (Rs.)" value={String(settings.per_day_late_fine)} onChangeText={value => update({ per_day_late_fine: Number(value) || 0 })} helper="Calculated for each day after the grace period when the bill is issued/settled."/>}<NumericField label="Grace period (days)" value={String(settings.grace_period_days)} onChangeText={value => update({ grace_period_days: Number(value) || 0 })} helper="Late fine begins after the due date plus this grace period."/><View className="mt-2 flex-row items-center justify-between"><View className="flex-1 pr-3"><Text className="text-sm font-semibold text-text">Enable maximum fine cap</Text><Text className="mt-1 text-xs text-text-muted">Limit the combined fine amount.</Text></View><Switch value={settings.fine_cap_enabled} onValueChange={value => update({ fine_cap_enabled: value })}/></View>{settings.fine_cap_enabled ? <NumericField label="Maximum fine (Rs.)" value={String(settings.fine_cap ?? 0)} onChangeText={value => update({ fine_cap: Number(value) || 0 })} helper="Maximum combined fine amount."/> : null}</View>
      <Pressable onPress={save} disabled={saving || !isOnline} className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-primary disabled:opacity-50">{saving ? <ActivityIndicator color="#FFFFFF"/> : <Save size={17} color="#FFFFFF"/>}<Text className="font-semibold text-on-primary">{saving ? 'Saving…' : 'Save billing settings'}</Text></Pressable>
      {!isOnline ? <Text className="mt-3 text-center text-xs text-warning">Offline: saved settings can be viewed, but changes require internet access.</Text> : null}
      <Pressable onPress={signOut} className="mt-8 min-h-12 flex-row items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger-bg"><LogOut size={17} color="#B13E4B"/><Text className="font-semibold text-danger">Sign out</Text></Pressable>
    </ScrollView>}
  </View>;
}
