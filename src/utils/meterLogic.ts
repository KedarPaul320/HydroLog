import type {
  AppRoute,
  DailyFlowBucket,
  DashboardSummary,
  MeterReading,
  MotorStatus,
  PlantBreakdown,
  PlantMotorState,
  PlantTrendSeries,
  PlantUsageTrendData,
  PlantUsageTrendPoint,
  ReadingFilters,
  UserRole,
} from '../types.ts';
import { DEFAULT_PLANTS, MOTOR_STATUSES } from '../types.ts';

export const RETENTION_DAYS = 45;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const RETENTION_MS = RETENTION_DAYS * MS_PER_DAY;

export interface ReadingInputPayload {
  waterFlow: string | number;
  plant: string;
  motorName: string;
  motorStatus: string;
  recordedAt: string;
  review?: string;
  hasImage: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  parsedFlow: number | null;
}

export function isValidMotorStatus(value: string): value is MotorStatus {
  return (MOTOR_STATUSES as readonly string[]).includes(value);
}

export interface MotorInterlockDecision {
  currentlyRunningMotor: string | null;
  isSameMotorAlreadyRunning: boolean;
  isDifferentMotorRunning: boolean;
  willAutoStopPreviousMotor: boolean;
  motorToAutoStop: string | null;
  nextActiveMotorName: string;
}

/**
 * Enforces the single-motor-per-plant interlock:
 * Only one motor may run in a given plant at any time. Starting a different motor in the
 * same plant automatically stops the previously running motor; recording a Stopped reading
 * on an idle motor leaves the currently running motor untouched.
 */
export function evaluateMotorInterlock(
  currentState: Pick<PlantMotorState, 'activeMotorName'> | null | undefined,
  selectedMotorName: string,
  desiredStatus: MotorStatus
): MotorInterlockDecision {
  const activeMotor = (currentState?.activeMotorName ?? '').trim();
  const targetMotor = selectedMotorName.trim();
  const currentlyRunningMotor = activeMotor || null;
  const isSameMotorAlreadyRunning = Boolean(currentlyRunningMotor && currentlyRunningMotor === targetMotor);
  const isDifferentMotorRunning = Boolean(currentlyRunningMotor && currentlyRunningMotor !== targetMotor);

  if (desiredStatus === 'Running') {
    return {
      currentlyRunningMotor,
      isSameMotorAlreadyRunning,
      isDifferentMotorRunning,
      willAutoStopPreviousMotor: isDifferentMotorRunning,
      motorToAutoStop: isDifferentMotorRunning ? currentlyRunningMotor : null,
      nextActiveMotorName: targetMotor,
    };
  }

  // desiredStatus === 'Stopped'
  return {
    currentlyRunningMotor,
    isSameMotorAlreadyRunning,
    isDifferentMotorRunning,
    willAutoStopPreviousMotor: false,
    motorToAutoStop: null,
    nextActiveMotorName: isSameMotorAlreadyRunning ? '' : activeMotor,
  };
}

export function getPlantMotorState(
  states: readonly PlantMotorState[],
  plantName: string
): PlantMotorState | undefined {
  const needle = plantName.trim().toLowerCase();
  return states.find((s) => s.plantName.trim().toLowerCase() === needle);
}

/**
 * Identifies readings still marked "Running" even though their plant's live interlock state
 * shows all motors stopped, a different motor running, or a newer active reading taking over.
 */
export function findStaleRunningReadingIds(
  readings: readonly Pick<MeterReading, 'id' | 'plant' | 'motorName' | 'motorStatus'>[],
  states: readonly PlantMotorState[]
): string[] {
  const staleIds: string[] = [];
  for (const r of readings) {
    if (r.motorStatus !== 'Running') continue;
    const state = getPlantMotorState(states, r.plant);
    if (!state) continue;
    const activeMotor = state.activeMotorName.trim();
    const activeReadingId = state.activeReadingId.trim();
    if (!activeMotor) {
      staleIds.push(r.id);
    } else if (
      r.motorName.trim().toLowerCase() !== activeMotor.toLowerCase() ||
      (activeReadingId && r.id !== activeReadingId)
    ) {
      staleIds.push(r.id);
    }
  }
  return staleIds;
}

export function applyPlantMotorStatesToReadings(
  readings: readonly MeterReading[],
  states: readonly PlantMotorState[]
): MeterReading[] {
  if (states.length === 0) return [...readings];
  const staleSet = new Set(findStaleRunningReadingIds(readings, states));
  if (staleSet.size === 0) return [...readings];
  return readings.map((r) => (staleSet.has(r.id) ? { ...r, motorStatus: 'Stopped' } : r));
}

export function buildPlantMotorStatesSignature(states: readonly PlantMotorState[]): string {
  return [...states]
    .sort((a, b) => a.plantId.localeCompare(b.plantId))
    .map(
      (s) =>
        `${s.plantId}:${s.activeMotorName}:${s.activeReadingId}:${s.previousStoppedMotor}:${s.updatedAt}`
    )
    .join('|');
}

/**
 * Computes the exact Day-46 expiration timestamp (45 full days after upload).
 * Records are kept throughout all 45 days and permanently deleted once entering Day 46.
 */
export function computeExpiresAtIso(uploadedAtIso: string): string {
  const uploadedMs = Date.parse(uploadedAtIso);
  const baseMs = Number.isNaN(uploadedMs) ? Date.now() : uploadedMs;
  return new Date(baseMs + RETENTION_MS).toISOString();
}

/**
 * Returns true once a record has completed its 45th day from upload and entered its 46th day.
 */
export function isRecordExpiredOnDay46(
  uploadedAtIso: string,
  expiresAtIso?: string | null,
  nowMs: number = Date.now()
): boolean {
  const explicitExpiryMs = expiresAtIso ? Date.parse(expiresAtIso) : Number.NaN;
  const expiryMs = !Number.isNaN(explicitExpiryMs)
    ? explicitExpiryMs
    : Date.parse(uploadedAtIso) + RETENTION_MS;

  if (Number.isNaN(expiryMs)) return false;
  return nowMs >= expiryMs;
}

export function getRetentionDaysRemaining(
  uploadedAtIso: string,
  expiresAtIso?: string | null,
  nowMs: number = Date.now()
): number {
  const explicitExpiryMs = expiresAtIso ? Date.parse(expiresAtIso) : Number.NaN;
  const expiryMs = !Number.isNaN(explicitExpiryMs)
    ? explicitExpiryMs
    : Date.parse(uploadedAtIso) + RETENTION_MS;

  if (Number.isNaN(expiryMs) || nowMs >= expiryMs) return 0;
  return Math.ceil((expiryMs - nowMs) / MS_PER_DAY);
}

export function filterActiveReadings(
  readings: readonly MeterReading[],
  nowMs: number = Date.now()
): MeterReading[] {
  return readings.filter((r) => !isRecordExpiredOnDay46(r.createdAt, r.expiresAt, nowMs));
}

export function validateReadingInput(
  input: ReadingInputPayload,
  requireImage = true,
  allowedPlants?: readonly string[],
  allowedMotors?: readonly string[]
): ValidationResult {
  const errors: Record<string, string> = {};

  const rawFlow =
    typeof input.waterFlow === 'number'
      ? input.waterFlow
      : Number(String(input.waterFlow).trim());

  let parsedFlow: number | null = null;
  if (
    String(input.waterFlow).trim() === '' ||
    !Number.isFinite(rawFlow) ||
    rawFlow <= 0
  ) {
    errors.waterFlow = 'Enter a valid water flow greater than 0 m³.';
  } else if (rawFlow > 1_000_000) {
    errors.waterFlow = 'Water flow exceeds maximum single reading limit (1,000,000 m³).';
  } else {
    parsedFlow = Math.round(rawFlow * 100) / 100;
  }

  const trimmedPlant = (input.plant ?? '').trim();
  if (!trimmedPlant || (allowedPlants && allowedPlants.length > 0 && !allowedPlants.includes(trimmedPlant))) {
    errors.plant = 'Select a valid plant.';
  }

  const trimmedMotor = (input.motorName ?? '').trim();
  if (!trimmedMotor || (allowedMotors && allowedMotors.length > 0 && !allowedMotors.includes(trimmedMotor))) {
    errors.motorName = 'Select a valid motor.';
  }

  if (!isValidMotorStatus(input.motorStatus)) {
    errors.motorStatus = 'Select motor status (Running or Stopped).';
  }

  if (!input.recordedAt || Number.isNaN(Date.parse(input.recordedAt))) {
    errors.recordedAt = 'Provide a valid reading date and time.';
  }

  if (requireImage && !input.hasImage) {
    errors.image = 'Capture or upload a meter photo as evidence.';
  }

  if (input.review && input.review.length > 500) {
    errors.review = 'Remarks must be 500 characters or fewer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    parsedFlow,
  };
}

export function hasAbnormalityRemark(review: string | null | undefined): boolean {
  const cleaned = (review ?? '').trim().toLowerCase();
  if (!cleaned) return false;
  const nominalPhrases = new Set([
    'normal',
    'normal operation',
    'ok',
    'no issues',
    'none',
    'nominal',
    'all clear',
    'no abnormalities',
    'n/a',
    '-',
  ]);
  return !nominalPhrases.has(cleaned);
}

export function filterReadings(
  readings: readonly MeterReading[],
  filters: ReadingFilters
): MeterReading[] {
  const searchLower = (filters.search ?? '').trim().toLowerCase();

  return readings.filter((r) => {
    if (filters.plant && filters.plant !== 'all' && r.plant !== filters.plant) {
      return false;
    }

    if (filters.motorName && filters.motorName !== 'all' && r.motorName !== filters.motorName) {
      return false;
    }

    if (filters.motorStatus && filters.motorStatus !== 'all' && r.motorStatus !== filters.motorStatus) {
      return false;
    }

    if (
      filters.userId !== undefined &&
      filters.userId !== 'all' &&
      r.submittedBy !== filters.userId
    ) {
      return false;
    }

    const recordDate = r.recordedAt.slice(0, 10);
    if (filters.dateFrom && recordDate < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && recordDate > filters.dateTo) {
      return false;
    }

    if (searchLower) {
      const haystack = `${r.plant} ${r.motorName} ${r.motorStatus} ${r.submittedByName} ${r.review} ${r.waterFlow} ${r.recordedAt}`.toLowerCase();
      if (!haystack.includes(searchLower)) {
        return false;
      }
    }

    return true;
  });
}

export function computeDashboardSummary(
  readings: readonly MeterReading[],
  plantNames?: readonly string[]
): DashboardSummary {
  const readingCount = readings.length;
  const totalFlowRaw = readings.reduce((acc, r) => acc + r.waterFlow, 0);
  const totalFlow = Math.round(totalFlowRaw * 100) / 100;
  const averageFlow =
    readingCount > 0 ? Math.round((totalFlowRaw / readingCount) * 100) / 100 : 0;
  const abnormalCount = readings.filter((r) => hasAbnormalityRemark(r.review)).length;
  const runningCount = readings.filter((r) => r.motorStatus === 'Running').length;
  const stoppedCount = readings.filter((r) => r.motorStatus === 'Stopped').length;

  const uniquePlants: string[] = [];
  const basePlants = plantNames && plantNames.length > 0 ? plantNames : DEFAULT_PLANTS;
  for (const name of basePlants) {
    if (!uniquePlants.includes(name)) uniquePlants.push(name);
  }
  for (const r of readings) {
    if (!uniquePlants.includes(r.plant)) uniquePlants.push(r.plant);
  }

  const plantBreakdown: PlantBreakdown[] = uniquePlants.map((plant) => {
    const items = readings.filter((r) => r.plant === plant);
    const plantTotal = Math.round(items.reduce((acc, r) => acc + r.waterFlow, 0) * 100) / 100;
    const sharePercent =
      totalFlowRaw > 0 ? Math.round((plantTotal / totalFlowRaw) * 1000) / 10 : 0;
    return {
      plant,
      totalFlow: plantTotal,
      readingCount: items.length,
      sharePercent,
    };
  });

  const bucketMap = new Map<string, { totalFlow: number; readingCount: number }>();
  for (const r of readings) {
    const dayKey = r.recordedAt.slice(0, 10);
    const current = bucketMap.get(dayKey) ?? { totalFlow: 0, readingCount: 0 };
    current.totalFlow = Math.round((current.totalFlow + r.waterFlow) * 100) / 100;
    current.readingCount += 1;
    bucketMap.set(dayKey, current);
  }

  const dailyTrend: DailyFlowBucket[] = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, stats]) => ({
      date,
      label: formatShortDate(date),
      totalFlow: stats.totalFlow,
      readingCount: stats.readingCount,
    }));

  return {
    totalFlow,
    readingCount,
    averageFlow,
    abnormalCount,
    runningCount,
    stoppedCount,
    plantBreakdown,
    dailyTrend,
  };
}

export const PLANT_CHART_COLORS: readonly string[] = [
  '#0369a1', // Deep Sky
  '#0f766e', // Teal
  '#d97706', // Amber
  '#4f46e5', // Indigo
  '#be123c', // Rose
  '#475569', // Slate
] as const;

function parseYyyyMmDdToUtcMs(yyyyMmDd: string): number | null {
  const parts = yyyyMmDd.split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const ms = Date.UTC(year, month - 1, day);
  return Number.isNaN(ms) ? null : ms;
}

function formatUtcMsAsYyyyMmDd(utcMs: number): string {
  const d = new Date(utcMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function extractReadingDateKey(recordedAt: string): string {
  const trimmed = (recordedAt ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return toLocalDateInputValue(parsed);
  }
  return trimmed.slice(0, 10);
}

/**
 * Aggregates daily water flow (m³) per plant across a continuous rolling window
 * (default: last 30 calendar days inclusive), zero-filling days without entries.
 */
export function buildPlantUsageTrend(
  readings: readonly MeterReading[],
  plantNames?: readonly string[],
  options?: { days?: number; referenceDate?: Date; endDateKey?: string }
): PlantUsageTrendData {
  const days = Math.max(1, Math.floor(options?.days ?? 30));
  const resolvedEndKey =
    options?.endDateKey && /^\d{4}-\d{2}-\d{2}$/.test(options.endDateKey)
      ? options.endDateKey
      : toLocalDateInputValue(options?.referenceDate ?? new Date());
  const endUtcMs =
    parseYyyyMmDdToUtcMs(resolvedEndKey) ??
    parseYyyyMmDdToUtcMs(toLocalDateInputValue(new Date()))!;

  const uniquePlants: string[] = [];
  const basePlants = plantNames && plantNames.length > 0 ? plantNames : DEFAULT_PLANTS;
  for (const name of basePlants) {
    const clean = name.trim();
    if (clean && !uniquePlants.includes(clean)) uniquePlants.push(clean);
  }
  for (const r of readings) {
    const clean = r.plant.trim();
    if (clean && !uniquePlants.includes(clean)) uniquePlants.push(clean);
  }

  const plantKeyByLower = new Map<string, string>();
  const seriesMeta: PlantTrendSeries[] = uniquePlants.map((plant, idx) => {
    const dataKey = `plant_${idx}`;
    plantKeyByLower.set(plant.toLowerCase(), dataKey);
    return {
      plant,
      dataKey,
      color: PLANT_CHART_COLORS[idx % PLANT_CHART_COLORS.length],
      totalFlow: 0,
      readingCount: 0,
      activeDays: 0,
      peakFlow: 0,
    };
  });

  const points: PlantUsageTrendPoint[] = [];
  const pointByDate = new Map<string, PlantUsageTrendPoint>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dayKey = formatUtcMsAsYyyyMmDd(endUtcMs - offset * MS_PER_DAY);
    const point: PlantUsageTrendPoint = {
      date: dayKey,
      label: formatShortDate(dayKey),
      totalFlow: 0,
      readingCount: 0,
    };
    for (const s of seriesMeta) {
      point[s.dataKey] = 0;
    }
    points.push(point);
    pointByDate.set(dayKey, point);
  }

  const seriesByKey = new Map<string, PlantTrendSeries>(
    seriesMeta.map((s) => [s.dataKey, s])
  );

  for (const reading of readings) {
    const dayKey = extractReadingDateKey(reading.recordedAt);
    const bucket = pointByDate.get(dayKey);
    if (!bucket) continue;

    const dataKey = plantKeyByLower.get(reading.plant.trim().toLowerCase());
    if (!dataKey) continue;

    const flow = Number.isFinite(reading.waterFlow) ? reading.waterFlow : 0;
    const prevPlantVal = Number(bucket[dataKey] ?? 0);
    const nextPlantVal = Math.round((prevPlantVal + flow) * 100) / 100;
    bucket[dataKey] = nextPlantVal;
    bucket.totalFlow = Math.round((bucket.totalFlow + flow) * 100) / 100;
    bucket.readingCount += 1;

    const s = seriesByKey.get(dataKey);
    if (s) {
      s.totalFlow = Math.round((s.totalFlow + flow) * 100) / 100;
      s.readingCount += 1;
    }
  }

  let grandTotalFlow = 0;
  let activeDays = 0;
  for (const point of points) {
    if (point.readingCount > 0) {
      activeDays += 1;
    }
    grandTotalFlow = Math.round((grandTotalFlow + point.totalFlow) * 100) / 100;
    for (const s of seriesMeta) {
      const val = Number(point[s.dataKey] ?? 0);
      if (val > 0) {
        s.activeDays += 1;
        if (val > s.peakFlow) {
          s.peakFlow = val;
        }
      }
    }
  }

  return {
    series: seriesMeta,
    points,
    totalFlow: grandTotalFlow,
    activeDays,
    startDate: points[0]?.date ?? resolvedEndKey,
    endDate: points[points.length - 1]?.date ?? resolvedEndKey,
    hasAnyData: activeDays > 0,
  };
}

export function canAccessRoute(role: UserRole, route: AppRoute): boolean {
  if (role === 'admin') {
    return true;
  }
  const userAllowed: readonly AppRoute[] = [
    'user-home',
    'submit-reading',
    'my-records',
  ];
  return userAllowed.includes(route);
}

export function canEditRecord(role: UserRole): boolean {
  return role === 'admin';
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin';
}

export function canManageConfig(role: UserRole): boolean {
  return role === 'admin';
}

export function canExportRecords(role: UserRole): boolean {
  return role === 'admin';
}

export function getDefaultRouteForRole(role: UserRole): AppRoute {
  return role === 'admin' ? 'admin-dashboard' : 'user-home';
}

/**
 * Returns true only when running inside the packaged HydroLog Android app WebView
 * (detected via the injected HydroLogAndroid JS bridge or HydroLogAndroid/<version> User-Agent),
 * returning false for desktop and mobile web browsers.
 */
export function isAndroidAppRuntime(userAgent: string, hasAndroidBridge: boolean): boolean {
  if (hasAndroidBridge) return true;
  return /HydroLogAndroid\b/i.test(userAgent ?? '');
}

export function formatFlow(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatShortDate(yyyyMmDd: string): string {
  const parts = yyyyMmDd.split('-');
  if (parts.length !== 3) return yyyyMmDd;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return yyyyMmDd;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function toLocalDateInputValue(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toLocalTimeInputValue(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function combineDateAndTime(dateStr: string, timeStr: string): string {
  const cleanDate = dateStr.trim();
  const cleanTime = timeStr.trim();
  if (!cleanDate || !cleanTime) return '';
  return `${cleanDate}T${cleanTime}`;
}

export function splitIsoToLocalDateAndTime(iso: string): { date: string; time: string } {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return {
      date: toLocalDateInputValue(now),
      time: toLocalTimeInputValue(now),
    };
  }
  return {
    date: toLocalDateInputValue(parsed),
    time: toLocalTimeInputValue(parsed),
  };
}

function getShiftedUtcDate(iso: string, tzOffsetMinutes = 0): Date | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() - tzOffsetMinutes * 60_000);
}

export function formatExcelDate(iso: string, tzOffsetMinutes = 0): string {
  const shifted = getShiftedUtcDate(iso, tzOffsetMinutes);
  if (!shifted) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(shifted.getUTCDate());
  const month = pad(shifted.getUTCMonth() + 1);
  const year = shifted.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export function formatExcelTime12h(iso: string, tzOffsetMinutes = 0): string {
  const shifted = getShiftedUtcDate(iso, tzOffsetMinutes);
  if (!shifted) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours24 = shifted.getUTCHours();
  const minutes = pad(shifted.getUTCMinutes());
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${pad(hours12)}:${minutes} ${meridiem}`;
}


