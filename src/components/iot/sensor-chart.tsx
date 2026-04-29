'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Thermometer, Wind, Droplets } from 'lucide-react';
import { useAppStore } from '@/lib/store';

function formatTime(timestamp: string) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function NoDataMessage({ label, hasDevices }: { label: string; hasDevices: boolean }) {
  return (
    <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
      {hasDevices ? (
        <>
          <p className="text-sm">No {label} data yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Data will appear when devices send readings</p>
        </>
      ) : (
        <>
          <p className="text-sm">No devices registered</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Register a device to start monitoring</p>
        </>
      )}
    </div>
  );
}

export function SensorChart() {
  const { sensorData, latestReadings, devices } = useAppStore();

  // Aggregate all sensor data for charts
  const { tempData, co2Data, humidityData } = useMemo(() => {
    const tempMap = new Map<string, { time: string; value: number }>();
    const co2Map = new Map<string, { time: string; value: number }>();
    const humidityMap = new Map<string, { time: string; value: number }>();

    // Process historical data from sensorData
    sensorData.forEach((readings, _deviceId) => {
      readings.forEach((r) => {
        const timeKey = new Date(r.timestamp).getTime().toString();
        if (!tempMap.has(timeKey)) {
          tempMap.set(timeKey, { time: r.timestamp, value: r.temperature });
        }
        if (!co2Map.has(timeKey)) {
          co2Map.set(timeKey, { time: r.timestamp, value: r.co2 });
        }
        if (r.humidity != null && !humidityMap.has(timeKey)) {
          humidityMap.set(timeKey, { time: r.timestamp, value: r.humidity });
        }
      });
    });

    // Also add latest readings
    latestReadings.forEach((reading) => {
      const timeKey = new Date(reading.timestamp).getTime().toString();
      if (!tempMap.has(timeKey)) {
        tempMap.set(timeKey, { time: reading.timestamp, value: reading.temperature });
      }
      if (!co2Map.has(timeKey)) {
        co2Map.set(timeKey, { time: reading.timestamp, value: reading.co2 });
      }
      if (reading.humidity != null && !humidityMap.has(timeKey)) {
        humidityMap.set(timeKey, { time: reading.timestamp, value: reading.humidity });
      }
    });

    const sortByTime = (a: { time: string }, b: { time: string }) =>
      new Date(a.time).getTime() - new Date(b.time).getTime();

    const tempArr = Array.from(tempMap.values()).sort(sortByTime).slice(-48);
    const co2Arr = Array.from(co2Map.values()).sort(sortByTime).slice(-48);
    const humidityArr = Array.from(humidityMap.values()).sort(sortByTime).slice(-48);

    return {
      tempData: tempArr.map((d) => ({
        time: formatTime(d.time),
        value: Number(d.value.toFixed(1)),
      })),
      co2Data: co2Arr.map((d) => ({
        time: formatTime(d.time),
        value: Math.round(d.value),
      })),
      humidityData: humidityArr.map((d) => ({
        time: formatTime(d.time),
        value: Number(d.value.toFixed(1)),
      })),
    };
  }, [sensorData, latestReadings]);

  const hasTempData = tempData.length > 0;
  const hasCo2Data = co2Data.length > 0;
  const hasHumidityData = humidityData.length > 0;
  const hasDevices = devices.length > 0;

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '12px',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Temperature Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Thermometer className="h-4 w-4 text-emerald-500" />
              Temperature
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {hasTempData ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={tempData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} unit="°C" />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                  <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#tempGradient)" name="Temperature" unit="°C" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <NoDataMessage label="temperature" hasDevices={hasDevices} />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* CO2 Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wind className="h-4 w-4 text-amber-500" />
              CO2 Level
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {hasCo2Data ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={co2Data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="co2Gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} unit=" ppm" />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                  <ReferenceLine y={1000} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: 'Threshold', position: 'right', fill: '#ef4444', fontSize: 10 }} />
                  <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} fill="url(#co2Gradient)" name="CO2" unit=" ppm" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <NoDataMessage label="CO2" hasDevices={hasDevices} />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Humidity Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Droplets className="h-4 w-4 text-sky-500" />
              Humidity
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {hasHumidityData ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={humidityData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="humidityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                  <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} label={{ value: 'High', position: 'right', fill: '#f59e0b', fontSize: 9 }} />
                  <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} label={{ value: 'Low', position: 'right', fill: '#f59e0b', fontSize: 9 }} />
                  <Area type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={2} fill="url(#humidityGradient)" name="Humidity" unit="%" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <NoDataMessage label="humidity" hasDevices={hasDevices} />
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
