
import { supabase } from '@/utils/supabase';
import { offlineStorage } from './offlineStorage';
import { syncService } from './syncService';

export const sessionService = {
  async signOut(discardPendingChanges = false): Promise<void> {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    const userId = data.session?.user.id;

    if (!userId) return;

    const queue = await offlineStorage.getQueue(userId);

    if (queue.length > 0 && !discardPendingChanges) {
      throw new Error(
        `There are ${queue.length} unsynchronized changes. ` +
        'Synchronize them or explicitly confirm that they should be discarded.',
      );
    }

    // This does not require contacting the Supabase server.
    const { error: signOutError } = await supabase.auth.signOut({
      scope: 'local',
    });

    if (signOutError) throw signOutError;

    // Remove only this account's local data.
    await offlineStorage.removeUserData(userId);
  },
};
