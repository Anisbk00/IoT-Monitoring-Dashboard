'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Cpu, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { StatsCards } from './stats-cards';
import { SensorChart } from './sensor-chart';

function formatTimestamp(ts: string) {
  try {
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  } catch {
    return ts;
  }
}

const severityColors: Record<string, string> = {
  critical: 'text-rose-500',
  warning: 'text-amber-500',
  info: 'text-sky-500',
};

export function Dashboard() {
  const { alerts, devices, latestReadings, setCurrentView } = useAppStore();

  const recentAlerts = alerts
    .filter((a) => !a.acknowledged)
    .slice(0, 5);

  const getDeviceName = (deviceId: string) => {
    const device = devices.find((d) => d.deviceId === deviceId);
    return device?.name || deviceId.slice(0, 8);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time overview of your IoT infrastructure</p>
      </div>

      {/* Stats */}
      <StatsCards />

      {/* Charts */}
      <SensorChart />

      {/* Bottom section: Alerts + Device Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Alerts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-0 bg-card/80 backdrop-blur-sm h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Recent Alerts
                </CardTitle>
                {recentAlerts.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => setCurrentView('alerts')}
                  >
                    View all
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {recentAlerts.length === 0 ? (
                <div className="py-6 text-center">
                  <div className="p-2 rounded-full bg-emerald-500/10 mx-auto w-fit mb-2">
                    <Activity className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No active alerts. Everything looks good!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 ${severityColors[alert.severity] || 'text-muted-foreground'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {getDeviceName(alert.deviceId)}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[11px] px-1.5 py-0 h-5"
                          >
                            {alert.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        {formatTimestamp(alert.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Device Status Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="border-0 bg-card/80 backdrop-blur-sm h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cpu className="h-4 w-4 text-teal-500" />
                  Device Status
                </CardTitle>
                {devices.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => setCurrentView('devices')}
                  >
                    View all
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {devices.length === 0 ? (
                <div className="py-6 text-center">
                  <div className="p-2 rounded-full bg-muted mx-auto w-fit mb-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No devices registered yet.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                    onClick={() => setCurrentView('devices')}
                  >
                    Register Your First Device
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {devices.slice(0, 5).map((device) => {
                    const reading = latestReadings.get(device.deviceId);
                    const isOnline = device.status === 'online';
                    return (
                      <div
                        key={device.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className={`h-2 w-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{device.name}</span>
                            <Badge
                              variant="outline"
                              className={`text-[11px] px-1.5 py-0 h-5 ${
                                isOnline
                                  ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : 'text-muted-foreground border-muted'
                              }`}
                            >
                              {isOnline ? 'Online' : 'Offline'}
                            </Badge>
                          </div>
                          {device.location && (
                            <p className="text-xs text-muted-foreground truncate">{device.location}</p>
                          )}
                        </div>
                        {reading && (
                          <div className="text-right shrink-0">
                            <p className="text-xs font-medium">{reading.temperature.toFixed(1)}°C</p>
                            <p className="text-[10px] text-muted-foreground">{reading.co2} ppm</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
