export type UserRole = 'admin' | 'user';

export type PlantName = string;

export type MotorStatus = 'Running' | 'Stopped';

export const MOTOR_STATUSES: readonly MotorStatus[] = ['Running', 'Stopped'] as const;

export const DEFAULT_PLANTS: readonly string[] = ['Plant A', 'Plant B', 'Plant C'] as const;
export const DEFAULT_MOTORS: readonly string[] = ['Motor 1', 'Motor 2', 'Motor 3'] as const;

export interface PlantItem {
  id: number;
  name: string;
  sortOrder: number;
}

export interface MotorItem {
  id: number;
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
  id: number;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  readingCount?: number;
}

export interface MeterReading {
  id: number;
  imageUrl: string;
  waterFlow: number;
  recordedAt: string;
  plant: PlantName;
  motorName: string;
  motorStatus: MotorStatus;
  review: string;
  submittedBy: number;
  submittedByName: string;
  submittedByEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingFilters {
  plant?: string | 'all';
  motorName?: string | 'all';
  motorStatus?: MotorStatus | 'all';
  userId?: number | 'all';
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

export interface AuthResponse {
  token: string;
  user: User;
}
