import { ConsumerModel, BillingRecord, PaymentStatus } from '../types';

export const DEFAULT_METER_MAX_LIMIT = 100000;

/**
 * Calculates consumed units handling normal progression and mechanical meter rollover.
 * Operational Rule: unitsConsumed = (newUnit >= oldUnit) ? (newUnit - oldUnit) : ((maxLimit - oldUnit) + newUnit)
 */
export function calculateUnitsConsumed(
  oldUnit: number,
  newUnit: number,
  maxLimit: number = DEFAULT_METER_MAX_LIMIT
): number {
  if (oldUnit < 0 || newUnit < 0) {
    throw new Error('Meter units cannot be negative.');
  }

  if (newUnit >= oldUnit) {
    return Math.round((newUnit - oldUnit) * 100) / 100;
  }

  // Meter rollover case (e.g. 99850 rolled over to 00120)
  const consumed = (maxLimit - oldUnit) + newUnit;
  return Math.round(consumed * 100) / 100;
}

/**
 * Calculates total bill rupees based on consumption, tariff, arrears, fine, and adjustments.
 * Formula: totalRupees = (unitsConsumed * ratePerUnit) + arrears + fine + adjustmentRupees
 */
export function calculateTotalRupees(
  unitsConsumed: number,
  ratePerUnit: number,
  arrears: number = 0,
  fine: number = 0,
  adjustmentRupees: number = 0
): number {
  const energyCharge = unitsConsumed * ratePerUnit;
  const rawTotal = energyCharge + arrears + fine + adjustmentRupees;
  return Math.max(0, Math.round(rawTotal));
}

/**
 * Calculates late payment fine (either flat fine or percentage of bill arrears).
 */
export function calculateLateFine(
  baseAmount: number,
  finePercent: number = 10,
  flatFineRupees: number = 150
): number {
  if (baseAmount <= 0) return 0;
  const percentageFine = Math.round((baseAmount * finePercent) / 100);
  return Math.max(flatFineRupees, percentageFine);
}

/**
 * Validates meter reading inputs.
 */
export function validateMeterReadingInput(
  oldUnitStr: string,
  newUnitStr: string,
  rateStr: string
): { isValid: boolean; error?: string } {
  if (!oldUnitStr.trim() || !newUnitStr.trim() || !rateStr.trim()) {
    return { isValid: false, error: 'All numerical meter fields are required.' };
  }

  const oldUnit = Number(oldUnitStr);
  const newUnit = Number(newUnitStr);
  const rate = Number(rateStr);

  if (isNaN(oldUnit) || isNaN(newUnit) || isNaN(rate)) {
    return { isValid: false, error: 'Meter readings and rate must be valid numbers.' };
  }

  if (oldUnit < 0 || newUnit < 0 || rate <= 0) {
    return { isValid: false, error: 'Units must be non-negative and rate must be greater than zero.' };
  }

  return { isValid: true };
}

/**
 * Soft deletes a consumer: marks `isActive = false`, records `leftDate`.
 * Historical ledgers remain intact and slot can be inherited or re-occupied.
 */
export function softDeleteConsumer(
  consumer: ConsumerModel,
  leftDate: string = new Date().toISOString().split('T')[0]
): ConsumerModel {
  return {
    ...consumer,
    isActive: false,
    leftDate,
  };
}

/**
 * Reactivates or reassigns an existing meter slot to a new incoming occupant.
 */
export function reassignMeterSlot(
  existingConsumer: ConsumerModel,
  newOccupantDetails: {
    fullName: string;
    cnic: string;
    phone: string;
    securityDeposit: number;
  }
): ConsumerModel {
  return {
    ...existingConsumer,
    fullName: newOccupantDetails.fullName,
    cnic: newOccupantDetails.cnic,
    phone: newOccupantDetails.phone,
    securityDeposit: newOccupantDetails.securityDeposit,
    isActive: true,
    leftDate: null,
    connectionDate: new Date().toISOString().split('T')[0],
  };
}

/**
 * Formats Pakistani Rupees (PKR) with standard thousand separators.
 */
export function formatRupees(amount: number): string {
  return 'Rs. ' + Math.round(amount).toLocaleString('en-PK');
}

/**
 * Formats units for tabular monospaced display.
 */
export function formatUnits(units: number): string {
  return units.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' kWh';
}
