import type { BillingRecord, ConsumerModel } from '@/types';

/** Natural, locale-aware ordering: M-2 sorts before M-10. */
export function compareMeterNumbers(a: unknown, b: unknown): number {
  return String(a ?? '').trim().localeCompare(String(b ?? '').trim(), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortConsumersByMeterNumber<T extends { meter_number?: unknown; meterNumber?: unknown }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareMeterNumbers(a.meter_number ?? a.meterNumber, b.meter_number ?? b.meterNumber));
}

export function sortLedgerRowsByMeterNumberLatestFirst<T extends Record<string, unknown>>(
  rows: T[],
  consumers: Array<{ id?: unknown; meter_number?: unknown; meterNumber?: unknown }>,
): T[] {
  const meterByConsumer = new Map(consumers.map(c => [String(c.id ?? ''), c.meter_number ?? c.meterNumber]));
  return [...rows].sort((a, b) => {
    const meterOrder = compareMeterNumbers(meterByConsumer.get(String(a.consumer_id ?? a.consumerId ?? '')), meterByConsumer.get(String(b.consumer_id ?? b.consumerId ?? '')));
    if (meterOrder) return meterOrder;
    const dateOrder = String(b.issue_date ?? b.issueDate ?? '').localeCompare(String(a.issue_date ?? a.issueDate ?? ''));
    if (dateOrder) return dateOrder;
    const createdOrder = String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
    if (createdOrder) return createdOrder;
    return String(b.bill_id ?? b.billId ?? '').localeCompare(String(a.bill_id ?? a.billId ?? ''), undefined, { numeric: true });
  });
}

export function sortBillingRecordsByMeterNumberLatestFirst(
  ledgers: BillingRecord[], consumers: ConsumerModel[],
): BillingRecord[] {
  const meterByConsumer = new Map(consumers.map(c => [c.id, c.meterNumber]));
  return [...ledgers].sort((a, b) => {
    const meterOrder = compareMeterNumbers(meterByConsumer.get(a.consumerId), meterByConsumer.get(b.consumerId));
    if (meterOrder) return meterOrder;
    return b.issueDate.localeCompare(a.issueDate) || b.billId.localeCompare(a.billId, undefined, { numeric: true });
  });
}
