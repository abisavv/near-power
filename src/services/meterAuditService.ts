import { ConsumerModel, BillingRecord, MeterAuditReport, AnomalyType } from '../types';

/**
 * Analyzes consumer meter consumption against historical 3-month moving averages.
 * Flags abnormal jumps, abrupt drops, zero consumption on occupied premises, or mechanical faults.
 */
export function analyzeMeterConsumption(
  consumer: ConsumerModel,
  records: BillingRecord[]
): MeterAuditReport {
  const consumerRecords = records
    .filter((r) => r.consumerId === consumer.id)
    .sort((a, b) => b.billId.localeCompare(a.billId));

  const currentRecord = consumerRecords[0];
  const currentUnits = currentRecord ? currentRecord.unitsConsumed : 0;

  // Previous 1-3 statements
  const previousRecords = consumerRecords.slice(1, 4);
  const previousUnits = previousRecords[0] ? previousRecords[0].unitsConsumed : currentUnits;

  const previousTotal = previousRecords.reduce((sum, r) => sum + r.unitsConsumed, 0);
  const threeMonthAverage =
    previousRecords.length > 0
      ? Math.round((previousTotal / previousRecords.length) * 100) / 100
      : currentUnits;

  // Calculate percentage variance
  let variancePercent = 0;
  if (threeMonthAverage > 0) {
    variancePercent = Math.round(((currentUnits - threeMonthAverage) / threeMonthAverage) * 100);
  }

  let anomalyType: AnomalyType = 'NORMAL';
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  let recommendation = 'Consumption within standard expected variance tolerance (±25%).';

  // Check for rollover
  if (currentRecord && currentRecord.newUnit < currentRecord.oldUnit) {
    anomalyType = 'ROLLOVER_ANOMALY';
    severity = 'MEDIUM';
    recommendation =
      'Mechanical meter rolled over dial capacity. Verify 5-digit register photo and seal integrity.';
  } else if (consumer.isActive && currentUnits === 0 && threeMonthAverage > 20) {
    anomalyType = 'ZERO_CONSUMPTION_OCCUPIED';
    severity = 'HIGH';
    recommendation =
      'Zero consumption recorded for active occupied premises. Dispatch lineman to check for meter rotor jam or bypass.';
  } else if (threeMonthAverage > 30 && variancePercent >= 50) {
    anomalyType = 'SURGE_SPIKE';
    severity = variancePercent >= 100 ? 'HIGH' : 'MEDIUM';
    recommendation = `Significant consumption surge (+${variancePercent}% vs average). Verify high-load appliances or check for ground insulation leakage.`;
  } else if (consumer.isActive && threeMonthAverage >= 50 && variancePercent <= -60) {
    anomalyType = 'ABRUPT_DROP';
    severity = 'MEDIUM';
    recommendation = `Abrupt drop in consumption (${variancePercent}% vs average). Verify if premises are temporarily unoccupied or check meter calibration.`;
  }

  return {
    consumerId: consumer.id,
    meterNumber: consumer.meterNumber,
    fullName: consumer.fullName,
    currentUnits,
    previousUnits,
    threeMonthAverage,
    variancePercent,
    anomalyType,
    severity,
    recommendation,
  };
}

/**
 * Runs batch audit analysis over all active consumers.
 */
export function auditAllConsumers(
  consumers: ConsumerModel[],
  records: BillingRecord[]
): MeterAuditReport[] {
  return consumers.map((c) => analyzeMeterConsumption(c, records));
}
