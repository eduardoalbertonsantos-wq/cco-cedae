const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permissions');

// POST /login
router.post('/login', (req, res) => {
    try {
        const loginInput = (req.body.email || req.body.usuario || req.body.login || '').trim();
        const senha = req.body.senha;

        if (!loginInput || !senha) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
        }

        const db = getDb();
        const user = db.prepare(`
            SELECT * FROM usuarios 
            WHERE (LOWER(email) = LOWER(?) OR LOWER(nome) = LOWER(?)) 
              AND status = 'ativo'
        `).get(loginInput, loginInput);

        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const validPassword = bcrypt.compareSync(senha, user.senha_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        // Buscar nome do setor se houver setor_id
        let setorNome = 'PLANTÃO';
        if (user.setor_id) {
            const rowSetor = db.prepare('SELECT nome FROM setores WHERE id = ?').get(user.setor_id);
            if (rowSetor) setorNome = rowSetor.nome;
        }

        // Buscar viaturas ativas vinculadas ao setor
        let viaturas = [];
        if (user.setor_id) {
            viaturas = db.prepare(`
                SELECT id, tipo_modelo, placa, prefixo 
                FROM viaturas 
                WHERE setor_id = ? AND status = 'ativo' 
                ORDER BY tipo_modelo ASC
            `).all(user.setor_id);
        }

        const token = jwt.sign(
            { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, setor_id: user.setor_id, setor_nome: setorNome },
            process.env.JWT_SECRET || 'cco-secret-key-change-in-production-2026',
            { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
        );

        const usuario = {
            id: user.id,
            nome: user.nome,
            email: user.email,
            perfil: user.perfil,
            setor_id: user.setor_id,
            setor_nome: setorNome,
            viaturas: viaturas,
            status: user.status
        };

        res.json({ token, usuario });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// POST /register (admin only)
router.post('/register', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { nome, email, senha, perfil } = req.body;
        if (!nome || !email || !senha) {
            return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
        }

        const db = getDb();
        const existing = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
        if (existing) {
            return res.status(400).json({ error: 'Email já cadastrado.' });
        }

        const senha_hash = bcrypt.hashSync(senha, 12);
        const result = db.prepare(
            'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)'
        ).run(nome, email, senha_hash, perfil || 'consulta');

        res.status(201).json({
            id: Number(result.lastInsertRowid),
            message: 'Usuário cadastrado com sucesso.'
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// GET /me
router.get('/me', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare(
            'SELECT id, nome, email, perfil, status, created_at FROM usuarios WHERE id = ?'
        ).get(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        res.json(user);
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// PUT /senha
router.put('/senha', authenticateToken, (req, res) => {
    try {
        const { senhaAtual, novaSenha } = req.body;
        if (!senhaAtual || !novaSenha) {
            return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
        }

        const db = getDb();
        const user = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        if (!bcrypt.compareSync(senhaAtual, user.senha_hash)) {
            return res.status(401).json({ error: 'Senha atual incorreta.' });
        }

        const novaHash = bcrypt.hashSync(novaSenha, 12);
        db.prepare('UPDATE usuarios SET senha_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(novaHash, req.user.id);

        res.json({ message: 'Senha alterada com sucesso.' });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

module.exports = router;
