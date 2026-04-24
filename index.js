const mqtt = require('mqtt');
const axios = require('axios');
const http = require('http');

// --- CONFIG ---
const PING_TOKEN = "24|t9IXUNcsidTqyxMzHwErxhG1E2sETgszYHz10l9hffb7f076";
const ADMIN_PHONE = "+254729901111"; 
const PHP_API = "https://dasify.co.ke/lisaki/api/sync_handler.php";

http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Lisaki Smart Bridge Active');
}).listen(process.env.PORT || 10000);

const client = mqtt.connect('mqtts://m518b210.ala.us-east-1.emqxsl.com:8883', {
    clientId: 'lisaki_bridge_' + Math.random().toString(16).substring(2, 8), 
    username: 'esp_device', password: 'gamepage6', rejectUnauthorized: false
});

// SMS Function (International Format Handling)
async function sendSMS(to, msg) {
    if (!to) return;
    let phone = to.toString().replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '254' + phone.substring(1);
    if (!phone.startsWith('+')) phone = '+' + phone;

    try {
        await axios.post("https://api.bulk.ping.africa/api/sms/send", {
            recipient: phone,
            message: msg,
            sender_id: "PING-AFRICA"
        }, {
            headers: { 'Authorization': `Bearer ${PING_TOKEN}` },
            timeout: 5000
        });
        console.log(`✅ SMS Sent to ${phone}`);
    } catch (err) { console.error("❌ SMS Error:", err.message); }
}

async function performFullSync() {
    try {
        const [farmerRes, invRes] = await Promise.all([
            axios.get(`${PHP_API}?format=text`, { timeout: 5000 }),
            axios.get(`${PHP_API}?get_inventory=1`, { timeout: 5000 })
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
        // 1. Save to DB
        await axios.post(PHP_API, { type, payload });
        
        // 2. Refresh ESP Inventory
        const invRes = await axios.get(`${PHP_API}?get_inventory=1`);
        client.publish('dasify/lisakidairy/inventory', invRes.data.toString());

        // 3. Background SMS (Non-blocking)
        const parts = payload.split('|');
        if (type === 'intake' && parts.length >= 5) {
            const [ph, lacto, fNum, vol, ppl] = parts;
            const total = (parseFloat(vol) * parseFloat(ppl)).toFixed(2);
            
            // Fetch name/phone and send receipt
            axios.get(`${PHP_API}?get_farmer_phone=${fNum}`).then(res => {
                if (res.data && res.data.phone) {
                    const msg = `${res.data.name}\nwe have recieved your ${vol} liters with Ph value ${ph} at a ppl of ksh ${ppl} totalling ksh ${total}.\nyour farmer number is ${fNum}`;
                    sendSMS(res.data.phone, msg);
                }
            }).catch(() => {});
        } 
        else if (type === 'sales') {
            const [amt, ppl, vol] = parts;
            sendSMS(ADMIN_PHONE, `Lisaki SALE: ${vol}L sold for KES ${amt} at ${ppl}/L.`);
        }

    } catch (err) { console.error(`❌ [${type}] Bridge Error: ${err.message}`); }
});
