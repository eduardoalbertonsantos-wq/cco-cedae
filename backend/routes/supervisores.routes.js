const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permissions');

// Listar Supervisores (com filtro opcional por setor_id)
router.get('/', authenticateToken, (req, res) => {
    try {
        const { setor_id, apenas_ativos } = req.query;
        const db = getDb();
        
        let sql = `
            SELECT s.*, seto.nome as setor_nome, seto.sigla as setor_sigla
            FROM supervisores s
            JOIN setores seto ON s.setor_id = seto.id
            WHERE 1=1
        `;
        const params = [];
        
        if (setor_id) {
            sql += ' AND s.setor_id = ?';
            params.push(setor_id);
        }
        
        if (apenas_ativos === 'true') {
            sql += " AND s.status = 'ativo' AND seto.status = 'ativo'";
        }
        
        sql += ' ORDER BY s.nome ASC';
        
        const supervisores = db.prepare(sql).all(...params);
        
        const result = supervisores.map(sup => {
            const relCount = db.prepare('SELECT COUNT(*) as total FROM relatorios WHERE supervisor_id = ?').get(sup.id).total;
            const postosCount = db.prepare(`
                SELECT COUNT(pr.id) as total
                FROM postos_relatorio pr
                JOIN relatorios r ON pr.relatorio_id = r.id
                WHERE r.supervisor_id = ?
            `).get(sup.id).total;
            
            return {
                ...sup,
                total_relatorios: relCount,
                total_postos_supervisionados: postosCount
            };
        });
        
        res.json(result);
    } catch (error) {
        console.error('Erro ao listar supervisores:', error);
        res.status(500).json({ error: error.message });
    }
});

// Buscar 1 supervisor
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const sup = db.prepare(`
            SELECT s.*, seto.nome as setor_nome 
            FROM supervisores s 
            JOIN setores seto ON s.setor_id = seto.id 
            WHERE s.id = ?
        `).get(req.params.id);
        
        if (!sup) return res.status(404).json({ error: 'Supervisor não encontrado' });
        res.json(sup);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Criar Supervisor vinculado a um Setor (Admin)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { nome, matricula, telefone, setor_id, funcao, observacoes } = req.body;
        if (!nome || !setor_id) {
            return res.status(400).json({ error: 'Nome e Setor são obrigatórios' });
        }
        
        const db = getDb();
        const setorExiste = db.prepare('SELECT id FROM setores WHERE id = ?').get(setor_id);
        if (!setorExiste) return res.status(400).json({ error: 'Setor informado não existe' });
        
        const result = db.prepare(`
            INSERT INTO supervisores (nome, matricula, telefone, setor_id, funcao, observacoes, status)
            VALUES (?, ?, ?, ?, ?, ?, 'ativo')
        `).run(
            nome.trim().toUpperCase(),
            matricula ? matricula.trim() : null,
            telefone ? telefone.trim() : null,
            setor_id,
            funcao || 'Supervisor Operacional',
            observacoes || ''
        );
        
        res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Supervisor cadastrado com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Atualizar Supervisor
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { nome, matricula, telefone, setor_id, funcao, observacoes, status } = req.body;
        const db = getDb();
        
        const current = db.prepare('SELECT * FROM supervisores WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'Supervisor não encontrado' });
        
        db.prepare(`
            UPDATE supervisores 
            SET nome = COALESCE(?, nome),
                matricula = COALESCE(?, matricula),
                telefone = COALESCE(?, telefone),
                setor_id = COALESCE(?, setor_id),
                funcao = COALESCE(?, funcao),
                observacoes = COALESCE(?, observacoes),
                status = COALESCE(?, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            nome ? nome.trim().toUpperCase() : current.nome,
            matricula !== undefined ? matricula : current.matricula,
            telefone !== undefined ? telefone : current.telefone,
            setor_id || current.setor_id,
            funcao || current.funcao,
            observacoes !== undefined ? observacoes : current.observacoes,
            status || current.status,
            req.params.id
        );
        
        res.json({ message: 'Supervisor atualizado com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alternar status
router.put('/:id/status', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const current = db.prepare('SELECT status FROM supervisores WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'Supervisor não encontrado' });
        
        const novoStatus = current.status === 'ativo' ? 'inativo' : 'ativo';
        db.prepare('UPDATE supervisores SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(novoStatus, req.params.id);
        
        res.json({ message: `Supervisor ${novoStatus === 'ativo' ? 'ativado' : 'desativado'} com sucesso`, status: novoStatus });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
