import type { MeterReading } from '../types.ts';
import {
  ALL_PLANTS_REPORT_HEADERS,
  EXCEL_REPORT_HEADERS,
  buildPlantExcelSheetsData,
  sanitizeWorksheetName,
  type BuildWorkbookOptions,
  type PlantExcelSheetData,
} from './excelExport.ts';

export interface SheetsRgbColor {
  red: number;
  green: number;
  blue: number;
}

export interface SheetsBorder {
  style: 'SOLID';
  width: number;
  color: SheetsRgbColor;
}

export interface SheetsCellFormat {
  backgroundColor?: SheetsRgbColor;
  horizontalAlignment?: 'LEFT' | 'CENTER' | 'RIGHT';
  verticalAlignment?: 'TOP' | 'MIDDLE' | 'BOTTOM';
  wrapStrategy?: 'OVERFLOW_CELL' | 'CLIP' | 'WRAP';
  textFormat?: {
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    foregroundColor?: SheetsRgbColor;
  };
  borders?: {
    top: SheetsBorder;
    bottom: SheetsBorder;
    left: SheetsBorder;
    right: SheetsBorder;
  };
}

export interface SheetsCellData {
  userEnteredValue:
    | { stringValue: string }
    | { numberValue: number }
    | { formulaValue: string };
  userEnteredFormat: SheetsCellFormat;
}

export interface SheetsGridRange {
  sheetId: number;
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
}

export interface SheetsSheetPayload {
  properties: {
    sheetId: number;
    title: string;
    gridProperties: {
      rowCount: number;
      columnCount: number;
      frozenRowCount: number;
    };
  };
  data: Array<{
    startRow: number;
    startColumn: number;
    rowData: Array<{ values: SheetsCellData[] }>;
    rowMetadata: Array<{ pixelSize: number }>;
    columnMetadata: Array<{ pixelSize: number }>;
  }>;
  merges: SheetsGridRange[];
}

export interface GoogleSheetsCreatePayload {
  properties: {
    title: string;
  };
  sheets: SheetsSheetPayload[];
}

export interface GoogleSheetsExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheetCount: number;
  recordCount: number;
  plantLabel: string;
  targetSheetTitle: string;
  accountEmail: string | null;
}

export interface BuildGoogleSheetsOptions extends BuildWorkbookOptions {
  /** Selected plant tab to open ('all' opens 1st sheet "All Plants"; a plant name opens that plant's tab). */
  selectedPlant?: string;
  /** Optional YYYY-MM-DD date stamp override for deterministic tests. */
  dateStamp?: string;
}

export class GoogleSheetsAuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'GoogleSheetsAuthError';
    this.status = status;
  }
}

function hexToSheetsColor(hex: string): SheetsRgbColor {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return {
    red: Math.round(r * 10000) / 10000,
    green: Math.round(g * 10000) / 10000,
    blue: Math.round(b * 10000) / 10000,
  };
}

const COLOR_BLACK = hexToSheetsColor('000000');
const COLOR_DARK_TEXT = hexToSheetsColor('1F2937');
const COLOR_GOLD = hexToSheetsColor('FFD966');
const COLOR_GREEN_12H = hexToSheetsColor('C6E0B4');
const COLOR_GREEN_12H_BASELINE = hexToSheetsColor('A9D08E');
const COLOR_BLUE_24H = hexToSheetsColor('8FAADC');
const COLOR_WHITE = hexToSheetsColor('FFFFFF');

const SOLID_THIN_BORDER: SheetsBorder = {
  style: 'SOLID',
  width: 1,
  color: COLOR_BLACK,
};

const ALL_THIN_BORDERS = {
  top: SOLID_THIN_BORDER,
  bottom: SOLID_THIN_BORDER,
  left: SOLID_THIN_BORDER,
  right: SOLID_THIN_BORDER,
};

const TITLE_FORMAT: SheetsCellFormat = {
  backgroundColor: COLOR_GOLD,
  horizontalAlignment: 'CENTER',
  verticalAlignment: 'MIDDLE',
  textFormat: {
    fontFamily: 'Calibri',
    fontSize: 15,
    bold: true,
    foregroundColor: COLOR_BLACK,
  },
  borders: ALL_THIN_BORDERS,
};

const HEADER_FORMAT: SheetsCellFormat = {
  backgroundColor: COLOR_GOLD,
  horizontalAlignment: 'CENTER',
  verticalAlignment: 'MIDDLE',
  wrapStrategy: 'WRAP',
  textFormat: {
    fontFamily: 'Calibri',
    fontSize: 10,
    bold: true,
    foregroundColor: COLOR_BLACK,
  },
  borders: ALL_THIN_BORDERS,
};

const DATA_CENTER_BOLD_FORMAT: SheetsCellFormat = {
  backgroundColor: COLOR_WHITE,
  horizontalAlignment: 'CENTER',
  verticalAlignment: 'MIDDLE',
  textFormat: {
    fontFamily: 'Calibri',
    fontSize: 11,
    bold: true,
    foregroundColor: COLOR_BLACK,
  },
  borders: ALL_THIN_BORDERS,
};

const DATA_TEXT_FORMAT: SheetsCellFormat = {
  backgroundColor: COLOR_WHITE,
  horizontalAlignment: 'CENTER',
  verticalAlignment: 'MIDDLE',
  wrapStrategy: 'WRAP',
  textFormat: {
    fontFamily: 'Calibri',
    fontSize: 10,
    bold: false,
    foregroundColor: COLOR_BLACK,
  },
  borders: ALL_THIN_BORDERS,
};

const DATA_REMARKS_FORMAT: SheetsCellFormat = {
  backgroundColor: COLOR_WHITE,
  horizontalAlignment: 'LEFT',
  verticalAlignment: 'MIDDLE',
  wrapStrategy: 'WRAP',
  textFormat: {
    fontFamily: 'Calibri',
    fontSize: 10,
    bold: false,
    foregroundColor: COLOR_DARK_TEXT,
  },
  borders: ALL_THIN_BORDERS,
};

const SHIFT_12H_FORMAT: SheetsCellFormat = {
  backgroundColor: COLOR_GREEN_12H,
  horizontalAlignment: 'CENTER',
  verticalAlignment: 'MIDDLE',
  textFormat: {
    fontFamily: 'Calibri',
    fontSize: 11,
    bold: true,
    foregroundColor: COLOR_BLACK,
  },
  borders: ALL_THIN_BORDERS,
};

const SHIFT_12H_BASELINE_FORMAT: SheetsCellFormat = {
  backgroundColor: COLOR_GREEN_12H_BASELINE,
  horizontalAlignment: 'CENTER',
  verticalAlignment: 'MIDDLE',
  textFormat: {
    fontFamily: 'Calibri',
    fontSize: 11,
    bold: true,
    foregroundColor: COLOR_BLACK,
  },
  borders: ALL_THIN_BORDERS,
};

const DAY_24H_FORMAT: SheetsCellFormat = {
  backgroundColor: COLOR_BLUE_24H,
  horizontalAlignment: 'CENTER',
  verticalAlignment: 'MIDDLE',
  textFormat: {
    fontFamily: 'Calibri',
    fontSize: 11,
    bold: true,
    foregroundColor: COLOR_BLACK,
  },
  borders: ALL_THIN_BORDERS,
};

const COLUMN_PIXEL_WIDTHS = [
  115, // DATE
  105, // TIME
  135, // WATER FLOW M³
  165, // WATER FLOW IN 4 HOUR (M³)
  165, // WATER FLOW IN 12 HOUR (M³)
  165, // WATER FLOW IN 24 HOUR (M³)
  165, // UPLOADED BY
  115, // MOTOR NO.
  115, // MOTOR STATUS
  260, // REMARKS
];

const ALL_PLANTS_COLUMN_PIXEL_WIDTHS = [
  145, // PLANT
  ...COLUMN_PIXEL_WIDTHS,
];

/**
 * Appends `authuser=<adminEmail>` and optional `#gid=<sheetId>` to a Google Sheets URL
 * so the spreadsheet opens directly in the admin's Google account on the chosen sheet tab.
 */
export function buildGoogleSheetsUrlForAccount(
  spreadsheetUrl: string,
  accountEmail?: string | null,
  targetSheetId?: number | null
): string {
  const cleanUrl = (spreadsheetUrl ?? '').trim();
  const cleanEmail = (accountEmail ?? '').trim();
  const hasGid = typeof targetSheetId === 'number' && Number.isFinite(targetSheetId);
  if (!cleanUrl) return cleanUrl;
  try {
    const parsed = new URL(cleanUrl);
    if (cleanEmail) {
      parsed.searchParams.set('authuser', cleanEmail);
    }
    if (hasGid) {
      parsed.hash = `gid=${Math.trunc(targetSheetId)}`;
    }
    return parsed.toString();
  } catch {
    let out = cleanUrl;
    if (cleanEmail) {
      const separator = out.includes('?') ? '&' : '?';
      out = `${out}${separator}authuser=${encodeURIComponent(cleanEmail)}`;
    }
    if (hasGid) {
      out = `${out.split('#')[0]}#gid=${Math.trunc(targetSheetId)}`;
    }
    return out;
  }
}

function buildAllPlantsSheetPayload(
  sheets: readonly PlantExcelSheetData[],
  sheetId: number,
  sheetTitle: string
): SheetsSheetPayload {
  const colCount = ALL_PLANTS_REPORT_HEADERS.length;
  const merges: SheetsGridRange[] = [];

  // Row 0 (Excel Row 1): Merged ALL PLANTS Banner
  const bannerRow: SheetsCellData[] = Array.from({ length: colCount }, (_, c) => ({
    userEnteredValue: { stringValue: c === 0 ? 'ALL PLANTS' : '' },
    userEnteredFormat: TITLE_FORMAT,
  }));
  merges.push({
    sheetId,
    startRowIndex: 0,
    endRowIndex: 1,
    startColumnIndex: 0,
    endColumnIndex: colCount,
  });

  // Row 1 (Excel Row 2): Column Headers (PLANT + 10 standard columns)
  const headerRow: SheetsCellData[] = ALL_PLANTS_REPORT_HEADERS.map((header) => ({
    userEnteredValue: { stringValue: header },
    userEnteredFormat: HEADER_FORMAT,
  }));

  const dataRows: Array<{ values: SheetsCellData[] }> = [];
  let cursorRow0 = 2;

  for (const sheet of sheets) {
    if (sheet.rows.length === 0) continue;
    const plantStartRow0 = cursorRow0;

    const shift12StartMap = new Map<
      number,
      { endIndex: number; hasDelta: boolean; totalFlow: number | null }
    >();
    const shift12RowHasDelta = new Map<number, boolean>();
    for (const block of sheet.shift12hBlocks) {
      shift12StartMap.set(block.startIndex, {
        endIndex: block.endIndex,
        hasDelta: block.hasDelta,
        totalFlow: block.totalFlow,
      });
      for (let idx = block.startIndex; idx <= block.endIndex; idx += 1) {
        shift12RowHasDelta.set(idx, block.hasDelta);
      }
      if (block.endIndex > block.startIndex) {
        merges.push({
          sheetId,
          startRowIndex: plantStartRow0 + block.startIndex,
          endRowIndex: plantStartRow0 + block.endIndex + 1,
          startColumnIndex: 5,
          endColumnIndex: 6,
        });
      }
    }

    const day24StartMap = new Map<
      number,
      { endIndex: number; hasDelta: boolean; totalFlow: number | null }
    >();
    for (const block of sheet.day24hBlocks) {
      day24StartMap.set(block.startIndex, {
        endIndex: block.endIndex,
        hasDelta: block.hasDelta,
        totalFlow: block.totalFlow,
      });
      if (block.endIndex > block.startIndex) {
        merges.push({
          sheetId,
          startRowIndex: plantStartRow0 + block.startIndex,
          endRowIndex: plantStartRow0 + block.endIndex + 1,
          startColumnIndex: 6,
          endColumnIndex: 7,
        });
      }
    }

    sheet.rows.forEach((row, idx) => {
      const excelRowNum = plantStartRow0 + idx + 1;

      // Col E (index 4): 4H delta formula referencing Col D (WATER FLOW M³) within this plant only
      let cell4h: SheetsCellData;
      if (row.delta4h !== null) {
        const formula =
          idx === 0 && row.baselineFlowUsed !== null
            ? `=MAX(0,D${excelRowNum}-${row.baselineFlowUsed})`
            : `=MAX(0,D${excelRowNum}-D${excelRowNum - 1})`;
        cell4h = {
          userEnteredValue: { formulaValue: formula },
          userEnteredFormat: DATA_CENTER_BOLD_FORMAT,
        };
      } else {
        cell4h = {
          userEnteredValue: { stringValue: '' },
          userEnteredFormat: DATA_CENTER_BOLD_FORMAT,
        };
      }

      // Col F (index 5): 12H shift total formula summing Col E
      const shiftBlock = shift12StartMap.get(idx);
      const has12hDelta = shift12RowHasDelta.get(idx) ?? false;
      const format12h = has12hDelta ? SHIFT_12H_FORMAT : SHIFT_12H_BASELINE_FORMAT;
      let cell12h: SheetsCellData;
      if (shiftBlock && shiftBlock.hasDelta && shiftBlock.totalFlow !== null) {
        const startExcel = plantStartRow0 + idx + 1;
        const endExcel = plantStartRow0 + shiftBlock.endIndex + 1;
        cell12h = {
          userEnteredValue: { formulaValue: `=SUM(E${startExcel}:E${endExcel})` },
          userEnteredFormat: format12h,
        };
      } else {
        cell12h = {
          userEnteredValue: { stringValue: '' },
          userEnteredFormat: format12h,
        };
      }

      // Col G (index 6): 24H operational day total formula summing Col E
      const dayBlock = day24StartMap.get(idx);
      let cell24h: SheetsCellData;
      if (dayBlock && dayBlock.hasDelta && dayBlock.totalFlow !== null) {
        const startExcel = plantStartRow0 + idx + 1;
        const endExcel = plantStartRow0 + dayBlock.endIndex + 1;
        cell24h = {
          userEnteredValue: { formulaValue: `=SUM(E${startExcel}:E${endExcel})` },
          userEnteredFormat: DAY_24H_FORMAT,
        };
      } else {
        cell24h = {
          userEnteredValue: { stringValue: '' },
          userEnteredFormat: DAY_24H_FORMAT,
        };
      }

      dataRows.push({
        values: [
          { userEnteredValue: { stringValue: sheet.plantName }, userEnteredFormat: DATA_CENTER_BOLD_FORMAT },
          { userEnteredValue: { stringValue: row.dateText }, userEnteredFormat: DATA_CENTER_BOLD_FORMAT },
          { userEnteredValue: { stringValue: row.timeText }, userEnteredFormat: DATA_CENTER_BOLD_FORMAT },
          { userEnteredValue: { numberValue: row.waterFlow }, userEnteredFormat: DATA_CENTER_BOLD_FORMAT },
          cell4h,
          cell12h,
          cell24h,
          {
            userEnteredValue: {
              stringValue: row.reading.submittedByName || row.reading.submittedByEmail || '—',
            },
            userEnteredFormat: DATA_TEXT_FORMAT,
          },
          {
            userEnteredValue: { stringValue: row.reading.motorName || '—' },
            userEnteredFormat: DATA_TEXT_FORMAT,
          },
          {
            userEnteredValue: { stringValue: row.reading.motorStatus },
            userEnteredFormat: DATA_TEXT_FORMAT,
          },
          {
            userEnteredValue: { stringValue: row.reading.review || 'Normal operation' },
            userEnteredFormat: DATA_REMARKS_FORMAT,
          },
        ],
      });
    });

    cursorRow0 += sheet.rows.length;
  }

  const allRowData = [{ values: bannerRow }, { values: headerRow }, ...dataRows];
  const rowMetadata = [
    { pixelSize: 38 },
    { pixelSize: 44 },
    ...dataRows.map(() => ({ pixelSize: 28 })),
  ];
  const columnMetadata = ALL_PLANTS_COLUMN_PIXEL_WIDTHS.map((pixelSize) => ({ pixelSize }));

  return {
    properties: {
      sheetId,
      title: sheetTitle,
      gridProperties: {
        rowCount: Math.max(allRowData.length + 5, 25),
        columnCount: colCount,
        frozenRowCount: 2,
      },
    },
    data: [
      {
        startRow: 0,
        startColumn: 0,
        rowData: allRowData,
        rowMetadata,
        columnMetadata,
      },
    ],
    merges,
  };
}

function buildSingleSheetPayload(
  sheet: PlantExcelSheetData,
  sheetId: number,
  sheetTitle: string
): SheetsSheetPayload {
  const colCount = EXCEL_REPORT_HEADERS.length;
  const merges: SheetsGridRange[] = [];

  // Row 0 (Excel Row 1): Merged Plant Title Banner
  const bannerRow: SheetsCellData[] = Array.from({ length: colCount }, (_, c) => ({
    userEnteredValue: { stringValue: c === 0 ? sheet.plantName.toUpperCase() : '' },
    userEnteredFormat: TITLE_FORMAT,
  }));
  merges.push({
    sheetId,
    startRowIndex: 0,
    endRowIndex: 1,
    startColumnIndex: 0,
    endColumnIndex: colCount,
  });

  // Row 1 (Excel Row 2): Column Headers
  const headerRow: SheetsCellData[] = EXCEL_REPORT_HEADERS.map((header) => ({
    userEnteredValue: { stringValue: header },
    userEnteredFormat: HEADER_FORMAT,
  }));

  // Map 12H and 24H block metadata per row index for O(1) lookup while building rowData
  const shift12StartMap = new Map<
    number,
    { endIndex: number; hasDelta: boolean; totalFlow: number | null }
  >();
  const shift12RowHasDelta = new Map<number, boolean>();
  for (const block of sheet.shift12hBlocks) {
    shift12StartMap.set(block.startIndex, {
      endIndex: block.endIndex,
      hasDelta: block.hasDelta,
      totalFlow: block.totalFlow,
    });
    for (let idx = block.startIndex; idx <= block.endIndex; idx += 1) {
      shift12RowHasDelta.set(idx, block.hasDelta);
    }
    if (block.endIndex > block.startIndex) {
      merges.push({
        sheetId,
        startRowIndex: 2 + block.startIndex,
        endRowIndex: 2 + block.endIndex + 1,
        startColumnIndex: 4,
        endColumnIndex: 5,
      });
    }
  }

  const day24StartMap = new Map<
    number,
    { endIndex: number; hasDelta: boolean; totalFlow: number | null }
  >();
  for (const block of sheet.day24hBlocks) {
    day24StartMap.set(block.startIndex, {
      endIndex: block.endIndex,
      hasDelta: block.hasDelta,
      totalFlow: block.totalFlow,
    });
    if (block.endIndex > block.startIndex) {
      merges.push({
        sheetId,
        startRowIndex: 2 + block.startIndex,
        endRowIndex: 2 + block.endIndex + 1,
        startColumnIndex: 5,
        endColumnIndex: 6,
      });
    }
  }

  const dataRows: Array<{ values: SheetsCellData[] }> = sheet.rows.map((row, idx) => {
    const excelRowNum = 3 + idx; // 1-based Sheets row number (Row 1 = Banner, Row 2 = Headers)

    // Col D: 4H delta formula
    let cell4h: SheetsCellData;
    if (row.delta4h !== null) {
      const formula =
        idx === 0 && row.baselineFlowUsed !== null
          ? `=MAX(0,C${excelRowNum}-${row.baselineFlowUsed})`
          : `=MAX(0,C${excelRowNum}-C${excelRowNum - 1})`;
      cell4h = {
        userEnteredValue: { formulaValue: formula },
        userEnteredFormat: DATA_CENTER_BOLD_FORMAT,
      };
    } else {
      cell4h = {
        userEnteredValue: { stringValue: '' },
        userEnteredFormat: DATA_CENTER_BOLD_FORMAT,
      };
    }

    // Col E: 12H shift total (formula on block start row, empty styled cells on merged continuation rows)
    const shiftBlock = shift12StartMap.get(idx);
    const has12hDelta = shift12RowHasDelta.get(idx) ?? false;
    const format12h = has12hDelta ? SHIFT_12H_FORMAT : SHIFT_12H_BASELINE_FORMAT;
    let cell12h: SheetsCellData;
    if (shiftBlock && shiftBlock.hasDelta && shiftBlock.totalFlow !== null) {
      const startExcel = 3 + idx;
      const endExcel = 3 + shiftBlock.endIndex;
      cell12h = {
        userEnteredValue: { formulaValue: `=SUM(D${startExcel}:D${endExcel})` },
        userEnteredFormat: format12h,
      };
    } else {
      cell12h = {
        userEnteredValue: { stringValue: '' },
        userEnteredFormat: format12h,
      };
    }

    // Col F: 24H operational day total (formula on block start row)
    const dayBlock = day24StartMap.get(idx);
    let cell24h: SheetsCellData;
    if (dayBlock && dayBlock.hasDelta && dayBlock.totalFlow !== null) {
      const startExcel = 3 + idx;
      const endExcel = 3 + dayBlock.endIndex;
      cell24h = {
        userEnteredValue: { formulaValue: `=SUM(D${startExcel}:D${endExcel})` },
        userEnteredFormat: DAY_24H_FORMAT,
      };
    } else {
      cell24h = {
        userEnteredValue: { stringValue: '' },
        userEnteredFormat: DAY_24H_FORMAT,
      };
    }

    return {
      values: [
        { userEnteredValue: { stringValue: row.dateText }, userEnteredFormat: DATA_CENTER_BOLD_FORMAT },
        { userEnteredValue: { stringValue: row.timeText }, userEnteredFormat: DATA_CENTER_BOLD_FORMAT },
        { userEnteredValue: { numberValue: row.waterFlow }, userEnteredFormat: DATA_CENTER_BOLD_FORMAT },
        cell4h,
        cell12h,
        cell24h,
        {
          userEnteredValue: {
            stringValue: row.reading.submittedByName || row.reading.submittedByEmail || '—',
          },
          userEnteredFormat: DATA_TEXT_FORMAT,
        },
        {
          userEnteredValue: { stringValue: row.reading.motorName || '—' },
          userEnteredFormat: DATA_TEXT_FORMAT,
        },
        {
          userEnteredValue: { stringValue: row.reading.motorStatus },
          userEnteredFormat: DATA_TEXT_FORMAT,
        },
        {
          userEnteredValue: { stringValue: row.reading.review || 'Normal operation' },
          userEnteredFormat: DATA_REMARKS_FORMAT,
        },
      ],
    };
  });

  const allRowData = [{ values: bannerRow }, { values: headerRow }, ...dataRows];
  const rowMetadata = [
    { pixelSize: 38 }, // Row 1 banner
    { pixelSize: 44 }, // Row 2 wrapped headers
    ...sheet.rows.map(() => ({ pixelSize: 28 })),
  ];
  const columnMetadata = COLUMN_PIXEL_WIDTHS.map((pixelSize) => ({ pixelSize }));

  return {
    properties: {
      sheetId,
      title: sheetTitle,
      gridProperties: {
        rowCount: Math.max(allRowData.length + 5, 25),
        columnCount: colCount,
        frozenRowCount: 2,
      },
    },
    data: [
      {
        startRow: 0,
        startColumn: 0,
        rowData: allRowData,
        rowMetadata,
        columnMetadata,
      },
    ],
    merges,
  };
}

/**
 * Builds an atomic Google Sheets API v4 `spreadsheets.create` request body containing:
 * - 1st tab: "All Plants" with combined per-plant 4H/12H/24H formulas & merged shift blocks
 * - Subsequent tabs: one formatted tab per individual plant
 * Also returns `targetSheetId` and `targetSheetTitle` so the URL opens straight to the chosen tab.
 */
export function buildGoogleSheetsSpreadsheetPayload(
  readings: readonly MeterReading[],
  options: BuildGoogleSheetsOptions = {}
): {
  payload: GoogleSheetsCreatePayload;
  plantLabel: string;
  sheetCount: number;
  targetSheetId: number;
  targetSheetTitle: string;
} {
  const selectedPlant = (options.selectedPlant ?? 'all').trim();
  const isSinglePlant = Boolean(selectedPlant && selectedPlant !== 'all');
  const plantLabel = isSinglePlant ? selectedPlant : 'All Plants';
  const dateStamp = options.dateStamp ?? new Date().toISOString().slice(0, 10);

  // Ensure configured plants (and selectedPlant if missing from readings) always get a tab
  const readingPlantKeys = new Set(
    readings.map((r) => (r.plant.trim() || 'Unknown Plant').toLowerCase())
  );
  const mergedPlantNames: string[] = [];
  const seenLower = new Set<string>();
  for (const name of options.plantNames ?? []) {
    const trimmed = name.trim();
    if (trimmed && !seenLower.has(trimmed.toLowerCase())) {
      seenLower.add(trimmed.toLowerCase());
      mergedPlantNames.push(trimmed);
    }
  }
  if (
    isSinglePlant &&
    !seenLower.has(selectedPlant.toLowerCase()) &&
    !readingPlantKeys.has(selectedPlant.toLowerCase())
  ) {
    mergedPlantNames.push(selectedPlant);
  }

  const sheetsData = buildPlantExcelSheetsData(readings, {
    tzOffsetMinutes: options.tzOffsetMinutes,
    baselineFlowByPlant: options.baselineFlowByPlant,
    emptyFallbackPlant: isSinglePlant ? selectedPlant : options.emptyFallbackPlant,
    plantNames: mergedPlantNames.length > 0 ? mergedPlantNames : undefined,
  });

  const usedTabNames = new Set<string>();
  const allPlantsTitle = sanitizeWorksheetName('All Plants', usedTabNames);
  const allPlantsSheetId = 1;
  const allPlantsSheet = buildAllPlantsSheetPayload(sheetsData, allPlantsSheetId, allPlantsTitle);

  let targetSheetId = allPlantsSheetId;
  let targetSheetTitle = allPlantsTitle;

  const plantSheets = sheetsData.map((sheet, idx) => {
    const tabId = idx + 2;
    const tabTitle = sanitizeWorksheetName(sheet.plantName, usedTabNames);
    if (
      isSinglePlant &&
      sheet.plantName.trim().toLowerCase() === selectedPlant.toLowerCase()
    ) {
      targetSheetId = tabId;
      targetSheetTitle = tabTitle;
    }
    return buildSingleSheetPayload(sheet, tabId, tabTitle);
  });

  const sheets = [allPlantsSheet, ...plantSheets];

  return {
    payload: {
      properties: {
        title: `HydroLog Water Flow — ${plantLabel} (${dateStamp})`,
      },
      sheets,
    },
    plantLabel,
    sheetCount: sheets.length,
    targetSheetId,
    targetSheetTitle,
  };
}

export async function createGoogleSheetViaApi(
  accessToken: string,
  payload: GoogleSheetsCreatePayload,
  meta: {
    recordCount: number;
    plantLabel: string;
    accountEmail: string | null;
    targetSheetId?: number;
    targetSheetTitle?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<GoogleSheetsExportResult> {
  const response = await fetchImpl('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let apiMessage = '';
    try {
      const errBody = (await response.json()) as {
        error?: { message?: string; status?: string };
      };
      apiMessage = errBody.error?.message ?? '';
    } catch {
      // Ignore unparseable response
    }

    if (response.status === 401 || response.status === 403) {
      throw new GoogleSheetsAuthError(
        apiMessage
          ? `Google Sheets authorization required (${apiMessage}). Please sign in with your Google administrator account again.`
          : 'Your Google Sheets session expired or lacks permission. Please sign in with your Google account again.',
        response.status
      );
    }

    throw new Error(
      apiMessage || `Google Sheets API request failed (HTTP ${response.status}).`
    );
  }

  const created = (await response.json()) as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  };

  if (!created.spreadsheetId) {
    throw new Error('Google Sheets did not return a spreadsheet ID.');
  }

  // Resolve authoritative sheetId (gid) from API response when available
  let resolvedSheetId = meta.targetSheetId;
  const resolvedSheetTitle = meta.targetSheetTitle || meta.plantLabel;
  if (Array.isArray(created.sheets) && created.sheets.length > 0 && meta.targetSheetTitle) {
    const matched = created.sheets.find(
      (s) => s.properties?.title?.toLowerCase() === meta.targetSheetTitle?.toLowerCase()
    );
    if (typeof matched?.properties?.sheetId === 'number') {
      resolvedSheetId = matched.properties.sheetId;
    }
  }

  const rawUrl =
    created.spreadsheetUrl ||
    `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}/edit`;

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: buildGoogleSheetsUrlForAccount(rawUrl, meta.accountEmail, resolvedSheetId),
    title: created.properties?.title || payload.properties.title,
    sheetCount: payload.sheets.length,
    recordCount: meta.recordCount,
    plantLabel: meta.plantLabel,
    targetSheetTitle: resolvedSheetTitle,
    accountEmail: meta.accountEmail,
  };
}
