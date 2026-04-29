'use client';

import { motion } from 'framer-motion';
import { Thermometer, Wind, Wifi, AlertTriangle, Droplets, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function StatsCards() {
  const { latestReadings, devices, alerts } = useAppStore();

  // Calculate stats from store data
  let currentTemp = 0;
  let currentCo2 = 0;
  let currentHumidity = 0;
  let tempCount = 0;
  let co2Count = 0;
  let humidityCount = 0;

  latestReadings.forEach((reading) => {
    if (reading.temperature != null) {
      currentTemp += reading.temperature;
      tempCount++;
    }
    if (reading.co2 != null) {
      currentCo2 += reading.co2;
      co2Count++;
    }
    if (reading.humidity != null) {
      currentHumidity += reading.humidity;
      humidityCount++;
    }
  });

  const avgTemp = tempCount > 0 ? currentTemp / tempCount : 0;
  const avgCo2 = co2Count > 0 ? currentCo2 / co2Count : 0;
  const avgHumidity = humidityCount > 0 ? currentHumidity / humidityCount : 0;
  const onlineDevices = devices.filter((d) => d.status === 'online').length;
  const totalDevices = devices.length;
  const activeAlerts = alerts.filter((a) => !a.acknowledged).length;

  const stats = [
    {
      title: 'Temperature',
      value: avgTemp > 0 ? `${avgTemp.toFixed(1)}°C` : '--°C',
      icon: Thermometer,
      description: avgTemp > 0 ? 'Average across devices' : 'No readings yet',
      trend: avgTemp > 30 ? 'high' : avgTemp > 0 ? 'normal' : 'none',
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-500',
      gradient: 'from-emerald-500 to-teal-600',
    },
    {
      title: 'CO2 Level',
      value: avgCo2 > 0 ? `${Math.round(avgCo2)} ppm` : '-- ppm',
      icon: Wind,
      description: avgCo2 > 1000 ? 'Above threshold!' : avgCo2 > 0 ? 'Within normal range' : 'No readings yet',
      trend: avgCo2 > 1000 ? 'high' : avgCo2 > 0 ? 'normal' : 'none',
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-500',
      gradient: 'from-amber-500 to-orange-500',
    },
    {
      title: 'Humidity',
      value: avgHumidity > 0 ? `${avgHumidity.toFixed(1)}%` : '--%',
      icon: Droplets,
      description: avgHumidity > 0
        ? avgHumidity > 70 ? 'High humidity' : avgHumidity < 30 ? 'Low humidity' : 'Comfortable range'
        : 'No readings yet',
      trend: avgHumidity > 70 ? 'high' : avgHumidity > 0 ? 'normal' : 'none',
      iconBg: 'bg-sky-500/15',
      iconColor: 'text-sky-500',
      gradient: 'from-sky-500 to-blue-500',
    },
    {
      title: 'Active Devices',
      value: `${onlineDevices}/${totalDevices}`,
      icon: Wifi,
      description: totalDevices > 0 ? `${Math.round((onlineDevices / totalDevices) * 100)}% online` : 'No devices yet',
      trend: onlineDevices === totalDevices && totalDevices > 0 ? 'good' : totalDevices > 0 ? 'warning' : 'none',
      iconBg: 'bg-teal-500/15',
      iconColor: 'text-teal-500',
      gradient: 'from-teal-500 to-cyan-600',
    },
    {
      title: 'Active Alerts',
      value: `${activeAlerts}`,
      icon: AlertTriangle,
      description: activeAlerts > 0 ? 'Requires attention' : 'All clear',
      trend: activeAlerts > 0 ? 'alert' : 'good',
      iconBg: 'bg-rose-500/15',
      iconColor: 'text-rose-500',
      gradient: 'from-rose-500 to-red-600',
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {stats.map((stat) => (
        <motion.div key={stat.title} variants={itemVariants}>
          <Card className="relative overflow-hidden border-0 bg-card/80 backdrop-blur-sm hover:bg-card transition-colors">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${stat.iconBg}`}>
                  <stat.icon className={`h-4 w-4 md:h-5 md:w-5 ${stat.iconColor}`} />
                </div>
                {stat.trend === 'high' || stat.trend === 'alert' ? (
                  <TrendingUp className="h-4 w-4 text-destructive" />
                ) : stat.trend === 'good' ? (
                  <TrendingDown className="h-4 w-4 text-emerald-500" />
                ) : null}
              </div>
              <div className="space-y-1">
                <p className="text-xl md:text-2xl font-bold tracking-tight">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.title}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{stat.description}</p>
              </div>
              {/* Subtle gradient accent at bottom */}
              <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${stat.gradient}`} />
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
