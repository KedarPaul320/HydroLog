import type {
  AppRoute,
  DailyFlowBucket,
  DashboardSummary,
  MeterReading,
  MotorStatus,
  PlantBreakdown,
  ReadingFilters,
  UserRole,
} from '../types.ts';
import { DEFAULT_PLANTS, MOTOR_STATUSES } from '../types.ts';

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

export function canAccessRoute(role: UserRole, route: AppRoute): boolean {
  if (role === 'admin') {
    return true;
  }
  const userAllowed: readonly AppRoute[] = [
    'user-home',
    'submit-reading',
    'my-records',
    'android-guide',
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
  // JS getTimezoneOffset() is (UTC - local) in minutes, so local wall clock = UTC - offset
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
