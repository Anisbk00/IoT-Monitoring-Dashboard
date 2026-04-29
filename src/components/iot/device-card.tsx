'use client';

import { motion } from 'framer-motion';
import { Thermometer, Wind, Droplets, MapPin, Clock, Wifi, WifiOff, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import type { Device } from '@/lib/types';

interface DeviceCardProps {
  device: Device;
  onClick?: () => void;
}

function formatLastSeen(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const statusConfig = {
  online: {
    color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    dotColor: 'bg-emerald-500',
    icon: Wifi,
    label: 'Online',
  },
  offline: {
    color: 'bg-muted text-muted-foreground border-muted',
    dotColor: 'bg-gray-400',
    icon: WifiOff,
    label: 'Offline',
  },
  warning: {
    color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
    dotColor: 'bg-amber-500',
    icon: Wifi,
    label: 'Warning',
  },
};

export function DeviceCard({ device, onClick }: DeviceCardProps) {
  const { latestReadings } = useAppStore();
  const reading = latestReadings.get(device.deviceId);
  const status = (device.status || 'offline') as keyof typeof statusConfig;
  const config = statusConfig[status] || statusConfig.offline;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <Card
        className="cursor-pointer border-0 bg-card/80 backdrop-blur-sm hover:bg-card transition-all duration-200 group"
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      >
        <CardContent className="p-4 md:p-5 space-y-3">
          {/* Header: name + status */}
          <div className="flex items-start justify-between">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-sm truncate group-hover:text-emerald-500 transition-colors">
                  {device.name}
                </h3>
                {device.claimed === false && (
                  <Badge className="text-[9px] px-1.5 py-0 h-4 shrink-0 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 border">
                    <UserPlus className="h-2.5 w-2.5 mr-0.5" />
                    Unclaimed
                  </Badge>
                )}
              </div>
              {device.location && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="text-xs truncate">{device.location}</span>
                </div>
              )}
            </div>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 shrink-0 ${config.color}`}>
              <div className={`h-1.5 w-1.5 rounded-full mr-1 ${config.dotColor}`} />
              {config.label}
            </Badge>
          </div>

          {/* Readings */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-500/5">
              <Thermometer className="h-3 w-3 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">Temp</p>
                <p className="text-xs font-semibold leading-tight">
                  {reading?.temperature != null ? `${reading.temperature.toFixed(1)}°` : '--'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/5">
              <Wind className="h-3 w-3 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">CO2</p>
                <p className="text-xs font-semibold leading-tight">
                  {reading?.co2 != null ? `${reading.co2}` : '--'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-sky-500/5">
              <Droplets className="h-3 w-3 text-sky-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">Hum</p>
                <p className="text-xs font-semibold leading-tight">
                  {reading?.humidity != null ? `${reading.humidity.toFixed(0)}%` : '--'}
                </p>
              </div>
            </div>
          </div>

          {/* Last seen */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Last seen: {formatLastSeen(device.updatedAt)}</span>
            </div>
            <span className="text-[10px] text-muted-foreground/50 font-mono">{device.deviceId.slice(0, 8)}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
