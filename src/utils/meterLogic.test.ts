import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MS_PER_DAY,
  RETENTION_DAYS,
  applyPlantMotorStatesToReadings,
  buildPlantMotorStatesSignature,
  buildPlantUsageTrend,
  canAccessRoute,
  canEditRecord,
  canExportRecords,
  canManageConfig,
  canManageUsers,
  combineDateAndTime,
  computeDashboardSummary,
  computeExpiresAtIso,
  evaluateMotorInterlock,
  filterActiveReadings,
  filterReadings,
  findStaleRunningReadingIds,
  formatExcelDate,
  formatExcelTime12h,
  getDefaultRouteForRole,
  getPlantMotorState,
  getRetentionDaysRemaining,
  hasAbnormalityRemark,
  isAndroidAppRuntime,
  isRecordExpiredOnDay46,
  splitIsoToLocalDateAndTime,
  validateReadingInput,
} from './meterLogic';
import type { MeterReading, PlantMotorState } from '../types';

const SAMPLE_READINGS: MeterReading[] = [
  {
    id: 'rd_1',
    photoId: 'ph_1',
    imageUrl: '',
    waterFlow: 1450.5,
    recordedAt: '2026-11-18T08:00:00.000Z',
    plant: 'North Intake',
    motorName: 'Booster Pump 1',
    motorStatus: 'Running',
    review: 'Normal operation',
    submittedBy: 'uid_marcus',
    submittedByName: 'Marcus Chen',
    submittedByEmail: 'marcus@aquaflow.io',
    createdAt: '2026-11-18T08:01:00.000Z',
    updatedAt: '2026-11-18T08:01:00.000Z',
    expiresAt: computeExpiresAtIso('2026-11-18T08:01:00.000Z'),
  },
  {
    id: 'rd_2',
    photoId: 'ph_2',
    imageUrl: '',
    waterFlow: 2100.25,
    recordedAt: '2026-11-18T10:30:00.000Z',
    plant: 'Plant B',
    motorName: 'Motor 2',
    motorStatus: 'Stopped',
    review: 'Minor seal leak near intake flange',
    submittedBy: 'uid_priya',
    submittedByName: 'Priya Nair',
    submittedByEmail: 'priya@aquaflow.io',
    createdAt: '2026-11-18T10:31:00.000Z',
    updatedAt: '2026-11-18T10:31:00.000Z',
    expiresAt: computeExpiresAtIso('2026-11-18T10:31:00.000Z'),
  },
  {
    id: 'rd_3',
    photoId: 'ph_3',
    imageUrl: '',
    waterFlow: 950.25,
    recordedAt: '2026-11-19T09:15:00.000Z',
    plant: 'Plant C',
    motorName: 'Motor 3',
    motorStatus: 'Running',
    review: '',
    submittedBy: 'uid_marcus',
    submittedByName: 'Marcus Chen',
    submittedByEmail: 'marcus@aquaflow.io',
    createdAt: '2026-11-19T09:16:00.000Z',
    updatedAt: '2026-11-19T09:16:00.000Z',
    expiresAt: computeExpiresAtIso('2026-11-19T09:16:00.000Z'),
  },
];

test('validateReadingInput accepts renamed plants, motors, and Running/Stopped status', () => {
  const res = validateReadingInput(
    {
      waterFlow: '1234.567',
      plant: 'North Intake',
      motorName: 'Booster Pump 1',
      motorStatus: 'Stopped',
      recordedAt: '2026-11-19T08:30',
      review: 'Motor stopped for scheduled inspection',
      hasImage: true,
    },
    true,
    ['North Intake', 'Plant B'],
    ['Booster Pump 1', 'Motor 2']
  );

  assert.equal(res.valid, true);
  assert.equal(res.parsedFlow, 1234.57);
  assert.deepEqual(res.errors, {});
});

test('validateReadingInput rejects missing photo, invalid flow, invalid motor, and invalid status', () => {
  const res = validateReadingInput(
    {
      waterFlow: '-12',
      plant: 'Unknown Plant',
      motorName: 'Unknown Motor',
      motorStatus: 'Idle',
      recordedAt: 'not-a-date',
      review: '',
      hasImage: false,
    },
    true,
    ['Plant A', 'Plant B'],
    ['Motor 1', 'Motor 2']
  );

  assert.equal(res.valid, false);
  assert.ok(res.errors.waterFlow);
  assert.ok(res.errors.plant);
  assert.ok(res.errors.motorName);
  assert.ok(res.errors.motorStatus);
  assert.ok(res.errors.recordedAt);
  assert.ok(res.errors.image);
});

test('combineDateAndTime and splitIsoToLocalDateAndTime round-trip cleanly', () => {
  const combined = combineDateAndTime('2026-11-19', '14:45');
  assert.equal(combined, '2026-11-19T14:45');
  const iso = new Date(combined).toISOString();
  const split = splitIsoToLocalDateAndTime(iso);
  assert.equal(split.date, '2026-11-19');
  assert.equal(split.time, '14:45');
});

test('hasAbnormalityRemark distinguishes nominal phrases from true remarks', () => {
  assert.equal(hasAbnormalityRemark(''), false);
  assert.equal(hasAbnormalityRemark('Normal operation'), false);
  assert.equal(hasAbnormalityRemark('OK'), false);
  assert.equal(hasAbnormalityRemark('Fogged register glass'), true);
});

test('filterReadings filters accurately by plant, motor, motorStatus, user, date range, and search', () => {
  assert.equal(filterReadings(SAMPLE_READINGS, { plant: 'Plant B' }).length, 1);
  assert.equal(filterReadings(SAMPLE_READINGS, { motorName: 'Booster Pump 1' }).length, 1);
  assert.equal(filterReadings(SAMPLE_READINGS, { motorStatus: 'Stopped' }).length, 1);
  assert.equal(filterReadings(SAMPLE_READINGS, { motorStatus: 'Running' }).length, 2);
  assert.equal(filterReadings(SAMPLE_READINGS, { userId: 'uid_marcus' }).length, 2);
  assert.equal(
    filterReadings(SAMPLE_READINGS, { dateFrom: '2026-11-19', dateTo: '2026-11-19' }).length,
    1
  );
  assert.equal(filterReadings(SAMPLE_READINGS, { search: 'flange' }).length, 1);
});

test('computeDashboardSummary aggregates dynamic plant names and motor running/stopped counts', () => {
  const summary = computeDashboardSummary(SAMPLE_READINGS, ['North Intake', 'Plant B', 'Plant C']);
  assert.equal(summary.readingCount, 3);
  assert.equal(summary.totalFlow, 4501);
  assert.equal(summary.averageFlow, 1500.33);
  assert.equal(summary.abnormalCount, 1);
  assert.equal(summary.runningCount, 2);
  assert.equal(summary.stoppedCount, 1);
  assert.equal(summary.plantBreakdown[0].plant, 'North Intake');
  assert.equal(summary.plantBreakdown[0].totalFlow, 1450.5);
  assert.equal(summary.dailyTrend.length, 2);
});

test('RBAC permission helpers enforce Admin vs User boundaries including plants-motors config', () => {
  assert.equal(canAccessRoute('user', 'user-home'), true);
  assert.equal(canAccessRoute('user', 'submit-reading'), true);
  assert.equal(canAccessRoute('user', 'my-records'), true);
  assert.equal(canAccessRoute('user', 'admin-dashboard'), false);
  assert.equal(canAccessRoute('user', 'all-records'), false);
  assert.equal(canAccessRoute('user', 'user-management'), false);
  assert.equal(canAccessRoute('user', 'plants-motors'), false);
  assert.equal(canAccessRoute('user', 'android-guide'), false);

  assert.equal(canAccessRoute('admin', 'admin-dashboard'), true);
  assert.equal(canAccessRoute('admin', 'all-records'), true);
  assert.equal(canAccessRoute('admin', 'user-management'), true);
  assert.equal(canAccessRoute('admin', 'plants-motors'), true);
  assert.equal(canAccessRoute('admin', 'android-guide'), true);

  assert.equal(canEditRecord('user'), false);
  assert.equal(canEditRecord('admin'), true);
  assert.equal(canManageUsers('user'), false);
  assert.equal(canManageUsers('admin'), true);
  assert.equal(canManageConfig('user'), false);
  assert.equal(canManageConfig('admin'), true);
  assert.equal(canExportRecords('user'), false);
  assert.equal(canExportRecords('admin'), true);

  assert.equal(getDefaultRouteForRole('user'), 'user-home');
  assert.equal(getDefaultRouteForRole('admin'), 'admin-dashboard');
});

test('formatExcelDate and formatExcelTime12h format DD/MM/YYYY and 12-hour AM/PM cleanly', () => {
  assert.equal(formatExcelDate('2026-11-05T00:05:00.000Z', 0), '05/11/2026');
  assert.equal(formatExcelTime12h('2026-11-05T00:05:00.000Z', 0), '12:05 AM');
  assert.equal(formatExcelTime12h('2026-11-05T12:30:00.000Z', 0), '12:30 PM');
  assert.equal(formatExcelTime12h('2026-11-05T15:45:00.000Z', 0), '03:45 PM');
  assert.equal(formatExcelDate('2026-11-19T20:00:00.000Z', -330), '20/11/2026');
  assert.equal(formatExcelTime12h('2026-11-19T20:00:00.000Z', -330), '01:30 AM');
});

test('45-day retention keeps records through Day 45 and expires them automatically on Day 46', () => {
  const uploadedAt = '2026-10-01T08:00:00.000Z';
  const uploadedMs = Date.parse(uploadedAt);
  const expiresAt = computeExpiresAtIso(uploadedAt);

  assert.equal(RETENTION_DAYS, 45);
  assert.equal(Date.parse(expiresAt), uploadedMs + 45 * MS_PER_DAY);

  // Day 1 (just uploaded): kept, 45 days remaining
  assert.equal(isRecordExpiredOnDay46(uploadedAt, expiresAt, uploadedMs + 1000), false);
  assert.equal(getRetentionDaysRemaining(uploadedAt, expiresAt, uploadedMs + 1000), 45);

  // End of Day 45 (44 days, 23h, 59m elapsed): still kept, 1 day remaining
  const endOfDay45 = uploadedMs + 45 * MS_PER_DAY - 60_000;
  assert.equal(isRecordExpiredOnDay46(uploadedAt, expiresAt, endOfDay45), false);
  assert.equal(getRetentionDaysRemaining(uploadedAt, expiresAt, endOfDay45), 1);

  // Start of Day 46 (45 full days completed): expired -> deleted automatically
  const startOfDay46 = uploadedMs + 45 * MS_PER_DAY;
  assert.equal(isRecordExpiredOnDay46(uploadedAt, expiresAt, startOfDay46), true);
  assert.equal(getRetentionDaysRemaining(uploadedAt, expiresAt, startOfDay46), 0);

  // Active filter excludes expired Day-46 records while keeping fresh ones
  const activeOnly = filterActiveReadings(
    [
      { ...SAMPLE_READINGS[0], createdAt: uploadedAt, expiresAt },
      {
        ...SAMPLE_READINGS[1],
        createdAt: '2026-11-10T08:00:00.000Z',
        expiresAt: computeExpiresAtIso('2026-11-10T08:00:00.000Z'),
      },
    ],
    startOfDay46
  );
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0].id, 'rd_2');
});

test('single-motor-per-plant interlock prevents concurrent motors and auto-stops previous running motor', () => {
  // 1. No motor running yet -> Motor 1 starts cleanly without auto-stopping anything
  const startFirst = evaluateMotorInterlock(null, 'Motor 1', 'Running');
  assert.equal(startFirst.currentlyRunningMotor, null);
  assert.equal(startFirst.isDifferentMotorRunning, false);
  assert.equal(startFirst.willAutoStopPreviousMotor, false);
  assert.equal(startFirst.motorToAutoStop, null);
  assert.equal(startFirst.nextActiveMotorName, 'Motor 1');

  // 2. Motor 1 is running -> trying to start Motor 2 (or Motor 3) flags interlock & auto-stops Motor 1
  const plantAState: PlantMotorState = {
    plantId: 'plant-1',
    plantName: 'Plant A',
    activeMotorName: 'Motor 1',
    activeReadingId: 'rd_1',
    previousStoppedMotor: '',
    updatedBy: 'uid_marcus',
    updatedByName: 'Marcus Chen',
    updatedAt: '2026-11-20T08:00:00.000Z',
  };

  const startMotor2 = evaluateMotorInterlock(plantAState, 'Motor 2', 'Running');
  assert.equal(startMotor2.currentlyRunningMotor, 'Motor 1');
  assert.equal(startMotor2.isDifferentMotorRunning, true);
  assert.equal(startMotor2.willAutoStopPreviousMotor, true);
  assert.equal(startMotor2.motorToAutoStop, 'Motor 1');
  assert.equal(startMotor2.nextActiveMotorName, 'Motor 2');

  const startMotor3 = evaluateMotorInterlock(plantAState, 'Motor 3', 'Running');
  assert.equal(startMotor3.willAutoStopPreviousMotor, true);
  assert.equal(startMotor3.motorToAutoStop, 'Motor 1');
  assert.equal(startMotor3.nextActiveMotorName, 'Motor 3');

  // 3. Logging a Stopped reading for idle Motor 2 leaves Motor 1 running
  const logStoppedMotor2 = evaluateMotorInterlock(plantAState, 'Motor 2', 'Stopped');
  assert.equal(logStoppedMotor2.isDifferentMotorRunning, true);
  assert.equal(logStoppedMotor2.willAutoStopPreviousMotor, false);
  assert.equal(logStoppedMotor2.nextActiveMotorName, 'Motor 1');

  // 4. Logging a Stopped reading for currently running Motor 1 clears the plant's active motor
  const stopMotor1 = evaluateMotorInterlock(plantAState, 'Motor 1', 'Stopped');
  assert.equal(stopMotor1.isSameMotorAlreadyRunning, true);
  assert.equal(stopMotor1.willAutoStopPreviousMotor, false);
  assert.equal(stopMotor1.nextActiveMotorName, '');

  // 5. Plant isolation: Plant B has no active motor while Plant A has Motor 1 running
  const states: PlantMotorState[] = [plantAState];
  assert.equal(getPlantMotorState(states, 'Plant A')?.activeMotorName, 'Motor 1');
  assert.equal(getPlantMotorState(states, 'Plant B'), undefined);
  const startPlantBMotor2 = evaluateMotorInterlock(
    getPlantMotorState(states, 'Plant B'),
    'Motor 2',
    'Running'
  );
  assert.equal(startPlantBMotor2.willAutoStopPreviousMotor, false);
  assert.equal(startPlantBMotor2.nextActiveMotorName, 'Motor 2');
});

test('reconciling readings with live plant motor states flips stopped and superseded motors to Stopped', () => {
  const readings: MeterReading[] = [
    {
      ...SAMPLE_READINGS[0],
      id: 'rd_a_m2_new',
      plant: 'Plant A',
      motorName: 'Motor 2',
      motorStatus: 'Running',
    },
    {
      ...SAMPLE_READINGS[0],
      id: 'rd_a_m1_old',
      plant: 'Plant A',
      motorName: 'Motor 1',
      motorStatus: 'Running',
    },
    {
      ...SAMPLE_READINGS[0],
      id: 'rd_a_m2_old',
      plant: 'Plant A',
      motorName: 'Motor 2',
      motorStatus: 'Running',
    },
    {
      ...SAMPLE_READINGS[1],
      id: 'rd_b_m2_stale',
      plant: 'Plant B',
      motorName: 'Motor 2',
      motorStatus: 'Running',
    },
    {
      ...SAMPLE_READINGS[2],
      id: 'rd_c_m3_untracked',
      plant: 'Plant C',
      motorName: 'Motor 3',
      motorStatus: 'Running',
    },
  ];

  const states: PlantMotorState[] = [
    {
      plantId: 'plant-1',
      plantName: 'Plant A',
      activeMotorName: 'Motor 2',
      activeReadingId: 'rd_a_m2_new',
      previousStoppedMotor: 'Motor 1',
      updatedBy: 'uid_tarak',
      updatedByName: 'Tarak',
      updatedAt: '2026-11-21T19:44:00.000Z',
    },
    {
      plantId: 'plant-2',
      plantName: 'Plant B',
      activeMotorName: '',
      activeReadingId: '',
      previousStoppedMotor: 'Motor 2',
      updatedBy: 'uid_admin',
      updatedByName: 'Plant Administrator',
      updatedAt: '2026-11-21T19:30:00.000Z',
    },
  ];

  const staleIds = findStaleRunningReadingIds(readings, states);
  assert.deepEqual(staleIds, ['rd_a_m1_old', 'rd_a_m2_old', 'rd_b_m2_stale']);

  const reconciled = applyPlantMotorStatesToReadings(readings, states);
  assert.equal(reconciled.find((r) => r.id === 'rd_a_m2_new')?.motorStatus, 'Running');
  assert.equal(reconciled.find((r) => r.id === 'rd_a_m1_old')?.motorStatus, 'Stopped');
  assert.equal(reconciled.find((r) => r.id === 'rd_a_m2_old')?.motorStatus, 'Stopped');
  assert.equal(reconciled.find((r) => r.id === 'rd_b_m2_stale')?.motorStatus, 'Stopped');
  assert.equal(reconciled.find((r) => r.id === 'rd_c_m3_untracked')?.motorStatus, 'Running');

  // Signature is order-independent and changes whenever a motor stops
  const sig1 = buildPlantMotorStatesSignature(states);
  const sig2 = buildPlantMotorStatesSignature([...states].reverse());
  assert.equal(sig1, sig2);

  const stoppedStates: PlantMotorState[] = [
    { ...states[0], activeMotorName: '', activeReadingId: '', previousStoppedMotor: 'Motor 2' },
    states[1],
  ];
  assert.notEqual(buildPlantMotorStatesSignature(stoppedStates), sig1);
});

test('buildPlantUsageTrend produces a 30-day zero-filled per-plant series excluding readings older than 30 days', () => {
  const readings: MeterReading[] = [
    // Day 1 of window (2026-10-23) - included
    {
      ...SAMPLE_READINGS[0],
      id: 'rd_start',
      plant: 'Plant A',
      waterFlow: 100.25,
      recordedAt: '2026-10-23T12:00:00.000Z',
    },
    // Before window (2026-10-22, 31 days ago) - excluded
    {
      ...SAMPLE_READINGS[0],
      id: 'rd_too_old',
      plant: 'Plant A',
      waterFlow: 9999,
      recordedAt: '2026-10-22T12:00:00.000Z',
    },
    // Same day, two readings for Plant A + one for Plant B (2026-11-21)
    {
      ...SAMPLE_READINGS[0],
      id: 'rd_end_a1',
      plant: 'Plant A',
      waterFlow: 250.5,
      recordedAt: '2026-11-21T10:00:00.000Z',
    },
    {
      ...SAMPLE_READINGS[0],
      id: 'rd_end_a2',
      plant: 'Plant A',
      waterFlow: 149.5,
      recordedAt: '2026-11-21T14:00:00.000Z',
    },
    {
      ...SAMPLE_READINGS[1],
      id: 'rd_end_b1',
      plant: 'Plant B',
      waterFlow: 310.75,
      recordedAt: '2026-11-21T15:00:00.000Z',
    },
  ];

  const trend = buildPlantUsageTrend(readings, ['Plant A', 'Plant B', 'Plant C'], {
    days: 30,
    endDateKey: '2026-11-21',
  });

  assert.equal(trend.points.length, 30);
  assert.equal(trend.startDate, '2026-10-23');
  assert.equal(trend.endDate, '2026-11-21');
  assert.equal(trend.hasAnyData, true);
  assert.equal(trend.activeDays, 2);
  assert.equal(trend.totalFlow, 811);

  const plantA = trend.series.find((s) => s.plant === 'Plant A')!;
  const plantB = trend.series.find((s) => s.plant === 'Plant B')!;
  const plantC = trend.series.find((s) => s.plant === 'Plant C')!;

  assert.equal(plantA.totalFlow, 500.25);
  assert.equal(plantA.activeDays, 2);
  assert.equal(plantA.peakFlow, 400);
  assert.equal(plantB.totalFlow, 310.75);
  assert.equal(plantB.activeDays, 1);
  assert.equal(plantC.totalFlow, 0);

  // First day in window has 100.25 for Plant A, 0 for Plant B
  assert.equal(trend.points[0].date, '2026-10-23');
  assert.equal(trend.points[0][plantA.dataKey], 100.25);
  assert.equal(trend.points[0][plantB.dataKey], 0);

  // Middle day has zero-filled values
  assert.equal(trend.points[15][plantA.dataKey], 0);
  assert.equal(trend.points[15].totalFlow, 0);

  // Final day sums both Plant A readings (400) and keeps Plant B separate (310.75)
  const last = trend.points[29];
  assert.equal(last.date, '2026-11-21');
  assert.equal(last[plantA.dataKey], 400);
  assert.equal(last[plantB.dataKey], 310.75);
  assert.equal(last.totalFlow, 710.75);

  // Empty readings produce 30 zero-filled points with hasAnyData = false
  const emptyTrend = buildPlantUsageTrend([], ['Plant A'], {
    days: 30,
    endDateKey: '2026-11-21',
  });
  assert.equal(emptyTrend.points.length, 30);
  assert.equal(emptyTrend.hasAnyData, false);
  assert.equal(emptyTrend.totalFlow, 0);
});

test('isAndroidAppRuntime detects HydroLog Android app while returning false on web browsers', () => {
  assert.equal(
    isAndroidAppRuntime(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 HydroLogAndroid/1.0.5',
      false
    ),
    true
  );
  assert.equal(isAndroidAppRuntime('Mozilla/5.0', true), true);
  assert.equal(
    isAndroidAppRuntime(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
      false
    ),
    false
  );
  assert.equal(
    isAndroidAppRuntime(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      false
    ),
    false
  );
});





