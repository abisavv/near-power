import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConsumerModel,
  BillingRecord,
  HydropowerStationMetrics,
  MeterAuditReport,
} from '../types';
import { initialHydropowerMetrics } from '../data/mockData';
import { databaseService } from '../services/databaseService';
import { auditAllConsumers } from '../services/meterAuditService';
import { appBootstrapService } from '../services/appBootstrapService';
import { networkService } from '../services/networkService';
import { paymentService, PAYMENT_METHODS, type PaymentMethod } from '../services/paymentService';
import { offlineStorage, type PendingMutation } from '../services/offlineStorage';
import { syncService } from '../services/syncService';
import { adminDataDownloadService, mapAdminSnapshotWithQueue } from '@/services/adminDataDownloadService';
import { supabase } from '@/utils/supabase';
import { useAuth } from './AuthContext';

interface UtilityDataContextType {
  consumers: ConsumerModel[];
  billingRecords: BillingRecord[];
  metrics: HydropowerStationMetrics;
  auditReports: MeterAuditReport[];
  isOnline: boolean;
  isLoading: boolean;
  refreshData: (force?: boolean) => Promise<void>;
  syncQueue: PendingMutation[];
  syncPendingQueue: () => Promise<{ processed: number; errors: number; conflicts: number }>;
  payBill: (billId: string, method?: string) => Promise<void>;
  addConsumer: (consumerData: Omit<ConsumerModel, 'id'>) => Promise<ConsumerModel>;
  vacateConsumer: (consumerId: string, leftDate?: string) => Promise<void>;
  addBillingRecord: (recordData: Omit<BillingRecord, 'billId'>) => Promise<BillingRecord>;
}

const UtilityDataContext = createContext<UtilityDataContextType | undefined>(undefined);
const ADMIN_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;

function latestBillPerConsumer(records: BillingRecord[]) {
  const latest = new Map<string, BillingRecord>();
  for (const bill of records) {
    const previous = latest.get(bill.consumerId);
    if (!previous || bill.issueDate > previous.issueDate ||
      (bill.issueDate === previous.issueDate && bill.billId.localeCompare(previous.billId, undefined, { numeric: true }) > 0)) {
      latest.set(bill.consumerId, bill);
    }
  }
  return latest;
}

export const UtilityDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const [consumers, setConsumers] = useState<ConsumerModel[]>([]);
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [syncQueue, setSyncQueue] = useState<PendingMutation[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const clearInMemoryData = useCallback(() => {
    setConsumers([]);
    setBillingRecords([]);
    setSyncQueue([]);
  }, []);

  const refreshData = useCallback((force = false): Promise<void> => {
    if (refreshInFlight.current) return refreshInFlight.current;

    const task = (async () => {
      if (auth.status === 'loading') return;
      setIsLoading(true);
      let hasLocalSnapshot = false;
      try {
        const { data: authData, error: authError } = await supabase.auth.getSession();
        if (authError) throw authError;
        const activeUserId = authData.session?.user.id;

        if (!activeUserId || auth.status === 'signed_out') {
          clearInMemoryData();
          return;
        }

        const online = await networkService.isOnline();
        setIsOnline(online);

        // Admins use the complete paginated database snapshot. Load it first so the
        // dashboard/database screen can render immediately while a stale copy refreshes.
        if (auth.session.role === 'ADMIN') {
          const localAdminSnapshot = await adminDataDownloadService.getSnapshot(activeUserId);
          if (localAdminSnapshot) {
            const localQueue = await offlineStorage.getQueue(activeUserId);
            const localData = mapAdminSnapshotWithQueue(localAdminSnapshot, localQueue);
            setConsumers(localData.consumers);
            setBillingRecords(localData.ledgers);
            setSyncQueue(localQueue);
            hasLocalSnapshot = true;
            setIsLoading(false);
          }

          if (!online) {
            if (!hasLocalSnapshot) {
              const fallback = await appBootstrapService.load();
              if (fallback.status === 'online' || fallback.status === 'offline') {
                setConsumers(fallback.data.consumers);
                setBillingRecords(fallback.data.ledgers);
                setSyncQueue(await offlineStorage.getQueue(activeUserId));
              } else if (fallback.status === 'cache_missing') {
                clearInMemoryData();
              }
            }
            return;
          }

          const queuedBeforeRefresh = await offlineStorage.getQueue(activeUserId);
          if (queuedBeforeRefresh.length) {
            try { await syncService.syncUser(activeUserId); }
            catch (syncError) { console.warn('Admin offline changes remain queued:', syncError); }
          }

          const snapshotAge = localAdminSnapshot ? Date.now() - new Date(localAdminSnapshot.downloadedAt).getTime() : Infinity;
          if (force || !localAdminSnapshot || !Number.isFinite(snapshotAge) || snapshotAge > ADMIN_SNAPSHOT_MAX_AGE_MS || queuedBeforeRefresh.length) {
            const freshSnapshot = await adminDataDownloadService.downloadAll(activeUserId);
            const freshQueue = await offlineStorage.getQueue(activeUserId);
            const freshData = mapAdminSnapshotWithQueue(freshSnapshot, freshQueue);
            setConsumers(freshData.consumers);
            setBillingRecords(freshData.ledgers);
            setSyncQueue(freshQueue);
          }
          setSyncQueue(await offlineStorage.getQueue(activeUserId));
          return;
        }

        // Consumer reads are RLS-filtered by the linked consumer account. The cache
        // is scoped to this Supabase user ID, so a different account cannot reuse it.
        const local = await offlineStorage.getCache(activeUserId);
        if (local) {
          const queue = await offlineStorage.getQueue(activeUserId);
          setConsumers(local.consumers);
          setBillingRecords(local.ledgers);
          setSyncQueue(queue);
          hasLocalSnapshot = true;
          setIsLoading(false);
        }

        const result = await appBootstrapService.load();
        if (result.status === 'signed_out' || result.status === 'cache_missing') {
          if (!hasLocalSnapshot) clearInMemoryData();
          return;
        }
        if (result.status === 'error') throw new Error(result.message);
        setConsumers(result.data.consumers);
        setBillingRecords(result.data.ledgers);
        setSyncQueue(await offlineStorage.getQueue(result.userId));
      } catch (error) {
        console.error('Failed to refresh application data:', error);
        if (!hasLocalSnapshot) throw error;
        // Keep the already-rendered local snapshot visible when cloud refresh fails.
      } finally {
        setIsLoading(false);
      }
    })();

    refreshInFlight.current = task;
    void task.then(
      () => { if (refreshInFlight.current === task) refreshInFlight.current = null; },
      () => { if (refreshInFlight.current === task) refreshInFlight.current = null; },
    );
    return task;
  }, [auth.status, auth.session.role, clearInMemoryData]);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      const online = await networkService.isOnline();
      if (mounted) setIsOnline(online);
    };
    void initialize();

    const unsubscribe = networkService.subscribe(online => {
      if (!mounted) return;
      setIsOnline(online);
      if (online && auth.status === 'signed_in') void refreshData().catch(() => undefined);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [auth.status, refreshData]);

  useEffect(() => {
    if (auth.status === 'loading') return;
    if (auth.status === 'signed_out') {
      clearInMemoryData();
      setIsLoading(false);
      return;
    }
    void refreshData().catch(() => undefined);
  }, [auth.status, refreshData, clearInMemoryData]);

  const syncPendingQueue = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const userId = data.session?.user.id;
    if (!userId) throw new Error('No authenticated account is available.');

    const results = await syncService.syncUser(userId);
    const processed = results.filter(result => result.status === 'synced').length;
    const conflicts = results.filter(result => result.status === 'conflict').length;
    const errors = results.filter(result => result.status === 'error' || result.status === 'offline').length;
    await refreshData();
    return { processed, errors, conflicts };
  }, [refreshData]);

  const latestBills = useMemo(() => latestBillPerConsumer(billingRecords), [billingRecords]);
  const metrics: HydropowerStationMetrics = useMemo(() => {
    const activeCount = consumers.filter(consumer => consumer.isActive).length;
    const vacantCount = consumers.filter(consumer => !consumer.isActive).length;
    // Total billed is the sum of every issued bill, not the money received.
    const totalBilled = billingRecords.reduce((sum, bill) => sum + (Number(bill.totalRupees) || 0), 0);
    // Current arrears are calculated once per consumer from their latest bill.
    // Historical arrears rows must not be summed because the balance is carried forward.
    const outstandingArrears = Array.from(latestBills.values()).reduce((sum, bill) =>
      sum + Math.max(0, (Number(bill.totalRupees) || 0) - (Number(bill.receivingAmount) || 0)), 0);
    return {
      ...initialHydropowerMetrics,
      activeConsumers: activeCount,
      vacantMeters: vacantCount,
      collectedRevenueRupees: totalBilled,
      pendingArrearsRupees: outstandingArrears,
    };
  }, [consumers, billingRecords, latestBills]);

  const auditReports = useMemo(() => auditAllConsumers(consumers, billingRecords), [consumers, billingRecords]);

  const payBill = useCallback(async (billId: string, method?: string) => {
    const safeMethod = PAYMENT_METHODS.includes(method as PaymentMethod) ? method as PaymentMethod : 'Cash';
    await paymentService.markPaid(billId, safeMethod);
    await refreshData(true);
  }, [refreshData]);

  const addConsumer = useCallback(async (data: Omit<ConsumerModel, 'id'>) => {
    const result = await databaseService.insertConsumer(data);
    await refreshData();
    return result;
  }, [refreshData]);

  const vacateConsumer = useCallback(async (consumerId: string, leftDate?: string) => {
    await databaseService.softDeleteConsumer(consumerId, leftDate);
    await refreshData();
  }, [refreshData]);

  const addBillingRecord = useCallback(async (data: Omit<BillingRecord, 'billId'>) => {
    const result = await databaseService.insertBillingRecord(data);
    await refreshData();
    return result;
  }, [refreshData]);

  const value = useMemo(() => ({
    consumers, billingRecords, metrics, auditReports,
    isOnline, isLoading, refreshData, syncQueue, syncPendingQueue,
    payBill, addConsumer, vacateConsumer, addBillingRecord,
  }), [consumers, billingRecords, metrics, auditReports, isOnline, isLoading, refreshData, syncQueue, syncPendingQueue, payBill, addConsumer, vacateConsumer, addBillingRecord]);

  return <UtilityDataContext.Provider value={value}>{children}</UtilityDataContext.Provider>;
};

export function useUtilityData() {
  const context = useContext(UtilityDataContext);
  if (!context) throw new Error('useUtilityData must be used within UtilityDataProvider');
  return context;
}
