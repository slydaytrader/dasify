const mqtt = require('mqtt');
const axios = require('axios');
const http = require('http');

// 1. WEB SERVER + HEALTH CHECK
const server = http.createServer((req, res) => {
  // Every time Cron-job.org hits this, we log it to see the bridge is alive
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
    username: 'esp_device',
    password: 'gamepage6',
    rejectUnauthorized: false,
    keepalive: 60,            // Vital for keeping the socket open
    reconnectPeriod: 1000,    // Try to reconnect every 1s if it drops
    connectTimeout: 30 * 1000
});

const PHP_API = "https://dasify.co.ke/lisaki/api/sync_handler.php";

client.on('connect', () => {
    console.log("✅ Connected to EMQX Broker");
    client.subscribe('dasify/lisakidairy/#', (err) => {
        if (!err) console.log("Subscribed to all topics");
    });
});

client.on('offline', () => {
    console.log("⚠️ Bridge is offline (Broker connection lost)");
});

client.on('error', (err) => {
    console.error("❌ MQTT Error:", err.message);
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
