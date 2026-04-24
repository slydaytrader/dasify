const mqtt = require('mqtt');
const axios = require('axios');
const http = require('http');

const server = http.createServer((req, res) => {
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
        console.log("🔄 Syncing Farmers & Volumes...");
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
    performFullSync(); // Initial boot sync
});

client.on('message', async (topic, message) => {
    const payload = message.toString();
    const type = topic.split('/').pop();

    // Handlers for commands vs data
    if (type === 'cmd' && payload === 'RELOAD') {
        return await performFullSync();
    }

    if (type === 'cache' || type === 'inventory') return;

    try {
        // Sync Intake/Sales/Processing to PHP
        await axios.post(PHP_API, { type, payload });
        console.log(`✔ [${type}] Synced to DB`);
        
        // Push fresh volumes to ESP immediately after any transaction
        // This keeps the ESP cache "warm" so it doesn't have to ask next time
        const invRes = await axios.get(`${PHP_API}?get_inventory=1`);
        client.publish('dasify/lisakidairy/inventory', invRes.data.toString());
    } catch (err) { console.error(`❌ [${type}] DB Error: ${err.message}`); }
});
