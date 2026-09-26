const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permissions');

// Listar Viaturas (com filtro opcional por setor_id)
router.get('/', authenticateToken, (req, res) => {
    try {
        const { setor_id, apenas_ativas } = req.query;
        const db = getDb();
        
        let sql = `
            SELECT v.*, seto.nome as setor_nome, seto.sigla as setor_sigla
            FROM viaturas v
            JOIN setores seto ON v.setor_id = seto.id
            WHERE 1=1
        `;
        const params = [];
        
        if (setor_id) {
            sql += ' AND v.setor_id = ?';
            params.push(setor_id);
        }
        
        if (apenas_ativas === 'true') {
            sql += " AND v.status = 'ativo' AND seto.status = 'ativo'";
        }
        
        sql += ' ORDER BY v.tipo_modelo ASC';
        
        const viaturas = db.prepare(sql).all(...params);
        
        const result = viaturas.map(v => {
            const relStats = db.prepare(`
                SELECT COUNT(*) as total_plantoes,
                       COALESCE(SUM(km_rodado), 0) as km_acumulado,
                       MAX(data_servico) as ultimo_uso
                FROM relatorios
                WHERE viatura_id = ?
            `).get(v.id);
            
            return {
                ...v,
                total_plantoes: relStats.total_plantoes,
                km_acumulado: relStats.km_acumulado,
                ultimo_uso: relStats.ultimo_uso
            };
        });
        
        res.json(result);
    } catch (error) {
        console.error('Erro ao listar viaturas:', error);
        res.status(500).json({ error: error.message });
    }
});

// Buscar 1 viatura
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const viatura = db.prepare(`
            SELECT v.*, seto.nome as setor_nome 
            FROM viaturas v 
            JOIN setores seto ON v.setor_id = seto.id 
            WHERE v.id = ?
        `).get(req.params.id);
        
        if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada' });
        res.json(viatura);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Criar Viatura vinculada ao Setor (Admin)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { tipo_modelo, marca, placa, prefixo, setor_id, supervisor_id, is_outros, observacao } = req.body;
        if (!tipo_modelo || !placa || !setor_id) {
            return res.status(400).json({ error: 'Tipo/Modelo, Placa e Setor são obrigatórios' });
        }
        
        const db = getDb();
        const setorExiste = db.prepare('SELECT id FROM setores WHERE id = ?').get(setor_id);
        if (!setorExiste) return res.status(400).json({ error: 'Setor informado não existe' });

        let supNome = null;
        if (supervisor_id) {
            const sup = db.prepare('SELECT nome FROM supervisores WHERE id = ?').get(supervisor_id);
            if (sup) supNome = sup.nome;
        }
        
        const result = db.prepare(`
            INSERT INTO viaturas (tipo_modelo, marca, placa, prefixo, setor_id, supervisor_id, supervisor_nome, is_outros, observacao, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativo')
        `).run(
            tipo_modelo.trim(),
            marca ? marca.trim().toUpperCase() : '',
            placa.trim().toUpperCase(),
            prefixo ? prefixo.trim().toUpperCase() : '',
            setor_id,
            supervisor_id || null,
            supNome,
            is_outros ? 1 : 0,
            observacao || ''
        );
        
        res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Viatura cadastrada com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Atualizar Viatura
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { tipo_modelo, marca, placa, prefixo, setor_id, supervisor_id, is_outros, observacao, status } = req.body;
        const db = getDb();
        
        const current = db.prepare('SELECT * FROM viaturas WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'Viatura não encontrada' });

        let supNome = current.supervisor_nome;
        if (supervisor_id !== undefined) {
            if (supervisor_id) {
                const sup = db.prepare('SELECT nome FROM supervisores WHERE id = ?').get(supervisor_id);
                supNome = sup ? sup.nome : null;
            } else {
                supNome = null;
            }
        }
        
        db.prepare(`
            UPDATE viaturas 
            SET tipo_modelo = COALESCE(?, tipo_modelo),
                marca = COALESCE(?, marca),
                placa = COALESCE(?, placa),
                prefixo = COALESCE(?, prefixo),
                setor_id = COALESCE(?, setor_id),
                supervisor_id = ?,
                supervisor_nome = ?,
                is_outros = COALESCE(?, is_outros),
                observacao = COALESCE(?, observacao),
                status = COALESCE(?, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            tipo_modelo ? tipo_modelo.trim() : current.tipo_modelo,
            marca !== undefined ? marca.trim().toUpperCase() : current.marca,
            placa ? placa.trim().toUpperCase() : current.placa,
            prefixo !== undefined ? prefixo.trim().toUpperCase() : current.prefixo,
            setor_id || current.setor_id,
            supervisor_id !== undefined ? (supervisor_id || null) : current.supervisor_id,
            supNome,
            is_outros !== undefined ? (is_outros ? 1 : 0) : current.is_outros,
            observacao !== undefined ? observacao : current.observacao,
            status || current.status,
            req.params.id
        );
        
        res.json({ message: 'Viatura atualizada com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alternar status
router.put('/:id/status', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const current = db.prepare('SELECT status FROM viaturas WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'Viatura não encontrada' });
        
        const novoStatus = current.status === 'ativo' ? 'inativo' : 'ativo';
        db.prepare('UPDATE viaturas SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(novoStatus, req.params.id);
        
        res.json({ message: `Viatura ${novoStatus === 'ativo' ? 'ativada' : 'desativada'} com sucesso`, status: novoStatus });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
