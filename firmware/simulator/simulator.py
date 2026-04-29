# =====================================================================
# IoT Monitor -- Python Simulator with Offline Queue
# Simulates ESP32 + DHT22 (temp/humidity) + MQ-2 (gas)
# Features: offline queue, auto-reconnect, sensor errors
# =====================================================================
# Usage:
#   1. Flash firmware to ESP32 → it generates Device ID + Secret
#   2. On dashboard, Add Device → scan QR from ESP32 (or enter manually)
#   3. Set DEVICE_ID, SECRET, and BROKER below
#   4. pip install paho-mqtt
#   5. python3 simulator.py
#
# The device identity comes FROM the ESP32, not the dashboard.
# =====================================================================

import paho.mqtt.client as mqtt
import json
import time
import random
import os
from datetime import datetime, timezone

# === Config ===========================================================
# These values come from your ESP32! Check Serial Monitor or 192.168.4.1
DEVICE_ID = "ESP32-TEST01"       # From ESP32 Serial output or QR code
SECRET    = "CHANGE_ME"           # From ESP32 identity.json
BROKER    = "localhost"           # MQTT broker address
PORT      = 1883                  # MQTT TCP port
INTERVAL  = 5                     # Seconds between readings
QUEUE_DIR = "./offline_queue"     # Offline storage directory
MAX_QUEUE = 500

# === Offline Queue ====================================================
os.makedirs(QUEUE_DIR, exist_ok=True)

def queue_size():
    return len([f for f in os.listdir(QUEUE_DIR) if f.endswith('.json')])

def enqueue(data):
    if queue_size() >= MAX_QUEUE:
        oldest = min(os.listdir(QUEUE_DIR),
                     key=lambda f: os.path.getmtime(os.path.join(QUEUE_DIR, f)))
        os.remove(os.path.join(QUEUE_DIR, oldest))
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    path = os.path.join(QUEUE_DIR, f"{ts}.json")
    with open(path, 'w') as f:
        json.dump(data, f)
    print(f"[QUEUE] Saved offline: {path}")

def flush_queue(client):
    if queue_size() == 0:
        return
    files = sorted(os.listdir(QUEUE_DIR))
    print(f"[QUEUE] Flushing {len(files)} queued readings")
    for fname in list(files):
        path = os.path.join(QUEUE_DIR, fname)
        try:
            with open(path) as f:
                data = json.load(f)
            topic = f"devices/{DEVICE_ID}/data"
            client.publish(topic, json.dumps(data))
            os.remove(path)
            time.sleep(0.05)
        except Exception as e:
            print(f"[QUEUE] Failed to flush {fname}: {e}")

# === MQTT Callbacks ===================================================
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("[MQTT] Connected!")
        topic = f"devices/{DEVICE_ID}/status"
        client.publish(topic, json.dumps({"status": "online"}), retain=True)
        flush_queue(client)
    else:
        print(f"[MQTT] Connect failed (rc={rc})")

def on_disconnect(client, userdata, rc):
    if rc != 0:
        print("[MQTT] Unexpected disconnect - data will be queued")

client = mqtt.Client(client_id=DEVICE_ID)
client.on_connect = on_connect
client.on_disconnect = on_disconnect

# === Simulate DHT22 + MQ-2 ===========================================
def read_sensors():
    """Simulate DHT22 + MQ-2 readings with occasional failures"""
    sensor_error = random.random() < 0.05

    if sensor_error:
        error_type = random.choice(["dht_fail", "mq2_fail", "all_fail"])
        if error_type == "dht_fail":
            return {"temperature": None, "co2": random.randint(100, 800),
                    "humidity": None, "gasRaw": random.randint(500, 2500)}
        elif error_type == "mq2_fail":
            return {"temperature": round(random.uniform(20, 35), 1), "co2": None,
                    "humidity": round(random.uniform(30, 70), 1), "gasRaw": None}
        else:
            return {"temperature": None, "co2": None, "humidity": None, "gasRaw": None}

    temperature = round(random.uniform(20, 35), 1)
    humidity = round(random.uniform(30, 70), 1)
    gas_raw = random.randint(400, 3000)
    gas_ppm = max(0, int((gas_raw / 4095.0) * 2000))

    return {"temperature": temperature, "co2": gas_ppm,
            "humidity": humidity, "gasRaw": gas_raw}

# === Main Loop ========================================================
print(f"Starting IoT Simulator: {DEVICE_ID} -> {BROKER}:{PORT}")

try:
    client.connect(BROKER, PORT)
except Exception as e:
    print(f"[MQTT] Cannot connect - will queue data: {e}")

client.loop_start()

try:
    while True:
        data = read_sensors()
        data["timestamp"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        if client.is_connected():
            topic = f"devices/{DEVICE_ID}/data"
            client.publish(topic, json.dumps(data))
            print(f"[DATA] Sent: {data}")
        else:
            enqueue(data)
            print(f"[DATA] Queued (offline): {data}")

        time.sleep(INTERVAL)
except KeyboardInterrupt:
    topic = f"devices/{DEVICE_ID}/status"
    client.publish(topic, json.dumps({"status": "offline"}), retain=True)
    client.loop_stop()
    client.disconnect()
    print("\nStopped - queued data will flush on next connect")
