
export type PaymentStatus = 'PAID' | 'UNPAID' | 'PARTIAL';

export interface ConsumerModel {
  id: string;
  serialNumber: string;
  meterNumber: string;
  fullName: string;
  cnic: string;
  phone: string;
  address: string;
  securityDeposit: number;
  isActive: boolean;
  leftDate?: string | null;
  connectionDate: string;
  phaseType?: 'Single Phase' | 'Three Phase';
  updatedAt?: string;
}

export interface BillingRecord {
  billId: string;
  consumerId: string;
  monthYear: string;
  issueDate: string;
  dueDate: string;
  oldUnit: number;
  newUnit: number;
  unitsConsumed: number;
  ratePerUnit: number;
  arrears: number;
  fine: number;
  adjustmentRupees: number;
  totalRupees: number;
  receivingAmount: number;
  status: PaymentStatus;
  paidDate?: string | null;
  paymentMethod?: string;
  remarks?: string;
  updatedAt?: string;
}
export interface HydropowerStationMetrics {
  stationName: string;
  turbineCapacityMW: number;
  liveOutputKW: number;
  waterDischargeCusecs: number;
  gridFrequencyHz: number;
  activeConsumers: number;
  vacantMeters: number;
  collectedRevenueRupees: number;
  pendingArrearsRupees: number;
  unitsGeneratedThisMonth: number;
  unitsBilledThisMonth: number;
}

export interface SystemSettingsConfig {
  baseRatePerUnit: number;
  commercialRatePerUnit: number;
  latePaymentFinePercent: number;
  fixedFineRupees: number;
  meterMaxLimit: number; // e.g. 100000 for 5-digit mechanical meter rollover
  plantName: string;
  location: string;
  currencySymbol: string;
}

export type UserRole = 'ADMIN' | 'CONSUMER';

export interface AuthSession {
  isAuthenticated: boolean;
  role: UserRole;
  phone: string;
  consumerId?: string;
  adminName?: string;
}

export interface OfflineSyncQueueItem {
  id: string;
  tableName: 'consumers' | 'ledgers' | 'settings';
  operation: 'INSERT' | 'UPDATE' | 'SOFT_DELETE';
  recordId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  lastError?: string;
}

export type AnomalyType =
  | 'NORMAL'
  | 'SURGE_SPIKE'
  | 'ABRUPT_DROP'
  | 'ZERO_CONSUMPTION_OCCUPIED'
  | 'ROLLOVER_ANOMALY';

export interface MeterAuditReport {
  consumerId: string;
  meterNumber: string;
  fullName: string;
  currentUnits: number;
  previousUnits: number;
  threeMonthAverage: number;
  variancePercent: number;
  anomalyType: AnomalyType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendation: string;
}
