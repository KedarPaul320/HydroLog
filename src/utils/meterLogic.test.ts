import test from 'node:test';
import assert from 'node:assert/strict';
import type { MeterReading } from '../types';
import {
  canAccessRoute,
  canEditRecord,
  canExportRecords,
  canManageConfig,
  canManageUsers,
  combineDateAndTime,
  computeDashboardSummary,
  filterReadings,
  formatExcelDate,
  formatExcelTime12h,
  hasAbnormalityRemark,
  splitIsoToLocalDateAndTime,
  validateReadingInput,
} from './meterLogic';

const sampleReadings: MeterReading[] = [
  {
    id: 1,
    imageUrl: '/src/assets/images/meter_plant_a.jpg',
    waterFlow: 482.5,
    recordedAt: '2026-11-17T08:15:00.000Z',
    plant: 'North Intake A',
    motorName: 'Main Booster 1',
    motorStatus: 'Running',
    review: 'Normal operation',
    submittedBy: 2,
    submittedByName: 'Marcus Chen',
    submittedByEmail: 'marcus@aquaflow.io',
    createdAt: '2026-11-17T08:15:00.000Z',
    updatedAt: '2026-11-17T08:15:00.000Z',
  },
  {
    id: 2,
    imageUrl: '/src/assets/images/meter_plant_b.jpg',
    waterFlow: 147.9,
    recordedAt: '2026-11-18T09:30:00.000Z',
    plant: 'Plant B',
    motorName: 'Motor 2',
    motorStatus: 'Stopped',
    review: 'Minor gasket weep on downstream flange',
    submittedBy: 2,
    submittedByName: 'Marcus Chen',
    submittedByEmail: 'marcus@aquaflow.io',
    createdAt: '2026-11-18T09:30:00.000Z',
    updatedAt: '2026-11-18T09:30:00.000Z',
  },
  {
    id: 3,
    imageUrl: '/src/assets/images/meter_plant_c.jpg',
    waterFlow: 269.6,
    recordedAt: '2026-11-19T07:45:00.000Z',
    plant: 'Plant C',
    motorName: 'Motor 3',
    motorStatus: 'Running',
    review: '',
    submittedBy: 3,
    submittedByName: 'Priya Nair',
    submittedByEmail: 'priya@aquaflow.io',
    createdAt: '2026-11-19T07:45:00.000Z',
    updatedAt: '2026-11-19T07:45:00.000Z',
  },
];

test('validateReadingInput accepts renamed plants, motors, and Running/Stopped status', () => {
  const result = validateReadingInput(
    {
      waterFlow: '124.456',
      plant: 'North Intake A',
      motorName: 'Main Booster 1',
      motorStatus: 'Stopped',
      recordedAt: combineDateAndTime('2026-11-19', '10:35'),
      review: 'Valve pressure stable',
      hasImage: true,
    },
    true,
    ['North Intake A', 'Plant B', 'Plant C'],
    ['Main Booster 1', 'Motor 2', 'Motor 3']
  );
  assert.equal(result.valid, true);
  assert.equal(result.parsedFlow, 124.46);
  assert.deepEqual(result.errors, {});
});

test('validateReadingInput rejects missing photo, invalid flow, invalid motor, and invalid status', () => {
  const result = validateReadingInput(
    {
      waterFlow: '-5',
      plant: 'Unknown Plant',
      motorName: '',
      motorStatus: 'Paused',
      recordedAt: combineDateAndTime('', '10:00'),
      hasImage: false,
    },
    true,
    ['Plant A', 'Plant B', 'Plant C'],
    ['Motor 1', 'Motor 2', 'Motor 3']
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.waterFlow);
  assert.ok(result.errors.plant);
  assert.ok(result.errors.motorName);
  assert.ok(result.errors.motorStatus);
  assert.ok(result.errors.recordedAt);
  assert.ok(result.errors.image);
});

test('combineDateAndTime and splitIsoToLocalDateAndTime round-trip cleanly', () => {
  const combined = combineDateAndTime('2026-11-18', '14:25');
  assert.equal(combined, '2026-11-18T14:25');
  const iso = new Date(combined).toISOString();
  const split = splitIsoToLocalDateAndTime(iso);
  assert.equal(split.date, '2026-11-18');
  assert.equal(split.time, '14:25');
});

test('hasAbnormalityRemark distinguishes nominal phrases from true remarks', () => {
  assert.equal(hasAbnormalityRemark(''), false);
  assert.equal(hasAbnormalityRemark('Normal operation'), false);
  assert.equal(hasAbnormalityRemark('OK'), false);
  assert.equal(hasAbnormalityRemark('Condensation inside dial lens'), true);
});

test('filterReadings filters accurately by plant, motor, motorStatus, user, date range, and search', () => {
  assert.equal(filterReadings(sampleReadings, { plant: 'North Intake A' }).length, 1);
  assert.equal(filterReadings(sampleReadings, { motorName: 'Motor 2' }).length, 1);
  assert.equal(filterReadings(sampleReadings, { motorStatus: 'Stopped' }).length, 1);
  assert.equal(filterReadings(sampleReadings, { motorStatus: 'Running' }).length, 2);
  assert.equal(filterReadings(sampleReadings, { userId: 3 }).length, 1);
  assert.equal(
    filterReadings(sampleReadings, { dateFrom: '2026-11-18', dateTo: '2026-11-19' }).length,
    2
  );
  assert.equal(filterReadings(sampleReadings, { search: 'booster' }).length, 1);
});

test('computeDashboardSummary aggregates dynamic plant names and motor running/stopped counts', () => {
  const summary = computeDashboardSummary(sampleReadings, [
    'North Intake A',
    'Plant B',
    'Plant C',
  ]);
  assert.equal(summary.readingCount, 3);
  assert.equal(summary.totalFlow, 900);
  assert.equal(summary.averageFlow, 300);
  assert.equal(summary.abnormalCount, 1);
  assert.equal(summary.runningCount, 2);
  assert.equal(summary.stoppedCount, 1);

  const northPlant = summary.plantBreakdown.find((p) => p.plant === 'North Intake A');
  assert.equal(northPlant?.totalFlow, 482.5);
  assert.equal(summary.dailyTrend.length, 3);
});

test('RBAC permission helpers enforce Admin vs User boundaries including plants-motors config', () => {
  assert.equal(canAccessRoute('admin', 'admin-dashboard'), true);
  assert.equal(canAccessRoute('admin', 'plants-motors'), true);
  assert.equal(canEditRecord('admin'), true);
  assert.equal(canManageUsers('admin'), true);
  assert.equal(canManageConfig('admin'), true);
  assert.equal(canExportRecords('admin'), true);

  assert.equal(canAccessRoute('user', 'user-home'), true);
  assert.equal(canAccessRoute('user', 'submit-reading'), true);
  assert.equal(canAccessRoute('user', 'my-records'), true);
  assert.equal(canAccessRoute('user', 'plants-motors'), false);
  assert.equal(canManageConfig('user'), false);
  assert.equal(canEditRecord('user'), false);
});

test('formatExcelDate and formatExcelTime12h format DD/MM/YYYY and 12-hour AM/PM cleanly', () => {
  // UTC (tzOffsetMinutes = 0)
  assert.equal(formatExcelDate('2026-03-05T00:05:00.000Z', 0), '05/03/2026');
  assert.equal(formatExcelTime12h('2026-03-05T00:05:00.000Z', 0), '12:05 AM');
  assert.equal(formatExcelTime12h('2026-03-05T08:15:00.000Z', 0), '08:15 AM');
  assert.equal(formatExcelTime12h('2026-03-05T12:00:00.000Z', 0), '12:00 PM');
  assert.equal(formatExcelTime12h('2026-11-19T14:35:00.000Z', 0), '02:35 PM');
  assert.equal(formatExcelDate('2026-11-19T14:35:00.000Z', 0), '19/11/2026');

  // Timezone offset: IST (+05:30 => JS getTimezoneOffset() = -330)
  assert.equal(formatExcelDate('2026-11-19T20:00:00.000Z', -330), '20/11/2026');
  assert.equal(formatExcelTime12h('2026-11-19T20:00:00.000Z', -330), '01:30 AM');

  // Timezone offset: PST (-08:00 => JS getTimezoneOffset() = 480)
  assert.equal(formatExcelDate('2026-11-19T02:15:00.000Z', 480), '18/11/2026');
  assert.equal(formatExcelTime12h('2026-11-19T02:15:00.000Z', 480), '06:15 PM');
});

