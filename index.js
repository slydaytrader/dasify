const mqtt = require('mqtt');
const axios = require('axios');
const http = require('http');

// 1. WEB SERVER (Satisfies Render's health checks)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Lisaki MQTT Bridge is Active\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// 2. MQTT BRIDGE
const client = mqtt.connect('mqtts://m518b210.ala.us-east-1.emqxsl.com:8883', {
    username: 'esp_device',
    password: 'gamepage6',
    rejectUnauthorized: false
});

const PHP_API = "https://dasify.co.ke/lisaki/api/sync_handler.php";

client.on('connect', () => {
    console.log("Connected to EMQX Broker");
    client.subscribe('dasify/lisakidairy/#');
});

client.on('message', async (topic, message) => {
    const payload = message.toString();
    const type = topic.split('/').pop();
    
    console.log(`Received ${type}: ${payload}`);

    try {
        // Send to your PHP API exactly how the Worker would have
        await axios.post(PHP_API, { type, payload });
        console.log(`✔ [${type}] Synced to MySQL`);
    } catch (err) {
        console.error("❌ Sync Error:", err.message);
    }
});
