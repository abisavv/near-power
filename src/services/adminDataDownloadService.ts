import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';
import type { BillingRecord, ConsumerModel, PaymentStatus } from '@/types';
import type { PendingMutation } from '@/services/offlineStorage';
import { compareMeterNumbers } from '@/utils/recordSorting';

export type AdminDatabaseSnapshot = {
  userId: string;
  consumers: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  ledgers: Record<string, unknown>[];
  downloadedAt: string;
  schemaVersion: 1;
};

const keyFor = (userId: string) => `near_power_admin_database_v1_${userId}`;
const PAGE_SIZE = 1000;

async function fetchAll(table: 'consumers' | 'profiles' | 'ledgers') {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not download ${table}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

const number = (value: unknown) => Number(value ?? 0) || 0;

export function mapAdminSnapshot(snapshot: AdminDatabaseSnapshot): { consumers: ConsumerModel[]; ledgers: BillingRecord[] } {
  const consumers: ConsumerModel[] = snapshot.consumers.map(row => ({
    id: String(row.id ?? ''),
    serialNumber: String(row.serial_number ?? ''),
    meterNumber: String(row.meter_number ?? ''),
    fullName: String(row.full_name ?? ''),
    cnic: String(row.cnic ?? ''),
    phone: String(row.phone ?? ''),
    address: String(row.address ?? ''),
    securityDeposit: number(row.security_deposit),
    isActive: Boolean(row.is_active),
    leftDate: row.left_date == null ? null : String(row.left_date),
    connectionDate: String(row.connection_date ?? ''),
    phaseType: (row.phase_type === 'Three Phase' ? 'Three Phase' : 'Single Phase'),
  }));

  const ledgers: BillingRecord[] = snapshot.ledgers.map(row => ({
    billId: String(row.bill_id ?? ''),
    consumerId: String(row.consumer_id ?? ''),
    monthYear: String(row.month_year ?? ''),
    issueDate: String(row.issue_date ?? ''),
    dueDate: String(row.due_date ?? ''),
    oldUnit: number(row.old_unit),
    newUnit: number(row.new_unit),
    unitsConsumed: number(row.units_consumed),
    ratePerUnit: number(row.rate_per_unit),
    arrears: number(row.arrears),
    fine: number(row.fine),
    adjustmentRupees: number(row.adjustment_rupees),
    totalRupees: number(row.total_rupees),
    receivingAmount: number(row.receiving_amount),
    status: (['PAID', 'PARTIAL'].includes(String(row.status ?? '').toUpperCase()) ? String(row.status).toUpperCase() : 'UNPAID') as PaymentStatus,
    paidDate: row.paid_date == null ? null : String(row.paid_date),
    paymentMethod: row.payment_method == null ? undefined : String(row.payment_method),
    remarks: row.remarks == null ? undefined : String(row.remarks),
  }));

  consumers.sort((a, b) => compareMeterNumbers(a.meterNumber, b.meterNumber));
  const meterByConsumer = new Map(consumers.map(consumer => [consumer.id, consumer.meterNumber]));
  ledgers.sort((a, b) => compareMeterNumbers(meterByConsumer.get(a.consumerId), meterByConsumer.get(b.consumerId)) || b.issueDate.localeCompare(a.issueDate) || b.billId.localeCompare(a.billId, undefined, { numeric: true }));
  return { consumers, ledgers };
}

export function mapAdminSnapshotWithQueue(snapshot: AdminDatabaseSnapshot, queue: PendingMutation[]) {
  const consumers = snapshot.consumers.map(row => ({ ...row }));
  const ledgers = snapshot.ledgers.map(row => ({ ...row }));
  for (const mutation of queue) {
    const target = mutation.table === 'consumers' ? consumers : ledgers;
    const key = mutation.table === 'consumers' ? 'id' : 'bill_id';
    const index = target.findIndex(row => String(row[key] ?? '') === mutation.recordId);
    if (mutation.operation === 'INSERT') {
      if (index < 0) target.push({ ...mutation.payload });
      else target[index] = { ...target[index], ...mutation.payload };
    } else if (index >= 0) {
      target[index] = { ...target[index], ...mutation.payload };
    }
  }
  return mapAdminSnapshot({ ...snapshot, consumers, ledgers });
}

export const adminDataDownloadService = {
  async getSnapshot(userId: string): Promise<AdminDatabaseSnapshot | null> {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AdminDatabaseSnapshot;
      if (parsed.userId !== userId || parsed.schemaVersion !== 1 ||
        !Array.isArray(parsed.consumers) || !Array.isArray(parsed.profiles) || !Array.isArray(parsed.ledgers) ||
        typeof parsed.downloadedAt !== 'string') return null;
      return parsed;
    } catch { return null; }
  },

  async downloadAll(userId: string, onProgress?: (table: string) => void): Promise<AdminDatabaseSnapshot> {
    onProgress?.('Consumers');
    const consumers = await fetchAll('consumers');
    onProgress?.('Profiles');
    const profiles = (await fetchAll('profiles')).map(row => Object.fromEntries(
      Object.entries(row).filter(([field]) => !/(password|token|secret|private[_-]?key)/i.test(field)),
    ));
    onProgress?.('Billing records');
    const ledgers = await fetchAll('ledgers');
    const snapshot: AdminDatabaseSnapshot = {
      userId, consumers, profiles, ledgers,
      downloadedAt: new Date().toISOString(), schemaVersion: 1,
    };
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(snapshot));
    return snapshot;
  },

  async saveSnapshot(snapshot: AdminDatabaseSnapshot) {
    await AsyncStorage.setItem(keyFor(snapshot.userId), JSON.stringify(snapshot));
  },

  async clear(userId: string) {
    await AsyncStorage.removeItem(keyFor(userId));
  },
};
