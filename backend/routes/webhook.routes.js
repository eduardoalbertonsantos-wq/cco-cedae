const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const crypto = require('crypto');

router.post('/google-forms', (req, res) => {
    try {
        const db = getDb();
        const payload = req.body;
        
        // Em um ambiente real, validar HMAC aqui
        // const signature = req.headers['x-goog-signature'];
        
        // Simulação básica de criação a partir do payload
        if (payload && payload.setor_id) {
            const result = db.prepare(`
                INSERT INTO plantoes (setor_id, data_plantao, hora_inicio, hora_fim, km_inicial, km_final, km_rodado, observacoes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                payload.setor_id, 
                payload.data_plantao || new Date().toISOString().split('T')[0],
                payload.hora_inicio || '00:00',
                payload.hora_fim || '00:00',
                payload.km_inicial || 0,
                payload.km_final || 0,
                (payload.km_final || 0) - (payload.km_inicial || 0),
                'Criado via Webhook'
            );
            return res.json({ success: true, plantao_id: result.lastInsertRowid });
        }
        
        res.json({ success: false, message: 'Payload inválido' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
