
import { networkService } from './networkService';
import { syncService } from './syncService';
import { offlineStorage } from './offlineStorage';
import { supabase } from '@/utils/supabase';

let unsubscribe: (() => void) | undefined;
let syncing = false;

export const syncCoordinator = {
  start(onSyncComplete?: () => void) {
    if (unsubscribe) return;

    unsubscribe = networkService.subscribe(async (online) => {
      if (!online || syncing) return;

      syncing = true;

      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;

        if (!userId) return;

        const queue = await offlineStorage.getQueue(userId);

        if (queue.length === 0) return;

        const results = await syncService.syncUser(userId);

        if (results.some((item) => item.status === 'synced')) {
          onSyncComplete?.();
        }
      } finally {
        syncing = false;
      }
    });
  },

  stop() {
    unsubscribe?.();
    unsubscribe = undefined;
  },
};
