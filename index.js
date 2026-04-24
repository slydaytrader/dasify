const client = mqtt.connect('mqtts://m518b210.ala.us-east-1.emqxsl.com:8883', {
    // This creates a unique ID every single time the app starts
    clientId: 'lisaki_bridge_' + Math.random().toString(16).substring(2, 12), 
    username: 'esp_device',
    password: 'gamepage6',
    rejectUnauthorized: false,
    keepalive: 30,             // More frequent pings
    reconnectPeriod: 1000,     // Reconnect instantly if dropped
    clean: true                // Start a fresh session
});

client.on('connect', () => {
    console.log("🚀 BRIDGE LIVE: Unique ID assigned and Connected.");
    client.subscribe('dasify/lisakidairy/#', (err) => {
        if (!err) console.log("📡 Listening to ALL Lisaki topics");
    });
});

client.on('offline', () => {
    console.log("⚠️ Bridge lost connection to EMQX!");
});
