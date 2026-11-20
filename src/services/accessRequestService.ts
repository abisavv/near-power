
import { supabase } from '@/utils/supabase';

export type AccessRequest = {
  id: string;
  user_id: string;
  requested_email: string | null;
  display_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  assigned_consumer_id: string | null;
};

export const accessRequestService = {
  async ensureRequest(): Promise<void> {
    const { error } = await supabase.rpc('ensure_access_request');

    if (error) throw error;
  },

  async getMyRequest(): Promise<AccessRequest | null> {
    const { data, error } = await supabase
      .from('access_requests')
      .select('*')
      .maybeSingle();

    if (error) throw error;

    return data as AccessRequest | null;
  },

  async getPendingRequests(): Promise<AccessRequest[]> {
    const { data, error } = await supabase
      .from('access_requests')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) throw error;

    return (data ?? []) as AccessRequest[];
  },

  async approve(
    requestId: string,
    consumerId: string
  ): Promise<void> {
    const { error } = await supabase.rpc('approve_access_request', {
      p_request_id: requestId,
      p_consumer_id: consumerId,
    });

    if (error) throw error;
  },

  async reject(requestId: string): Promise<void> {
    const { error } = await supabase.rpc('reject_access_request', {
      p_request_id: requestId,
    });

    if (error) throw error;
  },

  subscribeToChanges(callback: () => void) {
    const channel = supabase
      .channel('access-request-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'access_requests',
        },
        callback
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
