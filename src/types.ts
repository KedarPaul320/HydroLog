export type UserRole = 'admin' | 'user';

export type PlantName = string;

export type MotorStatus = 'Running' | 'Stopped';

export const MOTOR_STATUSES: readonly MotorStatus[] = ['Running', 'Stopped'] as const;

export const DEFAULT_PLANTS: readonly string[] = ['Plant A', 'Plant B', 'Plant C'] as const;
export const DEFAULT_MOTORS: readonly string[] = ['Motor 1', 'Motor 2', 'Motor 3'] as const;

export interface PlantItem {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MotorItem {
  id: string;
  name: string;
  sortOrder: number;
}

export interface AppConfig {
  plants: PlantItem[];
  motors: MotorItem[];
}

export type AppRoute =
  | 'user-home'
  | 'submit-reading'
  | 'my-records'
  | 'admin-dashboard'
  | 'all-records'
  | 'user-management'
  | 'plants-motors'
  | 'android-guide';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  readingCount?: number;
}

export interface PlantMotorState {
  plantId: string;
  plantName: string;
  activeMotorName: string;
  activeReadingId: string;
  previousStoppedMotor: string;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string;
}

export interface MeterReading {
  id: string;
  photoId: string;
  imageUrl: string;
  waterFlow: number;
  recordedAt: string;
  plant: PlantName;
  motorName: string;
  motorStatus: MotorStatus;
  review: string;
  submittedBy: string;
  submittedByName: string;
  submittedByEmail: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  autoStoppedMotor?: string;
}

export interface ReadingFilters {
  plant?: string | 'all';
  motorName?: string | 'all';
  motorStatus?: MotorStatus | 'all';
  userId?: string | 'all';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface PlantBreakdown {
  plant: string;
  totalFlow: number;
  readingCount: number;
  sharePercent: number;
}

export interface DailyFlowBucket {
  date: string;
  label: string;
  totalFlow: number;
  readingCount: number;
}

export interface DashboardSummary {
  totalFlow: number;
  readingCount: number;
  averageFlow: number;
  abnormalCount: number;
  runningCount: number;
  stoppedCount: number;
  plantBreakdown: PlantBreakdown[];
  dailyTrend: DailyFlowBucket[];
}

export interface PlantTrendSeries {
  plant: string;
  dataKey: string;
  color: string;
  totalFlow: number;
  readingCount: number;
  activeDays: number;
  peakFlow: number;
}

export interface PlantUsageTrendPoint {
  date: string;
  label: string;
  totalFlow: number;
  readingCount: number;
  [seriesKey: string]: string | number;
}

export interface PlantUsageTrendData {
  series: PlantTrendSeries[];
  points: PlantUsageTrendPoint[];
  totalFlow: number;
  activeDays: number;
  startDate: string;
  endDate: string;
  hasAnyData: boolean;
}

export interface AuthResponse {
  user: User;
}
