import { create } from 'zustand';
import type { User, Device, SensorReading, AlertItem, ViewMode, RealtimePayload } from './types';

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (user: User) => void;
  clearAuth: () => void;

  // Navigation
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;

  // Devices
  devices: Device[];
  setDevices: (devices: Device[]) => void;
  addDevice: (device: Device) => void;
  updateDeviceStatus: (deviceId: string, status: string) => void;

  // Sensor Data
  sensorData: Map<string, SensorReading[]>;
  latestReadings: Map<string, RealtimePayload>;
  addSensorReading: (deviceId: string, reading: SensorReading) => void;
  setSensorData: (deviceId: string, readings: SensorReading[]) => void;
  updateLatestReading: (payload: RealtimePayload) => void;

  // Alerts
  alerts: AlertItem[];
  setAlerts: (alerts: AlertItem[]) => void;
  addAlert: (alert: AlertItem) => void;
  acknowledgeAlert: (alertId: string) => void;

  // Realtime connection
  isRealtimeConnected: boolean;
  setRealtimeConnected: (connected: boolean) => void;

  // Loading states
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth
  user: null,
  isAuthenticated: false,
  setAuth: (user) => {
    set({ user, isAuthenticated: true });
  },
  clearAuth: () => {
    set({ user: null, isAuthenticated: false, devices: [], alerts: [], sensorData: new Map(), latestReadings: new Map(), currentView: 'dashboard', isRealtimeConnected: false, isLoading: false });
  },

  // Navigation
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),

  // Devices
  devices: [],
  setDevices: (devices) => set({ devices }),
  addDevice: (device) => set((state) => ({ devices: [...state.devices, device] })),
  updateDeviceStatus: (deviceId, status) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.deviceId === deviceId ? { ...d, status, updatedAt: new Date().toISOString() } : d
      ),
    })),

  // Sensor Data
  sensorData: new Map(),
  latestReadings: new Map(),
  addSensorReading: (deviceId, reading) =>
    set((state) => {
      const newMap = new Map(state.sensorData);
      const existing = newMap.get(deviceId) || [];
      newMap.set(deviceId, [...existing.slice(-99), reading]);
      return { sensorData: newMap };
    }),
  setSensorData: (deviceId, readings) =>
    set((state) => {
      const newMap = new Map(state.sensorData);
      newMap.set(deviceId, readings);
      return { sensorData: newMap };
    }),
  updateLatestReading: (payload) =>
    set((state) => {
      const newMap = new Map(state.latestReadings);
      newMap.set(payload.deviceId, payload);
      return { latestReadings: newMap };
    }),

  // Alerts
  alerts: [],
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) => set((state) => ({ alerts: [alert, ...state.alerts] })),
  acknowledgeAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a
      ),
    })),

  // Realtime connection
  isRealtimeConnected: false,
  setRealtimeConnected: (connected) => set({ isRealtimeConnected: connected }),

  // Loading states
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),
}));
