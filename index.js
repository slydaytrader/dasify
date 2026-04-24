const mqtt = require('mqtt');
const axios = require('axios');
const http = require('http');

http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Lisaki Smart Bridge Active');
}).listen(process.env.PORT || 10000);

const client = mqtt.connect('mqtts://m518b210.ala.us-east-1.emqxsl.com:8883', {
    clientId: 'lisaki_bridge_' + Math.random().toString(16).substring(2, 8), 
    username: 'esp_device', password: 'gamepage6', rejectUnauthorized: false
});

const PHP_API = "https://dasify.co.ke/lisaki/api/sync_handler.php";

async function performFullSync() {
    try {
        const [farmerRes, invRes] = await Promise.all([
            axios.get(`${PHP_API}?format=text`, { timeout: 4000 }),
            axios.get(`${PHP_API}?get_inventory=1`, { timeout: 4000 })
        ]);
        if (farmerRes.data) client.publish('dasify/lisakidairy/cache', farmerRes.data.trim());
        if (invRes.data) client.publish('dasify/lisakidairy/inventory', invRes.data.toString());
    } catch (err) { console.error("Sync Failed:", err.message); }
}

client.on('connect', () => {
    client.subscribe('dasify/lisakidairy/#');
    performFullSync();
});

client.on('message', async (topic, message) => {
    const payload = message.toString();
    const type = topic.split('/').pop();

    if (type === 'cmd' && payload === 'RELOAD') return await performFullSync();
    if (['cache', 'inventory'].includes(type)) return;

    try {
        await axios.post(PHP_API, { type, payload });
        // Immediately refresh volumes for the ESP
        const invRes = await axios.get(`${PHP_API}?get_inventory=1`);
        client.publish('dasify/lisakidairy/inventory', invRes.data.toString());
    } catch (err) { console.error(`❌ [${type}] DB Error: ${err.message}`); }
});
