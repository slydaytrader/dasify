const mqtt = require('mqtt');
const axios = require('axios');
const http = require('http');

// --- SMS CONFIGURATION ---
const PING_TOKEN = "24|t9IXUNcsidTqyxMzHwErxhG1E2sETgszYHz10l9hffb7f076";
const ADMIN_PHONE = "+254729901111"; // <--- Put the Admin Phone Number here

http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Lisaki Smart Bridge Active');
}).listen(process.env.PORT || 10000);

const client = mqtt.connect('mqtts://m518b210.ala.us-east-1.emqxsl.com:8883', {
    clientId: 'lisaki_bridge_' + Math.random().toString(16).substring(2, 8), 
    username: 'esp_device', password: 'gamepage6', rejectUnauthorized: false
});

const PHP_API = "https://dasify.co.ke/lisaki/api/sync_handler.php";

// Helper to format phone to International format
function formatPhone(phone) {
    let clean = phone.toString().replace(/\D/g, '');
    if (clean.startsWith('0')) clean = '254' + clean.substring(1);
    return clean.startsWith('+') ? clean : '+' + clean;
}

// SMS Dispatcher
async function sendSMS(to, message) {
    try {
        await axios.post("https://api.bulk.ping.africa/api/sms/send", {
            recipient: formatPhone(to),
            message: message,
            sender_id: "PING-AFRICA"
        }, {
            headers: { 'Authorization': `Bearer ${PING_TOKEN}` }
        });
        console.log(`✅ SMS Sent to ${to}`);
    } catch (err) {
        console.error("❌ SMS Failed:", err.response ? err.response.data : err.message);
    }
}

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
        // 1. Save to Database
        await axios.post(PHP_API, { type, payload });

        // 2. Refresh ESP Inventory
        const invRes = await axios.get(`${PHP_API}?get_inventory=1`);
        client.publish('dasify/lisakidairy/inventory', invRes.data.toString());

        // 3. SMS Logic
        const parts = payload.split('|');
        
        if (type === 'intake') {
            // Intake Payload: ph|lacto|farmer_num|vol|ppl
            const [ph, lacto, fNum, vol, ppl] = parts;
            const total = (parseFloat(vol) * parseFloat(ppl)).toFixed(2);
            
            // Get Farmer Phone from Cache (or you can adjust PHP to return it)
            // For now, we fetch the farmer details for the phone number
            const farmerInfo = await axios.get(`${PHP_API}?get_farmer_phone=${fNum}`);
            if (farmerInfo.data && farmerInfo.data.phone) {
                const msg = `Lisaki Dairy: Received ${vol}L at ${ppl}/L. Total: KES ${total}. Ref: Batch-${Date.now().toString().slice(-4)}`;
                sendSMS(farmerInfo.data.phone, msg);
            }
        } 
        
        else if (type === 'sales') {
            // Sales Payload: total_amount|ppl|vol
            const [total, ppl, vol] = parts;
            const msg = `Lisaki SALE: ${vol}L sold for KES ${total} (Rate: ${ppl}/L). Dispenser updated.`;
            sendSMS(ADMIN_PHONE, msg);
        }

    } catch (err) { console.error(`❌ [${type}] DB Error: ${err.message}`); }
});
