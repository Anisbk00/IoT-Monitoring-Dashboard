'use client';

import { User, Bell, Moon, Sun, Monitor, Copy, Check, Radio, Wifi, Code2, ChevronDown, ChevronUp, QrCode, FolderOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { useAppStore } from '@/lib/store';
import { useState, useEffect } from 'react';
import { QrGenerator } from './qr/qr-generator';

export function SettingsPanel() {
  const { user, devices } = useAppStore();
  const { theme, setTheme } = useTheme();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [mqttBrokerStatus, setMqttBrokerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [showEsp32Code, setShowEsp32Code] = useState(false);
  const [showPythonCode, setShowPythonCode] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedDeviceSecret, setSelectedDeviceSecret] = useState<string>('');

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }).catch(() => {});
  };

  useEffect(() => {
    fetch('/api/settings/mqtt-status')
      .then(res => res.json())
      .then(data => {
        setMqttBrokerStatus(data?.status === 'ok' ? 'online' : 'offline');
      })
      .catch(() => setMqttBrokerStatus('offline'));
  }, []);

  return (
    <div className="space-y-3 md:space-y-4 pb-4 max-w-2xl">
      <div>
        <h1 className="text-lg md:text-2xl font-bold">Settings</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Preferences & device integration</p>
      </div>

      {/* Profile */}
      <Card className="border-0 bg-card/80 backdrop-blur-sm">
        <CardHeader className="py-3 px-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <User className="h-3.5 w-3.5 text-emerald-500" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">Name</span>
              <p className="font-medium truncate">{user?.name || 'Not set'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Email</span>
              <p className="font-medium truncate">{user?.email || 'Not set'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Role</span>
              <p className="font-medium capitalize">{user?.role || 'technician'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Member since</span>
              <p className="font-medium">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MQTT Integration */}
      <Card className="border-0 bg-card/80 backdrop-blur-sm">
        <CardHeader className="py-3 px-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm flex-wrap">
            <Radio className="h-3.5 w-3.5 text-teal-500 shrink-0" />
            MQTT Integration
            <Badge
              variant={mqttBrokerStatus === 'online' ? 'default' : 'secondary'}
              className={`text-[9px] px-1.5 py-0 ${
                mqttBrokerStatus === 'online'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : mqttBrokerStatus === 'offline'
                  ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {mqttBrokerStatus === 'online' ? 'Online' : mqttBrokerStatus === 'offline' ? 'Offline' : '...'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Connect ESP32 devices via MQTT for real-time sensor data.
          </p>

          {/* Data Flow */}
          <div className="p-2 rounded-md bg-muted/50 overflow-x-auto">
            <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-mono flex-wrap">
              <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded whitespace-nowrap">ESP32</span>
              <span className="text-muted-foreground">→</span>
              <span className="px-1.5 py-0.5 bg-teal-500/20 text-teal-600 dark:text-teal-400 rounded whitespace-nowrap">MQTT</span>
              <span className="text-muted-foreground">→</span>
              <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded whitespace-nowrap">Broker</span>
              <span className="text-muted-foreground">→</span>
              <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-600 dark:text-violet-400 rounded whitespace-nowrap">DB</span>
              <span className="text-muted-foreground">→</span>
              <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded whitespace-nowrap">Dashboard</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Broker</Label>
                <div className="relative">
                  <pre className="text-[9px] sm:text-[10px] bg-muted p-2 rounded-md font-mono overflow-x-auto leading-tight">
{`Host:  your-server-ip
TCP:   1883
WS:    3003`}
                  </pre>
                  <button
                    onClick={() => copyToClipboard('Host: your-server-ip\nTCP: 1883\nWS: 3003', 'broker')}
                    className="absolute top-1 right-1 p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center rounded hover:bg-accent"
                  >
                    {copiedField === 'broker' ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <Copy className="h-2.5 w-2.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Topics</Label>
                <pre className="text-[9px] sm:text-[10px] bg-muted p-2 rounded-md font-mono overflow-x-auto leading-tight">
{`devices/{id}/data   ← Sensors
devices/{id}/status ← Status`}
                </pre>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Payload Example</Label>
              <div className="relative">
                <pre className="text-[9px] sm:text-[10px] bg-muted p-2 rounded-md font-mono overflow-x-auto leading-tight">
{`{"temperature": 25.5, "co2": 450, "humidity": 50.2}`}
                </pre>
                <button
                  onClick={() => copyToClipboard('{"temperature": 25.5, "co2": 450, "humidity": 50.2}', 'payload')}
                  className="absolute top-1 right-1 p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center rounded hover:bg-accent"
                >
                  {copiedField === 'payload' ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <Copy className="h-2.5 w-2.5 text-muted-foreground" />}
                </button>
              </div>
            </div>

            {/* ESP32 Firmware - Collapsible */}
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-[10px] text-muted-foreground hover:text-foreground px-0 min-h-[40px]"
                onClick={() => setShowEsp32Code(!showEsp32Code)}
              >
                <span className="flex items-center gap-1"><Wifi className="h-3 w-3" />ESP32 Firmware (QR + AP Mode + DHT11/DHT22 + MQ-2)</span>
                {showEsp32Code ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              {showEsp32Code && (
                <div className="mt-2 space-y-3">
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-2">Provisioning Flow (QR comes FROM the ESP32)</p>
                    <div className="flex items-center gap-1 text-[9px] font-mono flex-wrap">
                      <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded">ESP32 Boots</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded">AP Mode + QR</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="px-1.5 py-0.5 bg-teal-500/20 text-teal-600 dark:text-teal-400 rounded">Scan QR in App</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-600 dark:text-violet-400 rounded">Register</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">Data Flows</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      ESP32 generates its own ID + secret on first boot, displays QR at <code className="bg-muted px-1 rounded">192.168.4.1</code>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <FolderOpen className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-medium">Firmware files in project:</span>
                    </div>
                    <pre className="text-[10px] bg-muted p-2 rounded-md font-mono leading-relaxed">
{`firmware/
├── esp32-dht11-mq2/
│   └── esp32-dht11-mq2.ino   ← DHT11 + MQ-2 (recommended)
├── esp32-dht22-mq2/
│   └── esp32-dht22-mq2.ino   ← DHT22 + MQ-2
├── esp32-dht11/
│   └── esp32-dht11.ino       ← DHT11 only
└── simulator/
    └── simulator.py           ← Python test simulator`}
                    </pre>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Required Arduino Libraries:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {['WiFi.h (built-in)', 'PubSubClient', 'LittleFS (built-in)', 'DHT by Adafruit', 'ArduinoJson', 'WebServer (built-in)'].map((lib) => (
                        <div key={lib} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="h-1 w-1 rounded-full bg-emerald-500 shrink-0" />
                          {lib}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Wiring:</p>
                    <pre className="text-[10px] bg-muted p-2 rounded-md font-mono leading-relaxed">
{`DHT11:  VCC→3.3V  GND→GND  DATA→GPIO4 (10kΩ pull-up)
DHT22:  VCC→3.3V  GND→GND  DATA→GPIO4 (10kΩ pull-up)
MQ-2:   VCC→5V    GND→GND  A0→GPIO34  D0→GPIO35`}
                    </pre>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium">First Boot (what happens automatically):</p>
                    <pre className="text-[10px] bg-muted p-2 rounded-md font-mono leading-relaxed">
{`1. ESP32 reads its MAC → generates Device ID
2. esp_random() → generates Secret key
3. Saves identity to /identity.json (permanent)
4. Starts AP mode → WiFi: IoT-ESP32-XXXX
5. Web page at 192.168.4.1 shows QR code
6. User scans QR in dashboard → registers device
7. User configures WiFi/MQTT via AP page or Serial
8. ESP32 connects and starts sending data!`}
                    </pre>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Serial Commands:</p>
                    <pre className="text-[10px] bg-muted p-2 rounded-md font-mono leading-relaxed">
{`PROVISION {json}  — Configure WiFi/MQTT via Serial
STATUS             — Show device ID + status
RESET              — Erase WiFi/MQTT config (keeps ID)`}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Python Simulator - Collapsible */}
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-[10px] text-muted-foreground hover:text-foreground px-0 min-h-[40px]"
                onClick={() => setShowPythonCode(!showPythonCode)}
              >
                <span className="flex items-center gap-1"><Code2 className="h-3 w-3" />Python Simulator</span>
                {showPythonCode ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              {showPythonCode && (
                <div className="mt-2 space-y-2">
                  <p className="text-[10px] text-muted-foreground">
                    Test without hardware — simulates DHT22 + MQ-2 readings with offline queue.
                    File: <code className="bg-muted px-1 rounded">firmware/simulator/simulator.py</code>
                  </p>
                  <pre className="text-[10px] bg-muted p-2 rounded-md font-mono leading-relaxed">
{`# Setup:
pip install paho-mqtt
cd firmware/simulator
# Edit DEVICE_ID and BROKER in simulator.py
python3 simulator.py`}
                  </pre>
                </div>
              )}
            </div>
          </div>

          <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
              <strong>Tip:</strong> Each ESP32 generates its own Device ID + QR code on first boot. Connect to its WiFi (<code className="bg-muted px-1 rounded text-[9px]">IoT-ESP32-XXXX</code>) and open <code className="bg-muted px-1 rounded text-[9px]">192.168.4.1</code> to see the QR. Scan it in &quot;Add Device&quot; to register. Type <code className="bg-muted px-1 rounded text-[9px]">RESET</code> in Serial to erase WiFi/MQTT config (device ID is preserved).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* QR Sticker Reprint */}
      {devices.length > 0 && (
        <Card className="border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="py-3 px-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <QrCode className="h-3.5 w-3.5 text-emerald-500" />
              Reprint Device QR Stickers
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Lost your QR sticker? Reprint it here. The original QR was generated by the ESP32 on first boot.
            </p>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Select Device</Label>
              <div className="flex flex-wrap gap-2">
                {devices.map((device) => (
                  <Button
                    key={device.id}
                    variant={selectedDeviceId === device.deviceId ? 'default' : 'outline'}
                    size="sm"
                    className={`text-xs ${selectedDeviceId === device.deviceId ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                    onClick={async () => {
                      setSelectedDeviceId(device.deviceId);
                      try {
                        const res = await fetch(`/api/devices/qr-sticker?deviceId=${encodeURIComponent(device.deviceId)}`);
                        if (res.ok) {
                          const data = await res.json();
                          setSelectedDeviceSecret(data.qrPayload?.secret || '');
                        }
                      } catch {
                        setSelectedDeviceSecret('');
                      }
                    }}
                  >
                    {device.name}
                  </Button>
                ))}
              </div>
            </div>
            {selectedDeviceId && (
              <QrGenerator
                deviceId={selectedDeviceId}
                secret={selectedDeviceSecret}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Notifications */}
      <Card className="border-0 bg-card/80 backdrop-blur-sm">
        <CardHeader className="py-3 px-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bell className="h-3.5 w-3.5 text-amber-500" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs">Critical Alerts</span>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs">Warning Alerts</span>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs">Device Status Changes</span>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card className="border-0 bg-card/80 backdrop-blur-sm">
        <CardHeader className="py-3 px-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            {theme === 'dark' ? <Moon className="h-3.5 w-3.5 text-slate-400" /> : <Sun className="h-3.5 w-3.5 text-amber-500" />}
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                  theme === option.value
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-transparent bg-muted/50 hover:bg-muted'
                }`}
              >
                <option.icon
                  className={`h-4 w-4 ${
                    theme === option.value ? 'text-emerald-500' : 'text-muted-foreground'
                  }`}
                />
                <span
                  className={`text-[10px] font-medium ${
                    theme === option.value ? 'text-emerald-500' : 'text-muted-foreground'
                  }`}
                >
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
