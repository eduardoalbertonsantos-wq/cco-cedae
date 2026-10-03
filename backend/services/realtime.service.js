// CCO - Serviço de Transmissão em Tempo Real (Server-Sent Events)
// Conecta o Aplicativo dos Fiscais, Painel de Controle e Painel da Diretoria

const clients = new Set();

/**
 * Endpoint SSE para inscrição de clientes web (Dashboards, Painel Diretoria)
 */
function subscribeRealtime(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Desativa buffering no Nginx/Render
    res.flushHeaders?.();

    const client = { res, id: Date.now() + Math.random().toString(36).substring(2, 7) };
    clients.add(client);

    // Heartbeat inicial de conexão confirmada
    res.write(`data: ${JSON.stringify({ 
        type: 'CONECTADO', 
        mensagem: 'Transmissão em tempo real CCO conectada',
        timestamp: new Date().toISOString() 
    })}\n\n`);

    // Keepalive a cada 25 segundos para evitar timeouts de proxy reverso
    const keepAliveTimer = setInterval(() => {
        try {
            res.write(': keepalive\n\n');
        } catch (_) {
            clearInterval(keepAliveTimer);
            clients.delete(client);
        }
    }, 25000);

    req.on('close', () => {
        clearInterval(keepAliveTimer);
        clients.delete(client);
    });
}

/**
 * Emite um evento operacional para todos os painéis conectados
 * @param {'EM_PREENCHIMENTO' | 'ENVIADO' | 'EXCLUIDO' | 'ATUALIZACAO'} tipo 
 * @param {object} dados 
 */
function emitirEventoOperacional(tipo, dados = {}) {
    const payload = {
        type: tipo,
        dados,
        timestamp: new Date().toISOString()
    };
    const message = `data: ${JSON.stringify(payload)}\n\n`;

    for (const client of clients) {
        try {
            client.res.write(message);
        } catch (e) {
            clients.delete(client);
        }
    }
}

function getConnectedClientsCount() {
    return clients.size;
}

module.exports = {
    subscribeRealtime,
    emitirEventoOperacional,
    getConnectedClientsCount
};
