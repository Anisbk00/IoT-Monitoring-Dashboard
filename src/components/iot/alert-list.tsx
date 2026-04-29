'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, AlertCircle, Info, Check, Bell, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/lib/store';

type FilterTab = 'all' | 'critical' | 'warning';

const severityConfig = {
  critical: {
    icon: AlertCircle,
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  info: {
    icon: Info,
    color: 'text-sky-500',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    badge: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20',
  },
};

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

export function AlertList() {
  const { alerts, acknowledgeAlert, devices } = useAppStore();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const filteredAlerts = alerts.filter((alert) => {
    if (activeFilter === 'all') return !alert.acknowledged;
    if (activeFilter === 'critical') return alert.severity === 'critical' && !alert.acknowledged;
    if (activeFilter === 'warning') return alert.severity === 'warning' && !alert.acknowledged;
    return true;
  });

  const handleAcknowledge = async (alertId: string) => {
    setAcknowledging(alertId);
    try {
      const res = await fetch('/api/alerts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ alertId }),
      });

      if (res.ok) {
        acknowledgeAlert(alertId);
      }
    } catch {
      // Don't acknowledge locally on network failure — alert will persist until server confirms
    } finally {
      setAcknowledging(null);
    }
  };

  const getDeviceName = (deviceId: string) => {
    const device = devices.find((d) => d.deviceId === deviceId);
    return device?.name || deviceId.slice(0, 8);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Alerts</h2>
          <p className="text-sm text-muted-foreground">
            {alerts.filter((a) => !a.acknowledged).length} active alert{alerts.filter((a) => !a.acknowledged).length !== 1 ? 's' : ''}
          </p>
        </div>
        <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterTab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="critical">Critical</TabsTrigger>
            <TabsTrigger value="warning">Warning</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {filteredAlerts.length === 0 ? (
        <Card className="border-dashed border-2 bg-card/30">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">
              {activeFilter === 'all' ? 'No active alerts' : `No ${activeFilter} alerts`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {activeFilter === 'all'
                ? 'Everything looks good! No unacknowledged alerts.'
                : `No unacknowledged ${activeFilter} alerts at the moment.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[50vh] sm:max-h-[600px]">
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredAlerts.map((alert, i) => {
                const severity = (alert.severity || 'info') as keyof typeof severityConfig;
                const config = severityConfig[severity] || severityConfig.info;
                const Icon = config.icon;

                return (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20, height: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Card className={`border ${config.border} bg-card/80 backdrop-blur-sm`}>
                      <CardContent className="p-3 md:p-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${config.bg} shrink-0`}>
                            <Icon className={`h-4 w-4 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{getDeviceName(alert.deviceId)}</span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${config.badge}`}>
                                {severity}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{alert.message}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                              <Clock className="h-3 w-3" />
                              {formatTimestamp(alert.createdAt)}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-muted-foreground hover:text-emerald-500"
                            disabled={acknowledging === alert.id}
                            onClick={() => handleAcknowledge(alert.id)}
                          >
                            {acknowledging === alert.id ? (
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                              >
                                <Check className="h-4 w-4" />
                              </motion.div>
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            <span className="ml-1 text-xs hidden sm:inline">Ack</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
