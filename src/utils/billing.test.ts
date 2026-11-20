import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateUnitsConsumed,
  calculateTotalRupees,
  calculateLateFine,
  validateMeterReadingInput,
  softDeleteConsumer,
  reassignMeterSlot,
  formatRupees,
} from './billing';
import { ConsumerModel } from '../types';

test('calculateUnitsConsumed: standard consumption (newUnit >= oldUnit)', () => {
  const units = calculateUnitsConsumed(1450, 1680);
  assert.equal(units, 230);
});

test('calculateUnitsConsumed: zero consumption (no change)', () => {
  const units = calculateUnitsConsumed(2500, 2500);
  assert.equal(units, 0);
});

test('calculateUnitsConsumed: rollover case (newUnit < oldUnit)', () => {
  // Meter rolled over at 100,000 max limit: old was 99,850, new is 120
  // (100,000 - 99,850) + 120 = 150 + 120 = 270 units
  const units = calculateUnitsConsumed(99850, 120, 100000);
  assert.equal(units, 270);
});

test('calculateUnitsConsumed: throws error on negative units', () => {
  assert.throws(() => {
    calculateUnitsConsumed(-10, 100);
  }, /cannot be negative/);
});

test('calculateTotalRupees: standard formula calculation', () => {
  // unitsConsumed * ratePerUnit + arrears + fine + adjustment
  // 200 units * Rs. 14.50 = 2900 + 500 arrears + 150 fine + 0 adjustment = 3550
  const total = calculateTotalRupees(200, 14.5, 500, 150, 0);
  assert.equal(total, 3550);
});

test('calculateTotalRupees: supports manual discount adjustment (negative)', () => {
  // 100 units * Rs. 12 = 1200 - 200 repair discount = 1000
  const total = calculateTotalRupees(100, 12, 0, 0, -200);
  assert.equal(total, 1000);
});

test('calculateLateFine: applies higher of fixed or percentage fine', () => {
  // Fixed fine is 150. For 1000 base amount, 10% is 100 -> takes fixed 150
  assert.equal(calculateLateFine(1000, 10, 150), 150);
  // For 5000 base amount, 10% is 500 -> takes percentage 500
  assert.equal(calculateLateFine(5000, 10, 150), 500);
  // For 0 base amount -> 0
  assert.equal(calculateLateFine(0), 0);
});

test('validateMeterReadingInput: validates input formats and rules', () => {
  assert.equal(validateMeterReadingInput('100', '250', '14.5').isValid, true);
  assert.equal(validateMeterReadingInput('', '250', '14.5').isValid, false);
  assert.equal(validateMeterReadingInput('abc', '250', '14.5').isValid, false);
  assert.equal(validateMeterReadingInput('100', '250', '-5').isValid, false);
});

test('softDeleteConsumer: marks inactive and records left date', () => {
  const dummy: ConsumerModel = {
    id: 'c1',
    serialNumber: 'SR-001',
    meterNumber: 'NP-001',
    fullName: 'Gulzar Ahmed',
    cnic: '35201-1234567-1',
    phone: '0300-1234567',
    address: 'Hydro Colony Ward 2',
    securityDeposit: 5000,
    isActive: true,
    connectionDate: '2024-01-01',
  };

  const softDeleted = softDeleteConsumer(dummy, '2026-11-01');
  assert.equal(softDeleted.isActive, false);
  assert.equal(softDeleted.leftDate, '2026-11-01');
  assert.equal(softDeleted.meterNumber, 'NP-001'); // Meter slot retained
});

test('reassignMeterSlot: assigns new occupant to vacant meter slot', () => {
  const vacant: ConsumerModel = {
    id: 'c1',
    serialNumber: 'SR-001',
    meterNumber: 'NP-001',
    fullName: 'Former Tenant',
    cnic: '35201-0000000-0',
    phone: '0300-0000000',
    address: 'Hydro Colony Ward 2',
    securityDeposit: 0,
    isActive: false,
    leftDate: '2026-10-15',
    connectionDate: '2024-01-01',
  };

  const reassigned = reassignMeterSlot(vacant, {
    fullName: 'Shahbaz Sharif',
    cnic: '35202-9988776-5',
    phone: '0321-7654321',
    securityDeposit: 6000,
  });

  assert.equal(reassigned.fullName, 'Shahbaz Sharif');
  assert.equal(reassigned.isActive, true);
  assert.equal(reassigned.leftDate, null);
  assert.equal(reassigned.securityDeposit, 6000);
});

test('formatRupees: produces consistent currency strings', () => {
  assert.equal(formatRupees(24500), 'Rs. 24,500');
  assert.equal(formatRupees(0), 'Rs. 0');
});
