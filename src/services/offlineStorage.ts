import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConsumerModel, BillingRecord } from '../types';

export interface CachedAppData {
  userId: string;
  consumers: ConsumerModel[];
  ledgers: BillingRecord[];
  versions: {
    consumers: Record<string, string>;
    ledgers: Record<string, string>;
  };
  updatedAt: string;
}

export type MutationTable = 'consumers' | 'ledgers';
export type MutationOperation = 'INSERT' | 'UPDATE';

export interface PendingMutation {
  id: string;
  userId: string;
  table: MutationTable;
  operation: MutationOperation;
  recordId: string;
  payload: Record<string, unknown>;
  expectedUpdatedAt?: string;
  createdAt: string;
  status: 'pending' | 'conflict';
  conflictMessage?: string;
}

const cacheKey = (uid: string) => `app_cache_v2_${uid}`;
const queueKey = (uid: string) => `sync_queue_v2_${uid}`;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidCache(value: unknown, userId: string): value is CachedAppData {
  if (!isObject(value)) return false;
  return value.userId === userId &&
    Array.isArray(value.consumers) &&
    Array.isArray(value.ledgers) &&
    typeof value.updatedAt === 'string';
}

function isValidMutation(value: unknown, userId: string): value is PendingMutation {
  if (!isObject(value)) return false;
  return value.userId === userId &&
    typeof value.id === 'string' &&
    typeof value.recordId === 'string' &&
    (value.table === 'consumers' || value.table === 'ledgers') &&
    (value.operation === 'INSERT' || value.operation === 'UPDATE') &&
    isObject(value.payload) &&
    (value.status === 'pending' || value.status === 'conflict');
}

let queueWrite = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueWrite.then(operation, operation);
  queueWrite = result.then(() => undefined, () => undefined);
  return result;
}

async function readQueueUnsafe(userId: string): Promise<PendingMutation[]> {
  const raw = await AsyncStorage.getItem(queueKey(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(item => isValidMutation(item, userId)) : [];
  } catch {
    return [];
  }
}

export const offlineStorage = {
  async getCache(userId: string): Promise<CachedAppData | null> {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isValidCache(parsed, userId)) return null;
      return {
        ...parsed,
        versions: parsed.versions ?? { consumers: {}, ledgers: {} },
      };
    } catch {
      return null;
    }
  },

  async saveCache(data: CachedAppData): Promise<void> {
    await AsyncStorage.setItem(cacheKey(data.userId), JSON.stringify(data));
  },

  async getQueue(userId: string): Promise<PendingMutation[]> {
    await queueWrite;
    return readQueueUnsafe(userId);
  },

  async enqueue(mutation: PendingMutation): Promise<void> {
    return serialized(async () => {
      const queue = await readQueueUnsafe(mutation.userId);
      const previous = [...queue].reverse().find(item =>
        item.table === mutation.table &&
        item.recordId === mutation.recordId &&
        item.status === 'pending'
      );

      if (previous && previous.operation === 'INSERT' && mutation.operation === 'UPDATE') {
        previous.payload = { ...previous.payload, ...mutation.payload };
      } else if (previous && previous.operation === 'UPDATE' && mutation.operation === 'UPDATE') {
        previous.payload = { ...previous.payload, ...mutation.payload };
      } else {
        queue.push(mutation);
      }

      await AsyncStorage.setItem(queueKey(mutation.userId), JSON.stringify(queue));
    });
  },

  async removeSynced(userId: string, syncedSnapshot: PendingMutation[]): Promise<void> {
    return serialized(async () => {
      const current = await readQueueUnsafe(userId);
      const remaining = current.filter(item => {
        const matched = syncedSnapshot.find(snapshot =>
          snapshot.id === item.id &&
          snapshot.operation === item.operation &&
          snapshot.table === item.table &&
          snapshot.recordId === item.recordId &&
          snapshot.expectedUpdatedAt === item.expectedUpdatedAt &&
          JSON.stringify(snapshot.payload) === JSON.stringify(item.payload)
        );
        return !matched;
      });
      await AsyncStorage.setItem(queueKey(userId), JSON.stringify(remaining));
    });
  },

  async markConflict(userId: string, mutationId: string, message: string): Promise<void> {
    return serialized(async () => {
      const queue = await readQueueUnsafe(userId);
      const updated = queue.map(item => item.id === mutationId
        ? { ...item, status: 'conflict' as const, conflictMessage: message }
        : item);
      await AsyncStorage.setItem(queueKey(userId), JSON.stringify(updated));
    });
  },

  async removeUserData(userId: string): Promise<void> {
    return serialized(() => AsyncStorage.multiRemove([cacheKey(userId), queueKey(userId)]));
  },
};
