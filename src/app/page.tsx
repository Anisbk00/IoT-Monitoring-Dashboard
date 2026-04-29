'use client';

import { useEffect, useRef, useCallback, useState, lazy, Suspense } from 'react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import type { User, Device, SensorReading, RealtimePayload, AlertItem } from '@/lib/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Lazy-load heavy components to reduce initial compilation memory
const AuthScreen = lazy(() =>
  import('@/components/iot/auth-screen').then(m => ({ default: m.AuthScreen }))
);
const Header = lazy(() =>
  import('@/components/iot/header').then(m => ({ default: m.Header }))
);
const Sidebar = lazy(() =>
  import('@/components/iot/sidebar').then(m => ({ default: m.Sidebar }))
);
const Dashboard = lazy(() =>
  import('@/components/iot/dashboard').then(m => ({ default: m.Dashboard }))
);
const DeviceList = lazy(() =>
  import('@/components/iot/device-list').then(m => ({ default: m.DeviceList }))
);
const AlertList = lazy(() =>
  import('@/components/iot/alert-list').then(m => ({ default: m.AlertList }))
);
const SettingsPanel = lazy(() =>
  import('@/components/iot/settings-panel').then(m => ({ default: m.SettingsPanel }))
);
const SimulatorPanel = lazy(() =>
  import('@/components/iot/simulator-panel').then(m => ({ default: m.SimulatorPanel }))
);

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen" role="status" aria-label="Loading">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
    </div>
  );
}

export default function Home() {
  const {
    isAuthenticated,
    setAuth,
    clearAuth,
    currentView,
    setDevices,
    setAlerts,
    addSensorReading,
    setSensorData,
    updateLatestReading,
    updateDeviceStatus,
    addAlert,
    setRealtimeConnected,
  } = useAppStore();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const initializedRef = useRef(false);

  // Track whether we've finished checking the initial session
  // This prevents the login flash (showing AuthScreen while session is loading)
  const [sessionChecked, setSessionChecked] = useState(false);

  // Fetch initial data when authenticated
  const fetchInitialData = useCallback(async () => {
    try {
      const devicesRes = await fetch('/api/devices');
      let devicesData: { devices?: Device[] } | null = null;
      if (devicesRes.ok) {
        devicesData = await devicesRes.json();
        setDevices(devicesData?.devices || []);
      }

      const alertsRes = await fetch('/api/alerts');
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.alerts || []);
      }

      const latestRes = await fetch('/api/data/latest');
      if (latestRes.ok) {
        const latestData = await latestRes.json();
        const readings = latestData.readings || {};
        Object.entries(readings).forEach(([deviceId, reading]) => {
          const r = reading as SensorReading;
          updateLatestReading({
            deviceId,
            temperature: r.temperature,
            co2: r.co2,
            humidity: r.humidity ?? null,
            timestamp: r.timestamp,
          });
        });
      }

      // Fetch historical sensor data for charts (reuse already-parsed devicesData)
      if (devicesData) {
        const deviceList: { deviceId: string }[] = devicesData.devices || [];
        await Promise.all(
          deviceList.map(async (device) => {
            try {
              const historyRes = await fetch(`/api/data/device/${encodeURIComponent(device.deviceId)}?limit=48`);
              if (historyRes.ok) {
                const historyData = await historyRes.json();
                if (historyData.data && historyData.data.length > 0) {
                  setSensorData(device.deviceId, historyData.data);
                }
              }
            } catch {
              // Silently skip failed history fetches
            }
          })
        );
      }
    } catch (err) {
      console.error('Failed to fetch initial data:', err);
    }
  }, [setDevices, setAlerts, setSensorData, updateLatestReading]);

  // Setup Supabase Auth state listener
  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          try {
            const res = await fetch('/api/auth/user');
            if (res.ok) {
              const data = await res.json();
              setAuth(data.user as User);
            } else {
              setAuth({
                id: session.user.id,
                email: session.user.email || '',
                name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || null,
                role: 'user',
                createdAt: session.user.created_at,
              });
            }
          } catch {
            setAuth({
              id: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || null,
              role: 'user',
              createdAt: session.user.created_at,
            });
          }
        } else if (event === 'SIGNED_OUT') {
          clearAuth();
          if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }
          setRealtimeConnected(false);
          initializedRef.current = false;
        }
      }
    );

    // Check for existing session on mount — this is the key to preventing login flash
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user && !initializedRef.current) {
        try {
          const res = await fetch('/api/auth/user');
          if (res.ok) {
            const data = await res.json();
            setAuth(data.user as User);
          } else {
            setAuth({
              id: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || null,
              role: 'user',
              createdAt: session.user.created_at,
            });
          }
        } catch {
          setAuth({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || null,
            role: 'user',
            createdAt: session.user.created_at,
          });
        }
      }
      // Mark session as checked so we know whether to show login or loading
      setSessionChecked(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setAuth, clearAuth, setRealtimeConnected]);

  // Setup Supabase Realtime subscriptions when authenticated
  useEffect(() => {
    if (!isAuthenticated || initializedRef.current) return;
    initializedRef.current = true;

    fetchInitialData();

    const supabase = createClient();

    const channel = supabase
      .channel('sensor-data-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_data' },
        (payload) => {
          const newReading = payload.new as {
            id: string; device_id: string; temperature: number;
            co2: number; humidity: number | null; timestamp: string;
          };
          const realtimePayload: RealtimePayload = {
            deviceId: newReading.device_id,
            temperature: newReading.temperature,
            co2: newReading.co2,
            humidity: newReading.humidity ?? null,
            timestamp: newReading.timestamp,
          };
          updateLatestReading(realtimePayload);
          addSensorReading(newReading.device_id, {
            id: newReading.id,
            deviceId: newReading.device_id,
            temperature: newReading.temperature,
            co2: newReading.co2,
            humidity: newReading.humidity,
            timestamp: newReading.timestamp,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        (payload) => {
          const newAlert = payload.new as {
            id: string; device_id: string; type: string;
            severity: string; message: string; acknowledged: boolean; created_at: string;
          };
          addAlert({
            id: newAlert.id,
            deviceId: newAlert.device_id,
            type: newAlert.type,
            severity: newAlert.severity,
            message: newAlert.message,
            acknowledged: newAlert.acknowledged,
            createdAt: newAlert.created_at,
          } as AlertItem);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'devices' },
        (payload) => {
          const updatedDevice = payload.new as { device_id: string; status: string };
          updateDeviceStatus(updatedDevice.device_id, updatedDevice.status);
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setRealtimeConnected(false);
      initializedRef.current = false;
    };
  }, [isAuthenticated, fetchInitialData, updateLatestReading, addSensorReading, updateDeviceStatus, addAlert, setRealtimeConnected]);

  // While checking session, show loading spinner instead of login page
  // This prevents the "login flash" when a user is already authenticated
  if (!sessionChecked) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <AuthScreen />
      </Suspense>
    );
  }

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'devices':
        return <DeviceList />;
      case 'alerts':
        return <AlertList />;
      case 'settings':
        return <SettingsPanel />;
      case 'simulator':
        return <SimulatorPanel />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Suspense fallback={<LoadingSpinner />}>
        <Header />
      </Suspense>
      <div className="flex flex-1 min-h-0">
        <Suspense fallback={<div className="w-16 md:w-64" />}>
          <Sidebar />
        </Suspense>
        <main className="flex-1 p-3 md:p-6 overflow-y-auto overflow-x-hidden">
          <Suspense fallback={<LoadingSpinner />}>
            {renderContent()}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
