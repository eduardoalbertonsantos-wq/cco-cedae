const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permissions');

// 1. REGISTRAR ENTRADA OU SAÍDA (CONTROLE DE ACESSO COM SEQUENCIAL MENSAL)
router.post('/', optionalAuth, (req, res) => {
    try {
        const {
            posto_id,
            tipo,
            identificacao_nome,
            documento,
            empresa,
            motivo,
            veiculo_modelo,
            veiculo_placa,
            observacao,
            data_registro,
            hora_registro,
            supervisor_id,
            supervisor_nome,
            usuario_nome
        } = req.body;

        if (!posto_id || !tipo || !identificacao_nome) {
            return res.status(400).json({ error: 'Posto, Tipo (ENTRADA/SAÍDA) e Nome de identificação são obrigatórios.' });
        }

        const tipoUpper = String(tipo).trim().toUpperCase();
        if (!['ENTRADA', 'SAIDA'].includes(tipoUpper)) {
            return res.status(400).json({ error: 'Tipo inválido. Utilize ENTRADA ou SAIDA.' });
        }

        const db = getDb();
        const posto = db.prepare('SELECT p.id, p.nome, p.setor_id, s.nome as setor_nome FROM postos p LEFT JOIN setores s ON p.setor_id = s.id WHERE p.id = ?').get(posto_id);
        if (!posto) {
            return res.status(404).json({ error: 'Posto não encontrado no cadastro oficial.' });
        }

        // Data e Hora padrão
        const agora = new Date();
        const dataFinal = data_registro || agora.toISOString().split('T')[0];
        const horaFinal = hora_registro || agora.toTimeString().split(' ')[0].substring(0, 5);

        // Formatação do ano/mês (ex: 2026-09)
        const [ano, mes] = dataFinal.split('-');
        const anoMes = `${ano}-${mes}`;

        // LÓGICA DO NÚMERO SEQUENCIAL MENSAL:
        // Reinicia no primeiro dia de cada mês (0001, 0002, 0003...) e nunca apaga meses anteriores
        const seqResult = db.prepare('SELECT COALESCE(MAX(sequencial_mensal), 0) + 1 as prox FROM controle_acesso WHERE ano_mes = ?').get(anoMes);
        const sequencial = seqResult ? seqResult.prox : 1;
        const numFormatado = `${String(sequencial).padStart(4, '0')}/${mes}/${ano}`;

        const usuarioFinal = (req.user && req.user.nome) || usuario_nome || supervisor_nome || 'Operador CCO';

        const insertStmt = db.prepare(`
            INSERT INTO controle_acesso (
                posto_id, posto_nome, setor_id, ano_mes, sequencial_mensal, numero_registro,
                tipo, data_registro, hora_registro, identificacao_nome, documento,
                empresa, motivo, veiculo_modelo, veiculo_placa, observacao,
                supervisor_id, supervisor_nome, usuario_nome
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insertStmt.run(
            posto.id,
            posto.nome,
            posto.setor_id,
            anoMes,
            sequencial,
            numFormatado,
            tipoUpper,
            dataFinal,
            horaFinal,
            identificacao_nome.trim().toUpperCase(),
            documento ? documento.trim() : null,
            empresa ? empresa.trim() : null,
            motivo ? motivo.trim() : null,
            veiculo_modelo ? veiculo_modelo.trim().toUpperCase() : null,
            veiculo_placa ? veiculo_placa.trim().toUpperCase() : null,
            observacao ? observacao.trim() : null,
            supervisor_id || null,
            supervisor_nome || null,
            usuarioFinal
        );

        res.status(201).json({
            success: true,
            message: `✅ Movimentação de ${tipoUpper} registrada sob nº ${numFormatado}`,
            id: Number(result.lastInsertRowid),
            numero_registro: numFormatado,
            sequencial_mensal: sequencial,
            ano_mes: anoMes,
            posto: posto.nome,
            tipo: tipoUpper,
            data: dataFinal,
            hora: horaFinal
        });

    } catch (err) {
        console.error('Erro ao registrar controle de acesso:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. LISTAR REGISTROS DE ACESSO (COM FILTROS COMPLETOS)
router.get('/', optionalAuth, (req, res) => {
    try {
        const { posto_id, setor_id, ano_mes, data_inicio, data_fim, tipo, busca, limit = 100, offset = 0 } = req.query;
        const db = getDb();

        let sql = `
            SELECT ca.*, s.nome as setor_nome
            FROM controle_acesso ca
            LEFT JOIN setores s ON ca.setor_id = s.id
            WHERE 1=1
        `;
        const params = [];

        if (posto_id) {
            sql += ' AND ca.posto_id = ?';
            params.push(posto_id);
        }
        if (setor_id) {
            sql += ' AND ca.setor_id = ?';
            params.push(setor_id);
        }
        if (ano_mes) {
            sql += ' AND ca.ano_mes = ?';
            params.push(ano_mes);
        }
        if (data_inicio) {
            sql += ' AND ca.data_registro >= ?';
            params.push(data_inicio);
        }
        if (data_fim) {
            sql += ' AND ca.data_registro <= ?';
            params.push(data_fim);
        }
        if (tipo) {
            sql += ' AND ca.tipo = ?';
            params.push(String(tipo).toUpperCase());
        }
        if (busca) {
            sql += ' AND (ca.identificacao_nome LIKE ? OR ca.empresa LIKE ? OR ca.veiculo_placa LIKE ? OR ca.numero_registro LIKE ? OR ca.posto_nome LIKE ?)';
            const b = `%${busca}%`;
            params.push(b, b, b, b, b);
        }

        sql += ' ORDER BY ca.data_registro DESC, ca.hora_registro DESC, ca.id DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const registros = db.prepare(sql).all(...params);

        // Contagem total para paginação
        let countSql = 'SELECT count(*) as total FROM controle_acesso ca WHERE 1=1';
        const countParams = [];
        if (posto_id) { countSql += ' AND ca.posto_id = ?'; countParams.push(posto_id); }
        if (setor_id) { countSql += ' AND ca.setor_id = ?'; countParams.push(setor_id); }
        if (ano_mes) { countSql += ' AND ca.ano_mes = ?'; countParams.push(ano_mes); }
        if (tipo) { countSql += ' AND ca.tipo = ?'; countParams.push(String(tipo).toUpperCase()); }
        const total = db.prepare(countSql).get(...countParams).total;

        res.json({
            success: true,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            registros
        });
    } catch (err) {
        console.error('Erro ao listar controle de acesso:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3. ESTATÍSTICAS MENSAIS DO CONTROLE DE ACESSO
router.get('/estatisticas', optionalAuth, (req, res) => {
    try {
        const { ano_mes } = req.query;
        const db = getDb();
        const refMes = ano_mes || new Date().toISOString().substring(0, 7);

        const totalEntradas = db.prepare("SELECT count(*) as c FROM controle_acesso WHERE ano_mes = ? AND tipo = 'ENTRADA'").get(refMes).c;
        const totalSaidas = db.prepare("SELECT count(*) as c FROM controle_acesso WHERE ano_mes = ? AND tipo = 'SAIDA'").get(refMes).c;
        const totalMovimentacoes = totalEntradas + totalSaidas;

        const postosAtivos = db.prepare(`
            SELECT ca.posto_nome, count(*) as total
            FROM controle_acesso ca
            WHERE ca.ano_mes = ?
            GROUP BY ca.posto_id
            ORDER BY total DESC
            LIMIT 5
        `).all(refMes);

        res.json({
            success: true,
            ano_mes: refMes,
            total_movimentacoes: totalMovimentacoes,
            total_entradas: totalEntradas,
            total_saidas: totalSaidas,
            saldo_presentes: Math.max(0, totalEntradas - totalSaidas),
            top_postos: postosAtivos
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. FECHAMENTO DO LIVRO DIGITAL (TURNO, DIA OU MÊS)
router.post('/fechamento', authenticateToken, (req, res) => {
    try {
        const {
            tipo_fechamento,
            periodo_referencia,
            posto_id,
            setor_id,
            responsavel_nome,
            observacoes
        } = req.body;

        if (!tipo_fechamento || !periodo_referencia || !responsavel_nome) {
            return res.status(400).json({ error: 'Tipo de fechamento, Período de referência e Responsável são obrigatórios.' });
        }

        const tipoUpper = String(tipo_fechamento).toUpperCase();
        if (!['TURNO', 'DIA', 'MES'].includes(tipoUpper)) {
            return res.status(400).json({ error: 'Tipo de fechamento deve ser TURNO, DIA ou MES.' });
        }

        const db = getDb();

        // Calcular totais do período
        let calcSql = 'SELECT tipo, count(*) as c FROM controle_acesso WHERE 1=1';
        const calcParams = [];
        if (tipoUpper === 'MES') {
            calcSql += ' AND ano_mes = ?';
            calcParams.push(periodo_referencia);
        } else {
            calcSql += ' AND data_registro = ?';
            calcParams.push(periodo_referencia);
        }
        if (posto_id) {
            calcSql += ' AND posto_id = ?';
            calcParams.push(posto_id);
        }
        calcSql += ' GROUP BY tipo';

        const rows = db.prepare(calcSql).all(...calcParams);
        let entradas = 0;
        let saidas = 0;
        rows.forEach(r => {
            if (r.tipo === 'ENTRADA') entradas = r.c;
            if (r.tipo === 'SAIDA') saidas = r.c;
        });

        let pNome = null;
        if (posto_id) {
            const p = db.prepare('SELECT nome FROM postos WHERE id = ?').get(posto_id);
            if (p) pNome = p.nome;
        }

        const stmt = db.prepare(`
            INSERT INTO livro_digital_fechamentos (
                tipo_fechamento, periodo_referencia, posto_id, posto_nome, setor_id,
                responsavel_nome, total_movimentacoes, total_entradas, total_saidas,
                observacoes, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FECHADO')
        `);

        const result = stmt.run(
            tipoUpper,
            periodo_referencia,
            posto_id || null,
            pNome,
            setor_id || null,
            responsavel_nome,
            entradas + saidas,
            entradas,
            saidas,
            observacoes || null
        );

        res.status(201).json({
            success: true,
            message: `✅ Fechamento de ${tipoUpper} realizado com sucesso para o período ${periodo_referencia}!`,
            fechamento_id: Number(result.lastInsertRowid),
            tipo: tipoUpper,
            periodo: periodo_referencia,
            total_movimentacoes: entradas + saidas,
            entradas,
            saidas,
            responsavel: responsavel_nome
        });

    } catch (err) {
        console.error('Erro ao fechar livro digital:', err);
        res.status(500).json({ error: err.message });
    }
});

// 5. LISTAR FECHAMENTOS ANTERIORES DO LIVRO DIGITAL
router.get('/fechamentos', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const fechamentos = db.prepare(`
            SELECT id, tipo_fechamento, periodo_referencia, posto_nome,
                   responsavel_nome, total_movimentacoes, total_entradas, total_saidas,
                   observacoes, status,
                   strftime('%d/%m/%Y %H:%M', created_at) as data_hora
            FROM livro_digital_fechamentos
            ORDER BY id DESC
            LIMIT 50
        `).all();

        res.json({ success: true, fechamentos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
