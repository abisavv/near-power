import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthSession, SystemSettingsConfig } from '../types';
import { initialSystemSettings } from '../data/mockData';
import { supabase } from '@/utils/supabase';
import { offlineStorage } from '@/services/offlineStorage';
import { adminDataDownloadService } from '@/services/adminDataDownloadService';
import { billingSettingsService } from '@/services/billingSettingsService';
import { networkService } from '@/services/networkService';

type AccessStatus = 'unknown' | 'pending' | 'approved' | 'rejected' | 'unlinked';
type AuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'error';

interface AuthContextType {
  status: AuthStatus;
  isLoading: boolean;
  session: AuthSession;
  accessStatus: AccessStatus;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; fullName: string; phone: string }) => Promise<{ needsEmailConfirmation: boolean }>;
  logout: (options?: { discardPending?: boolean }) => Promise<void>;
  refreshAccess: () => Promise<void>;
  settings: SystemSettingsConfig;
  updateSettings: (settings: Partial<SystemSettingsConfig>) => void;
  selectedConsumerId: string;
  setSelectedConsumerId: (id: string) => void;
}

const SETTINGS_KEY = 'near_power_settings';
const SELECTED_CONSUMER_KEY = 'near_power_selected_consumer';
const AUTH_CACHE_PREFIX = 'near_power_authorized_session_v1_';
const AUTH_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CachedAuthorization = {
  userId: string;
  role: AuthSession['role'];
  accessStatus: AccessStatus;
  consumerId?: string;
  adminName?: string;
  cachedAt: number;
};

const signedOutSession: AuthSession = { isAuthenticated: false, role: 'CONSUMER', phone: '' };
const AuthContext = createContext<AuthContextType | undefined>(undefined);

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession>(signedOutSession);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('unknown');
  const [authError, setAuthError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SystemSettingsConfig>(initialSystemSettings);
  const [selectedConsumerId, setSelectedConsumerIdState] = useState('');

  const hydratePreferences = useCallback(async () => {
    try {
      const [savedSettings, savedConsumer] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_KEY),
        AsyncStorage.getItem(SELECTED_CONSUMER_KEY),
      ]);
      if (savedSettings) setSettings({ ...initialSystemSettings, ...JSON.parse(savedSettings) });
      if (savedConsumer) setSelectedConsumerIdState(savedConsumer);
    } catch (error) {
      console.warn('Unable to restore preferences:', messageOf(error));
    }
  }, []);

  const loadUserAccess = useCallback(async (user: { id: string; email?: string; phone?: string; user_metadata?: Record<string, unknown> }) => {
    const cacheKey = `${AUTH_CACHE_PREFIX}${user.id}`;
    try {
      const profile = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile.error) throw profile.error;

      const rawRole = String(profile.data?.role ?? 'user').toLowerCase();
      const role: AuthSession['role'] = rawRole === 'admin' ? 'ADMIN' : 'CONSUMER';
      let nextAccess: AccessStatus = role === 'ADMIN' ? 'approved' : 'unlinked';
      let consumerId: string | undefined;

      if (role !== 'ADMIN') {
        let request = await supabase.from('access_requests')
          .select('status, assigned_consumer_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (request.error) throw request.error;
        if (!request.data) {
          const ensured = await supabase.rpc('ensure_access_request');
          if (ensured.error) throw ensured.error;
          request = await supabase.from('access_requests')
            .select('status, assigned_consumer_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (request.error) throw request.error;
        }
        if (request.data) {
          const rawStatus = String(request.data.status ?? '').toLowerCase();
          if (rawStatus === 'approved') {
            nextAccess = 'approved';
            consumerId = request.data.assigned_consumer_id ?? undefined;
          } else if (rawStatus === 'rejected') {
            nextAccess = 'rejected';
          } else {
            nextAccess = 'pending';
          }
        }
      }

      const nextSession: AuthSession = {
        isAuthenticated: true,
        role,
        phone: user.phone ?? String(user.user_metadata?.phone ?? user.email ?? ''),
        consumerId: role === 'CONSUMER' ? consumerId : undefined,
        adminName: role === 'ADMIN' ? String(user.user_metadata?.full_name ?? 'Administrator') : undefined,
      };
      const cached: CachedAuthorization = {
        userId: user.id,
        role,
        accessStatus: nextAccess,
        consumerId,
        adminName: nextSession.adminName,
        cachedAt: Date.now(),
      };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cached));
      setSession(nextSession);
      setAccessStatus(nextAccess);
      setStatus('signed_in');
      setAuthError(null);
    } catch (remoteError) {
      // Only use the last-known authorization when the device is actually offline.
      // A server-side denial or role change while online must never be hidden by cache.
      const online = await networkService.isOnline().catch(() => true);
      if (online) throw remoteError;
      const raw = await AsyncStorage.getItem(cacheKey);
      if (!raw) throw new Error('This account has not been authorized on this device yet. Connect once while online to enable offline access.');
      let cached: CachedAuthorization;
      try { cached = JSON.parse(raw) as CachedAuthorization; }
      catch { throw new Error('The saved authorization is invalid. Connect to the internet and sign in again.'); }
      if (cached.userId !== user.id || !Number.isFinite(cached.cachedAt) || Date.now() - cached.cachedAt > AUTH_CACHE_MAX_AGE_MS) {
        throw new Error('Offline authorization has expired. Connect to the internet to verify this account again.');
      }
      setSession({
        isAuthenticated: true,
        role: cached.role,
        phone: user.phone ?? String(user.user_metadata?.phone ?? user.email ?? ''),
        consumerId: cached.role === 'CONSUMER' ? cached.consumerId : undefined,
        adminName: cached.adminName,
      });
      setAccessStatus(cached.accessStatus);
      setStatus('signed_in');
      setAuthError('Offline mode: using the last verified account permissions.');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await hydratePreferences();
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        setAuthError(error.message);
        setStatus('error');
      } else if (data.session?.user) {
        try {
          await loadUserAccess(data.session.user);
        } catch (error) {
          if (mounted) {
            setStatus('signed_in');
            setAccessStatus('unknown');
            setAuthError(messageOf(error));
          }
        }
      } else {
        setSession(signedOutSession);
        setAccessStatus('unknown');
        setStatus('signed_out');
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!mounted) return;
      if (!authSession?.user) {
        setSession(signedOutSession);
        setAccessStatus('unknown');
        setStatus('signed_out');
        return;
      }
      setTimeout(() => {
        if (mounted) {
          void loadUserAccess(authSession.user).catch(error => {
            if (mounted) {
              setAccessStatus('unknown');
              setStatus('signed_in');
              setAuthError(messageOf(error));
            }
          });
        }
      }, 0);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [hydratePreferences, loadUserAccess]);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
    if (data.user) await loadUserAccess(data.user);
  }, [loadUserAccess]);

  const signUp = useCallback(async (input: { email: string; password: string; fullName: string; phone: string }) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: { data: { full_name: input.fullName.trim(), phone: input.phone.trim() } },
    });
    if (error) throw error;
    if (data.user && data.session) await loadUserAccess(data.user);
    return { needsEmailConfirmation: !data.session };
  }, [loadUserAccess]);

  const logout = useCallback(async (options?: { discardPending?: boolean }) => {
    const { data: current } = await supabase.auth.getSession();
    const userId = current.session?.user.id;
    if (userId) {
      const queue = await offlineStorage.getQueue(userId);
      if (queue.length && !options?.discardPending) {
        throw new Error(`There are ${queue.length} unsynchronized changes. Synchronize them first, or explicitly confirm discarding them before signing out.`);
      }
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Clear only after Supabase confirms sign-out, so a failed sign-out
    // cannot destroy the user's local data or pending work.
    if (userId) {
      await offlineStorage.removeUserData(userId);
      await Promise.all([adminDataDownloadService.clear(userId), billingSettingsService.clear(userId), AsyncStorage.removeItem(`${AUTH_CACHE_PREFIX}${userId}`)]);
    }
    setSession(signedOutSession);
    setAccessStatus('unknown');
    setStatus('signed_out');
  }, []);

  const refreshAccess = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (data.user) await loadUserAccess(data.user);
  }, [loadUserAccess]);

  const updateSettings = useCallback((patch: Partial<SystemSettingsConfig>) => {
    setSettings(previous => {
      const next = { ...previous, ...patch };
      void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setSelectedConsumerId = useCallback((value: string) => {
    setSelectedConsumerIdState(value);
    void AsyncStorage.setItem(SELECTED_CONSUMER_KEY, value);
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    status, isLoading: status === 'loading', session, accessStatus, authError,
    signIn, signUp, logout, refreshAccess, settings, updateSettings,
    selectedConsumerId, setSelectedConsumerId,
  }), [status, session, accessStatus, authError, signIn, signUp, logout, refreshAccess, settings, updateSettings, selectedConsumerId, setSelectedConsumerId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
