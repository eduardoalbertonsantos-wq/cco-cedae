require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const https = require('https');
const { initializeDatabase, closeDatabase, getDb } = require('./database/db');
const { getBrasiliaDateTime } = require('./utils/date.utils');

const app = express();

// Confiança em proxy reverso (Nginx, Traefik, Localtunnel, Cloudflare, Render)
app.set('trust proxy', 1);

// Redirecionamento HTTPS condicional para ambientes de produção
if (process.env.NODE_ENV === 'production' && process.env.HTTPS_ENFORCE === 'true') {
    app.use((req, res, next) => {
        if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
            return res.redirect(301, 'https://' + req.get('host') + req.url);
        }
        next();
    });
}

// Security - configured to allow CDN resources and PWA connections
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org", "https://*.basemaps.cartocdn.com"],
            connectSrc: ["'self'", "https:", "wss:"]
        }
    }
}));

// CORS configurado para máxima compatibilidade com APKs, PWAs e navegadores
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'Expires', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range']
}));
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (generous limit to ensure smooth operations)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50000, // Generous limit so users and dashboards are never throttled
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false }
});
app.use('/api', limiter);

// Health check endpoints com sincronização de data/hora oficial de Brasília e diagnóstico do banco
const healthCheckHandler = (req, res) => {
    const sp = getBrasiliaDateTime();
    let postosAtivos = 0;
    let setoresAtivos = 0;
    let bancoStatus = 'online';
    try {
        const db = getDb();
        const rowPostos = db.prepare("SELECT COUNT(*) as count FROM postos WHERE status = 'ativo'").get();
        if (rowPostos) postosAtivos = rowPostos.count;
        const rowSetores = db.prepare("SELECT COUNT(*) as count FROM setores WHERE status = 'ativo'").get();
        if (rowSetores) setoresAtivos = rowSetores.count;
    } catch (err) {
        bancoStatus = 'erro: ' + err.message;
    }

    res.json({
        status: 'ok',
        service: 'cco-backend',
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'production',
        timezone: 'America/Sao_Paulo',
        data: sp.isoDate,
        data_formatada: sp.displayDate,
        hora: sp.horaCurta,
        timestamp: sp.dataHora,
        utcTime: new Date().toISOString(),
        postosOficiais: postosAtivos,
        postosAtivos: postosAtivos,
        setoresAtivos: setoresAtivos,
        banco: bancoStatus
    });
};

app.get('/health', healthCheckHandler);
app.get('/api/health', healthCheckHandler);
app.get('/api/v1/health', healthCheckHandler);

// Versão oficial e metadados multiplataforma
app.get('/api/v1/version', (req, res) => {
    let postosAtivos = 0;
    try {
        const db = getDb();
        const rowPostos = db.prepare("SELECT COUNT(*) as count FROM postos WHERE status = 'ativo'").get();
        if (rowPostos) postosAtivos = rowPostos.count;
    } catch (e) {}

    res.json({
        appName: 'CCO — SUPERVISÃO OPERACIONAL',
        version: '2.0.0',
        releaseDate: '2026-09-26',
        status: 'stable',
        environment: process.env.NODE_ENV || 'production',
        backupRef: 'CCO — VERSÃO ESTÁVEL ORIGINAL',
        postosOficiais: postosAtivos || 61
    });
});

// Initialize Database
try {
    initializeDatabase();
} catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
}

// Routes
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/dashboard', require('./routes/dashboard.routes'));
app.use('/api/v1/setores', require('./routes/setores.routes'));
app.use('/api/v1/postos', require('./routes/postos.routes'));
app.use('/api/v1/supervisores', require('./routes/supervisores.routes'));
app.use('/api/v1/viaturas', require('./routes/viaturas.routes'));
app.use('/api/v1/plantoes', require('./routes/plantoes.routes'));
app.use('/api/v1/auditoria', require('./routes/auditoria.routes'));
app.use('/api/v1/alertas', require('./routes/alertas.routes'));
app.use('/api/v1/relatorios', require('./routes/relatorios.routes'));
app.use('/api/v1/webhook', require('./routes/webhook.routes'));
app.use('/api/v1/mapa', require('./routes/mapa.routes'));
app.use('/api/v1/formulario', require('./routes/formulario.routes'));
app.use('/api/v1/configuracoes', require('./routes/configuracoes.routes'));

// Serve static files with anti-cache for PWA Service Worker and HTML pages
const frontendPath = path.join(__dirname, '..', 'frontend');

app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    if (p === '/sw.js' || p === '/manifest.json' || p.endsWith('.html') || p === '/app' || p === '/painel' || p === '/') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Redirecionamento oficial de versões antigas e rotas diretas
app.get('/app.html', (req, res) => res.redirect(301, '/app'));
app.get('/app', (req, res) => res.sendFile(path.join(frontendPath, 'app-supervisao.html')));
app.get('/painel', (req, res) => res.sendFile(path.join(frontendPath, 'dashboard.html')));

app.use(express.static(frontendPath));

// 404 para rotas de API inexistentes
app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint de API não encontrado.' });
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'), err => {
        if (err) {
            res.status(404).send('Frontend not found.');
        }
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Ocorreu um erro interno no servidor.',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log('----------------------------------------');
    console.log('CCO - Centro de Controle Operacional');
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}`);
    console.log('----------------------------------------');
});

// Keep-Alive automatizado para manter a instância na nuvem sempre acordada 24/7
const KEEP_ALIVE_URL = process.env.RENDER_EXTERNAL_URL || 'https://cco-cedae.onrender.com';
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    setInterval(() => {
        try {
            https.get(`${KEEP_ALIVE_URL}/api/health`, (res) => {
                // Instância de produção mantida ativa
            }).on('error', () => {});
        } catch (e) {}
    }, 8 * 60 * 1000); // Ping a cada 8 minutos para evitar suspensão
}

// Graceful shutdown
const shutdown = () => {
    console.log('\nDesligando servidor...');
    server.close(() => {
        closeDatabase();
        console.log('Servidor finalizado e banco de dados fechado.');
        process.exit(0);
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
