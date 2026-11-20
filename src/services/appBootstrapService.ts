import { supabase } from '@/utils/supabase';
import { consumerService } from './consumerService';
import { ledgerService } from './ledgerService';
import { networkService } from './networkService';
import { offlineStorage, type CachedAppData, type PendingMutation } from './offlineStorage';
import { syncService } from './syncService';
import type { ConsumerModel, BillingRecord } from '../types';
import { sortBillingRecordsByMeterNumberLatestFirst, compareMeterNumbers } from '@/utils/recordSorting';

export type BootstrapResult =
  | { status: 'online'; userId: string; data: CachedAppData; pendingCount: number }
  | { status: 'offline'; userId: string; data: CachedAppData; pendingCount: number }
  | { status: 'signed_out' }
  | { status: 'cache_missing'; userId: string }
  | { status: 'error'; message: string };

function camelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}
function camelPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [camelKey(key), value]));
}

function applyQueue(consumers: ConsumerModel[], ledgers: BillingRecord[], queue: PendingMutation[]) {
  const nextConsumers = [...consumers];
  const nextLedgers = [...ledgers];

  for (const item of queue) {
    const payload = camelPayload(item.payload);
    if (item.table === 'consumers') {
      const index = nextConsumers.findIndex(row => row.id === item.recordId);
      if (item.operation === 'INSERT') {
        if (index < 0) nextConsumers.push(payload as unknown as ConsumerModel);
        else nextConsumers[index] = { ...nextConsumers[index], ...payload } as ConsumerModel;
      } else if (index >= 0) {
        nextConsumers[index] = { ...nextConsumers[index], ...payload } as ConsumerModel;
      }
    } else {
      const index = nextLedgers.findIndex(row => row.billId === item.recordId);
      if (item.operation === 'INSERT') {
        if (index < 0) nextLedgers.push(payload as unknown as BillingRecord);
        else nextLedgers[index] = { ...nextLedgers[index], ...payload } as BillingRecord;
      } else if (index >= 0) {
        nextLedgers[index] = { ...nextLedgers[index], ...payload } as BillingRecord;
      }
    }
  }

  nextConsumers.sort((a, b) => compareMeterNumbers(a.meterNumber, b.meterNumber));
  return { consumers: nextConsumers, ledgers: sortBillingRecordsByMeterNumberLatestFirst(nextLedgers, nextConsumers) };
}

function versionsFrom(records: Array<ConsumerModel | BillingRecord>, key: 'id' | 'billId') {
  const result: Record<string, string> = {};
  for (const record of records) {
    const version = (record as (ConsumerModel | BillingRecord) & { updatedAt?: string }).updatedAt;
    const recordId = (record as unknown as Record<string, string>)[key];
    if (recordId && version) result[recordId] = version;
  }
  return result;
}

export const appBootstrapService = {
  async load(): Promise<BootstrapResult> {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) return { status: 'error', message: authError.message };
    const userId = authData.session?.user.id;
    if (!userId) return { status: 'signed_out' };

    const cached = await offlineStorage.getCache(userId);
    const queueBefore = await offlineStorage.getQueue(userId);
    const online = await networkService.isOnline();

    if (!online) {
      if (!cached) return { status: 'cache_missing', userId };
      const visible = applyQueue(cached.consumers, cached.ledgers, queueBefore);
      const data = { ...cached, ...visible };
      await offlineStorage.saveCache(data);
      return { status: 'offline', userId, data, pendingCount: queueBefore.length };
    }

    try {
      if (queueBefore.length) {
        try { await syncService.syncUser(userId); }
        catch (error) { console.warn('Sync deferred; queue retained:', error); }
      }

      const { data: currentAuth } = await supabase.auth.getSession();
      if (currentAuth.session?.user.id !== userId) return { status: 'signed_out' };

      const [cloudConsumers, cloudLedgers] = await Promise.all([
        consumerService.getAll(),
        ledgerService.getAll(),
      ]);
      const remainingQueue = await offlineStorage.getQueue(userId);
      const visible = applyQueue(cloudConsumers, cloudLedgers, remainingQueue);

      const freshCache: CachedAppData = {
        userId,
        consumers: visible.consumers,
        ledgers: visible.ledgers,
        versions: {
          consumers: versionsFrom(cloudConsumers, 'id'),
          ledgers: versionsFrom(cloudLedgers, 'billId'),
        },
        updatedAt: new Date().toISOString(),
      };

      await offlineStorage.saveCache(freshCache);
      return { status: 'online', userId, data: freshCache, pendingCount: remainingQueue.length };
    } catch (error) {
      if (cached) {
        const latestQueue = await offlineStorage.getQueue(userId);
        const visible = applyQueue(cached.consumers, cached.ledgers, latestQueue);
        const data = { ...cached, ...visible };
        await offlineStorage.saveCache(data);
        return { status: 'offline', userId, data, pendingCount: latestQueue.length };
      }
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unable to load application data.',
      };
    }
  },
};
