const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permissions');
const emailService = require('../services/email.service');

// Listar todas as configurações
router.get('/', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const configs = db.prepare('SELECT chave, valor, descricao, updated_at FROM configuracoes').all();
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Salvar/Atualizar configuração única (Admin)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { chave, valor, descricao } = req.body;
        if (!chave) return res.status(400).json({ error: 'Chave é obrigatória' });
        
        const db = getDb();
        db.prepare(`
            INSERT INTO configuracoes (chave, valor, descricao, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, descricao = COALESCE(excluded.descricao, configuracoes.descricao), updated_at = CURRENT_TIMESTAMP
        `).run(chave, valor !== undefined ? String(valor) : '', descricao || '');
        
        res.json({ message: 'Configuração atualizada com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Salvar configurações SMTP em lote (Admin)
router.post('/salvar-smtp', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, email_destino_relatorios, whatsapp_grupo_nome } = req.body;
        const db = getDb();

        const upsert = db.prepare(`
            INSERT INTO configuracoes (chave, valor, descricao, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = CURRENT_TIMESTAMP
        `);

        const transaction = db.transaction(() => {
            if (smtp_host !== undefined) upsert.run('smtp_host', String(smtp_host), 'Servidor Host SMTP');
            if (smtp_port !== undefined) upsert.run('smtp_port', String(smtp_port), 'Porta do Servidor SMTP');
            if (smtp_secure !== undefined) upsert.run('smtp_secure', String(smtp_secure), 'Usar SSL Seguro');
            if (smtp_user !== undefined) upsert.run('smtp_user', String(smtp_user).trim(), 'E-mail Remetente SMTP');
            if (smtp_pass !== undefined && smtp_pass.trim() !== '') {
                // Only update password if user actually entered something
                upsert.run('smtp_pass', String(smtp_pass).trim(), 'Senha de Aplicativo SMTP');
            }
            if (smtp_from !== undefined) upsert.run('smtp_from', String(smtp_from), 'Nome / E-mail Remetente');
            if (email_destino_relatorios !== undefined) upsert.run('email_destino_relatorios', String(email_destino_relatorios).trim(), 'E-mail Oficial de Destino dos Relatórios');
            if (whatsapp_grupo_nome !== undefined) upsert.run('whatsapp_grupo_nome', String(whatsapp_grupo_nome).trim(), 'Nome do Grupo de WhatsApp');
        });

        transaction();

        res.json({ message: 'Configurações operacionais e SMTP salvas com sucesso!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Testar envio de e-mail (Admin)
router.post('/testar-email', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { destinatario } = req.body;
        const resultado = await emailService.testarEnvioEmail(destinatario);
        
        if (!resultado.success) {
            return res.status(400).json(resultado);
        }

        res.json(resultado);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Zerar histórico de relatórios e supervisões (Admin)
router.post('/zerar-dados', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const transaction = db.transaction(() => {
            db.exec(`
                DELETE FROM postos_relatorio;
                DELETE FROM ocorrencias;
                DELETE FROM relatorios;
                DELETE FROM sqlite_sequence WHERE name IN ('relatorios', 'postos_relatorio', 'ocorrencias');
            `);
        });
        transaction();
        res.json({ message: 'Histórico de supervisões e relatórios zerado com sucesso! Os próximos envios iniciarão do ID #1.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
