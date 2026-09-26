const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permissions');

// Listar todos os setores com contadores vinculados
router.get('/', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const { apenas_ativos } = req.query;
        let sql = 'SELECT s.* FROM setores s';
        if (apenas_ativos === 'true') {
            sql += " WHERE s.status = 'ativo'";
        }
        sql += ' ORDER BY s.nome ASC';
        
        const setores = db.prepare(sql).all();
        
        const result = setores.map(s => {
            const supervisoresCount = db.prepare("SELECT COUNT(*) as total FROM supervisores WHERE setor_id = ? AND status = 'ativo'").get(s.id).total;
            const viaturasCount = db.prepare("SELECT COUNT(*) as total FROM viaturas WHERE setor_id = ? AND status = 'ativo'").get(s.id).total;
            const postosCount = (s.id === 4)
                ? db.prepare("SELECT COUNT(*) as total FROM postos WHERE status = 'ativo'").get().total
                : db.prepare("SELECT COUNT(*) as total FROM postos WHERE setor_id = ? AND status = 'ativo'").get(s.id).total;
            const relatoriosCount = db.prepare("SELECT COUNT(*) as total FROM relatorios WHERE setor_id = ?").get(s.id).total;
            
            return {
                ...s,
                total_supervisores: supervisoresCount,
                total_viaturas: viaturasCount,
                total_postos: postosCount,
                total_relatorios: relatoriosCount
            };
        });
        
        res.json(result);
    } catch (error) {
        console.error('Erro ao listar setores:', error);
        res.status(500).json({ error: error.message });
    }
});

// Buscar 1 setor com detalhes
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const setor = db.prepare('SELECT * FROM setores WHERE id = ?').get(req.params.id);
        if (!setor) return res.status(404).json({ error: 'Setor não encontrado' });
        res.json(setor);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Criar Setor (Admin)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { nome, sigla, observacao } = req.body;
        if (!nome) return res.status(400).json({ error: 'Nome do setor é obrigatório' });
        
        const db = getDb();
        const result = db.prepare(
            'INSERT INTO setores (nome, sigla, observacao, status) VALUES (?, ?, ?, ?)'
        ).run(nome.trim().toUpperCase(), sigla ? sigla.trim().toUpperCase() : null, observacao || '', 'ativo');
        
        res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Setor criado com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Atualizar Setor (Admin)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { nome, sigla, observacao, status } = req.body;
        const db = getDb();
        
        const current = db.prepare('SELECT * FROM setores WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'Setor não encontrado' });
        
        db.prepare(
            'UPDATE setores SET nome = COALESCE(?, nome), sigla = COALESCE(?, sigla), observacao = COALESCE(?, observacao), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(
            nome ? nome.trim().toUpperCase() : current.nome,
            sigla ? sigla.trim().toUpperCase() : current.sigla,
            observacao !== undefined ? observacao : current.observacao,
            status || current.status,
            req.params.id
        );
        
        res.json({ message: 'Setor atualizado com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alternar status Ativo/Inativo
router.put('/:id/status', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const current = db.prepare('SELECT status FROM setores WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'Setor não encontrado' });
        
        const novoStatus = current.status === 'ativo' ? 'inativo' : 'ativo';
        db.prepare('UPDATE setores SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(novoStatus, req.params.id);
        
        res.json({ message: `Setor ${novoStatus === 'ativo' ? 'ativado' : 'desativado'} com sucesso`, status: novoStatus });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
