// =====================================================================
// IoT Monitoring — ESP32 + DHT11 (Minimal Firmware)
// Hardware: ESP32 + DHT11 (temp/humidity only)
// =====================================================================
// PROVISIONING FLOW (device-first, QR comes FROM the ESP32):
//
//   1. Flash this firmware to ESP32 → it generates its own ID + secret
//   2. ESP32 starts in AP mode, serves a web page with QR code
//   3. From a computer, connect to WiFi "IoT-ESP32-XXXX"
//   4. Open http://192.168.4.1 → see the QR code + setup form
//   5. In the dashboard app, click "Add Device" → scan the QR code
//   6. Fill in device name, location → Register!
//   7. Configure WiFi/MQTT on the ESP32's AP page or via Serial
//
// WIRING:
//   DHT11:  VCC->3.3V, GND->GND, DATA->GPIO4 (with 10k pull-up to 3.3V)
//
// =====================================================================

#include <WiFi.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <LittleFS.h>
#include <DHT.h>
#include <time.h>
#include <ArduinoJson.h>

// === Configuration ====================================================
const int   SEND_INTERVAL = 10000;   // 10s between readings
const int   MAX_QUEUE     = 500;     // max offline entries
const char* QUEUE_FILE    = "/queue.dat";
const char* CONFIG_FILE   = "/config.json";
const char* IDENTITY_FILE = "/identity.json"; // deviceId + secret (never erased by RESET)

// === Hardware Pins ====================================================
#define DHT_PIN       4     // GPIO4 -> DHT11 data
#define DHT_TYPE      DHT11

// === Provisioning Data ================================================
struct DeviceConfig {
  char deviceId[32];
  char secret[64];
  char wifiSsid[64];
  char wifiPassword[64];
  char mqttBroker[64];
  int  mqttPort;
  int  mqttWsPort;
  bool valid;
} config;

// === AP Mode ==========================================================
WebServer apServer(80);
char apSsid[32];  // e.g. "IoT-ESP32-ABC123"
bool inApMode = false;

// === Objects ==========================================================
WiFiClient espClient;
PubSubClient mqtt(espClient);
DHT dht(DHT_PIN, DHT_TYPE);

unsigned long lastSend     = 0;
int  wifiRetryDelay   = 500;
int  mqttRetryDelay   = 1000;
bool dhtOk = false;
int  dhtFailCount = 0;
bool provisioned  = false;

// === NTP ==============================================================
const char* NTP_SERVER = "pool.ntp.org";
const char* TZ_INFO    = "CET-1CEST-2,M3.5.0/02:00,M10.5.0/03:00";

String getISOTime() {
  time_t now = time(nullptr);
  struct tm t;
  gmtime_r(&now, &t);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
  return String(buf);
}

void syncNTP() {
  configTzTime(TZ_INFO, NTP_SERVER, "time.nist.gov");
  Serial.print("[NTP] Syncing");
  int tries = 0;
  while (time(nullptr) < 1000000000 && tries < 20) {
    delay(500); Serial.print("."); tries++;
  }
  Serial.println(time(nullptr) > 1000000000 ? " OK!" : " FAILED");
}

// =====================================================================
// DEVICE IDENTITY: Generated ONCE on first boot, saved to LittleFS
// The identity file is separate from config and survives RESET
// =====================================================================

void generateIdentity() {
  // If identity file already exists, load it
  if (LittleFS.exists(IDENTITY_FILE)) {
    File f = LittleFS.open(IDENTITY_FILE, "r");
    if (f) {
      StaticJsonDocument<256> doc;
      DeserializationError err = deserializeJson(doc, f);
      f.close();
      if (!err) {
        strlcpy(config.deviceId, doc["deviceId"] | "", sizeof(config.deviceId));
        strlcpy(config.secret, doc["secret"] | "", sizeof(config.secret));
        if (strlen(config.deviceId) > 0 && strlen(config.secret) > 0) {
          Serial.println("[ID] Loaded identity from flash");
          Serial.println("[ID]   Device ID: " + String(config.deviceId));
          return;
        }
      }
    }
    // Corrupted file, delete it
    LittleFS.remove(IDENTITY_FILE);
  }

  // Generate new identity from ESP32's unique eFuse MAC
  uint64_t chipId = ESP.getEfuseMac();
  snprintf(config.deviceId, sizeof(config.deviceId), "ESP32-%04X",
           (uint16_t)(chipId >> 32));

  // Generate a strong random secret using ESP32 hardware RNG
  uint32_t r1 = esp_random();
  uint32_t r2 = esp_random();
  uint32_t r3 = esp_random();
  snprintf(config.secret, sizeof(config.secret), "%08X%08X%08X",
           r1, r2, r3);

  // Save to identity file (persists across RESET)
  StaticJsonDocument<256> doc;
  doc["deviceId"] = String(config.deviceId);
  doc["secret"] = String(config.secret);
  File f = LittleFS.open(IDENTITY_FILE, "w");
  if (f) {
    serializeJson(doc, f);
    f.close();
    Serial.println("[ID] Generated and saved new identity");
  }

  Serial.println("[ID]   Device ID: " + String(config.deviceId));
  Serial.println("[ID]   Secret: " + String(config.secret));
  Serial.println();
  Serial.println("==========================================");
  Serial.println("  QR CODE DATA (for sticker / dashboard):");
  Serial.println("==========================================");
  Serial.println("{\"type\":\"iot-device\",\"deviceId\":\"" + String(config.deviceId) +
                "\",\"secret\":\"" + String(config.secret) + "\"}");
  Serial.println("==========================================");
  Serial.println();
}

// =====================================================================
// AP MODE: Captive portal web server for provisioning
// Shows QR code + setup form
// =====================================================================

void setupApMode() {
  snprintf(apSsid, sizeof(apSsid), "IoT-%s", config.deviceId);
  inApMode = true;

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSsid);
  Serial.println("[AP] Started WiFi AP: " + String(apSsid));
  Serial.println("[AP] IP: " + WiFi.softAPIP().toString());
  Serial.println("[AP] Open http://192.168.4.1 to see QR code and configure");

  // Build the QR payload JSON string
  String qrJson = String("{\"type\":\"iot-device\",\"deviceId\":\"") +
                  String(config.deviceId) + "\",\"secret\":\"" +
                  String(config.secret) + "\",\"apSsid\":\"" +
                  String(apSsid) + "\"}";

  // === Main page: QR code + setup form ===
  apServer.on("/", HTTP_GET, [qrJson]() {
    String html = R"rawliteral(
<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 IoT Device</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
  .container{max-width:480px;margin:0 auto;padding:20px}
  h1{color:#10b981;font-size:1.4em;text-align:center;margin-bottom:4px}
  .subtitle{text-align:center;color:#64748b;font-size:0.85em;margin-bottom:20px}
  .card{background:#1e293b;border-radius:16px;padding:24px;margin-bottom:16px}
  .card h2{font-size:1em;margin-bottom:12px;display:flex;align-items:center;gap:8px}
  .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.7em;font-weight:600}
  .badge-green{background:#10b98133;color:#10b981}
  .badge-blue{background:#3b82f633;color:#60a5fa}
  .qr-section{display:flex;flex-direction:column;align-items:center;padding:10px 0}
  .qr-frame{background:#fff;padding:16px;border-radius:12px;box-shadow:0 0 30px #10b98122}
  #qr-canvas{display:block}
  .device-id{font-family:monospace;color:#10b981;font-size:0.9em;margin-top:12px;
    padding:6px 12px;background:#10b98111;border-radius:8px;letter-spacing:1px}
  .scan-hint{color:#94a3b8;font-size:0.75em;margin-top:8px;text-align:center}
  .info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155;font-size:0.85em}
  .info-row:last-child{border:none}
  .info-label{color:#64748b}
  .info-value{color:#e2e8f0;font-family:monospace;font-size:0.85em}
  .divider{display:flex;align-items:center;gap:12px;margin:20px 0;color:#475569;font-size:0.8em}
  .divider::before,.divider::after{content:'';flex:1;height:1px;background:#334155}
  .field{margin-bottom:14px}
  .field label{display:block;font-size:0.8em;color:#94a3b8;margin-bottom:4px}
  .field input{width:100%;padding:10px 12px;border:1px solid #334155;border-radius:10px;
    background:#0f172a;color:#e2e8f0;font-size:0.9em;outline:none;transition:border .2s}
  .field input:focus{border-color:#10b981}
  .btn{width:100%;padding:14px;background:#10b981;color:#fff;border:none;border-radius:12px;
    font-size:1em;font-weight:600;cursor:pointer;transition:background .2s}
  .btn:hover{background:#059669}
  .btn:disabled{opacity:0.5;cursor:not-allowed}
  .success{text-align:center;padding:30px 10px}
  .success h2{color:#10b981;font-size:1.3em}
  .success p{color:#94a3b8;margin-top:8px;font-size:0.9em}
  .steps{counter-reset:step;list-style:none;padding:0}
  .steps li{counter-increment:step;padding:8px 0 8px 36px;position:relative;font-size:0.8em;color:#94a3b8}
  .steps li::before{content:counter(step);position:absolute;left:0;top:6px;width:22px;height:22px;
    background:#10b98122;color:#10b981;border-radius:50%;display:flex;align-items:center;
    justify-content:center;font-size:0.75em;font-weight:700}
  .print-btn{background:transparent;border:1px solid #334155;color:#94a3b8;padding:8px 16px;
    border-radius:8px;cursor:pointer;font-size:0.8em;margin-top:10px}
  .print-btn:hover{border-color:#10b981;color:#10b981}
  @media print{
    body{background:#fff;color:#000}
    .card:not(.qr-card){display:none}
    .qr-card{background:#fff;border:2px solid #000;padding:8mm}
    h1{color:#000}
    .qr-frame{box-shadow:none}
    .divider,.steps,.scan-hint{display:none}
  }
</style></head><body>
<div class="container">
  <h1>ESP32 + DHT11</h1>
  <p class="subtitle">Scan the QR code to add this device to your dashboard</p>

  <div class="card qr-card">
    <h2>📱 QR Code <span class="badge badge-green">Scan Me!</span></h2>
    <div class="qr-section">
      <div class="qr-frame">
        <canvas id="qr-canvas" width="220" height="220"></canvas>
      </div>
      <div class="device-id">)rawliteral";
    html += String(config.deviceId) + R"rawliteral(</div>
      <p class="scan-hint">Open the IoT Dashboard app → Add Device → Scan this QR code</p>
    </div>
    <button class="print-btn" onclick="window.print()">🖨️ Print QR Sticker</button>

    <div class="divider">How to add this device</div>
    <ol class="steps">
      <li>Open the IoT Dashboard app on your phone</li>
      <li>Tap "Add Device" → Scan this QR code with your camera</li>
      <li>Fill in device name &amp; location</li>
      <li>The device will be registered and start sending data!</li>
    </ol>
  </div>

  <div class="card">
    <h2>📋 Device Info</h2>
    <div class="info-row"><span class="info-label">Device ID</span><span class="info-value">)rawliteral";
    html += String(config.deviceId) + R"rawliteral(</span></div>
    <div class="info-row"><span class="info-label">Secret</span><span class="info-value">)rawliteral";
    html += String(config.secret).substring(0, 12) + "••••</span></div>
    <div class="info-row"><span class="info-label">AP Network</span><span class="info-value">)rawliteral";
    html += String(apSsid) + R"rawliteral(</span></div>
    <div class="info-row"><span class="info-label">Sensor</span><span class="info-value">DHT11 (Temp + Humidity)</span></div>
    <div class="info-row"><span class="info-label">Status</span><span class="badge badge-blue">Waiting for setup</span></div>
  </div>

  <div class="card">
    <h2>⚙️ Quick Setup <span class="badge badge-blue">Alternative</span></h2>
    <p style="color:#64748b;font-size:0.8em;margin-bottom:14px">
      Or configure WiFi &amp; MQTT directly without the dashboard app:
    </p>
    <form id="setupForm" onsubmit="return sendConfig(event)">
      <div class="field">
        <label>WiFi Network Name (SSID)</label>
        <input id="ssid" placeholder="Your WiFi name" required>
      </div>
      <div class="field">
        <label>WiFi Password</label>
        <input id="pass" type="password" placeholder="Your WiFi password">
      </div>
      <div class="field">
        <label>MQTT Broker Address</label>
        <input id="broker" placeholder="e.g. 192.168.1.100">
      </div>
      <button type="submit" class="btn" id="saveBtn">Save &amp; Connect</button>
    </form>
    <div id="result" style="display:none" class="success">
      <h2>✅ Configuration Saved!</h2>
      <p>ESP32 is restarting and connecting to your WiFi...</p>
    </div>
  </div>
</div>

<!-- Lightweight QR Code Generator (inline, no internet needed) -->
<script>
var qrcode=function(){function a(a){this.mode=4;this.numChars=a;this.bitLength=3}function b(a,b){this.numChars=a;this.bitLength=3;this.data=b}function c(a,b,c){this.ordinal=a;this.formatBits=b;this.dataCodewordsPerBlock=c}function d(a,b,c,e,f,g){this.version=a;this.errorCorrectionLevel=b;this.size=c;this.dataCodewords=e;this.numBlocks=f;this.numEccCodewords=g}function e(b,c){if(b<1||b>40)throw"Version out of range";if(c.ordinal<0||c.ordinal>3)throw"EC level out of range";for(var e=k[b],f=e[0],g=e[1],h=e[2],i=e[3],j=f*(a.BIT_LENGTH>=0?a.BIT_LENGTH:0)+g*(b.BIT_LENGTH>=0?b.BIT_LENGTH:0),l=i-j%i,m=j+l,n=h*8-m,o=f+g,p=Math.floor(n/o),q=o-h,r=p*f,s=p*g,t=(j-r-s)/f,u=r+s+(j-r-s),v=0;v<i.length;v++)if(l==i[v])break;return new d(b,c,a.SIZE_OF(j),m,f+g,i[v])}function f(a,b){for(var c=a.slice(),d=0;d<b;d++){var e=1==(c[0]>>>7&1);for(var f=0;f<c.length-1;f++)c[f]=(c[f]<<1&255)|(c[f+1]>>>7);c[c.length-1]<<=1;if(e)c[c.length-1]^=135}return c}function g(a,b){for(var c=0;c<b;c++)a.push(0)}function h(a,b,c,d){for(var e=0;e<a;e++){for(var h=new Array(d),i=0;i<h.length;i++)h[i]=0;h[e]=1;for(var j=0;j<d;j++)if(b[e][j])for(var k=e+1;k<d;k++)if(b[k][j])for(var l=0;l<d;l++)h[l]^=b[k][l];c[e]=h}}function i(a,b,c,d,e){for(var f=new Array(e),g=0;g<e;g++){f[g]=new Array(d);for(var h=0;h<d;h++)f[g][h]=a[b+g*d+h]}return f}function j(a,b){for(var c=0;c<b.length;c++)a.push(b[c])}var k=[null,[],[1,0,19,7],[1,0,34,10],[1,0,55,15],[1,0,80,20],[1,0,108,26],[1,0,136,18],[1,0,156,20],[2,0,194,24],[2,0,232,28],[2,0,274,34],[2,0,324,42],[2,0,370,50],[2,0,428,60],[2,0,464,66],[3,2,518,72],[3,2,576,80],[3,2,636,90],[3,2,710,96],[3,2,788,104],[3,2,846,112],[4,2,910,120],[4,2,972,132],[4,2,1064,144],[4,2,1118,156],[4,2,1200,168],[4,2,1276,180],[4,2,1364,192],[5,2,1422,204],[5,2,1502,216],[5,2,1582,228],[5,2,1666,240],[5,2,1776,258],[5,2,1872,270],[6,2,1962,288],[6,2,2086,306],[6,2,2192,318],[6,2,2310,342],[6,2,2434,360],[7,2,2566,378],[7,2,2702,396],[7,2,2816,408]];var l=[new c(0,1,19),new c(1,0,16),new c(2,3,13),new c(3,2,9)];function m(a,b){this.modules=[];this.isFunction=[];for(var c=0;c<b;c++)this.modules.push(new Array(b).fill(!1)),this.isFunction.push(new Array(b).fill(!1));this.size=b;var d=n(a,b);this.drawFunctionPatterns();this.drawCodewords(d)}m.prototype.drawFunctionPatterns=function(){for(var a=this.size,b=0;b<a;b++)this.setFunctionModule(6,b,b%2==0),this.setFunctionModule(b,6,b%2==0);this.drawFinderPattern(3,3),this.drawFinderPattern(a-4,3),this.drawFinderPattern(3,a-4);for(var c=8;c<a-8;c++)this.setFunctionModule(6,c,c%2==0),this.setFunctionModule(c,6,c%2==0);this.setFunctionModule(8,a-8,!0);for(var d=0;d<15;d++){var e=o(d,0x537);this.setFunctionModule(8,a-1-d,e),this.setFunctionModule(a-1-d,8,e)}for(var f=0;f<15;f++){var g=o(f,0x537);this.setFunctionModule(0,a-1-f,g),this.setFunctionModule(a-1-f,0,g)}this.setFunctionModule(a-8,8,!0)},m.prototype.drawFinderPattern=function(a,b){for(var c=-4;c<=4;c++)for(var d=-4;d<=4;d++){var e=Math.max(Math.abs(c),Math.abs(d)),f=a+c,g=b+d;f>=0&&f<this.size&&g>=0&&g<this.size&&this.setFunctionModule(f,g,e!=2&&e!=4)}},m.prototype.drawCodewords=function(a){for(var b=0,c=this.size-1,d=this.size-1,e=1,f=0;f<a.length;f++){for(var g=0;g<8;g++){for(var h=0;h<2;h++){var i;if(0==h)i=c;else{if(d+e<0||d+e>=this.size)continue;i=d+e}for(;this.isFunction[i][d+e*(0==h?0:0)];){if(0==h)for(i-=1;i<0;)i=this.size-1,d-=2,e=-e,d+=e;else break}this.modules[i][d]=1==(a[f]>>>7-g&1)}}c-=1,c<0&&(c=this.size-1,d-=2,e=-e)}},m.prototype.setFunctionModule=function(a,b,c){this.modules[a][b]=c,this.isFunction[a][b]=!0};var n=function(a,b){for(var c=new Array,e=0;e<a.length;e++){var d=a.charCodeAt(e);d<128?c.push(d):d<2048?(c.push(192|d>>6),c.push(128|63&d)):d<55296||d>=57344?(c.push(224|d>>12),c.push(128|d>>6&63),c.push(128|63&d)):d<56320?(d=65536+((1023&d)<<10|1023&a.charCodeAt(++e)),c.push(240|d>>18),c.push(128|d>>12&63),c.push(128|d>>6&63),c.push(128|63&d)):c.push(239,191,189)}return c};function o(a,b){var c=0;for(var d=14;d>=0;d--)c=c<<1|o.bit(b,d);return o.bit(c,a)}o.bit=function(a,b){return a>>>b&1};var p=function(a,c){for(var d=[],e=0,f=0;f<a.length;f++){var g=a.charCodeAt(f);g<128?d.push(g):g<2048?(d.push(192|g>>6,128|63&g),e++):d.push(224|g>>12,128|g>>6&63,128|63&g),e++}var h=new Array(c);for(var i=0;i<d.length&&i<c;i++)h[i]=d[i];return h};return{encode:function(a,b){var c=new m(a,b)}}}();

(function(){
  var data = )rawliteral";
    html += "'" + qrJson + "';\n";
    html += R"rawliteral(
  var canvas = document.getElementById('qr-canvas');
  var ctx = canvas.getContext('2d');
  try {
    var qr = qrcode.encode(data, 0);
    var size = qr.size;
    var scale = Math.floor(220 / size);
    var offset = Math.floor((220 - size * scale) / 2);
    canvas.width = 220;
    canvas.height = 220;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 220, 220);
    ctx.fillStyle = '#000000';
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (qr.modules[y][x]) {
          ctx.fillRect(offset + x * scale, offset + y * scale, scale, scale);
        }
      }
    }
  } catch(e) {
    ctx.fillStyle = '#000000';
    ctx.font = '10px monospace';
    ctx.fillText('QR Error', 10, 20);
    ctx.font = '8px monospace';
    var lines = data.match(/.{1,30}/g) || [];
    lines.forEach(function(line, i) {
      ctx.fillText(line, 10, 35 + i * 12);
    });
  }
})();
</script>

<script>
async function sendConfig(e){
  e.preventDefault();
  var btn=document.getElementById('saveBtn');
  btn.disabled=true;btn.textContent='Saving...';
  var data={
    type:"iot-provisioning",version:1,
    deviceId:")rawliteral";
    html += String(config.deviceId) + R"rawliteral(",
    secret:")rawliteral";
    html += String(config.secret) + R"rawliteral(",
    wifiSsid:document.getElementById('ssid').value,
    wifiPassword:document.getElementById('pass').value,
    mqttBroker:document.getElementById('broker').value||'192.168.1.100',
    mqttPort:1883,mqttWsPort:3003
  };
  try{
    var r=await fetch('/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(r.ok){document.getElementById('setupForm').style.display='none';document.getElementById('result').style.display='block'}
    else{alert('Failed to save config');btn.disabled=false;btn.textContent='Save & Connect'}
  }catch(e){alert('Error: '+e.message);btn.disabled=false;btn.textContent='Save & Connect'}
}
</script>
</body></html>
)rawliteral";
    apServer.send(200, "text/html", html);
  });

  // POST /config — receives provisioning JSON from dashboard app or web form
  apServer.on("/config", HTTP_POST, []() {
    String body = apServer.arg("plain");
    Serial.println("[AP] Received config: " + body);

    if (saveConfig(body)) {
      apServer.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Config saved, restarting...\"}");
      delay(1000);
      ESP.restart();
    } else {
      apServer.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid config\"}");
    }
  });

  // GET /config — returns current device identity (for dashboard auto-detect)
  apServer.on("/config", HTTP_GET, [qrJson]() {
    apServer.send(200, "application/json", qrJson);
  });

  // GET /qr — returns just the QR payload JSON (lightweight endpoint)
  apServer.on("/qr", HTTP_GET, [qrJson]() {
    apServer.send(200, "application/json", qrJson);
  });

  // Captive portal redirect (for Android/Windows auto-detect)
  apServer.on("/generate_204", HTTP_GET, []() {
    apServer.sendHeader("Location", "http://192.168.4.1/");
    apServer.send(302, "text/plain", "");
  });
  apServer.on("/fwlink", HTTP_GET, []() {
    apServer.sendHeader("Location", "http://192.168.4.1/");
    apServer.send(302, "text/plain", "");
  });
  apServer.onNotFound([]() {
    apServer.sendHeader("Location", "http://192.168.4.1/");
    apServer.send(302, "text/plain", "");
  });

  apServer.begin();
  Serial.println("[AP] Web server started on 192.168.4.1");
  Serial.println("[AP] QR code available at http://192.168.4.1/");
}

// =====================================================================
// PROVISIONING: Load / Save config
// =====================================================================

bool loadConfig() {
  if (!LittleFS.exists(CONFIG_FILE)) return false;
  File f = LittleFS.open(CONFIG_FILE, "r");
  if (!f) return false;

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, f);
  f.close();
  if (err) {
    Serial.println("[CFG] Parse error, deleting corrupted config");
    LittleFS.remove(CONFIG_FILE);
    return false;
  }

  strlcpy(config.wifiSsid,     doc["wifiSsid"]     | "", sizeof(config.wifiSsid));
  strlcpy(config.wifiPassword, doc["wifiPassword"] | "", sizeof(config.wifiPassword));
  strlcpy(config.mqttBroker,   doc["mqttBroker"]   | "", sizeof(config.mqttBroker));
  config.mqttPort   = doc["mqttPort"]   | 1883;
  config.mqttWsPort = doc["mqttWsPort"] | 3003;

  config.valid = (strlen(config.deviceId) > 0 &&
                  strlen(config.wifiSsid) > 0 &&
                  strlen(config.mqttBroker) > 0);
  return config.valid;
}

bool saveConfig(const String& json) {
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, json);
  if (err) {
    Serial.println("[CFG] Invalid JSON!");
    return false;
  }

  String type = doc["type"] | "";
  if (type != "iot-provisioning") {
    Serial.println("[CFG] Not a provisioning payload!");
    return false;
  }

  strlcpy(config.wifiSsid,     doc["wifiSsid"]     | "", sizeof(config.wifiSsid));
  strlcpy(config.wifiPassword, doc["wifiPassword"] | "", sizeof(config.wifiPassword));
  strlcpy(config.mqttBroker,   doc["mqttBroker"]   | "", sizeof(config.mqttBroker));
  config.mqttPort   = doc["mqttPort"]   | 1883;
  config.mqttWsPort = doc["mqttWsPort"] | 3003;

  if (strlen(config.wifiSsid) == 0) {
    Serial.println("[CFG] Missing wifiSsid!");
    return false;
  }

  // Save config WITH device identity
  doc["deviceId"] = String(config.deviceId);
  doc["secret"] = String(config.secret);

  File f = LittleFS.open(CONFIG_FILE, "w");
  if (!f) { Serial.println("[CFG] Failed to write!"); return false; }
  serializeJson(doc, f);
  f.close();

  config.valid = true;
  Serial.println("[CFG] Provisioning saved!");
  Serial.println("[CFG]   Device: " + String(config.deviceId));
  Serial.println("[CFG]   WiFi:   " + String(config.wifiSsid));
  Serial.println("[CFG]   Broker: " + String(config.mqttBroker));
  return true;
}

void waitForSerialProvisioning() {
  Serial.println();
  Serial.println("========================================");
  Serial.println("  IoT Monitor - ESP32 + DHT11 Setup");
  Serial.println("========================================");
  Serial.println("  Option 1: Connect to WiFi '" + String(apSsid) + "'");
  Serial.println("    -> Open http://192.168.4.1");
  Serial.println("    -> Scan QR code or fill setup form");
  Serial.println("  Option 2: Scan QR in dashboard app");
  Serial.println("    -> QR data printed above");
  Serial.println("  Option 3: Paste via Serial Monitor");
  Serial.println("    PROVISION {\"type\":\"iot-provisioning\",...}");
  Serial.println("  Type RESET to erase WiFi/MQTT config");
  Serial.println("========================================");
  Serial.println("[PROV] Waiting...");

  String input = "";
  while (!provisioned) {
    apServer.handleClient();

    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n') {
        input.trim();
        if (input.startsWith("PROVISION ")) {
          String json = input.substring(10);
          if (saveConfig(json)) {
            provisioned = true;
            Serial.println("[PROV] Provisioned! Restarting...");
            delay(1000);
            ESP.restart();
          }
        } else if (input.startsWith("{")) {
          if (input.indexOf("\"iot-provisioning\"") >= 0 && saveConfig(input)) {
            provisioned = true;
            Serial.println("[PROV] Provisioned! Restarting...");
            delay(1000);
            ESP.restart();
          }
        } else if (input == "RESET") {
          LittleFS.remove(CONFIG_FILE);
          LittleFS.remove(QUEUE_FILE);
          // Note: IDENTITY_FILE is NOT erased - device ID persists
          Serial.println("[PROV] WiFi/MQTT config erased! Restarting...");
          ESP.restart();
        } else if (input == "STATUS") {
          Serial.println("--- Device Status ---");
          Serial.println("Device: " + String(config.deviceId));
          Serial.println("Secret: " + String(config.secret));
          Serial.println("AP: " + String(apSsid));
          Serial.println("Provisioned: " + String(config.valid ? "YES" : "NO"));
        }
        input = "";
      } else if (c != '\r') {
        input += c;
      }
    }
    delay(10);
  }
}

// === LittleFS Queue ===================================================

int queueSize() {
  File f = LittleFS.open(QUEUE_FILE, "r");
  if (!f) return 0;
  int count = 0;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    if (line.length() > 5) count++;
  }
  f.close();
  return count;
}

bool enqueueReading(const String& json) {
  if (queueSize() >= MAX_QUEUE) {
    File f = LittleFS.open(QUEUE_FILE, "r");
    File tmp = LittleFS.open("/tmp.dat", "w");
    if (f && tmp) {
      bool skipped = false;
      while (f.available()) {
        String line = f.readStringUntil('\n');
        if (!skipped) { skipped = true; continue; }
        if (line.length() > 5) tmp.println(line);
      }
      f.close(); tmp.close();
      LittleFS.remove(QUEUE_FILE);
      LittleFS.rename("/tmp.dat", QUEUE_FILE);
    }
  }
  File f = LittleFS.open(QUEUE_FILE, "a");
  if (!f) return false;
  f.println(json);
  f.close();
  return true;
}

void flushQueue() {
  if (!LittleFS.exists(QUEUE_FILE)) return;
  int sz = queueSize();
  if (sz == 0) return;
  Serial.printf("[FS] Flushing %d queued readings\n", sz);
  File f = LittleFS.open(QUEUE_FILE, "r");
  if (!f) return;
  int sent = 0, failed = 0;
  String remaining = "";
  while (f.available()) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() <= 5) continue;
    String topic = String("devices/") + config.deviceId + "/data";
    if (mqtt.publish(topic.c_str(), line.c_str())) {
      sent++; delay(50);
    } else { failed++; remaining += line + "\n"; }
  }
  f.close();
  LittleFS.remove(QUEUE_FILE);
  if (remaining.length() > 0) {
    File f2 = LittleFS.open(QUEUE_FILE, "w");
    if (f2) { f2.print(remaining); f2.close(); }
  }
  Serial.printf("[FS] Flush: %d sent, %d failed\n", sent, failed);
}

// === WiFi =============================================================

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[WiFi] Connecting to %s (delay=%dms)...\n",
                 config.wifiSsid, wifiRetryDelay);
  WiFi.begin(config.wifiSsid, config.wifiPassword);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(wifiRetryDelay / 5); attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiRetryDelay = 500;
    Serial.println("[WiFi] OK! IP: " + WiFi.localIP().toString());
  } else {
    wifiRetryDelay = min(wifiRetryDelay * 2, 30000);
    Serial.println("[WiFi] Failed - retry later");
  }
}

// === MQTT =============================================================

bool connectMQTT() {
  if (mqtt.connected()) return true;
  mqtt.setServer(config.mqttBroker, config.mqttPort);
  if (mqtt.connect(config.deviceId)) {
    mqttRetryDelay = 1000;
    Serial.println("[MQTT] Connected to " + String(config.mqttBroker));

    // Send registration message with device identity (allows auto-registration in dashboard)
    String regTopic = String("devices/") + config.deviceId + "/register";
    String regPayload = String("{\"deviceId\":\"") + String(config.deviceId) +
                        "\",\"secret\":\"" + String(config.secret) + "\"}";
    mqtt.publish(regTopic.c_str(), regPayload.c_str());
    Serial.println("[MQTT] Registration sent: " + regPayload);

    String st = String("devices/") + config.deviceId + "/status";
    mqtt.publish(st.c_str(), "{\"status\":\"online\"}", true);
    flushQueue();
    return true;
  }
  mqttRetryDelay = min(mqttRetryDelay * 2, 60000);
  Serial.printf("[MQTT] Failed (rc=%d)\n", mqtt.state());
  return false;
}

// === DHT11 Sensor =====================================================

void initSensors() {
  dht.begin();
  dhtOk = true; dhtFailCount = 0;
  Serial.println("[DHT11] OK on GPIO" + String(DHT_PIN));
}

void checkSensorHealth() {
  if (!dhtOk && dhtFailCount > 0 && dhtFailCount % 6 == 0) {
    float t = dht.readTemperature();
    if (!isnan(t)) {
      dhtOk = true; dhtFailCount = 0;
      Serial.println("[DHT11] RECOVERED!");
      publishStatus("sensor_recovered", "DHT11");
    }
  }
}

void publishStatus(const char* status, const char* details) {
  if (!mqtt.connected()) return;
  String topic = String("devices/") + config.deviceId + "/status";
  String payload = String("{\"status\":\"") + status +
    "\",\"details\":\"" + details + "\"}";
  mqtt.publish(topic.c_str(), payload.c_str(), true);
}

void sendSensorData() {
  float temperature = NAN, humidity = NAN;

  if (dhtOk) {
    temperature = dht.readTemperature();
    humidity    = dht.readHumidity();
    if (isnan(temperature) || isnan(humidity)) {
      dhtFailCount++;
      if (dhtFailCount >= 3) {
        dhtOk = false;
        Serial.println("[DHT11] FAILED 3x -> offline");
        publishStatus("sensor_error", "DHT11 not responding");
      }
    } else { dhtFailCount = 0; }
  }

  // DHT11: temp range 0-50°C (±2°C), humidity 20-90% (±5%)
  // Send temperature + humidity; co2 and gasRaw are null (no gas sensor)
  String topic = String("devices/") + config.deviceId + "/data";
  String payload = "{";
  payload += "\"temperature\":" + (!isnan(temperature) ? String(temperature,1) : "null") + ",";
  payload += "\"co2\":null,";
  payload += "\"humidity\":" + (!isnan(humidity) ? String(humidity,1) : "null") + ",";
  payload += "\"gasRaw\":null";
  payload += "}";

  bool published = false;
  if (WiFi.status() == WL_CONNECTED && connectMQTT())
    published = mqtt.publish(topic.c_str(), payload.c_str());
  if (!published) {
    String qPayload = payload;
    qPayload.remove(qPayload.length()-1);
    qPayload += ",\"timestamp\":\"" + getISOTime() + "\"}";
    enqueueReading(qPayload);
    Serial.println("[DATA] Queued: " + payload);
  } else {
    Serial.println("[DATA] Sent: " + payload);
  }
}

// === Setup ============================================================

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== IoT Monitor -- ESP32 + DHT11 ===");

  if (!LittleFS.begin(true)) Serial.println("[FS] Mount FAILED!");
  else Serial.printf("[FS] OK, queued: %d\n", queueSize());

  // Step 1: Generate or load device identity (persists forever)
  generateIdentity();

  // Step 2: Try to load saved WiFi/MQTT config
  if (loadConfig()) {
    Serial.println("[CFG] Config loaded from flash");
    Serial.println("[CFG]   Device: " + String(config.deviceId));
    Serial.println("[CFG]   WiFi:   " + String(config.wifiSsid));
    Serial.println("[CFG]   Broker: " + String(config.mqttBroker));
    provisioned = true;

    // Start in STA mode (normal operation)
    WiFi.mode(WIFI_STA);
    connectWiFi();
    syncNTP();
    connectMQTT();
    initSensors();

    if (mqtt.connected()) {
      String status = dhtOk ? "online" : "sensor_error";
      publishStatus(status.c_str(), "Boot complete");
    }
  } else {
    // NOT provisioned -> start AP mode for QR display + configuration
    Serial.println("[CFG] No WiFi/MQTT config found.");
    Serial.println("[CFG] Starting AP mode...");
    Serial.println("[CFG] Connect to WiFi '" + String("IoT-") + String(config.deviceId) + "' to see QR code");
    setupApMode();
    provisioned = false;
  }
}

// === Main Loop ========================================================

void loop() {
  if (!provisioned) {
    apServer.handleClient();
    waitForSerialProvisioning();
    return;
  }

  // Normal operation
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input == "RESET") {
      LittleFS.remove(CONFIG_FILE);
      LittleFS.remove(QUEUE_FILE);
      // Note: IDENTITY_FILE is NOT erased - device ID persists
      Serial.println("[CMD] WiFi/MQTT erased! Restarting...");
      ESP.restart();
    } else if (input.startsWith("PROVISION ") || input.startsWith("{")) {
      String json = input.startsWith("PROVISION ") ? input.substring(10) : input;
      if (saveConfig(json)) {
        Serial.println("[CMD] Reprovisioned! Restarting...");
        delay(1000); ESP.restart();
      }
    } else if (input == "STATUS") {
      Serial.println("--- Device Status ---");
      Serial.println("Device: " + String(config.deviceId));
      Serial.println("Secret: " + String(config.secret));
      Serial.println("WiFi: " + String(WiFi.status() == WL_CONNECTED ? "OK" : "DISCONNECTED"));
      Serial.println("MQTT: " + String(mqtt.connected() ? "OK" : "DISCONNECTED"));
      Serial.println("DHT11: " + String(dhtOk ? "OK" : "FAIL"));
      Serial.println("Queue: " + String(queueSize()));
    }
  }

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() == WL_CONNECTED) { syncNTP(); connectMQTT(); }
  }
  if (!mqtt.connected() && WiFi.status() == WL_CONNECTED) connectMQTT();
  mqtt.loop();
  checkSensorHealth();

  unsigned long now = millis();
  if (now - lastSend >= (unsigned long)SEND_INTERVAL) {
    lastSend = now;
    sendSensorData();
  }

  static unsigned long lastHeartbeat = 0;
  if (now - lastHeartbeat >= 60000 && mqtt.connected()) {
    lastHeartbeat = now;
    publishStatus("online", "heartbeat");
  }
}
