import XLSX from 'xlsx-js-style';
import type { MeterReading } from '../types.ts';

export const EXCEL_REPORT_HEADERS = [
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
] as const;

export const ALL_PLANTS_REPORT_HEADERS = [
  'PLANT',
  ...EXCEL_REPORT_HEADERS,
] as const;

export type ShiftHalf = 'AM' | 'PM';

export interface OperationalShiftWindow {
  /** Operational day key (YYYY-MM-DD) running from ~9:00 PM prev day to ~9:00 PM this day */
  opDayKey: string;
  /** AM = ~9:00 PM -> ~9:00 AM (01:00 AM, 05:00 AM, 09:00 AM); PM = ~9:00 AM -> ~9:00 PM (01:00 PM, 05:00 PM, 09:00 PM) */
  shift: ShiftHalf;
  /** Unique contiguous shift identifier: `${opDayKey}|${shift}` */
  shiftKey: string;
}

export interface ComputedPlantRow {
  reading: MeterReading;
  dateText: string;
  timeText: string;
  waterFlow: number;
  delta4h: number | null;
  baselineFlowUsed: number | null;
  opDayKey: string;
  shift: ShiftHalf;
  shiftKey: string;
}

export interface MergedBlock {
  key: string;
  startIndex: number; // 0-based index within plant rows
  endIndex: number; // 0-based inclusive index within plant rows
  totalFlow: number | null;
  hasDelta: boolean;
}

export interface PlantExcelSheetData {
  plantName: string;
  sheetName: string;
  rows: ComputedPlantRow[];
  shift12hBlocks: MergedBlock[];
  day24hBlocks: MergedBlock[];
}

export interface BuildWorkbookOptions {
  /** Minutes offset as returned by Date.prototype.getTimezoneOffset() (UTC - local). Defaults to 0. */
  tzOffsetMinutes?: number;
  /** Optional preceding cumulative flow per plant (lowercased plant name -> flow) for date-filtered exports. */
  baselineFlowByPlant?: Record<string, number>;
  /** Fallback plant title used if readings array is empty (e.g. filtered single plant). */
  emptyFallbackPlant?: string;
  /** Optional configured plant list so every configured plant receives its own sheet tab (even if 0 readings). */
  plantNames?: readonly string[];
}

// Grace cutoff: 90 minutes past 09:00 AM (10:30 AM) and 09:00 PM (10:30 PM)
// so readings recorded approximately around 9:00 AM / 9:00 PM close the intended 12H / 24H window.
const MORNING_SHIFT_CUTOFF_MINUTES = 10 * 60 + 30; // 10:30 AM (630)
const EVENING_SHIFT_CUTOFF_MINUTES = 22 * 60 + 30; // 10:30 PM (1350)

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function getShiftedDate(iso: string, tzOffsetMinutes = 0): Date | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() - tzOffsetMinutes * 60_000);
}

/**
 * Formats an ISO timestamp as DD-MM-YYYY (e.g. 22-11-2026) matching the plant log sheet format.
 */
export function formatExcelReportDate(iso: string, tzOffsetMinutes = 0): string {
  const shifted = getShiftedDate(iso, tzOffsetMinutes);
  if (!shifted) return iso;
  return `${pad2(shifted.getUTCDate())}-${pad2(shifted.getUTCMonth() + 1)}-${shifted.getUTCFullYear()}`;
}

/**
 * Formats an ISO timestamp as hh.mm AM/PM (e.g. 09.00 PM, 01.00 AM) matching the plant log sheet format.
 */
export function formatExcelReportTime(iso: string, tzOffsetMinutes = 0): string {
  const shifted = getShiftedDate(iso, tzOffsetMinutes);
  if (!shifted) return '';
  const hours24 = shifted.getUTCHours();
  const minutes = pad2(shifted.getUTCMinutes());
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${pad2(hours12)}.${minutes} ${meridiem}`;
}

/**
 * Classifies a timestamp into its 12-hour shift (~9:00 PM -> ~9:00 AM or ~9:00 AM -> ~9:00 PM)
 * and 24-hour operational day (~9:00 PM -> ~9:00 PM), tolerating approximate 9:00 AM / 9:00 PM entries.
 */
export function classifyOperationalShift(
  iso: string,
  tzOffsetMinutes = 0
): OperationalShiftWindow {
  const shifted = getShiftedDate(iso, tzOffsetMinutes);
  if (!shifted) {
    return {
      opDayKey: 'unknown',
      shift: 'AM',
      shiftKey: 'unknown|AM',
    };
  }

  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const minutesOfDay = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();

  const formatYmd = (y: number, mZero: number, d: number) =>
    `${y}-${pad2(mZero + 1)}-${pad2(d)}`;

  if (minutesOfDay > EVENING_SHIFT_CUTOFF_MINUTES) {
    // Late evening after ~10:30 PM belongs to the next operational day's Morning (~9PM -> ~9AM) shift
    const nextUtc = new Date(Date.UTC(year, month, day + 1));
    const opDayKey = formatYmd(
      nextUtc.getUTCFullYear(),
      nextUtc.getUTCMonth(),
      nextUtc.getUTCDate()
    );
    return { opDayKey, shift: 'AM', shiftKey: `${opDayKey}|AM` };
  }

  const opDayKey = formatYmd(year, month, day);
  if (minutesOfDay <= MORNING_SHIFT_CUTOFF_MINUTES) {
    // 12:00 AM through ~10:30 AM (captures 01:00 AM, 05:00 AM, and ~09:00 AM)
    return { opDayKey, shift: 'AM', shiftKey: `${opDayKey}|AM` };
  }

  // After ~10:30 AM through ~10:30 PM (captures 01:00 PM, 05:00 PM, and ~09:00 PM)
  return { opDayKey, shift: 'PM', shiftKey: `${opDayKey}|PM` };
}

/**
 * Produces a valid, unique Excel worksheet tab name (<= 31 chars, no illegal chars).
 */
export function sanitizeWorksheetName(rawName: string, usedLowerNames: Set<string>): string {
  const cleaned = rawName
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = (cleaned || 'Plant Log').slice(0, 31).trim() || 'Plant Log';

  let candidate = base;
  let counter = 2;
  while (usedLowerNames.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length)).trim()}${suffix}`;
    counter += 1;
  }
  usedLowerNames.add(candidate.toLowerCase());
  return candidate;
}

function buildContiguousBlocks(
  rows: readonly ComputedPlantRow[],
  getKey: (row: ComputedPlantRow) => string
): MergedBlock[] {
  const blocks: MergedBlock[] = [];
  if (rows.length === 0) return blocks;

  let start = 0;
  let currentKey = getKey(rows[0]);

  const flush = (endIdx: number) => {
    let sum = 0;
    let hasDelta = false;
    for (let i = start; i <= endIdx; i += 1) {
      const d = rows[i].delta4h;
      if (d !== null) {
        sum = round2(sum + d);
        hasDelta = true;
      }
    }
    blocks.push({
      key: currentKey,
      startIndex: start,
      endIndex: endIdx,
      totalFlow: hasDelta ? sum : null,
      hasDelta,
    });
  };

  for (let i = 1; i < rows.length; i += 1) {
    const nextKey = getKey(rows[i]);
    if (nextKey !== currentKey) {
      flush(i - 1);
      start = i;
      currentKey = nextKey;
    }
  }
  flush(rows.length - 1);
  return blocks;
}

/**
 * Groups readings per plant, sorts each plant chronologically ascending (~9 AM / ~9 PM sequence),
 * and computes 4-hour deltas, 12-hour shift totals, and 24-hour operational day totals.
 */
export function buildPlantExcelSheetsData(
  readings: readonly MeterReading[],
  options: BuildWorkbookOptions = {}
): PlantExcelSheetData[] {
  const tzOffset = options.tzOffsetMinutes ?? 0;
  const baselines = options.baselineFlowByPlant ?? {};
  const usedSheetNames = new Set<string>();

  const configuredPlants = (options.plantNames ?? [])
    .map((p) => p.trim())
    .filter(Boolean);

  if (readings.length === 0 && configuredPlants.length === 0) {
    const fallbackName =
      options.emptyFallbackPlant && options.emptyFallbackPlant !== 'all'
        ? options.emptyFallbackPlant
        : 'Water Meter Readings';
    return [
      {
        plantName: fallbackName,
        sheetName: sanitizeWorksheetName(fallbackName, usedSheetNames),
        rows: [],
        shift12hBlocks: [],
        day24hBlocks: [],
      },
    ];
  }

  // Group readings by plant while preserving configured plant order first, then any extra plants alphabetically
  const plantGroups = new Map<string, { displayName: string; items: MeterReading[]; configuredIndex: number }>();
  configuredPlants.forEach((name, idx) => {
    const key = name.toLowerCase();
    if (!plantGroups.has(key)) {
      plantGroups.set(key, { displayName: name, items: [], configuredIndex: idx });
    }
  });

  for (const reading of readings) {
    const displayName = reading.plant.trim() || 'Unknown Plant';
    const key = displayName.toLowerCase();
    const existing = plantGroups.get(key);
    if (existing) {
      existing.items.push(reading);
    } else {
      plantGroups.set(key, {
        displayName,
        items: [reading],
        configuredIndex: Number.MAX_SAFE_INTEGER,
      });
    }
  }

  const orderedGroups = Array.from(plantGroups.values()).sort((a, b) => {
    if (a.configuredIndex !== b.configuredIndex) {
      return a.configuredIndex - b.configuredIndex;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return orderedGroups.map(({ displayName, items }) => {
    // Chronological ascending order (oldest -> newest) for continuous 4H / 12H / 24H sequence
    const sorted = [...items].sort((a, b) => {
      const timeDiff = Date.parse(a.recordedAt) - Date.parse(b.recordedAt);
      if (timeDiff !== 0 && !Number.isNaN(timeDiff)) return timeDiff;
      const createdDiff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (createdDiff !== 0 && !Number.isNaN(createdDiff)) return createdDiff;
      return a.id.localeCompare(b.id);
    });

    const baselineCandidate = baselines[displayName.toLowerCase()];
    const hasExplicitBaseline =
      typeof baselineCandidate === 'number' && Number.isFinite(baselineCandidate);

    const rows: ComputedPlantRow[] = sorted.map((reading, idx) => {
      const flow = round2(Number.isFinite(reading.waterFlow) ? reading.waterFlow : 0);
      const shiftInfo = classifyOperationalShift(reading.recordedAt, tzOffset);

      let delta4h: number | null = null;
      let baselineFlowUsed: number | null = null;

      if (idx === 0) {
        if (hasExplicitBaseline) {
          baselineFlowUsed = round2(baselineCandidate);
          delta4h = Math.max(0, round2(flow - baselineFlowUsed));
        }
      } else {
        const prevFlow = round2(
          Number.isFinite(sorted[idx - 1].waterFlow) ? sorted[idx - 1].waterFlow : 0
        );
        delta4h = Math.max(0, round2(flow - prevFlow));
      }

      return {
        reading,
        dateText: formatExcelReportDate(reading.recordedAt, tzOffset),
        timeText: formatExcelReportTime(reading.recordedAt, tzOffset),
        waterFlow: flow,
        delta4h,
        baselineFlowUsed,
        opDayKey: shiftInfo.opDayKey,
        shift: shiftInfo.shift,
        shiftKey: shiftInfo.shiftKey,
      };
    });

    const shift12hBlocks = buildContiguousBlocks(rows, (r) => r.shiftKey);
    const day24hBlocks = buildContiguousBlocks(rows, (r) => r.opDayKey);

    return {
      plantName: displayName,
      sheetName: sanitizeWorksheetName(displayName, usedSheetNames),
      rows,
      shift12hBlocks,
      day24hBlocks,
    };
  });
}

const THIN_BLACK_BORDER = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
};

const TITLE_STYLE = {
  font: { name: 'Calibri', sz: 16, bold: true, color: { rgb: '000000' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFD966' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: THIN_BLACK_BORDER,
};

const HEADER_STYLE = {
  font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFD966' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: THIN_BLACK_BORDER,
};

const DATA_CENTER_STYLE = {
  font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: THIN_BLACK_BORDER,
};

const DATA_TEXT_STYLE = {
  font: { name: 'Calibri', sz: 11, color: { rgb: '000000' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: THIN_BLACK_BORDER,
};

const DATA_REMARKS_STYLE = {
  font: { name: 'Calibri', sz: 10, color: { rgb: '1F2937' } },
  alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  border: THIN_BLACK_BORDER,
};

const SHIFT_12H_STYLE = {
  font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'C6E0B4' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: THIN_BLACK_BORDER,
};

const SHIFT_12H_BASELINE_STYLE = {
  font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'A9D08E' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: THIN_BLACK_BORDER,
};

const DAY_24H_STYLE = {
  font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
  fill: { patternType: 'solid', fgColor: { rgb: '8FAADC' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: THIN_BLACK_BORDER,
};

function setCell(
  ws: XLSX.WorkSheet,
  rowIdx0: number,
  colIdx0: number,
  cell: XLSX.CellObject
) {
  const addr = XLSX.utils.encode_cell({ r: rowIdx0, c: colIdx0 });
  ws[addr] = cell;
}

function buildAllPlantsWorksheet(sheets: readonly PlantExcelSheetData[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const colCount = ALL_PLANTS_REPORT_HEADERS.length;

  // Row 0 (Excel Row 1): Merged ALL PLANTS Title Banner
  for (let c = 0; c < colCount; c += 1) {
    setCell(ws, 0, c, {
      t: 's',
      v: c === 0 ? 'ALL PLANTS' : '',
      s: TITLE_STYLE,
    });
  }
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });

  // Row 1 (Excel Row 2): Column Headers (PLANT + standard 10 report columns)
  for (let c = 0; c < colCount; c += 1) {
    setCell(ws, 1, c, {
      t: 's',
      v: ALL_PLANTS_REPORT_HEADERS[c],
      s: HEADER_STYLE,
    });
  }

  let cursorRow0 = 2;
  for (const sheet of sheets) {
    if (sheet.rows.length === 0) continue;
    const plantStartRow0 = cursorRow0;

    for (let i = 0; i < sheet.rows.length; i += 1) {
      const row = sheet.rows[i];
      const r0 = plantStartRow0 + i;
      const excelRowNum = r0 + 1;

      // Col 0 (A): PLANT
      setCell(ws, r0, 0, { t: 's', v: sheet.plantName, s: DATA_CENTER_STYLE });
      // Col 1 (B): DATE
      setCell(ws, r0, 1, { t: 's', v: row.dateText, s: DATA_CENTER_STYLE });
      // Col 2 (C): TIME
      setCell(ws, r0, 2, { t: 's', v: row.timeText, s: DATA_CENTER_STYLE });
      // Col 3 (D): WATER FLOW M³
      setCell(ws, r0, 3, { t: 'n', v: row.waterFlow, s: DATA_CENTER_STYLE });

      // Col 4 (E): WATER FLOW IN 4 HOUR (M³) — strictly computed within this plant's rows
      if (row.delta4h !== null) {
        const formula =
          i === 0 && row.baselineFlowUsed !== null
            ? `MAX(0,D${excelRowNum}-${row.baselineFlowUsed})`
            : `MAX(0,D${excelRowNum}-D${excelRowNum - 1})`;
        setCell(ws, r0, 4, {
          t: 'n',
          v: row.delta4h,
          f: formula,
          s: DATA_CENTER_STYLE,
        });
      } else {
        setCell(ws, r0, 4, { t: 's', v: '', s: DATA_CENTER_STYLE });
      }

      // Col 5 (F) & Col 6 (G) populated & merged below
      setCell(ws, r0, 5, { t: 's', v: '', s: SHIFT_12H_STYLE });
      setCell(ws, r0, 6, { t: 's', v: '', s: DAY_24H_STYLE });

      // Col 7 (H): UPLOADED BY
      setCell(ws, r0, 7, {
        t: 's',
        v: row.reading.submittedByName || row.reading.submittedByEmail || '—',
        s: DATA_TEXT_STYLE,
      });
      // Col 8 (I): MOTOR NO.
      setCell(ws, r0, 8, {
        t: 's',
        v: row.reading.motorName || '—',
        s: DATA_TEXT_STYLE,
      });
      // Col 9 (J): MOTOR STATUS
      setCell(ws, r0, 9, {
        t: 's',
        v: row.reading.motorStatus,
        s: DATA_TEXT_STYLE,
      });
      // Col 10 (K): REMARKS
      setCell(ws, r0, 10, {
        t: 's',
        v: row.reading.review || 'Normal operation',
        s: DATA_REMARKS_STYLE,
      });
    }

    for (const block of sheet.shift12hBlocks) {
      const startR0 = plantStartRow0 + block.startIndex;
      const endR0 = plantStartRow0 + block.endIndex;
      const startExcel = startR0 + 1;
      const endExcel = endR0 + 1;
      const cellStyle = block.hasDelta ? SHIFT_12H_STYLE : SHIFT_12H_BASELINE_STYLE;

      for (let r0 = startR0; r0 <= endR0; r0 += 1) {
        if (r0 === startR0 && block.hasDelta && block.totalFlow !== null) {
          setCell(ws, r0, 5, {
            t: 'n',
            v: block.totalFlow,
            f: `SUM(E${startExcel}:E${endExcel})`,
            s: cellStyle,
          });
        } else {
          setCell(ws, r0, 5, { t: 's', v: '', s: cellStyle });
        }
      }
      if (endR0 > startR0) {
        merges.push({ s: { r: startR0, c: 5 }, e: { r: endR0, c: 5 } });
      }
    }

    for (const block of sheet.day24hBlocks) {
      const startR0 = plantStartRow0 + block.startIndex;
      const endR0 = plantStartRow0 + block.endIndex;
      const startExcel = startR0 + 1;
      const endExcel = endR0 + 1;

      for (let r0 = startR0; r0 <= endR0; r0 += 1) {
        if (r0 === startR0 && block.hasDelta && block.totalFlow !== null) {
          setCell(ws, r0, 6, {
            t: 'n',
            v: block.totalFlow,
            f: `SUM(E${startExcel}:E${endExcel})`,
            s: DAY_24H_STYLE,
          });
        } else {
          setCell(ws, r0, 6, { t: 's', v: '', s: DAY_24H_STYLE });
        }
      }
      if (endR0 > startR0) {
        merges.push({ s: { r: startR0, c: 6 }, e: { r: endR0, c: 6 } });
      }
    }

    cursorRow0 += sheet.rows.length;
  }

  const totalDataRows = Math.max(0, cursorRow0 - 2);
  const lastRow0 = Math.max(1, cursorRow0 - 1);
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastRow0, c: colCount - 1 },
  });
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 18 }, // PLANT
    { wch: 15 }, // DATE
    { wch: 14 }, // TIME
    { wch: 18 }, // WATER FLOW M³
    { wch: 22 }, // WATER FLOW IN 4 HOUR (M³)
    { wch: 22 }, // WATER FLOW IN 12 HOUR (M³)
    { wch: 22 }, // WATER FLOW IN 24 HOUR (M³)
    { wch: 22 }, // UPLOADED BY
    { wch: 15 }, // MOTOR NO.
    { wch: 15 }, // MOTOR STATUS
    { wch: 36 }, // REMARKS
  ];
  ws['!rows'] = [
    { hpt: 28 },
    { hpt: 32 },
    ...Array.from({ length: totalDataRows }, () => ({ hpt: 22 })),
  ];
  return ws;
}

/**
 * Builds a fully styled, formula-backed Excel workbook (.xlsx) with:
 * - 1st sheet: "All Plants" combining every plant's readings with live 4H/12H/24H formulas
 * - Subsequent sheets: one tab per individual plant (banner, DATE, TIME, WATER FLOW M³,
 *   4H, merged 12H green, merged 24H blue, UPLOADED BY, MOTOR NO., MOTOR STATUS, REMARKS).
 */
export function buildWaterFlowWorkbook(
  readings: readonly MeterReading[],
  options: BuildWorkbookOptions = {}
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const sheets = buildPlantExcelSheetsData(readings, options);
  const colCount = EXCEL_REPORT_HEADERS.length;

  // 1st Sheet: All Plants
  const usedWorkbookTabNames = new Set<string>();
  const allPlantsTabName = sanitizeWorksheetName('All Plants', usedWorkbookTabNames);
  XLSX.utils.book_append_sheet(workbook, buildAllPlantsWorksheet(sheets), allPlantsTabName);

  for (const sheet of sheets) {
    const uniqueSheetName = sanitizeWorksheetName(sheet.plantName, usedWorkbookTabNames);
    const ws: XLSX.WorkSheet = {};
    const merges: XLSX.Range[] = [];

    // Row 0 (Excel Row 1): Merged Plant Title Banner
    const bannerTitle = sheet.plantName.toUpperCase();
    for (let c = 0; c < colCount; c += 1) {
      setCell(ws, 0, c, {
        t: 's',
        v: c === 0 ? bannerTitle : '',
        s: TITLE_STYLE,
      });
    }
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });

    // Row 1 (Excel Row 2): Column Headers
    for (let c = 0; c < colCount; c += 1) {
      setCell(ws, 1, c, {
        t: 's',
        v: EXCEL_REPORT_HEADERS[c],
        s: HEADER_STYLE,
      });
    }

    // Data rows start at 0-based row 2 (Excel Row 3)
    const dataStartRow0 = 2;

    for (let i = 0; i < sheet.rows.length; i += 1) {
      const row = sheet.rows[i];
      const r0 = dataStartRow0 + i;
      const excelRowNum = r0 + 1; // 1-based Excel row index

      // Col 0 (A): DATE
      setCell(ws, r0, 0, { t: 's', v: row.dateText, s: DATA_CENTER_STYLE });

      // Col 1 (B): TIME
      setCell(ws, r0, 1, { t: 's', v: row.timeText, s: DATA_CENTER_STYLE });

      // Col 2 (C): WATER FLOW M³
      setCell(ws, r0, 2, { t: 'n', v: row.waterFlow, s: DATA_CENTER_STYLE });

      // Col 3 (D): WATER FLOW IN 4 HOUR (M³)
      if (row.delta4h !== null) {
        const formula =
          i === 0 && row.baselineFlowUsed !== null
            ? `MAX(0,C${excelRowNum}-${row.baselineFlowUsed})`
            : `MAX(0,C${excelRowNum}-C${excelRowNum - 1})`;
        setCell(ws, r0, 3, {
          t: 'n',
          v: row.delta4h,
          f: formula,
          s: DATA_CENTER_STYLE,
        });
      } else {
        setCell(ws, r0, 3, { t: 's', v: '', s: DATA_CENTER_STYLE });
      }

      // Col 4 (E) & Col 5 (F) placeholders styled & populated in merge passes below
      setCell(ws, r0, 4, { t: 's', v: '', s: SHIFT_12H_STYLE });
      setCell(ws, r0, 5, { t: 's', v: '', s: DAY_24H_STYLE });

      // Col 6 (G): UPLOADED BY (upload person)
      setCell(ws, r0, 6, {
        t: 's',
        v: row.reading.submittedByName || row.reading.submittedByEmail || '—',
        s: DATA_TEXT_STYLE,
      });

      // Col 7 (H): MOTOR NO.
      setCell(ws, r0, 7, {
        t: 's',
        v: row.reading.motorName || '—',
        s: DATA_TEXT_STYLE,
      });

      // Col 8 (I): MOTOR STATUS
      setCell(ws, r0, 8, {
        t: 's',
        v: row.reading.motorStatus,
        s: DATA_TEXT_STYLE,
      });

      // Col 9 (J): REMARKS
      setCell(ws, r0, 9, {
        t: 's',
        v: row.reading.review || 'Normal operation',
        s: DATA_REMARKS_STYLE,
      });
    }

    // Col 4 (E): 12-HOUR merged blocks (~9:00 PM -> ~9:00 AM and ~9:00 AM -> ~9:00 PM)
    for (const block of sheet.shift12hBlocks) {
      const startR0 = dataStartRow0 + block.startIndex;
      const endR0 = dataStartRow0 + block.endIndex;
      const startExcel = startR0 + 1;
      const endExcel = endR0 + 1;
      const cellStyle = block.hasDelta ? SHIFT_12H_STYLE : SHIFT_12H_BASELINE_STYLE;

      for (let r0 = startR0; r0 <= endR0; r0 += 1) {
        if (r0 === startR0 && block.hasDelta && block.totalFlow !== null) {
          setCell(ws, r0, 4, {
            t: 'n',
            v: block.totalFlow,
            f: `SUM(D${startExcel}:D${endExcel})`,
            s: cellStyle,
          });
        } else {
          setCell(ws, r0, 4, { t: 's', v: '', s: cellStyle });
        }
      }

      if (endR0 > startR0) {
        merges.push({ s: { r: startR0, c: 4 }, e: { r: endR0, c: 4 } });
      }
    }

    // Col 5 (F): 24-HOUR merged blocks (~9:00 PM -> ~9:00 PM operational day)
    for (const block of sheet.day24hBlocks) {
      const startR0 = dataStartRow0 + block.startIndex;
      const endR0 = dataStartRow0 + block.endIndex;
      const startExcel = startR0 + 1;
      const endExcel = endR0 + 1;

      for (let r0 = startR0; r0 <= endR0; r0 += 1) {
        if (r0 === startR0 && block.hasDelta && block.totalFlow !== null) {
          setCell(ws, r0, 5, {
            t: 'n',
            v: block.totalFlow,
            f: `SUM(D${startExcel}:D${endExcel})`,
            s: DAY_24H_STYLE,
          });
        } else {
          setCell(ws, r0, 5, { t: 's', v: '', s: DAY_24H_STYLE });
        }
      }

      if (endR0 > startR0) {
        merges.push({ s: { r: startR0, c: 5 }, e: { r: endR0, c: 5 } });
      }
    }

    const lastRow0 = Math.max(1, dataStartRow0 + sheet.rows.length - 1);
    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: lastRow0, c: colCount - 1 },
    });
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 15 }, // DATE
      { wch: 14 }, // TIME
      { wch: 18 }, // WATER FLOW M³
      { wch: 22 }, // WATER FLOW IN 4 HOUR (M³)
      { wch: 22 }, // WATER FLOW IN 12 HOUR (M³)
      { wch: 22 }, // WATER FLOW IN 24 HOUR (M³)
      { wch: 22 }, // UPLOADED BY
      { wch: 15 }, // MOTOR NO.
      { wch: 15 }, // MOTOR STATUS
      { wch: 36 }, // REMARKS
    ];
    ws['!rows'] = [
      { hpt: 28 }, // Row 1: Plant title banner
      { hpt: 32 }, // Row 2: Wrapped column headers
      ...sheet.rows.map(() => ({ hpt: 22 })),
    ];

    XLSX.utils.book_append_sheet(workbook, ws, uniqueSheetName);
  }

  return workbook;
}

export function serializeWorkbookToArrayBuffer(workbook: XLSX.WorkBook): ArrayBuffer {
  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array;
  if (out instanceof ArrayBuffer) return out;
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

export interface IntervalBlockSpan {
  rowSpan: number;
  totalFlow: number | null;
  hasDelta: boolean;
  label: string;
}

export interface IntervalTableRow {
  row: ComputedPlantRow;
  /** Non-null only on the first row of a 12H shift block (for HTML rowSpan rendering) */
  shift12hSpan: IntervalBlockSpan | null;
  /** True when the row belongs to a 12H block with at least one computed delta */
  shift12hHasDelta: boolean;
  /** Block total available on every row (for mobile card display) */
  shift12hTotal: number | null;
  /** Non-null only on the first row of a 24H operational day block (for HTML rowSpan rendering) */
  day24hSpan: IntervalBlockSpan | null;
  /** Block total available on every row (for mobile card display) */
  day24hTotal: number | null;
}

export interface DashboardIntervalSummary {
  latest4h: number | null;
  latest12h: number | null;
  latest24h: number | null;
  latest4hSubtitle: string;
  latest12hSubtitle: string;
  latest24hSubtitle: string;
  plantCount: number;
}

function formatShiftWindowLabel(shift: ShiftHalf): string {
  return shift === 'AM' ? '9 PM – 9 AM' : '9 AM – 9 PM';
}

/**
 * Transforms a plant's computed rows and merged 12H/24H blocks into rowSpan-ready view rows
 * for rendering an in-app table that mirrors the exported spreadsheet.
 */
export function buildIntervalTableRows(sheet: PlantExcelSheetData): IntervalTableRow[] {
  const shiftStartByIndex = new Map<number, IntervalBlockSpan>();
  const shiftMetaByIndex = new Map<number, { totalFlow: number | null; hasDelta: boolean }>();

  for (const block of sheet.shift12hBlocks) {
    const startRow = sheet.rows[block.startIndex];
    const span: IntervalBlockSpan = {
      rowSpan: block.endIndex - block.startIndex + 1,
      totalFlow: block.totalFlow,
      hasDelta: block.hasDelta,
      label: startRow ? formatShiftWindowLabel(startRow.shift) : '12H Shift',
    };
    shiftStartByIndex.set(block.startIndex, span);
    for (let i = block.startIndex; i <= block.endIndex; i += 1) {
      shiftMetaByIndex.set(i, { totalFlow: block.totalFlow, hasDelta: block.hasDelta });
    }
  }

  const dayStartByIndex = new Map<number, IntervalBlockSpan>();
  const dayTotalByIndex = new Map<number, number | null>();

  for (const block of sheet.day24hBlocks) {
    const startRow = sheet.rows[block.startIndex];
    const span: IntervalBlockSpan = {
      rowSpan: block.endIndex - block.startIndex + 1,
      totalFlow: block.totalFlow,
      hasDelta: block.hasDelta,
      label: startRow?.dateText ?? block.key,
    };
    dayStartByIndex.set(block.startIndex, span);
    for (let i = block.startIndex; i <= block.endIndex; i += 1) {
      dayTotalByIndex.set(i, block.totalFlow);
    }
  }

  return sheet.rows.map((row, idx) => {
    const shiftMeta = shiftMetaByIndex.get(idx);
    return {
      row,
      shift12hSpan: shiftStartByIndex.get(idx) ?? null,
      shift12hHasDelta: shiftMeta?.hasDelta ?? false,
      shift12hTotal: shiftMeta?.totalFlow ?? null,
      day24hSpan: dayStartByIndex.get(idx) ?? null,
      day24hTotal: dayTotalByIndex.get(idx) ?? null,
    };
  });
}

/**
 * Slices a plant's table rows to the most recent `maxDays` operational day blocks without
 * ever splitting a merged 12H or 24H rowSpan block.
 */
export function sliceIntervalTableToRecentDays(
  sheet: PlantExcelSheetData,
  maxDays = 3
): { rows: IntervalTableRow[]; totalRows: number; hiddenRows: number } {
  const allRows = buildIntervalTableRows(sheet);
  if (sheet.day24hBlocks.length <= maxDays) {
    return { rows: allRows, totalRows: allRows.length, hiddenRows: 0 };
  }
  const firstVisibleBlock = sheet.day24hBlocks[sheet.day24hBlocks.length - maxDays];
  const startIndex = firstVisibleBlock.startIndex;
  return {
    rows: allRows.slice(startIndex),
    totalRows: allRows.length,
    hiddenRows: startIndex,
  };
}

/**
 * Computes top-level KPI values for the latest 4H, 12H shift, and 24H operational day flow
 * across one or more plant sheets.
 */
export function buildDashboardIntervalSummary(
  sheets: readonly PlantExcelSheetData[]
): DashboardIntervalSummary {
  const activeSheets = sheets.filter((s) => s.rows.length > 0);
  if (activeSheets.length === 0) {
    return {
      latest4h: null,
      latest12h: null,
      latest24h: null,
      latest4hSubtitle: 'No readings in selected range',
      latest12hSubtitle: 'No 12-hour shift data yet',
      latest24hSubtitle: 'No 24-hour cycle data yet',
      plantCount: 0,
    };
  }

  let sum4h = 0;
  let count4h = 0;
  let sum12h = 0;
  let count12h = 0;
  let sum24h = 0;
  let count24h = 0;

  let single4hMeta = '';
  let single12hMeta = '';
  let single24hMeta = '';

  for (const sheet of activeSheets) {
    // Latest reading with a computed 4H delta
    for (let i = sheet.rows.length - 1; i >= 0; i -= 1) {
      const r = sheet.rows[i];
      if (r.delta4h !== null) {
        sum4h = round2(sum4h + r.delta4h);
        count4h += 1;
        single4hMeta = `${sheet.plantName} · ${r.dateText} ${r.timeText}`;
        break;
      }
    }

    // Latest 12H block with a computed total
    for (let i = sheet.shift12hBlocks.length - 1; i >= 0; i -= 1) {
      const b = sheet.shift12hBlocks[i];
      if (b.hasDelta && b.totalFlow !== null) {
        sum12h = round2(sum12h + b.totalFlow);
        count12h += 1;
        const sampleRow = sheet.rows[b.endIndex];
        single12hMeta = `${sheet.plantName} · ${formatShiftWindowLabel(sampleRow.shift)}`;
        break;
      }
    }

    // Latest 24H block with a computed total
    for (let i = sheet.day24hBlocks.length - 1; i >= 0; i -= 1) {
      const b = sheet.day24hBlocks[i];
      if (b.hasDelta && b.totalFlow !== null) {
        sum24h = round2(sum24h + b.totalFlow);
        count24h += 1;
        const sampleRow = sheet.rows[b.endIndex];
        single24hMeta = `${sheet.plantName} · ${sampleRow.dateText}`;
        break;
      }
    }
  }

  const multiLabel = (count: number, fallback: string) => {
    if (count === 0) return fallback;
    if (activeSheets.length === 1) return '';
    return `Latest across ${count} ${count === 1 ? 'plant' : 'plants'}`;
  };

  return {
    latest4h: count4h > 0 ? sum4h : null,
    latest12h: count12h > 0 ? sum12h : null,
    latest24h: count24h > 0 ? sum24h : null,
    latest4hSubtitle:
      count4h === 0
        ? 'Needs at least 2 readings per plant'
        : activeSheets.length === 1
          ? single4hMeta
          : multiLabel(count4h, 'Needs at least 2 readings'),
    latest12hSubtitle:
      count12h === 0
        ? 'Needs at least 2 readings per plant'
        : activeSheets.length === 1
          ? single12hMeta
          : multiLabel(count12h, 'No 12-hour shift totals yet'),
    latest24hSubtitle:
      count24h === 0
        ? 'Needs at least 2 readings per plant'
        : activeSheets.length === 1
          ? single24hMeta
          : multiLabel(count24h, 'No 24-hour totals yet'),
    plantCount: activeSheets.length,
  };
}

export interface IntervalBarPoint4h {
  id: string;
  /** Compact X-axis label (e.g. "22/11 01:00 AM" or "01.00 AM") */
  axisLabel: string;
  dateText: string;
  timeText: string;
  flow: number;
  meterReading: number;
  uploadedBy: string;
  motorName: string;
  motorStatus: string;
}

export interface IntervalBarPoint12h {
  key: string;
  /** Compact X-axis label (e.g. "22/11 · 9PM–9AM") */
  axisLabel: string;
  dateText: string;
  shift: ShiftHalf;
  shiftLabel: string;
  flow: number;
  readingCount: number;
}

export interface IntervalBarPoint24h {
  key: string;
  /** Compact X-axis label (e.g. "22-11-2026") */
  axisLabel: string;
  dateText: string;
  flow: number;
  readingCount: number;
}

export interface PlantIntervalBarChartData {
  plantName: string;
  bars4h: IntervalBarPoint4h[];
  bars12h: IntervalBarPoint12h[];
  bars24h: IntervalBarPoint24h[];
  total4hCount: number;
  total12hCount: number;
  total24hCount: number;
  hasChartData: boolean;
  baselineReading: {
    dateText: string;
    timeText: string;
    waterFlow: number;
  } | null;
}

export interface BuildIntervalBarChartOptions {
  max4hBars?: number;
  max12hBars?: number;
  max24hBars?: number;
}

function toShortDayMonth(dateText: string): string {
  // Converts "DD-MM-YYYY" -> "DD/MM"
  const parts = dateText.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return dateText;
}

/**
 * Transforms a plant's computed 4H/12H/24H sheet data into structured bar-chart series
 * for Recharts visualization, preserving chronological order and exact shift totals.
 */
export function buildIntervalBarChartData(
  sheet: PlantExcelSheetData,
  options: BuildIntervalBarChartOptions = {}
): PlantIntervalBarChartData {
  const all4h: IntervalBarPoint4h[] = [];
  const distinctDates = new Set<string>();

  for (const row of sheet.rows) {
    if (row.delta4h === null) continue;
    distinctDates.add(row.dateText);
    all4h.push({
      id: row.reading.id,
      axisLabel: row.timeText,
      dateText: row.dateText,
      timeText: row.timeText,
      flow: row.delta4h,
      meterReading: row.waterFlow,
      uploadedBy: row.reading.submittedByName || row.reading.submittedByEmail || '—',
      motorName: row.reading.motorName || '—',
      motorStatus: row.reading.motorStatus,
    });
  }

  // Include short DD/MM prefix on 4H X-axis ticks when spanning multiple dates
  if (distinctDates.size > 1) {
    for (const pt of all4h) {
      pt.axisLabel = `${toShortDayMonth(pt.dateText)} ${pt.timeText}`;
    }
  }

  const all12h: IntervalBarPoint12h[] = [];
  for (const block of sheet.shift12hBlocks) {
    if (!block.hasDelta || block.totalFlow === null) continue;
    const endRow = sheet.rows[block.endIndex];
    const dateText = endRow?.dateText ?? block.key;
    const shift: ShiftHalf = endRow?.shift ?? 'AM';
    const shiftLabel = formatShiftWindowLabel(shift);
    all12h.push({
      key: block.key,
      axisLabel: `${toShortDayMonth(dateText)} ${shift === 'AM' ? '9P–9A' : '9A–9P'}`,
      dateText,
      shift,
      shiftLabel,
      flow: block.totalFlow,
      readingCount: block.endIndex - block.startIndex + 1,
    });
  }

  const all24h: IntervalBarPoint24h[] = [];
  for (const block of sheet.day24hBlocks) {
    if (!block.hasDelta || block.totalFlow === null) continue;
    const endRow = sheet.rows[block.endIndex];
    const dateText = endRow?.dateText ?? block.key;
    all24h.push({
      key: block.key,
      axisLabel: dateText,
      dateText,
      flow: block.totalFlow,
      readingCount: block.endIndex - block.startIndex + 1,
    });
  }

  const sliceTail = <T,>(items: T[], limit?: number): T[] => {
    if (!limit || limit <= 0 || items.length <= limit) return items;
    return items.slice(items.length - limit);
  };

  const bars4h = sliceTail(all4h, options.max4hBars);
  const bars12h = sliceTail(all12h, options.max12hBars);
  const bars24h = sliceTail(all24h, options.max24hBars);

  const firstRow = sheet.rows[0];
  return {
    plantName: sheet.plantName,
    bars4h,
    bars12h,
    bars24h,
    total4hCount: all4h.length,
    total12hCount: all12h.length,
    total24hCount: all24h.length,
    hasChartData: all4h.length > 0 || all12h.length > 0 || all24h.length > 0,
    baselineReading: firstRow
      ? {
          dateText: firstRow.dateText,
          timeText: firstRow.timeText,
          waterFlow: firstRow.waterFlow,
        }
      : null,
  };
}


