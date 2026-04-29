// =====================================================================
// IoT Monitor — Node.js Device Simulator
// Simulates ESP32 + DHT11 (temp/humidity) + MQ-2 (gas)
// =====================================================================
// Modes:
//   direct  — Calls Vercel ingest API directly (no MQTT broker needed!)
//   mqtt    — Publishes to local MQTT broker (full stack test)
//
// Usage:
//   SIM_MODE=direct  bun index.ts   ← Simplest, no MQTT needed
//   SIM_MODE=mqtt    bun index.ts   ← Full stack test
//   NUM_DEVICES=3    bun index.ts   ← Simulate 3 devices
//   SEND_INTERVAL=3  bun index.ts   ← Send every 3 seconds
// =====================================================================

import { randomBytes } from 'crypto';

// === Configuration ====================================================
const SIM_MODE = (process.env.SIM_MODE || 'direct').toLowerCase() as 'direct' | 'mqtt';
const INGEST_API_URL = process.env.INGEST_API_URL || 'https://io-t-monitoring-dashboard.vercel.app/api/data/ingest';
const AUTO_REGISTER_URL = process.env.AUTO_REGISTER_URL || INGEST_API_URL.replace('/api/data/ingest', '/api/devices/auto-register');
const API_KEY = process.env.INGEST_API_KEY || 'iot-internal-key-2024';
const BROKER_HOST = process.env.MQTT_BROKER_HOST || 'localhost';
const BROKER_PORT = parseInt(process.env.MQTT_TCP_PORT || '1883');
const SEND_INTERVAL = parseInt(process.env.SEND_INTERVAL || '5');
const NUM_DEVICES = parseInt(process.env.NUM_DEVICES || '1');

// Sensor simulation ranges
const TEMP_MIN = 18, TEMP_MAX = 38;
const HUMIDITY_MIN = 25, HUMIDITY_MAX = 75;
const GAS_RAW_MIN = 300, GAS_RAW_MAX = 3000;
const ERROR_RATE = 0.05;

// === Types ============================================================
interface DeviceSim {
  deviceId: string;
  secret: string;
  connected: boolean;
  sendCount: number;
  errorCount: number;
  registered: boolean;
  tempBaseline: number;
  humidityBaseline: number;
  gasBaseline: number;
  mqttClient: any | null;
}

// === Device Management ================================================
const devices: DeviceSim[] = [];

function generateDeviceId(): string {
  const hex = randomBytes(3).toString('hex').toUpperCase();
  return `ESP32-SIM${hex}`;
}

function generateSecret(): string {
  return randomBytes(12).toString('hex').toUpperCase();
}

function createDeviceSim(): DeviceSim {
  return {
    deviceId: generateDeviceId(),
    secret: generateSecret(),
    connected: false,
    sendCount: 0,
    errorCount: 0,
    registered: false,
    tempBaseline: 22 + Math.random() * 6,
    humidityBaseline: 40 + Math.random() * 20,
    gasBaseline: 400 + Math.random() * 600,
    mqttClient: null,
  };
}

// === Sensor Simulation ================================================
function readSensors(device: DeviceSim) {
  // Slow random walk for baselines (realistic drift)
  device.tempBaseline += (Math.random() - 0.5) * 0.3;
  device.tempBaseline = Math.max(TEMP_MIN, Math.min(TEMP_MAX, device.tempBaseline));

  device.humidityBaseline += (Math.random() - 0.5) * 1;
  device.humidityBaseline = Math.max(HUMIDITY_MIN, Math.min(HUMIDITY_MAX, device.humidityBaseline));

  device.gasBaseline += (Math.random() - 0.5) * 50;
  device.gasBaseline = Math.max(GAS_RAW_MIN, Math.min(GAS_RAW_MAX, device.gasBaseline));

  // Occasional sensor errors
  if (Math.random() < ERROR_RATE) {
    const errorType = Math.random();
    if (errorType < 0.33) {
      device.errorCount++;
      return { temperature: null, co2: gasToPPM(device.gasBaseline), humidity: null, gasRaw: Math.round(device.gasBaseline) };
    } else if (errorType < 0.66) {
      device.errorCount++;
      return { temperature: round1(device.tempBaseline), co2: null, humidity: round1(device.humidityBaseline), gasRaw: null };
    } else {
      device.errorCount++;
      return { temperature: null, co2: null, humidity: null, gasRaw: null };
    }
  }

  const temperature = round1(device.tempBaseline + (Math.random() - 0.5) * 1.5);
  const humidity = round1(device.humidityBaseline + (Math.random() - 0.5) * 4);
  const gasRaw = Math.round(device.gasBaseline + (Math.random() - 0.5) * 300);
  const co2 = gasToPPM(gasRaw);

  return { temperature, co2, humidity, gasRaw };
}

function gasToPPM(raw: number): number {
  return Math.max(0, Math.round((raw / 4095.0) * 2000));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// === Direct API Mode ==================================================
async function autoRegisterDevice(device: DeviceSim) {
  try {
    const response = await fetch(AUTO_REGISTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        deviceId: device.deviceId,
        secret: device.secret,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      device.registered = true;
      device.connected = true;
      console.log(`  [REGISTER] ✓ ${device.deviceId} ${result.action} (secret: ${device.secret.substring(0, 8)}...)`);
    } else {
      const error = await response.text();
      console.error(`  [REGISTER] ✗ ${device.deviceId} failed (${response.status}): ${error}`);
    }
  } catch (err: any) {
    console.error(`  [REGISTER] ✗ ${device.deviceId} error: ${err.message}`);
  }
}

async function sendDataDirect(device: DeviceSim, sensorData: any) {
  try {
    const ingestPayload = {
      deviceId: device.deviceId,
      temperature: sensorData.temperature !== null ? sensorData.temperature : 0,
      co2: sensorData.co2 !== null ? sensorData.co2 : 0,
      humidity: sensorData.humidity,
      timestamp: sensorData.timestamp,
    };

    const response = await fetch(INGEST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(ingestPayload),
    });

    if (response.ok) {
      device.sendCount++;
      const result = await response.json();
      const parts: string[] = [];
      if (sensorData.temperature !== null) parts.push(`temp=${sensorData.temperature}°C`);
      if (sensorData.co2 !== null) parts.push(`co2=${sensorData.co2}ppm`);
      if (sensorData.humidity !== null) parts.push(`hum=${sensorData.humidity}%`);
      console.log(`  [DATA] ${device.deviceId} #${device.sendCount}: ${parts.join(' | ')} → ✓`);
    } else {
      const error = await response.text();
      console.error(`  [DATA] ${device.deviceId} ✗ (${response.status}): ${error}`);
    }
  } catch (err: any) {
    console.error(`  [DATA] ${device.deviceId} ✗ Error: ${err.message}`);
  }
}

// === MQTT Mode ========================================================
async function connectDeviceMQTT(device: DeviceSim) {
  try {
    const mqtt = await import('mqtt');
    const url = `mqtt://${BROKER_HOST}:${BROKER_PORT}`;

    console.log(`  [MQTT] ${device.deviceId} connecting to ${url}`);

    const client = mqtt.default.connect(url, {
      clientId: device.deviceId,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 5000,
      keepalive: 60,
    });

    device.mqttClient = client;

    client.on('connect', () => {
      device.connected = true;
      console.log(`  [MQTT] ✓ ${device.deviceId} connected!`);

      // Send registration (like real ESP32)
      client.publish(
        `devices/${device.deviceId}/register`,
        JSON.stringify({ deviceId: device.deviceId, secret: device.secret }),
        { qos: 1 }
      );
      console.log(`  [REGISTER] ${device.deviceId}: Sent (secret: ${device.secret.substring(0, 8)}...)`);

      // Send online status (retained)
      client.publish(
        `devices/${device.deviceId}/status`,
        JSON.stringify({ status: 'online' }),
        { retain: true }
      );
      device.registered = true;
    });

    client.on('error', (err: Error) => {
      console.error(`  [MQTT] ${device.deviceId} error: ${err.message}`);
    });

    client.on('close', () => {
      device.connected = false;
    });

    client.on('reconnect', () => {
      console.log(`  [MQTT] ${device.deviceId} reconnecting...`);
    });
  } catch (err: any) {
    console.error(`  [MQTT] ${device.deviceId} failed to import mqtt: ${err.message}`);
    console.error(`  [MQTT] Falling back to direct mode...`);
    await autoRegisterDevice(device);
  }
}

async function sendDataMQTT(device: DeviceSim, sensorData: any) {
  if (device.mqttClient?.connected) {
    const topic = `devices/${device.deviceId}/data`;
    device.mqttClient.publish(topic, JSON.stringify(sensorData));
    device.sendCount++;
    const parts: string[] = [];
    if (sensorData.temperature !== null) parts.push(`temp=${sensorData.temperature}°C`);
    if (sensorData.co2 !== null) parts.push(`co2=${sensorData.co2}ppm`);
    if (sensorData.humidity !== null) parts.push(`hum=${sensorData.humidity}%`);
    console.log(`  [DATA] ${device.deviceId} #${device.sendCount}: ${parts.join(' | ')} → MQTT`);
  } else if (device.connected) {
    // MQTT not connected but was registered — fall back to direct
    await sendDataDirect(device, sensorData);
  } else {
    console.log(`  [DATA] ${device.deviceId}: Offline, skipping`);
  }
}

// === Heartbeat (MQTT mode only) ======================================
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

function startHeartbeat() {
  if (SIM_MODE !== 'mqtt') return;
  heartbeatInterval = setInterval(() => {
    for (const device of devices) {
      if (device.mqttClient?.connected) {
        device.mqttClient.publish(
          `devices/${device.deviceId}/status`,
          JSON.stringify({ status: 'online', details: 'heartbeat' })
        );
      }
    }
  }, 60000);
}

// === Data Sending Loop ================================================
let dataInterval: ReturnType<typeof setInterval> | null = null;

function startSendingData() {
  console.log(`\n[DATA] Starting sensor data transmission (every ${SEND_INTERVAL}s via ${SIM_MODE})\n`);

  dataInterval = setInterval(async () => {
    for (const device of devices) {
      const sensorData: any = readSensors(device);
      sensorData.timestamp = new Date().toISOString();

      if (SIM_MODE === 'direct' || !device.mqttClient) {
        await sendDataDirect(device, sensorData);
      } else {
        await sendDataMQTT(device, sensorData);
      }
    }
  }, SEND_INTERVAL * 1000);
}

// === Status Display ====================================================
let statusInterval: ReturnType<typeof setInterval> | null = null;

function startStatusDisplay() {
  statusInterval = setInterval(() => {
    console.log('\n┌─────────────────────────────────────────────────────┐');
    console.log('│ IoT Device Simulator Status                         │');
    console.log('├─────────────────────────────────────────────────────┤');
    for (const device of devices) {
      const status = device.connected ? '🟢 ONLINE' : '🔴 OFFLINE';
      console.log(`│ ${device.deviceId}  ${status}  Mode: ${SIM_MODE}`);
      console.log(`│   Secret: ${device.secret}  Sent: ${device.sendCount}  Errors: ${device.errorCount}`);
    }
    console.log('└─────────────────────────────────────────────────────┘\n');
  }, 30000);
}

// === Graceful Shutdown ================================================
function shutdown() {
  console.log('\n[SHUTDOWN] Stopping simulator...');

  if (dataInterval) clearInterval(dataInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (statusInterval) clearInterval(statusInterval);

  if (SIM_MODE === 'mqtt') {
    for (const device of devices) {
      if (device.mqttClient?.connected) {
        device.mqttClient.publish(
          `devices/${device.deviceId}/status`,
          JSON.stringify({ status: 'offline' }),
          { retain: true }
        );
        device.mqttClient.end(true);
      }
    }
  }

  console.log('[SHUTDOWN] All devices stopped.');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// === Main =============================================================
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║        IoT Device Simulator (ESP32 + DHT11 + MQ2)        ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log(`║  Mode:      ${SIM_MODE.toUpperCase().padEnd(42)}║`);
if (SIM_MODE === 'direct') {
  console.log(`║  API:       ${INGEST_API_URL.substring(0, 42).padEnd(42)}║`);
} else {
  console.log(`║  Broker:    ${(BROKER_HOST + ':' + BROKER_PORT).padEnd(42)}║`);
}
console.log(`║  Devices:   ${String(NUM_DEVICES).padEnd(42)}║`);
console.log(`║  Interval:  ${(SEND_INTERVAL + 's').padEnd(42)}║`);
console.log('╚═══════════════════════════════════════════════════════════╝');

// Create simulated devices
for (let i = 0; i < NUM_DEVICES; i++) {
  const device = createDeviceSim();
  devices.push(device);
}

// Print device info
console.log('\n┌─────────────────────────────────────────────────────┐');
console.log('│ Device Credentials (use these to claim on dashboard)│');
console.log('├─────────────────────────────────────────────────────┤');
for (const device of devices) {
  console.log(`│ Device ID: ${device.deviceId}`);
  console.log(`│ Secret:    ${device.secret}`);
  console.log('│                                                     │');
}
console.log('└─────────────────────────────────────────────────────┘\n');

// Register and connect devices
(async () => {
  for (const device of devices) {
    if (SIM_MODE === 'direct') {
      await autoRegisterDevice(device);
    } else {
      await connectDeviceMQTT(device);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Start data transmission
  setTimeout(() => {
    startSendingData();
    startHeartbeat();
    startStatusDisplay();
  }, 1000);

  console.log('\n[READY] Simulator is running. Press Ctrl+C to stop.\n');
})();
