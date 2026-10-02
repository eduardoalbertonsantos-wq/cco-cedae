const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Endpoint que retorna a estrutura hierárquica completa:
// SETOR -> SUPERVISORES -> VIATURAS -> POSTOS
router.get('/hierarquia', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { setor_id } = req.query;
        
        let sql = "SELECT * FROM setores WHERE status = 'ativo'";
        if (setor_id) sql += ` AND id = ${parseInt(setor_id)}`;
        sql += " ORDER BY nome ASC";
        
        const setores = db.prepare(sql).all();
        
        const hierarquia = setores.map(setor => {
            const supervisores = db.prepare("SELECT * FROM supervisores WHERE setor_id = ? AND status = 'ativo' ORDER BY nome ASC").all(setor.id);
            const postos = (setor.id === 4)
                ? db.prepare("SELECT * FROM postos WHERE status = 'ativo' ORDER BY nome ASC").all()
                : db.prepare("SELECT * FROM postos WHERE setor_id = ? AND status = 'ativo' ORDER BY nome ASC").all(setor.id);
            
            const ultRel = db.prepare(`
                SELECT r.*, sup.nome as supervisor_nome, v.tipo_modelo as viatura_modelo, v.placa as viatura_placa
                FROM relatorios r
                LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
                LEFT JOIN viaturas v ON r.viatura_id = v.id
                WHERE r.setor_id = ?
                ORDER BY r.data_servico DESC, r.id DESC LIMIT 1
            `).get(setor.id);
            
            return {
                setor,
                supervisores,
                viaturas,
                postos,
                ultimo_plantao: ultRel || null
            };
        });
        
        res.json(hierarquia);
    } catch (error) {
        console.error('Erro na hierarquia do mapa:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint com coordenadas para Leaflet (se houver)
router.get('/postos', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const postos = db.prepare(`
            SELECT p.*, s.nome as setor_nome
            FROM postos p
            JOIN setores s ON p.setor_id = s.id
            WHERE p.status = 'ativo' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        `).all();
        res.json(postos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cores e configurações oficiais dos setores
const SETORES_CONFIG = {
    1: { nome: 'TINGUÁ', cor: '#2563eb', emoji: '🔵', base: { lat: -22.5835, lng: -43.4312, label: 'Base Operacional Tinguá' } },
    2: { nome: 'GUANDU', cor: '#16a34a', emoji: '🟢', base: { lat: -22.8051, lng: -43.6264, label: 'Complexo Guandu' } },
    3: { nome: 'LARANJAL', cor: '#ea580c', emoji: '🟠', base: { lat: -22.8256, lng: -42.9902, label: 'Complexo Laranjal' } },
    4: { nome: 'PLANTÃO', cor: '#9333ea', emoji: '🟣', base: { lat: -22.9094, lng: -43.1895, label: 'Sede CEDAE Centro / Plantão' } }
};

// POST /api/v1/mapa/localizacao - Atualiza a última localização conhecida do fiscal logado
router.post('/localizacao', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const nomeUsuario = req.user.nome || req.user.email || 'Fiscal';
        const setorId = parseInt(req.body.setor_id || req.user.setor_id || 4, 10);
        
        let setorNome = 'PLANTÃO';
        if (SETORES_CONFIG[setorId]) {
            setorNome = SETORES_CONFIG[setorId].nome;
        } else if (req.user.setor_nome) {
            setorNome = req.user.setor_nome;
        }

        const {
            latitude,
            longitude,
            accuracy,
            gps_authorized = 1,
            device_info = null
        } = req.body;

        const isGpsAuth = (gps_authorized === false || gps_authorized === 0 || gps_authorized === '0') ? 0 : 1;
        const latVal = (isGpsAuth && typeof latitude === 'number' && !isNaN(latitude)) ? latitude : null;
        const lngVal = (isGpsAuth && typeof longitude === 'number' && !isNaN(longitude)) ? longitude : null;
        const accVal = (isGpsAuth && typeof accuracy === 'number' && !isNaN(accuracy)) ? accuracy : null;

        const stmt = db.prepare(`
            INSERT INTO fiscal_locations (
                user_id, nome_usuario, setor, setor_id, latitude, longitude, accuracy,
                is_online, gps_authorized, device_info, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP
            )
            ON CONFLICT(user_id) DO UPDATE SET
                nome_usuario = excluded.nome_usuario,
                setor = excluded.setor,
                setor_id = excluded.setor_id,
                latitude = CASE WHEN excluded.gps_authorized = 1 AND excluded.latitude IS NOT NULL THEN excluded.latitude ELSE fiscal_locations.latitude END,
                longitude = CASE WHEN excluded.gps_authorized = 1 AND excluded.longitude IS NOT NULL THEN excluded.longitude ELSE fiscal_locations.longitude END,
                accuracy = CASE WHEN excluded.gps_authorized = 1 AND excluded.accuracy IS NOT NULL THEN excluded.accuracy ELSE fiscal_locations.accuracy END,
                is_online = 1,
                gps_authorized = excluded.gps_authorized,
                device_info = COALESCE(excluded.device_info, fiscal_locations.device_info),
                updated_at = CURRENT_TIMESTAMP
        `);

        stmt.run(userId, nomeUsuario, setorNome, setorId, latVal, lngVal, accVal, isGpsAuth, device_info);

        res.json({
            success: true,
            message: 'Localização atualizada com sucesso',
            is_online: 1,
            gps_authorized: isGpsAuth,
            setor: setorNome
        });
    } catch (error) {
        console.error('Erro ao atualizar localização do fiscal:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/mapa/localizacao/offline - Marca o fiscal como deslogado/offline ao sair
router.post('/localizacao/offline', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        db.prepare(`
            UPDATE fiscal_locations 
            SET is_online = 0, updated_at = CURRENT_TIMESTAMP 
            WHERE user_id = ?
        `).run(userId);

        res.json({ success: true, message: 'Status alterado para offline com sucesso' });
    } catch (error) {
        console.error('Erro ao marcar offline:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/mapa/posicoes - Retorna todas as posições para o mapa operacional do painel
router.get('/posicoes', authenticateToken, (req, res) => {
    try {
        const db = getDb();

        // 1. Fiscais e suas localizações
        const rawLocations = db.prepare(`
            SELECT 
                fl.*,
                u.perfil,
                (strftime('%s', 'now') - strftime('%s', fl.updated_at)) as seg_passados,
                datetime(fl.updated_at, '-3 hours') as updated_at_brasilia
            FROM fiscal_locations fl
            LEFT JOIN usuarios u ON fl.user_id = u.id
            ORDER BY fl.updated_at DESC
        `).all();

        let totalOnline = 0;
        let totalAntiga = 0;
        let totalOffline = 0;
        let totalGpsNegado = 0;

        const fiscais = rawLocations.map(loc => {
            const seg = loc.seg_passados || 0;
            const minutos = Math.floor(seg / 60);

            const setorConf = SETORES_CONFIG[loc.setor_id] || { cor: '#3b82f6', emoji: '📍', nome: loc.setor || 'PLANTÃO' };
            const temCoordenadaReal = (loc.latitude !== null && loc.longitude !== null && loc.gps_authorized === 1);
            const effectiveLat = temCoordenadaReal ? loc.latitude : null;
            const effectiveLng = temCoordenadaReal ? loc.longitude : null;

            let status = 'offline';
            let statusLabel = 'Offline';
            let statusBadge = '🔴 OFFLINE';
            let statusCor = '#dc2626';

            if (loc.gps_authorized === 0) {
                status = 'gps_nao_autorizado';
                statusLabel = 'GPS Não Autorizado';
                statusBadge = '⚪ GPS NÃO AUTORIZADO';
                statusCor = '#94a3b8';
                totalGpsNegado++;
            } else if (loc.is_online === 0) {
                status = 'offline';
                statusLabel = 'Offline (Sessão Encerrada)';
                statusBadge = '🔴 OFFLINE';
                statusCor = '#dc2626';
                totalOffline++;
            } else if (!temCoordenadaReal) {
                status = 'buscando';
                statusLabel = 'Conectando satélites GPS...';
                statusBadge = '🟡 BUSCANDO SINAL';
                statusCor = '#eab308';
                totalOnline++;
            } else if (minutos <= 5) {
                status = 'online';
                statusLabel = 'Online';
                statusBadge = '🟢 ONLINE';
                statusCor = '#16a34a';
                totalOnline++;
            } else if (minutos <= 30) {
                status = 'antiga';
                statusLabel = `Atualização Antiga (${minutos} min atrás)`;
                statusBadge = '🟡 ATUALIZAÇÃO ANTIGA';
                statusCor = '#eab308';
                totalAntiga++;
            } else {
                status = 'offline';
                statusLabel = `Sem atualização recente (${minutos} min atrás)`;
                statusBadge = '🔴 OFFLINE';
                statusCor = '#dc2626';
                totalOffline++;
            }

            // Formatar horário da última atualização (fuso de Brasília)
            let horaFormatada = '-';
            const dtRef = loc.updated_at_brasilia || loc.updated_at;
            if (dtRef) {
                const parts = dtRef.split(' ');
                horaFormatada = parts[1] ? parts[1].substring(0, 5) : dtRef;
            }

            return {
                id: loc.id,
                user_id: loc.user_id,
                nome: loc.nome_usuario,
                setor: loc.setor || setorConf.nome,
                setor_id: loc.setor_id,
                setor_cor: setorConf.cor,
                setor_emoji: setorConf.emoji,
                latitude: effectiveLat,
                longitude: effectiveLng,
                tem_gps_real: temCoordenadaReal,
                accuracy: loc.accuracy ? Math.round(loc.accuracy) : null,
                is_online: loc.is_online,
                gps_authorized: loc.gps_authorized,
                status: status,
                status_label: statusLabel,
                status_badge: statusBadge,
                status_cor: statusCor,
                minutos_atras: minutos,
                updated_at: loc.updated_at,
                hora_formatada: horaFormatada,
                device_info: loc.device_info
            };
        });

        // 2. Postos com coordenadas (se houver no cadastro)
        const postos = db.prepare(`
            SELECT p.id, p.nome, p.endereco, p.latitude, p.longitude, p.setor_id, s.nome as setor_nome
            FROM postos p
            LEFT JOIN setores s ON p.setor_id = s.id
            WHERE p.status = 'ativo' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        `).all();

        // 3. Bases dos 4 Setores (para referência espacial no mapa)
        const basesSetores = Object.keys(SETORES_CONFIG).map(id => {
            const conf = SETORES_CONFIG[id];
            return {
                setor_id: parseInt(id, 10),
                nome: conf.nome,
                cor: conf.cor,
                emoji: conf.emoji,
                base: conf.base
            };
        });

        res.json({
            success: true,
            fiscais,
            postos,
            bases_setores: basesSetores,
            resumo_status: {
                total_fiscais: fiscais.length,
                online: totalOnline,
                antiga: totalAntiga,
                offline: totalOffline,
                gps_nao_autorizado: totalGpsNegado
            }
        });
    } catch (error) {
        console.error('Erro ao consultar posições do mapa:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

