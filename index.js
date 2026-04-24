const mqtt = require('mqtt');
const axios = require('axios');
const http = require('http');

// 1. WEB SERVER
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Lisaki Bridge & Sync Active\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

// 2. MQTT CONNECTION
const client = mqtt.connect('mqtts://m518b210.ala.us-east-1.emqxsl.com:8883', {
    clientId: 'lisaki_bridge_' + Math.random().toString(16).substring(2, 12), 
    username: 'esp_device',
    password: 'gamepage6',
    rejectUnauthorized: false,
    keepalive: 30,             
    reconnectPeriod: 1000,     
    clean: true                
});

const PHP_API = "https://dasify.co.ke/lisaki/api/sync_handler.php";

// 3. FETCHING LOGIC (Farmers & Inventory)
async function performFullSync() {
    try {
        console.log("🔄 Performing Full Sync (Farmers & Inventory)...");
        
        // A. Fetch Farmers
        const farmerRes = await axios.get(`${PHP_API}?format=text`);
        if (farmerRes.data) {
            client.publish('dasify/lisakidairy/cache', farmerRes.data.trim(), { retain: false });
            console.log("✅ Farmers synced.");
        }

        // B. Fetch Inventory (Requesting a new format from PHP)
        const invRes = await axios.get(`${PHP_API}?get_inventory=1`);
        if (invRes.data) {
            // This expects a string like "VOL|120.5"
            client.publish('dasify/lisakidairy/inventory', invRes.data.toString(), { retain: false });
            console.log("✅ Inventory synced.");
        }
    } catch (err) {
        console.error("❌ Sync Error:", err.message);
    }
}

client.on('connect', () => {
    console.log("🚀 BRIDGE LIVE.");
    client.subscribe('dasify/lisakidairy/#');
});

// 4. MESSAGE ROUTER
client.on('message', async (topic, message) => {
    const payload = message.toString();
    const type = topic.split('/').pop();
    
    // Command Handler
    if (type === 'cmd' && payload === 'RELOAD') {
        await performFullSync();
        return;
    }

    // Ignore read-only topics to prevent loops
    if (type === 'cache' || type === 'inventory') return;

    // Data Sync Handler (Intake, Sales, etc.)
    console.log(`📩 New Data [${type}]: ${payload}`);
    try {
        const response = await axios.post(PHP_API, { type, payload });
        console.log(`✔ [${type}] Synced. PHP Status: ${response.status}`);
        
        // After a Sale or Intake, trigger an inventory refresh automatically
        if (type === 'sales' || type === 'intake') {
            await performFullSync();
        }
    } catch (err) {
        console.error(`❌ [${type}] Sync Failed: ${err.message}`);
    }
});
