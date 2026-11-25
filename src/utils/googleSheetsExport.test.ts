import test from 'node:test';
import assert from 'node:assert/strict';
import type { MeterReading } from '../types';
import {
  GoogleSheetsAuthError,
  buildGoogleSheetsSpreadsheetPayload,
  buildGoogleSheetsUrlForAccount,
  createGoogleSheetViaApi,
} from './googleSheetsExport';

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

test('buildGoogleSheetsUrlForAccount attaches authuser and target sheet #gid', () => {
  assert.equal(
    buildGoogleSheetsUrlForAccount(
      'https://docs.google.com/spreadsheets/d/abc123/edit',
      'admin@example.com',
      2
    ),
    'https://docs.google.com/spreadsheets/d/abc123/edit?authuser=admin%40example.com#gid=2'
  );
  assert.equal(
    buildGoogleSheetsUrlForAccount(
      'https://docs.google.com/spreadsheets/d/abc123/edit',
      'admin@example.com'
    ),
    'https://docs.google.com/spreadsheets/d/abc123/edit?authuser=admin%40example.com'
  );
  assert.equal(
    buildGoogleSheetsUrlForAccount('https://docs.google.com/spreadsheets/d/abc123/edit', null, 3),
    'https://docs.google.com/spreadsheets/d/abc123/edit#gid=3'
  );
});

test('buildGoogleSheetsSpreadsheetPayload puts All Plants as 1st sheet followed by individual plant tabs with 4H/12H/24H formulas and targetSheetId', () => {
  const readings: MeterReading[] = [
    makeReading({ id: 'r1', recordedAt: '2026-11-21T21:00:00.000Z', waterFlow: 466433, submittedByName: 'Tarak Das' }),
    makeReading({ id: 'r2', recordedAt: '2026-11-22T01:00:00.000Z', waterFlow: 467733, submittedByName: 'Marcus Chen' }),
    makeReading({ id: 'r3', recordedAt: '2026-11-22T05:00:00.000Z', waterFlow: 468909, submittedByName: 'Marcus Chen' }),
    makeReading({ id: 'r4', recordedAt: '2026-11-22T09:00:00.000Z', waterFlow: 469980, submittedByName: 'Marcus Chen' }),
    makeReading({ id: 'r5', recordedAt: '2026-11-22T13:00:00.000Z', waterFlow: 469980, submittedByName: 'Priya Nair', motorStatus: 'Stopped' }),
    makeReading({ id: 'r6', recordedAt: '2026-11-22T17:00:00.000Z', waterFlow: 469980, submittedByName: 'Priya Nair', motorStatus: 'Stopped' }),
    makeReading({ id: 'r7', recordedAt: '2026-11-22T21:00:00.000Z', waterFlow: 470769, submittedByName: 'Priya Nair' }),
  ];

  const { payload, plantLabel, sheetCount, targetSheetId, targetSheetTitle } =
    buildGoogleSheetsSpreadsheetPayload(readings, {
      tzOffsetMinutes: 0,
      selectedPlant: 'DAMILIA',
      dateStamp: '2026-11-24',
      plantNames: ['DAMILIA', 'Plant B'],
    });

  assert.equal(plantLabel, 'DAMILIA');
  assert.equal(sheetCount, 3);
  assert.equal(targetSheetId, 2);
  assert.equal(targetSheetTitle, 'DAMILIA');
  assert.equal(payload.properties.title, 'HydroLog Water Flow — DAMILIA (2026-11-24)');
  assert.deepEqual(
    payload.sheets.map((s) => ({ id: s.properties.sheetId, title: s.properties.title })),
    [
      { id: 1, title: 'All Plants' },
      { id: 2, title: 'DAMILIA' },
      { id: 3, title: 'Plant B' },
    ]
  );

  // Sheet 1: All Plants
  const allSheet = payload.sheets[0];
  assert.equal(allSheet.properties.gridProperties.columnCount, 11);
  assert.deepEqual(allSheet.data[0].rowData[0].values[0].userEnteredValue, {
    stringValue: 'ALL PLANTS',
  });
  const allHeaderTexts = allSheet.data[0].rowData[1].values.map((c) =>
    'stringValue' in c.userEnteredValue ? c.userEnteredValue.stringValue : ''
  );
  assert.equal(allHeaderTexts[0], 'PLANT');
  assert.equal(allHeaderTexts[4], 'WATER FLOW IN 4 HOUR (M³)');
  assert.equal(allHeaderTexts.some((h) => /record\s*id/i.test(h)), false);
  // Row 3 (Excel row 4) on All Plants references Col D for 4H and Col E for 12H/24H
  assert.deepEqual(allSheet.data[0].rowData[3].values[0].userEnteredValue, { stringValue: 'DAMILIA' });
  assert.deepEqual(allSheet.data[0].rowData[3].values[4].userEnteredValue, {
    formulaValue: '=MAX(0,D4-D3)',
  });
  assert.deepEqual(allSheet.data[0].rowData[3].values[5].userEnteredValue, {
    formulaValue: '=SUM(E4:E6)',
  });
  assert.deepEqual(allSheet.data[0].rowData[3].values[6].userEnteredValue, {
    formulaValue: '=SUM(E4:E9)',
  });

  // Sheet 2: DAMILIA individual tab
  const sheet = payload.sheets[1];
  assert.equal(sheet.properties.title, 'DAMILIA');
  assert.equal(sheet.properties.gridProperties.frozenRowCount, 2);
  assert.equal(sheet.properties.gridProperties.columnCount, 10);

  const rows = sheet.data[0].rowData;
  assert.deepEqual(rows[0].values[0].userEnteredValue, { stringValue: 'DAMILIA' });

  const headerTexts = rows[1].values.map((c) =>
    'stringValue' in c.userEnteredValue ? c.userEnteredValue.stringValue : ''
  );
  assert.deepEqual(headerTexts, [
    'DATE',
    'TIME',
    'WATER FLOW M³',
    'WATER FLOW IN 4 HOUR (M³)',
    'WATER FLOW IN 12 HOUR (M³)',
    'WATER FLOW IN 24 HOUR (M³)',
    'UPLOADED BY',
    'MOTOR NO.',
    'MOTOR STATUS',
    'REMARKS',
  ]);
  assert.equal(headerTexts.some((h) => /record\s*id/i.test(h)), false);

  assert.deepEqual(rows[2].values[0].userEnteredValue, { stringValue: '21-11-2026' });
  assert.deepEqual(rows[2].values[1].userEnteredValue, { stringValue: '09.00 PM' });
  assert.deepEqual(rows[2].values[2].userEnteredValue, { numberValue: 466433 });
  assert.deepEqual(rows[2].values[6].userEnteredValue, { stringValue: 'Tarak Das' });

  assert.deepEqual(rows[3].values[3].userEnteredValue, { formulaValue: '=MAX(0,C4-C3)' });
  assert.deepEqual(rows[3].values[4].userEnteredValue, { formulaValue: '=SUM(D4:D6)' });
  assert.deepEqual(rows[3].values[5].userEnteredValue, { formulaValue: '=SUM(D4:D9)' });
  assert.deepEqual(rows[3].values[6].userEnteredValue, { stringValue: 'Marcus Chen' });

  assert.deepEqual(rows[6].values[4].userEnteredValue, { formulaValue: '=SUM(D7:D9)' });
  assert.deepEqual(rows[6].values[6].userEnteredValue, { stringValue: 'Priya Nair' });

  assert.ok(
    sheet.merges.some(
      (m) =>
        m.startRowIndex === 0 &&
        m.endRowIndex === 1 &&
        m.startColumnIndex === 0 &&
        m.endColumnIndex === 10
    )
  );
  assert.ok(
    sheet.merges.some(
      (m) =>
        m.startRowIndex === 3 &&
        m.endRowIndex === 6 &&
        m.startColumnIndex === 4 &&
        m.endColumnIndex === 5
    )
  );
  assert.ok(
    sheet.merges.some(
      (m) =>
        m.startRowIndex === 6 &&
        m.endRowIndex === 9 &&
        m.startColumnIndex === 4 &&
        m.endColumnIndex === 5
    )
  );
  assert.ok(
    sheet.merges.some(
      (m) =>
        m.startRowIndex === 3 &&
        m.endRowIndex === 9 &&
        m.startColumnIndex === 5 &&
        m.endColumnIndex === 6
    )
  );
});

test('selecting All Plants vs individual plant routes #gid accurately and createGoogleSheetViaApi handles success and 401', async () => {
  const multiPlant: MeterReading[] = [
    makeReading({ id: 'a1', plant: 'Plant A', recordedAt: '2026-11-22T01:00:00.000Z', waterFlow: 100 }),
    makeReading({ id: 'b1', plant: 'Plant B', recordedAt: '2026-11-22T01:00:00.000Z', waterFlow: 200 }),
    makeReading({ id: 'b2', plant: 'Plant B', recordedAt: '2026-11-22T05:00:00.000Z', waterFlow: 350 }),
  ];

  // Selecting All Plants targets Sheet 1 (gid=1)
  const allResult = buildGoogleSheetsSpreadsheetPayload(multiPlant, {
    tzOffsetMinutes: 0,
    selectedPlant: 'all',
    dateStamp: '2026-11-24',
  });
  assert.equal(allResult.plantLabel, 'All Plants');
  assert.equal(allResult.sheetCount, 3);
  assert.equal(allResult.targetSheetId, 1);
  assert.equal(allResult.targetSheetTitle, 'All Plants');
  assert.deepEqual(
    allResult.payload.sheets.map((s) => s.properties.title),
    ['All Plants', 'Plant A', 'Plant B']
  );

  // Selecting Plant B keeps all 3 sheets (All Plants + Plant A + Plant B) and targets Plant B (gid=3)
  const plantBResult = buildGoogleSheetsSpreadsheetPayload(multiPlant, {
    tzOffsetMinutes: 0,
    selectedPlant: 'Plant B',
    dateStamp: '2026-11-24',
  });
  assert.equal(plantBResult.sheetCount, 3);
  assert.equal(plantBResult.targetSheetId, 3);
  assert.equal(plantBResult.targetSheetTitle, 'Plant B');

  // Verify All Plants tab has NO cross-plant delta on Plant B's first row (row index 3 -> Excel row 4)
  const allRows = plantBResult.payload.sheets[0].data[0].rowData;
  assert.deepEqual(allRows[3].values[0].userEnteredValue, { stringValue: 'Plant B' });
  assert.deepEqual(allRows[3].values[4].userEnteredValue, { stringValue: '' });
  assert.deepEqual(allRows[4].values[4].userEnteredValue, { formulaValue: '=MAX(0,D5-D4)' });

  // Success mock returning authoritative sheet IDs from Google Sheets API
  const mockOkFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), 'https://sheets.googleapis.com/v4/spreadsheets');
    assert.equal(init?.method, 'POST');
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer test-token-123');
    return new Response(
      JSON.stringify({
        spreadsheetId: 'sheet_xyz',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_xyz/edit',
        properties: { title: plantBResult.payload.properties.title },
        sheets: [
          { properties: { sheetId: 1, title: 'All Plants' } },
          { properties: { sheetId: 2, title: 'Plant A' } },
          { properties: { sheetId: 3, title: 'Plant B' } },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const res = await createGoogleSheetViaApi(
    'test-token-123',
    plantBResult.payload,
    {
      recordCount: 3,
      plantLabel: plantBResult.plantLabel,
      accountEmail: 'admin@example.com',
      targetSheetId: plantBResult.targetSheetId,
      targetSheetTitle: plantBResult.targetSheetTitle,
    },
    mockOkFetch
  );
  assert.equal(res.spreadsheetId, 'sheet_xyz');
  assert.equal(
    res.spreadsheetUrl,
    'https://docs.google.com/spreadsheets/d/sheet_xyz/edit?authuser=admin%40example.com#gid=3'
  );
  assert.equal(res.sheetCount, 3);
  assert.equal(res.targetSheetTitle, 'Plant B');
  assert.equal(res.accountEmail, 'admin@example.com');

  // 401 auth error mock
  const mock401Fetch = (async () =>
    new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  await assert.rejects(
    () =>
      createGoogleSheetViaApi(
        'expired-token',
        plantBResult.payload,
        {
          recordCount: 3,
          plantLabel: plantBResult.plantLabel,
          accountEmail: 'admin@example.com',
          targetSheetId: plantBResult.targetSheetId,
          targetSheetTitle: plantBResult.targetSheetTitle,
        },
        mock401Fetch
      ),
    (err: unknown) => err instanceof GoogleSheetsAuthError && err.status === 401
  );
});
