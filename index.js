const mqtt = require('mqtt');
const axios = require('axios');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Lisaki Bridge Active');
}).listen(process.env.PORT || 10000);

const client = mqtt.connect('mqtts://m518b210.ala.us-east-1.emqxsl.com:8883', {
    clientId: 'lisaki_bridge_' + Math.random().toString(16).substring(2, 8), 
    username: 'esp_device', password: 'gamepage6', rejectUnauthorized: false
});

const PHP_API = "https://dasify.co.ke/lisaki/api/sync_handler.php";

async function performFullSync() {
    try {
        const farmerRes = await axios.get(`${PHP_API}?format=text`);
        if (farmerRes.data) client.publish('dasify/lisakidairy/cache', farmerRes.data.trim());

        const invRes = await axios.get(`${PHP_API}?get_inventory=1`);
        if (invRes.data) client.publish('dasify/lisakidairy/inventory', invRes.data.toString());
        console.log("🔄 Global Sync Pushed");
    } catch (err) { console.error("Sync Error:", err.message); }
}

client.on('connect', () => {
    client.subscribe('dasify/lisakidairy/#');
    performFullSync();
});

client.on('message', async (topic, message) => {
    const payload = message.toString();
    const type = topic.split('/').pop();

    if (type === 'cmd' && payload === 'RELOAD') return await performFullSync();
    if (type === 'cache' || type === 'inventory') return;

    try {
        await axios.post(PHP_API, { type, payload });
        console.log(`✔ [${type}] Synced`);
        await performFullSync(); // Auto-refresh volumes for the ESP
    } catch (err) { console.error(`❌ [${type}] Fail: ${err.message}`); }
});
