import { supabase } from '@/utils/supabase';
import type { BillingRecord, PaymentStatus } from '@/types';
import { paymentService, PAYMENT_METHODS, type PaymentMethod } from '@/services/paymentService';

type LedgerRow = {
  bill_id: string;
  consumer_id: string;
  month_year: string;
  issue_date: string;
  due_date: string;
  old_unit: number;
  new_unit: number;
  units_consumed: number;
  rate_per_unit: number;
  arrears: number;
  fine: number;
  adjustment_rupees: number;
  total_rupees: number;
  receiving_amount: number;
  status: PaymentStatus;
  paid_date: string | null;
  payment_method: string | null;
  remarks: string | null;
  created_at?: string;
  updated_at?: string;
};

type VersionedLedger = BillingRecord & { updatedAt?: string };

function mapLedger(row: LedgerRow): BillingRecord {
  const mapped: VersionedLedger = {
    billId: row.bill_id,
    consumerId: row.consumer_id,
    monthYear: row.month_year,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    oldUnit: Number(row.old_unit),
    newUnit: Number(row.new_unit),
    unitsConsumed: Number(row.units_consumed),
    ratePerUnit: Number(row.rate_per_unit),
    arrears: Number(row.arrears),
    fine: Number(row.fine),
    adjustmentRupees: Number(row.adjustment_rupees),
    totalRupees: Number(row.total_rupees),
    receivingAmount: Number(row.receiving_amount),
    status: row.status,
    paidDate: row.paid_date,
    paymentMethod: row.payment_method,
    remarks: row.remarks,
    updatedAt: row.updated_at,
  };
  return mapped;
}

function toDatabaseRow(bill: BillingRecord) {
  return {
    bill_id: bill.billId,
    consumer_id: bill.consumerId,
    month_year: bill.monthYear,
    issue_date: bill.issueDate,
    due_date: bill.dueDate,
    old_unit: bill.oldUnit,
    new_unit: bill.newUnit,
    units_consumed: bill.unitsConsumed,
    rate_per_unit: bill.ratePerUnit,
    arrears: bill.arrears,
    fine: bill.fine,
    adjustment_rupees: bill.adjustmentRupees,
    total_rupees: bill.totalRupees,
    receiving_amount: bill.receivingAmount,
    status: bill.status,
    paid_date: bill.paidDate ?? null,
    payment_method: bill.paymentMethod ?? null,
    remarks: bill.remarks ?? null,
  };
}

export const ledgerService = {
  async getByConsumer(consumerId: string): Promise<BillingRecord[]> {
    const { data, error } = await supabase.from('ledgers').select('*').eq('consumer_id', consumerId).order('issue_date', { ascending: false }).order('bill_id', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => mapLedger(row as LedgerRow));
  },

  async getById(billId: string): Promise<BillingRecord | null> {
    const { data, error } = await supabase.from('ledgers').select('*').eq('bill_id', billId).maybeSingle();
    if (error) throw error;
    return data ? mapLedger(data as LedgerRow) : null;
  },

  async create(bill: Omit<BillingRecord, 'billId'>): Promise<BillingRecord> {
    const newBill = { ...bill, billId: `BILL-${Date.now()}-${Math.floor(Math.random() * 100000)}` } as BillingRecord;
    const { data, error } = await supabase.from('ledgers').insert(toDatabaseRow(newBill)).select().single();
    if (error) throw error;
    return mapLedger(data as LedgerRow);
  },

  async getAll(): Promise<BillingRecord[]> {
    const pageSize = 1000;
    const rows: LedgerRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from('ledgers').select('*')
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Failed to fetch ledgers: ${error.message}`);
      const page = (data ?? []) as LedgerRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    const { data: consumers, error: consumerError } = await supabase.from('consumers').select('id,meter_number');
    if (consumerError) throw consumerError;
    const meterByConsumer = new Map((consumers ?? []).map(row => [String(row.id), String(row.meter_number ?? '')]));
    return rows.map(mapLedger).sort((a, b) =>
      (meterByConsumer.get(a.consumerId) ?? '').localeCompare(meterByConsumer.get(b.consumerId) ?? '', undefined, { numeric: true, sensitivity: 'base' }) ||
      b.issueDate.localeCompare(a.issueDate) || b.billId.localeCompare(a.billId, undefined, { numeric: true }),
    );
  },

  async updatePaymentStatus(billId: string, status: PaymentStatus, method?: string): Promise<BillingRecord> {
    const existing = await this.getById(billId);
    if (!existing) throw new Error(`Bill ${billId} not found.`);
    if (status === 'PAID') {
      const safeMethod = PAYMENT_METHODS.includes(method as PaymentMethod) ? method as PaymentMethod : 'Cash';
      return paymentService.markPaid(billId, safeMethod);
    }
    if (status === 'PARTIAL') {
      throw new Error('Use the payment recording workflow to create a partial payment.');
    }
    if (existing.receivingAmount > 0) {
      throw new Error('A bill with recorded payments cannot be reset to unpaid. Correct or reverse its payment through an authorized accounting process.');
    }
    const { data, error } = await supabase.from('ledgers').update({
      status: 'UNPAID', paid_date: null, payment_method: null, receiving_amount: 0,
    }).eq('bill_id', billId).select().single();
    if (error) throw error;
    return mapLedger(data as LedgerRow);
  },
};
