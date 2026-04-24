const mqtt = require('mqtt');   // <--- This was missing!
const axios = require('axios');
const http = require('http');

// 1. WEB SERVER (Satisfies Render's health checks)
const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] Heartbeat: Web check received.`);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Lisaki MQTT Bridge is Active\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

// 2. RESILIENT MQTT BRIDGE
const client = mqtt.connect('mqtts://m518b210.ala.us-east-1.emqxsl.com:8883', {
    // Unique ID prevents collisions
    clientId: 'lisaki_bridge_' + Math.random().toString(16).substring(2, 12), 
    username: 'esp_device',
    password: 'gamepage6',
    rejectUnauthorized: false,
    keepalive: 30,             
    reconnectPeriod: 1000,     
    clean: true                
});

const PHP_API = "https://dasify.co.ke/lisaki/api/sync_handler.php";

client.on('connect', () => {
    console.log("🚀 BRIDGE LIVE: Unique ID assigned and Connected.");
    client.subscribe('dasify/lisakidairy/#', (err) => {
        if (!err) console.log("📡 Listening to ALL Lisaki topics");
    });
});

client.on('offline', () => {
    console.log("⚠️ Bridge lost connection to EMQX!");
});

client.on('message', async (topic, message) => {
    const payload = message.toString();
    const type = topic.split('/').pop();
    
    console.log(`📩 New Data [${type}]: ${payload}`);

    try {
        const response = await axios.post(PHP_API, { type, payload });
        console.log(`✔ [${type}] Synced. PHP Status: ${response.status}`);
    } catch (err) {
        console.error(`❌ [${type}] Sync Failed: ${err.message}`);
    }
});
