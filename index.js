const mqtt = require('mqtt');
const axios = require('axios');
const http = require('http');

// --- CONFIG ---
const PING_TOKEN = "24|t9IXUNcsidTqyxMzHwErxhG1E2sETgszYHz10l9hffb7f076";
const ADMIN_PHONE = "+254729901111"; 
const PHP_API = "https://dasify.co.ke/lisaki/api/sync_handler.php";

// Simple HTTP server to keep the Render service alive
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Lisaki Smart Bridge Active');
}).listen(process.env.PORT || 10000);

const client = mqtt.connect('mqtts://m518b210.ala.us-east-1.emqxsl.com:8883', {
    clientId: 'lisaki_bridge_' + Math.random().toString(16).substring(2, 8), 
    username: 'esp_device', password: 'gamepage6', rejectUnauthorized: false
});

// SMS Function with safety substring to avoid multi-page billing
async function sendSMS(to, msg) {
    if (!to) return;
    let phone = to.toString().replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '254' + phone.substring(1);
    if (!phone.startsWith('+')) phone = '+' + phone;

    try {
        await axios.post("https://api.bulk.ping.africa/api/sms/send", {
            recipient: phone,
            message: msg.substring(0, 160), 
            sender_id: "PING-AFRICA"
        }, {
            headers: { 'Authorization': `Bearer ${PING_TOKEN}` },
            timeout: 5000
        });
        console.log(`✅ SMS to ${phone}`);
    } catch (err) { console.error("❌ SMS Error:", err.message); }
}

async function performFullSync() {
    try {
        const [fRes, iRes] = await Promise.all([
            axios.get(`${PHP_API}?format=text`, { timeout: 5000 }),
            axios.get(`${PHP_API}?get_inventory=1`, { timeout: 5000 })
        ]);
        if (fRes.data) client.publish('dasify/lisakidairy/cache', fRes.data.trim());
        if (iRes.data) client.publish('dasify/lisakidairy/inventory', iRes.data.toString());
    } catch (err) { console.error("Sync Fail:", err.message); }
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

        const parts = payload.split('|');
        
        // --- INTAKE LOGIC ---
        if (type === 'intake' && parts.length >= 5) {
            const [ph, lacto, fNum, vol, ppl] = parts;
            const total = (parseFloat(vol) * parseFloat(ppl)).toFixed(2);
            
            axios.get(`${PHP_API}?get_farmer_phone=${fNum}`).then(res => {
                if (res.data && res.data.phone) {
                    const { name, phone } = res.data;

                    // Exact format requested for farmer
                    const fMsg = `${name}\nwe have recieved ${vol} liters with Ph ${ph} at a Ppl of ksh ${ppl} ,totall ksh ${total}.\nyour farmer number is ${fNum}`;
                    sendSMS(phone, fMsg);
                }
            }).catch(() => {});
        } 
        
        // --- SALES LOGIC (Warmly Presented for Admin) ---
        else if (type === 'sales' && parts.length >= 3) {
            const [amt, ppl, vol] = parts;
            
            const sMsg = `Confirmed.A sale of ${vol}L has just been completed at KES ${ppl}/L. Total earned: KES ${amt}. Full details  available on your dashboard.`;
            
            sendSMS(ADMIN_PHONE, sMsg);
        }

    } catch (err) { console.error(`❌ [${type}] Bridge Error: ${err.message}`); }
});
