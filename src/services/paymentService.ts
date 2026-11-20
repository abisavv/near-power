import { supabase } from '@/utils/supabase';
import type { BillingRecord } from '@/types';

export const PAYMENT_METHODS = ['JazzCash', 'Easypaisa', 'ABL', 'UBL', 'MCB', 'Cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentRecord = {
  id: string;
  bill_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  received_by: string | null;
  remarks: string | null;
  created_at: string;
};

export const paymentService = {
  async listForBill(billId: string): Promise<PaymentRecord[]> {
    const { data, error } = await supabase.from('payments').select('*')
      .eq('bill_id', billId).order('payment_date', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => ({ ...row, amount: Number(row.amount) })) as PaymentRecord[];
  },

  async record(input: { billId: string; amount: number; method: PaymentMethod; date?: string; remarks?: string }): Promise<BillingRecord> {
    const { data, error } = await supabase.rpc('record_bill_payment', {
      p_bill_id: input.billId,
      p_amount: input.amount,
      p_payment_method: input.method,
      p_payment_date: input.date ?? new Date().toISOString().slice(0, 10),
      p_remarks: input.remarks?.trim() || null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('Payment was recorded but the updated bill was not returned. Refresh the bill before continuing.');
    return {
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
    };
  },

  async markPaid(billId: string, method: PaymentMethod = 'Cash'): Promise<BillingRecord> {
    const { data, error } = await supabase.rpc('mark_bill_paid', { p_bill_id: billId, p_payment_method: method });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('The bill status could not be confirmed. Refresh and check the bill.');
    return this.recordedRow(row);
  },

  recordedRow(row: Record<string, unknown>): BillingRecord {
    return {
      billId: String(row.bill_id), consumerId: String(row.consumer_id), monthYear: String(row.month_year),
      issueDate: String(row.issue_date), dueDate: String(row.due_date), oldUnit: Number(row.old_unit),
      newUnit: Number(row.new_unit), unitsConsumed: Number(row.units_consumed), ratePerUnit: Number(row.rate_per_unit),
      arrears: Number(row.arrears), fine: Number(row.fine), adjustmentRupees: Number(row.adjustment_rupees),
      totalRupees: Number(row.total_rupees), receivingAmount: Number(row.receiving_amount),
      status: row.status as BillingRecord['status'], paidDate: row.paid_date ? String(row.paid_date) : null,
      paymentMethod: row.payment_method ? String(row.payment_method) : undefined,
      remarks: row.remarks ? String(row.remarks) : undefined,
    };
  },
};
