import { supabase } from '@/utils/supabase';
import type { BillingRecord, ConsumerModel, PaymentStatus } from '@/types';
import { offlineStorage, type CachedAppData, type PendingMutation } from './offlineStorage';

type Versioned = { updatedAt?: string };
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

async function activeUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in before changing application data.');
  return userId;
}

async function currentCache(userId: string): Promise<CachedAppData> {
  const cache = await offlineStorage.getCache(userId);
  if (!cache) throw new Error('No local data cache exists yet. Connect to the internet and refresh before making offline changes.');
  return cache;
}

function newMutation(userId: string, table: PendingMutation['table'], operation: PendingMutation['operation'], recordId: string, payload: Record<string, unknown>, expectedUpdatedAt?: string): PendingMutation {
  return {
    id: id('mutation'),
    userId,
    table,
    operation,
    recordId,
    payload,
    expectedUpdatedAt,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

function consumerDbPatch(patch: Partial<ConsumerModel>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const fields: Array<[keyof ConsumerModel, string]> = [
    ['serialNumber', 'serial_number'], ['meterNumber', 'meter_number'],
    ['fullName', 'full_name'], ['cnic', 'cnic'], ['phone', 'phone'],
    ['address', 'address'], ['securityDeposit', 'security_deposit'],
    ['isActive', 'is_active'], ['leftDate', 'left_date'],
    ['connectionDate', 'connection_date'], ['phaseType', 'phase_type'],
  ];
  for (const [source, target] of fields) {
    if (patch[source] !== undefined) result[target] = patch[source];
  }
  return result;
}

function consumerDbRow(value: ConsumerModel): Record<string, unknown> {
  return {
    id: value.id,
    serial_number: value.serialNumber,
    meter_number: value.meterNumber,
    full_name: value.fullName,
    cnic: value.cnic,
    phone: value.phone,
    address: value.address,
    security_deposit: value.securityDeposit,
    is_active: value.isActive,
    left_date: value.leftDate ?? null,
    connection_date: value.connectionDate,
    phase_type: value.phaseType ?? null,
  };
}

function ledgerDbRow(value: BillingRecord): Record<string, unknown> {
  return {
    bill_id: value.billId,
    consumer_id: value.consumerId,
    month_year: value.monthYear,
    issue_date: value.issueDate,
    due_date: value.dueDate,
    old_unit: value.oldUnit,
    new_unit: value.newUnit,
    units_consumed: value.unitsConsumed,
    rate_per_unit: value.ratePerUnit,
    arrears: value.arrears,
    fine: value.fine,
    adjustment_rupees: value.adjustmentRupees,
    total_rupees: value.totalRupees,
    receiving_amount: value.receivingAmount,
    status: value.status,
    paid_date: value.paidDate ?? null,
    payment_method: value.paymentMethod ?? null,
    remarks: value.remarks ?? null,
  };
}

async function persist(userId: string, cache: CachedAppData, mutation: PendingMutation) {
  // Queue first: if the app stops before the cache write, bootstrap can replay it.
  await offlineStorage.enqueue(mutation);
  await offlineStorage.saveCache({ ...cache, updatedAt: new Date().toISOString() });
}

export const offlineMutationService = {
  async addConsumer(input: Omit<ConsumerModel, 'id'>): Promise<ConsumerModel> {
    const userId = await activeUserId();
    const cache = await currentCache(userId);
    const consumer = { ...input, id: id('c') } as ConsumerModel;
    cache.consumers = [...cache.consumers, consumer];
    const mutation = newMutation(userId, 'consumers', 'INSERT', consumer.id, consumerDbRow(consumer));
    await persist(userId, cache, mutation);
    return consumer;
  },

  async updateConsumer(consumerId: string, patch: Partial<ConsumerModel>): Promise<ConsumerModel> {
    const userId = await activeUserId();
    const cache = await currentCache(userId);
    const index = cache.consumers.findIndex(item => item.id === consumerId);
    if (index < 0) throw new Error('Consumer is not present in the local cache.');
    const expectedUpdatedAt = cache.versions?.consumers?.[consumerId] ?? (cache.consumers[index] as ConsumerModel & Versioned).updatedAt;
    if (!expectedUpdatedAt) throw new Error('This cached consumer has no server version. Refresh while online before editing it.');
    const updated = { ...cache.consumers[index], ...patch };
    cache.consumers[index] = updated;
    const mutation = newMutation(userId, 'consumers', 'UPDATE', consumerId, consumerDbPatch(patch), expectedUpdatedAt);
    await persist(userId, cache, mutation);
    return updated;
  },

  async vacateConsumer(consumerId: string, leftDate = new Date().toISOString().slice(0, 10)): Promise<void> {
    await this.updateConsumer(consumerId, { isActive: false, leftDate });
  },

  async addBillingRecord(input: Omit<BillingRecord, 'billId'>): Promise<BillingRecord> {
    const userId = await activeUserId();
    const cache = await currentCache(userId);
    const bill = { ...input, billId: id('BILL') } as BillingRecord;
    cache.ledgers = [bill, ...cache.ledgers];
    const mutation = newMutation(userId, 'ledgers', 'INSERT', bill.billId, ledgerDbRow(bill));
    await persist(userId, cache, mutation);
    return bill;
  },

  async updatePaymentStatus(_billId: string, _status: PaymentStatus, _method?: string): Promise<void> {
    throw new Error('Payment transactions require an online database transaction. Reconnect and record the payment in Quick Entry.');
  },
};
