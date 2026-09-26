const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const URL_FILE = path.join(__dirname, '..', '..', '..', 'scratch', 'cco-sistema', 'tunnel_url.txt');

let reconnectTimer = null;

async function startTunnel() {
    try {
        console.log('[Tunnel] Conectando porta ' + PORT + '...');
        const randSub = 'cco-cedae-' + Math.floor(1000 + Math.random() * 9000);
        const tunnel = await localtunnel({
            port: PORT,
            subdomain: randSub
        });

        const publicUrl = tunnel.url;
        console.log('=======================================================');
        console.log('[CCO TUNNEL ATIVO]: ' + publicUrl);
        console.log('=======================================================');

        fs.writeFileSync(URL_FILE, publicUrl, 'utf8');

        tunnel.on('close', () => {
            console.log('[Tunnel] Conexao encerrada. Reconectando em 3s...');
            scheduleReconnect();
        });

        tunnel.on('error', (err) => {
            console.error('[Tunnel Error]:', err.message);
            scheduleReconnect();
        });

    } catch (err) {
        console.error('[Tunnel Falha]:', err.message);
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startTunnel();
    }, 3000);
}

setInterval(() => {}, 60000);

startTunnel();
