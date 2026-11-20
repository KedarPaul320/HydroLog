import type {
  AppConfig,
  AuthResponse,
  MeterReading,
  MotorItem,
  MotorStatus,
  PlantItem,
  ReadingFilters,
  User,
  UserRole,
} from '../types';

const TOKEN_STORAGE_KEY = 'hydrolog_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors in restricted frames
  }
}

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => null);
      if (data && typeof data.error === 'string') {
        message = data.error;
      }
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

function buildFilterQuery(filters?: ReadingFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.plant && filters.plant !== 'all') params.set('plant', filters.plant);
  if (filters.motorName && filters.motorName !== 'all') params.set('motorName', filters.motorName);
  if (filters.motorStatus && filters.motorStatus !== 'all') {
    params.set('motorStatus', filters.motorStatus);
  }
  if (filters.userId !== undefined && filters.userId !== 'all') {
    params.set('userId', String(filters.userId));
  }
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.search && filters.search.trim()) params.set('search', filters.search.trim());
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await apiFetch<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(data.token);
    return data;
  },

  async me(): Promise<{ user: User }> {
    return apiFetch<{ user: User }>('/api/auth/me');
  },

  async getConfig(): Promise<AppConfig> {
    return apiFetch<AppConfig>('/api/config');
  },

  async renamePlant(id: number, name: string): Promise<{ plant: PlantItem; config: AppConfig }> {
    return apiFetch<{ plant: PlantItem; config: AppConfig }>(`/api/config/plants/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },

  async createPlant(name: string): Promise<{ plant: PlantItem; config: AppConfig }> {
    return apiFetch<{ plant: PlantItem; config: AppConfig }>('/api/config/plants', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async renameMotor(id: number, name: string): Promise<{ motor: MotorItem; config: AppConfig }> {
    return apiFetch<{ motor: MotorItem; config: AppConfig }>(`/api/config/motors/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },

  async createMotor(name: string): Promise<{ motor: MotorItem; config: AppConfig }> {
    return apiFetch<{ motor: MotorItem; config: AppConfig }>('/api/config/motors', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async getMyReadings(
    filters?: Pick<ReadingFilters, 'plant' | 'motorName' | 'motorStatus' | 'search'>
  ): Promise<MeterReading[]> {
    const qs = buildFilterQuery(filters);
    const data = await apiFetch<{ readings: MeterReading[] }>(`/api/readings/mine${qs}`);
    return data.readings;
  },

  async getAllReadings(filters?: ReadingFilters): Promise<MeterReading[]> {
    const qs = buildFilterQuery(filters);
    const data = await apiFetch<{ readings: MeterReading[] }>(`/api/readings${qs}`);
    return data.readings;
  },

  async createReading(payload: {
    imageFile: File;
    waterFlow: number;
    plant: string;
    motorName: string;
    motorStatus: MotorStatus;
    recordedAt: string;
    review: string;
  }): Promise<MeterReading> {
    const form = new FormData();
    form.append('image', payload.imageFile);
    form.append('waterFlow', String(payload.waterFlow));
    form.append('plant', payload.plant);
    form.append('motorName', payload.motorName);
    form.append('motorStatus', payload.motorStatus);
    form.append('recordedAt', payload.recordedAt);
    form.append('review', payload.review);

    const data = await apiFetch<{ reading: MeterReading }>('/api/readings', {
      method: 'POST',
      body: form,
    });
    return data.reading;
  },

  async updateReading(
    id: number,
    payload: {
      waterFlow: number;
      plant: string;
      motorName: string;
      motorStatus: MotorStatus;
      recordedAt: string;
      review: string;
      imageFile?: File | null;
    }
  ): Promise<MeterReading> {
    const form = new FormData();
    form.append('waterFlow', String(payload.waterFlow));
    form.append('plant', payload.plant);
    form.append('motorName', payload.motorName);
    form.append('motorStatus', payload.motorStatus);
    form.append('recordedAt', payload.recordedAt);
    form.append('review', payload.review);
    if (payload.imageFile) {
      form.append('image', payload.imageFile);
    }

    const data = await apiFetch<{ reading: MeterReading }>(`/api/readings/${id}`, {
      method: 'PUT',
      body: form,
    });
    return data.reading;
  },

  async deleteReading(id: number): Promise<void> {
    await apiFetch<{ deletedId: number }>(`/api/readings/${id}`, {
      method: 'DELETE',
    });
  },

  async getUsers(): Promise<User[]> {
    const data = await apiFetch<{ users: User[] }>('/api/users');
    return data.users;
  },

  async createUser(payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }): Promise<User> {
    const data = await apiFetch<{ user: User }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.user;
  },

  async deleteUser(id: number): Promise<void> {
    await apiFetch<{ deletedId: number }>(`/api/users/${id}`, {
      method: 'DELETE',
    });
  },

  async exportReadingsXlsx(filters?: ReadingFilters): Promise<string> {
    const token = getStoredToken();
    const params = new URLSearchParams();
    if (filters?.plant && filters.plant !== 'all') params.set('plant', filters.plant);
    if (filters?.motorName && filters.motorName !== 'all') params.set('motorName', filters.motorName);
    if (filters?.motorStatus && filters.motorStatus !== 'all') {
      params.set('motorStatus', filters.motorStatus);
    }
    if (filters?.userId !== undefined && filters.userId !== 'all') {
      params.set('userId', String(filters.userId));
    }
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.search && filters.search.trim()) params.set('search', filters.search.trim());
    params.set('tzOffset', String(new Date().getTimezoneOffset()));
    const qs = `?${params.toString()}`;

    const res = await fetch(`/api/readings/export${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      let msg = `Export failed (${res.status})`;
      try {
        const err = await res.json();
        if (err?.error) msg = err.error;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `water-meter-readings.xlsx`;

    const androidBridge = (
      window as unknown as {
        HydroLogAndroid?: {
          saveBase64File?: (base64Data: string, filename: string, mimeType: string) => boolean;
        };
      }
    ).HydroLogAndroid;

    if (androidBridge?.saveBase64File) {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      const saved = androidBridge.saveBase64File(
        base64,
        filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      if (saved) {
        return filename;
      }
    }

    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);

    return filename;
  },
};
