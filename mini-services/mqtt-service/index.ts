import aedes, { type Aedes, type Connection } from 'aedes';
import { createServer } from 'net';
import { createServer as createHttpServer } from 'http';

// Configuration
const MQTT_PORT = parseInt(process.env.MQTT_TCP_PORT || '1883');
const WS_PORT = parseInt(process.env.MQTT_WS_PORT || '3003');
const INGEST_API_KEY = process.env.INGEST_API_KEY;
if (!INGEST_API_KEY) {
  console.error('[MQTT] INGEST_API_KEY environment variable is not set — exiting');
  process.exit(1);
}
const INGEST_API_URL = process.env.INGEST_API_URL || 'http://localhost:3000/api/data/ingest';
const AUTO_REGISTER_API_URL = process.env.AUTO_REGISTER_API_URL || INGEST_API_URL.replace('/api/data/ingest', '/api/devices/auto-register');

// Create Aedes MQTT broker
const broker: Aedes = aedes({
  id: 'iot-mqtt-broker',
  concurrency: 100,
  heartbeatInterval: 60000,
  connectTimeout: 30000,
});

// Track connected devices
const connectedDevices = new Map<string, { connectedAt: Date; ip: string }>();

// Broker event handlers
broker.on('client', (client: Connection) => {
  const deviceId = client.id;
  if (deviceId) {
    connectedDevices.set(deviceId, {
      connectedAt: new Date(),
      ip: (client as any).ip || 'unknown',
    });
    console.log(`[MQTT] Client connected: ${deviceId} (${connectedDevices.size} total)`);
    updateDeviceStatus(deviceId, 'online');
  }
});

broker.on('clientDisconnect', (client: Connection) => {
  const deviceId = client.id;
  if (deviceId) {
    connectedDevices.delete(deviceId);
    console.log(`[MQTT] Client disconnected: ${deviceId} (${connectedDevices.size} total)`);
    updateDeviceStatus(deviceId, 'offline');
  }
});

broker.on('clientError', (client: Connection, error: Error) => {
  console.error(`[MQTT] Client error (${client.id}):`, error.message);
});

// Handle incoming messages on device topics
broker.on('publish', async (packet, client) => {
  // Only process messages from clients (not broker's own messages)
  if (!client) return;

  const topic = packet.topic;
  const payload = packet.payload?.toString();
  if (!payload) return;

  // Route: devices/{deviceId}/data — sensor data
  const dataMatch = topic.match(/^devices\/(.+)\/data$/);
  if (dataMatch) {
    const deviceId = dataMatch[1];
    await handleSensorData(deviceId, payload, client.id);
    return;
  }

  // Route: devices/{deviceId}/status — device status update
  const statusMatch = topic.match(/^devices\/(.+)\/status$/);
  if (statusMatch) {
    const deviceId = statusMatch[1];
    await handleDeviceStatus(deviceId, payload);
    return;
  }

  // Route: devices/{deviceId}/register — device registration (first connect)
  const registerMatch = topic.match(/^devices\/(.+)\/register$/);
  if (registerMatch) {
    const deviceId = registerMatch[1];
    await handleDeviceRegistration(deviceId, payload);
    return;
  }
});

/**
 * Handle sensor data from MQTT topic: devices/{deviceId}/data
 * Expected payload: { "temperature": 25.5, "co2": 450, "humidity": 50.2 }
 */
async function handleSensorData(deviceId: string, payload: string, clientId?: string) {
  try {
    const data = JSON.parse(payload);

    // Skip ingestion if all sensor values are null (sensor power loss / error)
    if ((data.temperature === null || data.temperature === undefined) &&
        (data.co2 === null || data.co2 === undefined) &&
        (data.humidity === null || data.humidity === undefined)) {
      console.warn(`[MQTT] All sensors null for ${deviceId} — skipping ingest (sensor error?)`);
      return;
    }

    // Require at least temperature or co2 to be a valid number
    const hasTemp = data.temperature !== null && data.temperature !== undefined;
    const hasCo2 = data.co2 !== null && data.co2 !== undefined;

    if (!hasTemp && !hasCo2) {
      console.warn(`[MQTT] No valid temp or co2 from ${deviceId} — skipping`);
      return;
    }

    const ingestPayload = {
      deviceId: deviceId,
      temperature: hasTemp ? Number(data.temperature) : 0,
      co2: hasCo2 ? Number(data.co2) : 0,
      humidity: data.humidity !== null && data.humidity !== undefined ? Number(data.humidity) : null,
      timestamp: data.timestamp || new Date().toISOString(),
    };

    // Log warnings for partial sensor failures
    if (!hasTemp) console.warn(`[MQTT] ${deviceId}: temperature is null (sensor error)`);
    if (!hasCo2) console.warn(`[MQTT] ${deviceId}: co2 is null (sensor error)`);

    const response = await fetch(INGEST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': INGEST_API_KEY,
      },
      body: JSON.stringify(ingestPayload),
    });

    if (response.ok) {
      const parts = [];
      if (hasTemp) parts.push(`temp=${data.temperature}°C`);
      if (hasCo2) parts.push(`co2=${data.co2}ppm`);
      if (data.humidity !== null && data.humidity !== undefined) parts.push(`hum=${data.humidity}%`);
      console.log(`[MQTT] ✓ Data ingested: ${deviceId} ${parts.join(' ')}`);
    } else {
      const error = await response.text();
      console.error(`[MQTT] ✗ Ingest failed (${response.status}) for ${deviceId}: ${error}`);
    }
  } catch (err: any) {
    console.error(`[MQTT] ✗ Error processing sensor data from ${deviceId}:`, err.message);
  }
}

/**
 * Handle device status from MQTT topic: devices/{deviceId}/status
 * Expected payload: { "status": "online" } or { "status": "offline" }
 */
async function handleDeviceStatus(deviceId: string, payload: string) {
  try {
    const data = JSON.parse(payload);
    if (data.status) {
      await updateDeviceStatus(deviceId, data.status);
    }
  } catch (err: any) {
    console.error(`[MQTT] ✗ Error processing status from ${deviceId}:`, err.message);
  }
}

/**
 * Handle device registration from MQTT topic: devices/{deviceId}/register
 * Expected payload: { "deviceId": "ESP32-ABC123", "secret": "A1B2C3..." }
 * This is sent by the ESP32 on first MQTT connect to register itself.
 */
async function handleDeviceRegistration(deviceId: string, payload: string) {
  try {
    const data = JSON.parse(payload);
    if (!data.deviceId || !data.secret) {
      console.warn(`[MQTT] Invalid registration payload from ${deviceId}`);
      return;
    }

    console.log(`[MQTT] Device registration: ${deviceId}`);

    const response = await fetch(AUTO_REGISTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': INGEST_API_KEY,
      },
      body: JSON.stringify({
        deviceId: data.deviceId,
        secret: data.secret,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[MQTT] ✓ Device ${deviceId} ${result.action} (auto-register)`);
    } else {
      const error = await response.text();
      console.error(`[MQTT] ✗ Auto-register failed (${response.status}) for ${deviceId}: ${error}`);
    }
  } catch (err: any) {
    console.error(`[MQTT] ✗ Error processing registration from ${deviceId}:`, err.message);
  }
}

/**
 * Update device status in Supabase directly via REST API (service role)
 */
async function updateDeviceStatus(deviceId: string, status: string) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn(`[MQTT] Missing Supabase credentials, cannot update ${deviceId} status`);
      return;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/devices?device_id=eq.${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        status: status,
        updated_at: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      console.log(`[MQTT] ✓ Device ${deviceId} status → ${status}`);
    } else {
      console.error(`[MQTT] ✗ Failed to update ${deviceId} status: ${response.status}`);
    }
  } catch (err: any) {
    console.error(`[MQTT] ✗ Error updating device status for ${deviceId}:`, err.message);
  }
}

// ─── TCP MQTT Server (port 1883) ─────────────────────────────────────────────
const tcpServer = createServer(broker.handle);
tcpServer.listen(MQTT_PORT, '0.0.0.0', () => {
  console.log(`[MQTT] TCP broker listening on 0.0.0.0:${MQTT_PORT}`);
});

// ─── HTTP Server with WebSocket + Health (port 3003) ─────────────────────────
const httpServer = createHttpServer();

// Health check endpoint
httpServer.on('request', (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      broker: 'running',
      connectedDevices: connectedDevices.size,
      tcpPort: MQTT_PORT,
      wsPort: WS_PORT,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// WebSocket upgrade for MQTT over WS
httpServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/' || req.url === '/mqtt') {
    // Handle MQTT over WebSocket
    broker.handle(socket as any, req);
  }
});

httpServer.listen(WS_PORT, '0.0.0.0', () => {
  console.log(`[MQTT] HTTP/WS broker listening on 0.0.0.0:${WS_PORT}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('[MQTT] Shutting down...');
  tcpServer.close();
  httpServer.close();
  broker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[MQTT] ═════════════════════════════════════════════════════');
console.log('[MQTT]  IoT MQTT Broker');
console.log(`[MQTT]  TCP:   0.0.0.0:${MQTT_PORT}`);
console.log(`[MQTT]  WS:    0.0.0.0:${WS_PORT}`);
console.log(`[MQTT]  Ingest: ${INGEST_API_URL}`);
console.log('[MQTT]  Topics:');
console.log('[MQTT]    devices/{device_id}/data      → sensor data');
console.log('[MQTT]    devices/{device_id}/status    → online/offline');
console.log('[MQTT]    devices/{device_id}/register  → auto-register (first connect)');
console.log('[MQTT] ═════════════════════════════════════════════════════');
