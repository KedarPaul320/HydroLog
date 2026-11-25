import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx-js-style';
import type { MeterReading } from '../types';
import {
  EXCEL_REPORT_HEADERS,
  buildDashboardIntervalSummary,
  buildIntervalBarChartData,
  buildIntervalTableRows,
  buildPlantExcelSheetsData,
  buildWaterFlowWorkbook,
  classifyOperationalShift,
  formatExcelReportDate,
  formatExcelReportTime,
  sanitizeWorksheetName,
  serializeWorkbookToArrayBuffer,
  sliceIntervalTableToRecentDays,
} from './excelExport';

function makeReading(
  overrides: Partial<MeterReading> & {
    id: string;
    recordedAt: string;
    waterFlow: number;
  }
): MeterReading {
  return {
    photoId: `ph_${overrides.id}`,
    imageUrl: '',
    plant: 'DAMILIA',
    motorName: 'Motor 1',
    motorStatus: 'Running',
    review: 'Normal operation',
    submittedBy: 'uid_op1',
    submittedByName: 'Tarak Das',
    submittedByEmail: 'tarak@hydrolog.io',
    createdAt: overrides.recordedAt,
    updatedAt: overrides.recordedAt,
    expiresAt: '2027-01-06T00:00:00.000Z',
    ...overrides,
  };
}

test('formatExcelReportDate and formatExcelReportTime match DD-MM-YYYY and hh.mm AM/PM format', () => {
  assert.equal(formatExcelReportDate('2026-11-21T21:00:00.000Z', 0), '21-11-2026');
  assert.equal(formatExcelReportTime('2026-11-21T21:00:00.000Z', 0), '09.00 PM');
  assert.equal(formatExcelReportTime('2026-11-22T01:00:00.000Z', 0), '01.00 AM');
  assert.equal(formatExcelReportTime('2026-11-22T09:00:00.000Z', 0), '09.00 AM');
  assert.equal(formatExcelReportTime('2026-11-22T13:00:00.000Z', 0), '01.00 PM');
  // IST (-330 min offset): 15:30 UTC -> 21:00 IST (09.00 PM)
  assert.equal(formatExcelReportDate('2026-11-21T15:30:00.000Z', -330), '21-11-2026');
  assert.equal(formatExcelReportTime('2026-11-21T15:30:00.000Z', -330), '09.00 PM');
});

test('classifyOperationalShift aligns shifts approximately around 9:00 AM and 9:00 PM', () => {
  // Exact 9:00 PM closes the day's PM shift
  assert.deepEqual(classifyOperationalShift('2026-11-21T21:00:00.000Z', 0), {
    opDayKey: '2026-11-21',
    shift: 'PM',
    shiftKey: '2026-11-21|PM',
  });
  // Approximate 9:00 PM (e.g. 9:25 PM or 8:40 PM) still closes the same day's PM shift
  assert.equal(classifyOperationalShift('2026-11-21T21:25:00.000Z', 0).shiftKey, '2026-11-21|PM');
  assert.equal(classifyOperationalShift('2026-11-21T20:40:00.000Z', 0).shiftKey, '2026-11-21|PM');

  // Late night past cutoff (11:15 PM) rolls cleanly into next day's AM shift
  assert.deepEqual(classifyOperationalShift('2026-11-21T23:15:00.000Z', 0), {
    opDayKey: '2026-11-22',
    shift: 'AM',
    shiftKey: '2026-11-22|AM',
  });

  // 1:00 AM, 5:00 AM, and approx 9:00 AM (8:45 AM, 9:00 AM, 9:20 AM) stay in Morning AM shift
  assert.equal(classifyOperationalShift('2026-11-22T01:05:00.000Z', 0).shiftKey, '2026-11-22|AM');
  assert.equal(classifyOperationalShift('2026-11-22T05:10:00.000Z', 0).shiftKey, '2026-11-22|AM');
  assert.equal(classifyOperationalShift('2026-11-22T08:45:00.000Z', 0).shiftKey, '2026-11-22|AM');
  assert.equal(classifyOperationalShift('2026-11-22T09:20:00.000Z', 0).shiftKey, '2026-11-22|AM');

  // 1:00 PM, 5:00 PM, and approx 9:00 PM stay in Evening PM shift
  assert.equal(classifyOperationalShift('2026-11-22T13:05:00.000Z', 0).shiftKey, '2026-11-22|PM');
  assert.equal(classifyOperationalShift('2026-11-22T17:10:00.000Z', 0).shiftKey, '2026-11-22|PM');
  assert.equal(classifyOperationalShift('2026-11-22T21:18:00.000Z', 0).shiftKey, '2026-11-22|PM');
});

test('DAMILIA reference dataset produces exact 4H, 12H (3547 & 789), and 24H (4336) values with Uploaded By and no Record ID', () => {
  // Deliberately passed out-of-order (descending, as Firestore returns) to verify chronological sorting
  const damiliaReadings: MeterReading[] = [
    makeReading({ id: 'r7', recordedAt: '2026-11-22T21:00:00.000Z', waterFlow: 470769, submittedByName: 'Priya Nair' }),
    makeReading({ id: 'r6', recordedAt: '2026-11-22T17:00:00.000Z', waterFlow: 469980, submittedByName: 'Priya Nair', motorStatus: 'Stopped' }),
    makeReading({ id: 'r5', recordedAt: '2026-11-22T13:00:00.000Z', waterFlow: 469980, submittedByName: 'Priya Nair', motorStatus: 'Stopped' }),
    makeReading({ id: 'r4', recordedAt: '2026-11-22T09:00:00.000Z', waterFlow: 469980, submittedByName: 'Marcus Chen' }),
    makeReading({ id: 'r3', recordedAt: '2026-11-22T05:00:00.000Z', waterFlow: 468909, submittedByName: 'Marcus Chen' }),
    makeReading({ id: 'r2', recordedAt: '2026-11-22T01:00:00.000Z', waterFlow: 467733, submittedByName: 'Marcus Chen' }),
    makeReading({ id: 'r1', recordedAt: '2026-11-21T21:00:00.000Z', waterFlow: 466433, submittedByName: 'Tarak Das' }),
  ];

  const sheets = buildPlantExcelSheetsData(damiliaReadings, { tzOffsetMinutes: 0 });
  assert.equal(sheets.length, 1);
  const sheet = sheets[0];
  assert.equal(sheet.plantName, 'DAMILIA');
  assert.equal(sheet.sheetName, 'DAMILIA');

  // Sorted oldest -> newest with exact 4H deltas
  assert.deepEqual(
    sheet.rows.map((r) => r.delta4h),
    [null, 1300, 1176, 1071, 0, 0, 789]
  );

  // 12H blocks: baseline (row 0), morning shift (rows 1..3 = 3547), evening shift (rows 4..6 = 789)
  assert.equal(sheet.shift12hBlocks.length, 3);
  assert.equal(sheet.shift12hBlocks[0].hasDelta, false);
  assert.equal(sheet.shift12hBlocks[0].totalFlow, null);
  assert.deepEqual(
    {
      start: sheet.shift12hBlocks[1].startIndex,
      end: sheet.shift12hBlocks[1].endIndex,
      total: sheet.shift12hBlocks[1].totalFlow,
    },
    { start: 1, end: 3, total: 3547 }
  );
  assert.deepEqual(
    {
      start: sheet.shift12hBlocks[2].startIndex,
      end: sheet.shift12hBlocks[2].endIndex,
      total: sheet.shift12hBlocks[2].totalFlow,
    },
    { start: 4, end: 6, total: 789 }
  );

  // 24H blocks: baseline day (row 0 = null), operational day 2026-11-22 (rows 1..6 = 4336)
  assert.equal(sheet.day24hBlocks.length, 2);
  assert.equal(sheet.day24hBlocks[0].totalFlow, null);
  assert.deepEqual(
    {
      start: sheet.day24hBlocks[1].startIndex,
      end: sheet.day24hBlocks[1].endIndex,
      total: sheet.day24hBlocks[1].totalFlow,
    },
    { start: 1, end: 6, total: 4336 }
  );

  // Headers include Uploaded By + 4H/12H/24H and strictly omit Record ID
  assert.ok(EXCEL_REPORT_HEADERS.includes('UPLOADED BY'));
  assert.ok(EXCEL_REPORT_HEADERS.includes('WATER FLOW IN 4 HOUR (M³)'));
  assert.ok(EXCEL_REPORT_HEADERS.includes('WATER FLOW IN 12 HOUR (M³)'));
  assert.ok(EXCEL_REPORT_HEADERS.includes('WATER FLOW IN 24 HOUR (M³)'));
  assert.equal(
    EXCEL_REPORT_HEADERS.some((h) => /record\s*id/i.test(h)),
    false
  );

  // Full workbook round-trip binary verification
  const wb = buildWaterFlowWorkbook(damiliaReadings, { tzOffsetMinutes: 0 });
  const buf = serializeWorkbookToArrayBuffer(wb);
  assert.ok(buf.byteLength > 2000);

  const parsed = XLSX.read(buf, { type: 'array' });
  assert.deepEqual(parsed.SheetNames, ['All Plants', 'DAMILIA']);
  const allWs = parsed.Sheets['All Plants'];
  assert.equal(allWs['A1']?.v, 'ALL PLANTS');
  assert.equal(allWs['A2']?.v, 'PLANT');
  assert.equal(allWs['B2']?.v, 'DATE');
  assert.equal(allWs['E4']?.v, 1300);
  assert.equal(allWs['E4']?.f, 'MAX(0,D4-D3)');
  assert.equal(allWs['F4']?.v, 3547);
  assert.equal(allWs['F4']?.f, 'SUM(E4:E6)');
  assert.equal(allWs['G4']?.v, 4336);
  assert.equal(allWs['G4']?.f, 'SUM(E4:E9)');

  const ws = parsed.Sheets['DAMILIA'];

  // Row 1 title banner & Row 2 headers
  assert.equal(ws['A1']?.v, 'DAMILIA');
  assert.equal(ws['A2']?.v, 'DATE');
  assert.equal(ws['B2']?.v, 'TIME');
  assert.equal(ws['C2']?.v, 'WATER FLOW M³');
  assert.equal(ws['D2']?.v, 'WATER FLOW IN 4 HOUR (M³)');
  assert.equal(ws['E2']?.v, 'WATER FLOW IN 12 HOUR (M³)');
  assert.equal(ws['F2']?.v, 'WATER FLOW IN 24 HOUR (M³)');
  assert.equal(ws['G2']?.v, 'UPLOADED BY');

  // Verify data cells, formulas, and upload person values
  assert.equal(ws['A3']?.v, '21-11-2026');
  assert.equal(ws['B3']?.v, '09.00 PM');
  assert.equal(ws['C3']?.v, 466433);
  assert.equal(ws['G3']?.v, 'Tarak Das');

  assert.equal(ws['D4']?.v, 1300);
  assert.equal(ws['D4']?.f, 'MAX(0,C4-C3)');
  assert.equal(ws['E4']?.v, 3547);
  assert.equal(ws['E4']?.f, 'SUM(D4:D6)');
  assert.equal(ws['E7']?.v, 789);
  assert.equal(ws['E7']?.f, 'SUM(D7:D9)');
  assert.equal(ws['F4']?.v, 4336);
  assert.equal(ws['F4']?.f, 'SUM(D4:D9)');
  assert.equal(ws['G4']?.v, 'Marcus Chen');
  assert.equal(ws['G9']?.v, 'Priya Nair');

  // Verify merges exist for title banner, both 12H blocks, and 24H block
  const merges = ws['!merges'] ?? [];
  assert.ok(merges.some((m) => m.s.r === 0 && m.s.c === 0 && m.e.r === 0 && m.e.c === 9));
  assert.ok(merges.some((m) => m.s.r === 3 && m.s.c === 4 && m.e.r === 5 && m.e.c === 4));
  assert.ok(merges.some((m) => m.s.r === 6 && m.s.c === 4 && m.e.r === 8 && m.e.c === 4));
  assert.ok(merges.some((m) => m.s.r === 3 && m.s.c === 5 && m.e.r === 8 && m.e.c === 5));
});

test('approximate 9:00 AM / 9:00 PM timestamps and date-filtered baseline produce exact 12H and 24H totals', () => {
  const approxReadings: MeterReading[] = [
    makeReading({ id: 'a1', recordedAt: '2026-11-22T01:12:00.000Z', waterFlow: 467733 }),
    makeReading({ id: 'a2', recordedAt: '2026-11-22T04:50:00.000Z', waterFlow: 468909 }),
    makeReading({ id: 'a3', recordedAt: '2026-11-22T09:18:00.000Z', waterFlow: 469980 }),
    makeReading({ id: 'a4', recordedAt: '2026-11-22T13:05:00.000Z', waterFlow: 469980 }),
    makeReading({ id: 'a5', recordedAt: '2026-11-22T17:10:00.000Z', waterFlow: 469980 }),
    makeReading({ id: 'a6', recordedAt: '2026-11-22T21:22:00.000Z', waterFlow: 470769 }),
  ];

  const wb = buildWaterFlowWorkbook(approxReadings, {
    tzOffsetMinutes: 0,
    baselineFlowByPlant: { damilia: 466433 },
  });
  const ws = wb.Sheets['DAMILIA'];

  // First row uses baseline flow (466433) so 4H = 1300, 12H = 3547, 24H = 4336
  assert.equal(ws['D3']?.v, 1300);
  assert.equal(ws['D3']?.f, 'MAX(0,C3-466433)');
  assert.equal(ws['E3']?.v, 3547);
  assert.equal(ws['E6']?.v, 789);
  assert.equal(ws['F3']?.v, 4336);
});

test('multi-plant export creates separate sanitized tabs per plant and handles empty readings & meter resets safely', () => {
  const used = new Set<string>();
  assert.equal(sanitizeWorksheetName('Plant: A / North * [1]?', used), 'Plant A North 1');
  assert.equal(sanitizeWorksheetName('Plant: A / North * [1]?', used), 'Plant A North 1 (2)');
  assert.ok(sanitizeWorksheetName('A very long plant name exceeding thirty one characters', used).length <= 31);

  const mixed: MeterReading[] = [
    makeReading({ id: 'p1_1', plant: 'Plant A', recordedAt: '2026-11-22T01:00:00.000Z', waterFlow: 500 }),
    makeReading({ id: 'p1_2', plant: 'Plant A', recordedAt: '2026-11-22T05:00:00.000Z', waterFlow: 100 }), // meter reset -> clamped to 0
    makeReading({ id: 'p2_1', plant: 'Plant B', recordedAt: '2026-11-22T01:00:00.000Z', waterFlow: 1000 }),
    makeReading({ id: 'p2_2', plant: 'Plant B', recordedAt: '2026-11-22T05:00:00.000Z', waterFlow: 1250.5 }),
  ];

  const wb = buildWaterFlowWorkbook(mixed, { tzOffsetMinutes: 0 });
  assert.deepEqual(wb.SheetNames, ['All Plants', 'Plant A', 'Plant B']);
  assert.equal(wb.Sheets['Plant A']['D4']?.v, 0);
  assert.equal(wb.Sheets['Plant B']['D4']?.v, 250.5);
  assert.equal(wb.Sheets['Plant B']['E3']?.v, 250.5);
  assert.equal(wb.Sheets['Plant B']['F3']?.v, 250.5);

  // Verify All Plants sheet does NOT subtract Plant A's flow from Plant B's first row (row 5)
  const allSheet = wb.Sheets['All Plants'];
  assert.equal(allSheet['A3']?.v, 'Plant A');
  assert.equal(allSheet['A5']?.v, 'Plant B');
  assert.equal(allSheet['E5']?.v, '');
  assert.equal(allSheet['E6']?.v, 250.5);
  assert.equal(allSheet['E6']?.f, 'MAX(0,D6-D5)');

  // Empty export still creates All Plants + fallback plant sheet cleanly
  const emptyWb = buildWaterFlowWorkbook([], { emptyFallbackPlant: 'DAMILIA' });
  assert.deepEqual(emptyWb.SheetNames, ['All Plants', 'DAMILIA']);
  assert.equal(emptyWb.Sheets['All Plants']['A1']?.v, 'ALL PLANTS');
  assert.equal(emptyWb.Sheets['DAMILIA']['A1']?.v, 'DAMILIA');
});

test('dashboard 4H/12H/24H helpers produce exact rowSpan blocks, KPI summaries, and clean multi-day slices', () => {
  const damiliaReadings: MeterReading[] = [
    makeReading({ id: 'r1', recordedAt: '2026-11-21T21:00:00.000Z', waterFlow: 466433 }),
    makeReading({ id: 'r2', recordedAt: '2026-11-22T01:00:00.000Z', waterFlow: 467733 }),
    makeReading({ id: 'r3', recordedAt: '2026-11-22T05:00:00.000Z', waterFlow: 468909 }),
    makeReading({ id: 'r4', recordedAt: '2026-11-22T09:00:00.000Z', waterFlow: 469980 }),
    makeReading({ id: 'r5', recordedAt: '2026-11-22T13:00:00.000Z', waterFlow: 469980 }),
    makeReading({ id: 'r6', recordedAt: '2026-11-22T17:00:00.000Z', waterFlow: 469980 }),
    makeReading({ id: 'r7', recordedAt: '2026-11-22T21:00:00.000Z', waterFlow: 470769 }),
  ];

  const sheets = buildPlantExcelSheetsData(damiliaReadings, { tzOffsetMinutes: 0 });
  const tableRows = buildIntervalTableRows(sheets[0]);

  assert.equal(tableRows.length, 7);
  // Row 0: baseline row
  assert.equal(tableRows[0].shift12hSpan?.rowSpan, 1);
  assert.equal(tableRows[0].shift12hSpan?.hasDelta, false);
  assert.equal(tableRows[0].day24hSpan?.rowSpan, 1);
  // Row 1: starts morning 12H block (3 rows = 3547) and 24H block (6 rows = 4336)
  assert.equal(tableRows[1].shift12hSpan?.rowSpan, 3);
  assert.equal(tableRows[1].shift12hSpan?.totalFlow, 3547);
  assert.equal(tableRows[1].day24hSpan?.rowSpan, 6);
  assert.equal(tableRows[1].day24hSpan?.totalFlow, 4336);
  // Row 2: continuation row (no new span, but retains totals for mobile cards)
  assert.equal(tableRows[2].shift12hSpan, null);
  assert.equal(tableRows[2].day24hSpan, null);
  assert.equal(tableRows[2].shift12hTotal, 3547);
  assert.equal(tableRows[2].day24hTotal, 4336);
  // Row 4: starts evening 12H block (3 rows = 789)
  assert.equal(tableRows[4].shift12hSpan?.rowSpan, 3);
  assert.equal(tableRows[4].shift12hSpan?.totalFlow, 789);

  // Dashboard KPI summary reflects latest 4H (789), 12H (789), and 24H (4336)
  const kpi = buildDashboardIntervalSummary(sheets);
  assert.equal(kpi.latest4h, 789);
  assert.equal(kpi.latest12h, 789);
  assert.equal(kpi.latest24h, 4336);
  assert.equal(kpi.plantCount, 1);

  // Slicing to latest 1 operational day preserves full 6-row 24H block without splitting merges
  const sliced = sliceIntervalTableToRecentDays(sheets[0], 1);
  assert.equal(sliced.rows.length, 6);
  assert.equal(sliced.hiddenRows, 1);
  assert.equal(sliced.rows[0].day24hSpan?.rowSpan, 6);
  assert.equal(sliced.rows[0].shift12hSpan?.rowSpan, 3);
});

test('buildIntervalBarChartData builds accurate 4H, 12H, and 24H bar series, slices tail cleanly, and handles baseline-only sheets', () => {
  const damiliaReadings: MeterReading[] = [
    makeReading({ id: 'r1', recordedAt: '2026-11-21T21:00:00.000Z', waterFlow: 466433, submittedByName: 'Tarak Das' }),
    makeReading({ id: 'r2', recordedAt: '2026-11-22T01:00:00.000Z', waterFlow: 467733, submittedByName: 'Marcus Chen' }),
    makeReading({ id: 'r3', recordedAt: '2026-11-22T05:00:00.000Z', waterFlow: 468909, submittedByName: 'Marcus Chen' }),
    makeReading({ id: 'r4', recordedAt: '2026-11-22T09:00:00.000Z', waterFlow: 469980, submittedByName: 'Marcus Chen' }),
    makeReading({ id: 'r5', recordedAt: '2026-11-22T13:00:00.000Z', waterFlow: 469980, submittedByName: 'Priya Nair' }),
    makeReading({ id: 'r6', recordedAt: '2026-11-22T17:00:00.000Z', waterFlow: 469980, submittedByName: 'Priya Nair' }),
    makeReading({ id: 'r7', recordedAt: '2026-11-22T21:00:00.000Z', waterFlow: 470769, submittedByName: 'Priya Nair' }),
  ];

  const [sheet] = buildPlantExcelSheetsData(damiliaReadings, { tzOffsetMinutes: 0 });
  const chart = buildIntervalBarChartData(sheet);

  assert.equal(chart.hasChartData, true);
  assert.equal(chart.total4hCount, 6);
  assert.equal(chart.total12hCount, 2);
  assert.equal(chart.total24hCount, 1);

  assert.deepEqual(
    chart.bars4h.map((b) => b.flow),
    [1300, 1176, 1071, 0, 0, 789]
  );
  assert.equal(chart.bars4h[0].uploadedBy, 'Marcus Chen');
  assert.equal(chart.bars4h[5].uploadedBy, 'Priya Nair');
  assert.equal(chart.bars4h[5].meterReading, 470769);

  assert.deepEqual(
    chart.bars12h.map((b) => ({ flow: b.flow, shiftLabel: b.shiftLabel, count: b.readingCount })),
    [
      { flow: 3547, shiftLabel: '9 PM – 9 AM', count: 3 },
      { flow: 789, shiftLabel: '9 AM – 9 PM', count: 3 },
    ]
  );

  assert.deepEqual(
    chart.bars24h.map((b) => ({ flow: b.flow, dateText: b.dateText, count: b.readingCount })),
    [{ flow: 4336, dateText: '22-11-2026', count: 6 }]
  );

  // Tail slicing preserves most recent bars chronologically
  const tailChart = buildIntervalBarChartData(sheet, { max4hBars: 2 });
  assert.deepEqual(
    tailChart.bars4h.map((b) => b.flow),
    [0, 789]
  );
  assert.equal(tailChart.total4hCount, 6);

  // Single baseline reading has no delta bars yet, but exposes baselineReading metadata
  const [baselineOnlySheet] = buildPlantExcelSheetsData([damiliaReadings[0]], { tzOffsetMinutes: 0 });
  const emptyChart = buildIntervalBarChartData(baselineOnlySheet);
  assert.equal(emptyChart.hasChartData, false);
  assert.equal(emptyChart.bars4h.length, 0);
  assert.equal(emptyChart.baselineReading?.waterFlow, 466433);
});

