import { supabase } from '@/utils/supabase';
import { offlineStorage, type PendingMutation } from './offlineStorage';

export type SyncResult =
  | { status: 'synced'; mutationId: string }
  | { status: 'conflict'; mutationId: string; message: string }
  | { status: 'offline'; mutationId?: string }
  | { status: 'error'; mutationId?: string; message: string };

const primaryKey = { consumers: 'id', ledgers: 'bill_id' } as const;

function sameValues(current: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  return Object.entries(expected).every(([key, value]) => current[key] === value);
}

async function getCurrentRow(item: PendingMutation): Promise<Record<string, unknown> | null> {
  const key = primaryKey[item.table];
  const { data, error } = await supabase.from(item.table).select('*').eq(key, item.recordId).maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function applyOne(item: PendingMutation): Promise<SyncResult> {
  try {
    const key = primaryKey[item.table];

    if (item.operation === 'INSERT') {
      const existing = await getCurrentRow(item);
      if (existing) {
        return sameValues(existing, item.payload)
          ? { status: 'synced', mutationId: item.id }
          : { status: 'conflict', mutationId: item.id, message: 'A record with this ID already exists with different data.' };
      }
      const { error } = await supabase.from(item.table).insert(item.payload);
      if (!error) return { status: 'synced', mutationId: item.id };
      const afterError = await getCurrentRow(item).catch(() => null);
      if (afterError && sameValues(afterError, item.payload)) return { status: 'synced', mutationId: item.id };
      return { status: 'error', mutationId: item.id, message: error.message };
    }

    if (!item.expectedUpdatedAt) {
      return { status: 'conflict', mutationId: item.id, message: 'This update has no original server version.' };
    }

    const { data, error } = await supabase.from(item.table)
      .update(item.payload)
      .eq(key, item.recordId)
      .eq('updated_at', item.expectedUpdatedAt)
      .select('*')
      .maybeSingle();

    if (error) return { status: 'error', mutationId: item.id, message: error.message };
    if (data) return { status: 'synced', mutationId: item.id };

    const current = await getCurrentRow(item);
    if (current && sameValues(current, item.payload)) return { status: 'synced', mutationId: item.id };
    return {
      status: 'conflict',
      mutationId: item.id,
      message: current
        ? 'The server record changed after this offline copy was created.'
        : 'The server record no longer exists.',
    };
  } catch (error) {
    return {
      status: 'error',
      mutationId: item.id,
      message: error instanceof Error ? error.message : 'Unknown synchronization error.',
    };
  }
}

export const syncService = {
  async syncUser(userId: string): Promise<SyncResult[]> {
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session?.user.id !== userId) {
      return [{ status: 'error', message: 'The active account does not match this sync queue.' }];
    }

    const queue = await offlineStorage.getQueue(userId);
    const results: SyncResult[] = [];
    const successfullySynced: PendingMutation[] = [];

    for (const item of queue) {
      if (item.userId !== userId) continue;
      if (item.status === 'conflict') break;
      const result = await applyOne(item);
      results.push(result);

      if (result.status === 'synced') {
        successfullySynced.push(item);
        continue;
      }

      if (result.status === 'conflict') {
        await offlineStorage.markConflict(userId, item.id, result.message);
      }
      // Preserve ordering: later operations may depend on this one.
      break;
    }

    if (successfullySynced.length) {
      await offlineStorage.removeSynced(userId, successfullySynced);
    }
    return results;
  },
};
