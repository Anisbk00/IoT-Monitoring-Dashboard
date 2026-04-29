'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Square,
  Plus,
  Trash2,
  Thermometer,
  Wind,
  Droplets,
  Radio,
  Activity,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/lib/store';

// === Types ============================================================
interface SimDevice {
  id: string;
  deviceId: string;
  secret: string;
  name: string;
  running: boolean;
  sendCount: number;
  errorCount: number;
  tempBaseline: number;
  humBaseline: number;
  co2Baseline: number;
}

// === Helpers (pure functions outside component) =======================
function randomHex(len: number): string {
  const chars = '0123456789ABCDEF';
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * 16)];
  return result;
}

function createSimDevice(name?: string): SimDevice {
  const hex = randomHex(6);
  return {
    id: crypto.randomUUID(),
    deviceId: `ESP32-SIM${hex}`,
    secret: randomHex(24),
    name: name || `Sim Device ${hex.slice(0, 4)}`,
    running: false,
    sendCount: 0,
    errorCount: 0,
    tempBaseline: 22 + Math.random() * 6,
    humBaseline: 40 + Math.random() * 20,
    co2Baseline: 300 + Math.random() * 400,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

async function apiRegisterDevice(device: SimDevice): Promise<boolean> {
  try {
    const res = await fetch('/api/simulator/auto-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: device.deviceId, secret: device.secret }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function apiSendSensorData(device: SimDevice, errorRate: number): Promise<boolean> {
  const temp = device.tempBaseline + (Math.random() - 0.5) * 1.5;
  const hum = device.humBaseline + (Math.random() - 0.5) * 4;
  const co2 = Math.round(device.co2Baseline + (Math.random() - 0.5) * 100);

  const isError = Math.random() * 100 < errorRate;
  let payload: Record<string, unknown>;

  if (isError) {
    const errType = Math.random();
    if (errType < 0.33) {
      payload = { deviceId: device.deviceId, temperature: 0, co2, humidity: null };
    } else if (errType < 0.66) {
      payload = { deviceId: device.deviceId, temperature: round1(temp), co2: 0, humidity: round1(hum) };
    } else {
      payload = { deviceId: device.deviceId, temperature: 0, co2: 0, humidity: null };
    }
  } else {
    payload = {
      deviceId: device.deviceId,
      temperature: round1(temp),
      co2,
      humidity: round1(hum),
    };
  }

  try {
    const res = await fetch('/api/simulator/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// === Component ========================================================
export function SimulatorPanel() {
  const [simDevices, setSimDevices] = useState<SimDevice[]>([]);
  const [sendInterval, setSendInterval] = useState(5);
  const [errorRate, setErrorRate] = useState(5);
  const [isGlobalRunning, setIsGlobalRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const devicesRef = useRef<SimDevice[]>(simDevices);
  const errorRateRef = useRef(errorRate);

  // Keep refs in sync
  useEffect(() => {
    devicesRef.current = simDevices;
  }, [simDevices]);

  useEffect(() => {
    errorRateRef.current = errorRate;
  }, [errorRate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const addDevice = () => {
    setSimDevices(prev => [...prev, createSimDevice()]);
  };

  const removeDevice = (id: string) => {
    setSimDevices(prev => prev.filter(d => d.id !== id));
  };

  const updateDevice = (id: string, updates: Partial<SimDevice>) => {
    setSimDevices(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const startSimulation = async () => {
    // Register all devices first
    for (const device of devicesRef.current) {
      await apiRegisterDevice(device);
      updateDevice(device.id, { running: true });
    }

    setIsGlobalRunning(true);

    // Start sending data
    intervalRef.current = setInterval(async () => {
      const currentDevices = devicesRef.current;
      const currentErrorRate = errorRateRef.current;

      for (const device of currentDevices) {
        if (!device.running) continue;

        // Update baselines (random walk) — mutate ref for next cycle
        device.tempBaseline += (Math.random() - 0.5) * 0.3;
        device.tempBaseline = Math.max(18, Math.min(38, device.tempBaseline));
        device.humBaseline += (Math.random() - 0.5) * 1;
        device.humBaseline = Math.max(25, Math.min(75, device.humBaseline));
        device.co2Baseline += (Math.random() - 0.5) * 30;
        device.co2Baseline = Math.max(100, Math.min(1200, device.co2Baseline));

        const success = await apiSendSensorData(device, currentErrorRate);
        if (success) {
          updateDevice(device.id, { sendCount: device.sendCount + 1 });
        } else {
          updateDevice(device.id, { errorCount: device.errorCount + 1 });
        }
      }
    }, sendInterval * 1000);
  };

  const stopSimulation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsGlobalRunning(false);
    setSimDevices(prev => prev.map(d => ({ ...d, running: false })));
  };

  const seedHistoricalData = async () => {
    for (const device of devicesRef.current) {
      await apiRegisterDevice(device);

      const now = Date.now();
      const promises = [];
      for (let i = 47; i >= 0; i--) {
        const ts = new Date(now - i * 5 * 60 * 1000).toISOString();
        const temp = round1(device.tempBaseline + (Math.random() - 0.5) * 4);
        const co2 = Math.round(device.co2Baseline + (Math.random() - 0.5) * 200);
        const hum = round1(device.humBaseline + (Math.random() - 0.5) * 10);

        promises.push(
          fetch('/api/simulator/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: device.deviceId, temperature: temp, co2, humidity: hum, timestamp: ts }),
          })
        );
      }
      await Promise.all(promises);
      updateDevice(device.id, { sendCount: device.sendCount + 48 });
    }
  };

  const addPresetDevices = () => {
    const presets = [
      { name: 'Living Room', temp: 23, hum: 55, co2: 400 },
      { name: 'Kitchen', temp: 26, hum: 60, co2: 600 },
      { name: 'Garage', temp: 19, hum: 45, co2: 300 },
    ];
    const newDevices = presets.map(p => {
      const d = createSimDevice(p.name);
      d.tempBaseline = p.temp;
      d.humBaseline = p.hum;
      d.co2Baseline = p.co2;
      return d;
    });
    setSimDevices(prev => [...prev, ...newDevices]);
  };

  const totalSent = simDevices.reduce((sum, d) => sum + d.sendCount, 0);
  const totalErrors = simDevices.reduce((sum, d) => sum + d.errorCount, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6 text-emerald-500" />
            Device Simulator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Test your dashboard without physical ESP32 hardware
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isGlobalRunning ? (
            <Button
              onClick={startSimulation}
              disabled={simDevices.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Simulation
            </Button>
          ) : (
            <Button onClick={stopSimulation} variant="destructive">
              <Square className="h-4 w-4 mr-2" />
              Stop Simulation
            </Button>
          )}
        </div>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        <Card className="bg-card/80 backdrop-blur-sm border-0">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Simulated Devices</div>
            <div className="text-xl font-bold">{simDevices.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/80 backdrop-blur-sm border-0">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Data Points Sent</div>
            <div className="text-xl font-bold text-emerald-600">{totalSent}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/80 backdrop-blur-sm border-0">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Errors</div>
            <div className="text-xl font-bold text-red-500">{totalErrors}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/80 backdrop-blur-sm border-0">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="text-xl font-bold flex items-center gap-2">
              {isGlobalRunning ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  Running
                </>
              ) : (
                'Stopped'
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Settings */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card className="bg-card/80 backdrop-blur-sm border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Simulation Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Send Interval: {sendInterval}s
                </Label>
                <Slider
                  value={[sendInterval]}
                  min={1}
                  max={30}
                  step={1}
                  onValueChange={([v]) => setSendInterval(v)}
                  disabled={isGlobalRunning}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Sensor Error Rate: {errorRate}%
                </Label>
                <Slider
                  value={[errorRate]}
                  min={0}
                  max={30}
                  step={1}
                  onValueChange={([v]) => setErrorRate(v)}
                />
              </div>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={addDevice} disabled={isGlobalRunning}>
                <Plus className="h-3 w-3 mr-1" />
                Add Device
              </Button>
              <Button variant="outline" size="sm" onClick={addPresetDevices} disabled={isGlobalRunning}>
                <Zap className="h-3 w-3 mr-1" />
                Quick Add (3 Devices)
              </Button>
              <Button variant="outline" size="sm" onClick={seedHistoricalData} disabled={simDevices.length === 0}>
                <Activity className="h-3 w-3 mr-1" />
                Seed Historical Data
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSimDevices([])}
                disabled={isGlobalRunning || simDevices.length === 0}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Device List */}
      {simDevices.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-card/80 backdrop-blur-sm border-0">
            <CardContent className="py-12 text-center">
              <Radio className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No simulated devices</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Add a device to start simulating sensor data
              </p>
              <div className="flex justify-center gap-2 mt-4">
                <Button onClick={addDevice} variant="outline" size="sm">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Device
                </Button>
                <Button onClick={addPresetDevices} variant="outline" size="sm">
                  <Zap className="h-3 w-3 mr-1" />
                  Quick Add (3)
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {simDevices.map((device, index) => (
            <motion.div
              key={device.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="bg-card/80 backdrop-blur-sm border-0">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Device info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">{device.name}</span>
                        {device.running && (
                          <Badge variant="default" className="bg-emerald-600 text-[10px] px-1.5 py-0">
                            LIVE
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono truncate">{device.deviceId}</span>
                        <span className="font-mono opacity-50">{device.secret.slice(0, 8)}...</span>
                      </div>
                    </div>

                    {/* Sensor previews */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs">
                        <Thermometer className="h-3 w-3 text-orange-500" />
                        <span>{round1(device.tempBaseline)}°C</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <Droplets className="h-3 w-3 text-blue-500" />
                        <span>{round1(device.humBaseline)}%</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <Wind className="h-3 w-3 text-yellow-500" />
                        <span>{Math.round(device.co2Baseline)}ppm</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Sent: {device.sendCount}</span>
                      {device.errorCount > 0 && (
                        <span className="text-red-500">Errors: {device.errorCount}</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-destructive hover:text-destructive"
                        onClick={() => removeDevice(device.id)}
                        disabled={device.running}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="bg-emerald-600/5 border-emerald-600/20">
          <CardContent className="p-4">
            <h3 className="font-medium text-sm flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-emerald-500" />
              How it works
            </h3>
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>
                <strong>1. Add devices</strong> — Click &quot;Add Device&quot; or &quot;Quick Add&quot; to create simulated ESP32 devices.
              </p>
              <p>
                <strong>2. Start simulation</strong> — Click &quot;Start Simulation&quot; to begin sending realistic sensor data to the ingest API.
              </p>
              <p>
                <strong>3. View on dashboard</strong> — Switch to Dashboard or Devices view to see live data flowing in via Supabase Realtime.
              </p>
              <p>
                <strong>4. Claim devices</strong> — Go to Devices, click on an unclaimed device, and use the Device ID + Secret shown here to claim it.
              </p>
              <p className="text-emerald-600 dark:text-emerald-400 mt-2">
                This simulates the same data flow as real ESP32 + DHT11 + MQ2 hardware, just without needing physical devices!
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
