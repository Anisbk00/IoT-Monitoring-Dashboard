# MQTT Broker Service

IoT MQTT broker built with [Aedes](https://github.com/moscajs/aedes). Receives sensor data from ESP32 devices via MQTT and forwards it to the Supabase database via the Next.js ingest API.

## Architecture

```
ESP32 Device → MQTT Broker (TCP:1883 / WS:3003) → POST /api/data/ingest → Supabase DB → Realtime → Dashboard
```

## MQTT Topics

| Topic | Direction | Payload |
|-------|-----------|---------|
| `devices/{device_id}/data` | Publish | `{ "temperature": 25.5, "co2": 450, "humidity": 50.2 }` |
| `devices/{device_id}/status` | Publish | `{ "status": "online" }` or `{ "status": "offline" }` |

## Configuration (.env)

```env
INGEST_API_KEY=iot-internal-key-2024
INGEST_API_URL=http://localhost:3000/api/data/ingest
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

## Running

```bash
# Start MQTT broker only
bun run dev:mqtt

# Start both MQTT broker + Next.js
bun run dev:all

# Or manually:
cd mini-services/mqtt-service
bun install
bun --hot index.ts
```

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 1883 | TCP | MQTT broker (for ESP32/IoT devices) |
| 3003 | HTTP/WS | Health check + MQTT over WebSocket |

## Health Check

```bash
curl http://localhost:3003/health
```

Returns:
```json
{
  "status": "ok",
  "broker": "running",
  "connectedDevices": 2,
  "tcpPort": 1883,
  "wsPort": 3003
}
```

## ESP32 Arduino Example

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

const char* MQTT_BROKER = "your-server-ip";
const int MQTT_PORT = 1883;
const char* DEVICE_ID = "ESP32-OFFICE-01";

WiFiClient espClient;
PubSubClient client(espClient);

void reconnect() {
  while (!client.connected()) {
    if (client.connect(DEVICE_ID)) {
      client.publish(
        String("devices/" + String(DEVICE_ID) + "/status").c_str(),
        "{\"status\":\"online\"}"
      );
    } else delay(5000);
  }
}

void sendSensorData() {
  if (!client.connected()) reconnect();
  String topic = "devices/" + String(DEVICE_ID) + "/data";
  String payload = "{\"temperature\":" + String(readTemp()) +
    ",\"co2\":" + String(readCO2()) +
    ",\"humidity\":" + String(readHumidity()) + "}";
  client.publish(topic.c_str(), payload.c_str());
}

void setup() {
  WiFi.begin("SSID", "PASSWORD");
  while (WiFi.status() != WL_CONNECTED) delay(500);
  client.setServer(MQTT_BROKER, MQTT_PORT);
  reconnect();
}

void loop() {
  client.loop();
  sendSensorData();
  delay(5000);
}
```

## Features

- **Automatic device status tracking**: When an ESP32 connects, its status is set to `online` in Supabase. When it disconnects, it's set to `offline`.
- **Auto-alerting**: The ingest API automatically creates alerts when CO2 > 1000 ppm or temperature > 32°C.
- **MQTT over WebSocket**: Browser clients can connect on port 3003 for real-time data.
- **Zero mock data**: All data comes from real MQTT clients.
