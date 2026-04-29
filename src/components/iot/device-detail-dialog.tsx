'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Thermometer, Wind, Droplets, MapPin, Clock, Wifi, WifiOff,
  Settings2, QrCode, Radio, Copy, Check, RefreshCw, Cpu,
  ExternalLink, CircleCheck, CircleAlert, Info, UserPlus, Loader2
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/lib/store';
import type { Device } from '@/lib/types';
import QRCode from 'qrcode';

interface DeviceDetailDialogProps {
  device: Device | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function DeviceDetailDialog({ device, open, onOpenChange }: DeviceDetailDialogProps) {
  const { latestReadings, sensorData, addDevice } = useAppStore();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [showWifiConfig, setShowWifiConfig] = useState(false);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [mqttBroker, setMqttBroker] = useState('');
  const [mqttPort, setMqttPort] = useState('1883');
  const [configStatus, setConfigStatus] = useState<'idle' | 'sending' | 'success' | 'failed'>('idle');
  const [claiming, setClaiming] = useState(false);
  const [claimName, setClaimName] = useState('');
  const [claimLocation, setClaimLocation] = useState('');
  const [claimSecret, setClaimSecret] = useState('');
  const [claimError, setClaimError] = useState('');
  const qrCanvasDrawn = useRef(false);

  useEffect(() => {
    if (device && open) {
      // Fetch device secret for QR reprint
      fetch(`/api/devices/qr-sticker?deviceId=${encodeURIComponent(device.deviceId)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.qrPayload?.secret) setSecret(data.qrPayload.secret);
        })
        .catch(() => {});
    }
  }, [device, open]);

  // Draw QR code on canvas when secret is available
  useEffect(() => {
    if (!device || !secret || !open) {
      qrCanvasDrawn.current = false;
      return;
    }

    const canvasId = `qr-${device.deviceId}`;
    const drawQr = async () => {
      const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
      if (!canvas) return;
      try {
        const payload = JSON.stringify({ type: 'iot-device', deviceId: device.deviceId, secret, apSsid: `IoT-${device.deviceId}` });
        await QRCode.toCanvas(canvas, payload, { width: 150, margin: 1 });
        qrCanvasDrawn.current = true;
      } catch (err) {
        console.error('Failed to render QR code:', err);
      }
    };

    // Small delay to ensure canvas is in the DOM
    const timer = setTimeout(drawQr, 50);
    return () => clearTimeout(timer);
  }, [device, secret, open]);

  if (!device) return null;

  const reading = latestReadings.get(device.deviceId);
  const status = (device.status || 'offline') as keyof typeof statusConfig;
  const config = statusConfig[status] || statusConfig.offline;
  const isOnline = status === 'online';
  const isUnclaimed = device.claimed === false || !device.userId;
  const apSsid = `IoT-${device.deviceId}`;
  const readings = sensorData.get(device.deviceId) || [];

  const claimDevice = async () => {
    if (!claimName.trim() || !claimSecret.trim()) {
      setClaimError('Device name and secret are required');
      return;
    }
    setClaiming(true);
    setClaimError('');
    try {
      const res = await fetch('/api/devices/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.deviceId,
          secret: claimSecret.trim(),
          name: claimName.trim(),
          location: claimLocation.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to claim device');
      // Update the device in the store
      addDevice(data.device as Device);
      onOpenChange(false);
    } catch (err: unknown) {
      setClaimError(err instanceof Error ? err.message : 'Failed to claim device');
    } finally {
      setClaiming(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }).catch(() => {});
  };

  const sendWifiConfig = async () => {
    if (!wifiSsid.trim() || !mqttBroker.trim()) return;
    setConfigStatus('sending');
    try {
      const response = await fetch('http://192.168.4.1/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'iot-provisioning',
          version: 1,
          deviceId: device.deviceId,
          secret,
          wifiSsid: wifiSsid.trim(),
          wifiPassword: wifiPassword.trim(),
          mqttBroker: mqttBroker.trim(),
          mqttPort: parseInt(mqttPort) || 1883,
          mqttWsPort: 3003,
        }),
        signal: AbortSignal.timeout(8000),
      });
      setConfigStatus(response.ok ? 'success' : 'failed');
    } catch {
      setConfigStatus('failed');
    }
  };

  const latestTemp = readings.length > 0 ? readings[readings.length - 1].temperature : null;
  const latestCo2 = readings.length > 0 ? readings[readings.length - 1].co2 : null;
  const latestHum = readings.length > 0 ? readings[readings.length - 1].humidity : null;

  // Simple sparkline data
  const tempHistory = readings.slice(-20).map(r => r.temperature);
  const co2History = readings.slice(-20).map(r => r.co2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-emerald-500" />
            {device.name}
          </DialogTitle>
          <DialogDescription>
            Device details and configuration
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs px-2 py-0.5 ${config.color}`}>
                <div className={`h-1.5 w-1.5 rounded-full mr-1.5 ${config.dotColor}`} />
                {config.label}
              </Badge>
              {isUnclaimed && (
                <Badge className="text-[10px] px-1.5 py-0 h-5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 border">
                  <UserPlus className="h-3 w-3 mr-0.5" />
                  Unclaimed
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatLastSeen(device.updatedAt)}
            </div>
          </div>

          {/* Claim this device (only shown for unclaimed/auto-registered devices) */}
          {isUnclaimed && (
            <Card className="border-0 bg-amber-500/5">
              <CardHeader className="py-2 px-3 pb-1">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <UserPlus className="h-3 w-3 text-amber-500" />
                  Claim This Device
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1 space-y-2">
                <p className="text-xs text-muted-foreground">
                  This device was auto-registered when it started sending data. Claim it to add it to your dashboard.
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Device Name *</Label>
                    <Input
                      placeholder="e.g., Workshop Sensor"
                      value={claimName}
                      onChange={(e) => setClaimName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Location</Label>
                    <Input
                      placeholder="e.g., Building A, Floor 2"
                      value={claimLocation}
                      onChange={(e) => setClaimLocation(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Device Secret *</Label>
                    <Input
                      type="password"
                      placeholder="Secret from QR code or 192.168.4.1"
                      value={claimSecret}
                      onChange={(e) => setClaimSecret(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                    <p className="text-[9px] text-muted-foreground">
                      Find this in the QR code, at 192.168.4.1, or in the Serial Monitor
                    </p>
                  </div>
                  {claimError && <p className="text-[10px] text-destructive">{claimError}</p>}
                  <Button
                    size="sm"
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white h-9 text-xs"
                    disabled={!claimName.trim() || !claimSecret.trim() || claiming}
                    onClick={claimDevice}
                  >
                    {claiming ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Claiming...</>
                    ) : (
                      <><UserPlus className="h-3 w-3 mr-1" /> Claim Device</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Device Info */}
          <Card className="border-0 bg-card/80">
            <CardContent className="p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Device ID</span>
                  <div className="flex items-center gap-1">
                    <p className="font-mono font-medium truncate">{device.deviceId}</p>
                    <button onClick={() => copyToClipboard(device.deviceId, 'deviceId')} className="shrink-0 p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-md hover:bg-accent">
                      {copiedField === 'deviceId' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Location</span>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    <p className="truncate">{device.location || 'Not set'}</p>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">AP Network</span>
                  <p className="font-mono truncate">{apSsid}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Registered</span>
                  <p>{new Date(device.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Sensor Readings */}
          <Card className="border-0 bg-card/80">
            <CardHeader className="py-2 px-3 pb-1">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Thermometer className="h-3 w-3 text-emerald-500" />
                Live Readings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-emerald-500/5">
                  <Thermometer className="h-3.5 w-3.5 text-emerald-500 mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Temp</p>
                  <p className="text-sm font-semibold">
                    {latestTemp != null ? `${latestTemp.toFixed(1)}°C` : '--'}
                  </p>
                </div>
                <div className="text-center p-2 rounded-lg bg-amber-500/5">
                  <Wind className="h-3.5 w-3.5 text-amber-500 mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Gas</p>
                  <p className="text-sm font-semibold">
                    {latestCo2 != null ? `${latestCo2} ppm` : '--'}
                  </p>
                </div>
                <div className="text-center p-2 rounded-lg bg-sky-500/5">
                  <Droplets className="h-3.5 w-3.5 text-sky-500 mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Humidity</p>
                  <p className="text-sm font-semibold">
                    {latestHum != null ? `${latestHum.toFixed(0)}%` : '--'}
                  </p>
                </div>
              </div>

              {/* Mini sparkline for temperature */}
              {tempHistory.length > 2 && (
                <div className="mt-3">
                  <p className="text-[10px] text-muted-foreground mb-1">Temperature (last {tempHistory.length} readings)</p>
                  <div className="h-12 flex items-end gap-px">
                    {tempHistory.map((v, i) => {
                      const min = Math.min(...tempHistory);
                      const max = Math.max(...tempHistory);
                      const range = max - min || 1;
                      const height = ((v - min) / range) * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-emerald-500/40 rounded-t-sm min-w-[2px] transition-all"
                          style={{ height: `${Math.max(height, 4)}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Provisioning / WiFi Config */}
          {!isOnline && (
            <Card className="border-0 bg-amber-500/5">
              <CardHeader className="py-2 px-3 pb-1">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <CircleAlert className="h-3 w-3 text-amber-500" />
                  Device Offline — Needs Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1 space-y-3">
                <p className="text-xs text-muted-foreground">
                  This device hasn&apos;t connected yet. It needs WiFi &amp; MQTT credentials to start sending data.
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setShowWifiConfig(!showWifiConfig)}
                >
                  <Settings2 className="h-3 w-3 mr-1.5" />
                  {showWifiConfig ? 'Hide WiFi Configuration' : 'Configure WiFi & MQTT'}
                </Button>

                {showWifiConfig && (
                  <div className="space-y-2">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mb-1">
                        Option 1: Send from here (requires being on ESP32&apos;s WiFi)
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Connect to <code className="bg-muted px-1 rounded">{apSsid}</code>, then fill in the form below.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">WiFi SSID *</Label>
                        <Input
                          placeholder="Your WiFi name"
                          value={wifiSsid}
                          onChange={(e) => setWifiSsid(e.target.value)}
                          className="h-10 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">WiFi Password</Label>
                        <Input
                          type="password"
                          placeholder="Your WiFi password"
                          value={wifiPassword}
                          onChange={(e) => setWifiPassword(e.target.value)}
                          className="h-10 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">MQTT Broker *</Label>
                        <Input
                          placeholder="e.g., 192.168.1.100"
                          value={mqttBroker}
                          onChange={(e) => setMqttBroker(e.target.value)}
                          className="h-10 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">MQTT Port</Label>
                        <Input
                          type="number"
                          value={mqttPort}
                          onChange={(e) => setMqttPort(e.target.value)}
                          className="h-10 text-xs max-w-[120px]"
                        />
                      </div>

                      {configStatus === 'success' && (
                        <div className="flex items-center gap-1.5 p-1.5 rounded bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <CircleCheck className="h-3 w-3" /> Config sent! ESP32 is restarting...
                        </div>
                      )}
                      {configStatus === 'failed' && (
                        <div className="p-1.5 rounded bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400">
                          Could not reach ESP32. Make sure you&apos;re connected to {apSsid} WiFi.
                        </div>
                      )}

                      <Button
                        size="sm"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-10 text-xs"
                        disabled={!wifiSsid.trim() || !mqttBroker.trim() || configStatus === 'sending'}
                        onClick={sendWifiConfig}
                      >
                        {configStatus === 'sending' ? (
                          <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Sending...</>
                        ) : (
                          <><Radio className="h-3 w-3 mr-1" /> Send Config to ESP32</>
                        )}
                      </Button>
                    </div>

                    <Separator />

                    <div className="p-2 rounded-lg bg-muted/50">
                      <p className="text-[10px] font-medium mb-1">
                        Option 2: Configure on ESP32&apos;s web page
                      </p>
                      <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                        <li>Connect to WiFi: <code className="bg-muted px-0.5 rounded">{apSsid}</code></li>
                        <li>Open <code className="bg-muted px-0.5 rounded">192.168.4.1</code></li>
                        <li>Fill in WiFi &amp; MQTT details</li>
                      </ol>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* QR Code Section */}
          {secret && (
            <Card className="border-0 bg-card/80">
              <CardHeader className="py-2 px-3 pb-1">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <QrCode className="h-3 w-3 text-emerald-500" />
                  Device QR Code
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1">
                <p className="text-[10px] text-muted-foreground mb-2">
                  Scan this QR in the app to re-register or share this device.
                </p>
                <div className="p-2 bg-white rounded-lg inline-block">
                  <canvas id={`qr-${device.deviceId}`} width="150" height="150" />
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Button variant="outline" size="sm" className="text-[10px]" onClick={() => {
                    const payload = JSON.stringify({ type: 'iot-device', deviceId: device.deviceId, secret, apSsid });
                    copyToClipboard(payload, 'qr');
                  }}>
                    {copiedField === 'qr' ? <Check className="h-2.5 w-2.5 mr-1" /> : <Copy className="h-2.5 w-2.5 mr-1" />}
                    Copy QR Data
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
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
