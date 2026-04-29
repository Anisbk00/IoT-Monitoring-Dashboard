export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

/** Alias used throughout the codebase (e.g. store, pages, components). */
export type User = UserProfile;

export interface Device {
  id: string;
  deviceId: string;
  name: string;
  location: string | null;
  status: string;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  claimed?: boolean;
  autoRegistered?: boolean;
}

export interface SensorReading {
  id: string;
  deviceId: string;
  temperature: number;
  co2: number;
  humidity: number | null;
  timestamp: string;
}

export interface AlertItem {
  id: string;
  deviceId: string;
  type: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
  device?: Device;
}

export interface RealtimePayload {
  deviceId: string;
  temperature: number;
  co2: number;
  humidity: number | null;
  timestamp: string;
}

export type ViewMode = 'dashboard' | 'devices' | 'alerts' | 'settings' | 'simulator';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

export interface DashboardStats {
  totalDevices: number;
  onlineDevices: number;
  currentTemp: number;
  currentCo2: number;
  activeAlerts: number;
}
