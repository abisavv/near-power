import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';

export type BillingSettings = {
  min_bill_amount: number;
  rate_per_unit: number;
  underpayment_fine_percent: number;
  underpayment_fine_basis: 'UNPAID_BALANCE' | 'TOTAL_BILL';
  late_fine_type: 'FIXED' | 'PER_DAY';
  fixed_late_fine: number;
  per_day_late_fine: number;
  grace_period_days: number;
  fine_cap: number | null;
  fine_cap_enabled: boolean;
  updated_at?: string | null;
};

// Defaults retain the values already used by the supplied application.
export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  min_bill_amount: 1000,
  rate_per_unit: 18,
  underpayment_fine_percent: 0,
  underpayment_fine_basis: 'UNPAID_BALANCE',
  late_fine_type: 'FIXED',
  fixed_late_fine: 0,
  per_day_late_fine: 0,
  grace_period_days: 0,
  fine_cap: null,
  fine_cap_enabled: false,
};

const cacheKey = (userId: string) => `near_power_billing_settings_v2_${userId}`;
const number = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function mapSettings(row: Record<string, unknown>): BillingSettings {
  return {
    min_bill_amount: number(row.min_bill_amount, DEFAULT_BILLING_SETTINGS.min_bill_amount),
    rate_per_unit: number(row.rate_per_unit, DEFAULT_BILLING_SETTINGS.rate_per_unit),
    underpayment_fine_percent: number(row.underpayment_fine_percent, 0),
    underpayment_fine_basis: row.underpayment_fine_basis === 'TOTAL_BILL' ? 'TOTAL_BILL' : 'UNPAID_BALANCE',
    late_fine_type: row.late_fine_type === 'PER_DAY' ? 'PER_DAY' : 'FIXED',
    fixed_late_fine: number(row.fixed_late_fine, 0),
    per_day_late_fine: number(row.per_day_late_fine, 0),
    grace_period_days: number(row.grace_period_days, 0),
    fine_cap: row.fine_cap == null ? null : number(row.fine_cap, 0),
    fine_cap_enabled: Boolean(row.fine_cap_enabled),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
  };
}

async function readCache(userId: string): Promise<BillingSettings | null> {
  const cached = await AsyncStorage.getItem(cacheKey(userId));
  if (!cached) return null;
  try { return { ...DEFAULT_BILLING_SETTINGS, ...(JSON.parse(cached) as Partial<BillingSettings>) }; }
  catch { return null; }
}

export const billingSettingsService = {
  async get(userId: string, online: boolean): Promise<BillingSettings> {
    if (online) {
      const { data, error } = await supabase.from('billing_settings').select('*').eq('id', 1).maybeSingle();
      if (!error && data) {
        const settings = mapSettings(data as Record<string, unknown>);
        await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(settings));
        return settings;
      }
      // Missing migration/table must not prevent consumers and meter readings loading.
      if (error && !['PGRST116', '42P01', 'PGRST205'].includes(error.code ?? '')) throw error;
    }
    return (await readCache(userId)) ?? DEFAULT_BILLING_SETTINGS;
  },

  async save(userId: string, values: BillingSettings): Promise<BillingSettings> {
    const payload = { id: 1, ...values, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('billing_settings').upsert(payload).select('*').single();
    if (error) throw error;
    const saved = mapSettings(data as Record<string, unknown>);
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(saved));
    return saved;
  },

  async clear(userId: string) { await AsyncStorage.removeItem(cacheKey(userId)); },
};
