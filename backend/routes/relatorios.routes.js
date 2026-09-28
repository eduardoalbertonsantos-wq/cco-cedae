const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requirePainel } = require('../middleware/permissions');

// Proteção: Apenas CCO e Diretoria podem emitir relatórios
router.use(authenticateToken, requirePainel);

// 1. RELATÓRIO DE SUPERVISÃO OPERACIONAL (DETALHADO E ANALÍTICO)
router.get('/supervisao', (req, res) => {
    try {
        const { data_inicio, data_fim, setor_id, supervisor_id, situacao } = req.query;
        const db = getDb();

        let sql = `
            SELECT 
                r.id as relatorio_id,
                r.data_servico,
                r.turno,
                pr.horario_supervisao,
                p.id as posto_id,
                COALESCE(p.nome, pr.nome_posto_digitado) as posto_nome,
                COALESCE(sp.nome, pr.setor_nome_posto, 'PLANTÃO') as setor_posto,
                COALESCE(r.responsavel_nome, sup.nome, 'FISCAL') as supervisor_nome,
                s_rel.nome as setor_supervisor,
                COALESCE(v.tipo_modelo || ' (' || v.placa || ')', r.viatura_outros_texto, 'Não informada') as veiculo,
                CASE 
                    WHEN pr.supervisionado = 0 OR pr.status_supervisao = 'NAO_SUPERVISIONADO' THEN 'Não fiscalizado'
                    WHEN pr.tem_ocorrencia = 1 OR pr.status_supervisao = 'COM_OCORRENCIA' THEN 'Com ocorrência'
                    ELSE 'Fiscalizado'
                END as situacao,
                pr.motivo_nao_supervisao,
                pr.descricao_ocorrencia,
                pr.km_posto,
                pr.efetivo_completo,
                pr.falta_efetivo_qtd
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            LEFT JOIN postos p ON pr.posto_id = p.id
            LEFT JOIN setores sp ON p.setor_id = sp.id
            LEFT JOIN setores s_rel ON r.setor_id = s_rel.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            LEFT JOIN viaturas v ON r.viatura_id = v.id
            WHERE 1=1
        `;

        const params = [];
        if (data_inicio) { sql += ' AND r.data_servico >= ?'; params.push(data_inicio); }
        if (data_fim) { sql += ' AND r.data_servico <= ?'; params.push(data_fim); }
        if (setor_id) { sql += ' AND (p.setor_id = ? OR r.setor_id = ?)'; params.push(setor_id, setor_id); }
        if (supervisor_id) { sql += ' AND r.supervisor_id = ?'; params.push(supervisor_id); }
        if (situacao) {
            if (situacao === 'supervisionado') sql += " AND pr.supervisionado = 1 AND pr.status_supervisao != 'NAO_SUPERVISIONADO'";
            else if (situacao === 'nao_supervisionado') sql += " AND (pr.supervisionado = 0 OR pr.status_supervisao = 'NAO_SUPERVISIONADO')";
            else if (situacao === 'ocorrencia') sql += " AND pr.tem_ocorrencia = 1";
        }

        sql += ' ORDER BY r.data_servico DESC, pr.id DESC LIMIT 500';
        const dados = db.prepare(sql).all(...params);

        res.json({ success: true, total: dados.length, dados });
    } catch (err) {
        console.error('Erro no relatório de supervisão:', err);
        res.status(500).json({ error: err.message });
    }
});

// Alias mantido para compatibilidade
router.get('/supervisoes-detalhadas', (req, res) => {
    const db = getDb();
    const { data_inicio, data_fim, setor_posto, setor_supervisor, situacao } = req.query;
    let sql = `
        SELECT 
            r.data_servico,
            pr.horario_supervisao,
            p.id as posto_id,
            COALESCE(p.nome, pr.nome_posto_digitado) as posto_nome,
            COALESCE(pr.setor_nome_posto, sp.nome, 'PLANTÃO') as setor_posto,
            COALESCE(r.responsavel_nome, sup.nome, 'FISCAL') as supervisor_nome,
            s_rel.nome as setor_supervisor,
            COALESCE(v.tipo_modelo || ' (' || v.placa || ')', r.viatura_outros_texto, 'Não informada') as veiculo,
            CASE 
                WHEN pr.supervisionado = 0 OR pr.status_supervisao = 'NAO_SUPERVISIONADO' THEN 'Não fiscalizado'
                WHEN pr.tem_ocorrencia = 1 OR pr.status_supervisao = 'COM_OCORRENCIA' THEN 'Com ocorrência'
                ELSE 'Fiscalizado'
            END as situacao,
            pr.motivo_nao_supervisao,
            pr.descricao_ocorrencia,
            pr.km_posto,
            pr.efetivo_completo,
            pr.falta_efetivo_qtd
        FROM postos_relatorio pr
        JOIN relatorios r ON pr.relatorio_id = r.id
        LEFT JOIN postos p ON pr.posto_id = p.id
        LEFT JOIN setores sp ON p.setor_id = sp.id
        LEFT JOIN setores s_rel ON r.setor_id = s_rel.id
        LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
        LEFT JOIN viaturas v ON r.viatura_id = v.id
        WHERE 1=1
    `;
    const params = [];
    if (data_inicio) { sql += ' AND r.data_servico >= ?'; params.push(data_inicio); }
    if (data_fim) { sql += ' AND r.data_servico <= ?'; params.push(data_fim); }
    if (setor_posto) { sql += ' AND (p.setor_id = ? OR pr.setor_id_posto = ?)'; params.push(setor_posto, setor_posto); }
    if (setor_supervisor) { sql += ' AND r.setor_id = ?'; params.push(setor_supervisor); }
    if (situacao) {
        if (situacao === 'supervisionado') sql += " AND pr.supervisionado = 1 AND pr.status_supervisao != 'NAO_SUPERVISIONADO'";
        else if (situacao === 'nao_supervisionado') sql += " AND (pr.supervisionado = 0 OR pr.status_supervisao = 'NAO_SUPERVISIONADO')";
        else if (situacao === 'ocorrencia') sql += " AND pr.tem_ocorrencia = 1";
    }
    sql += ' ORDER BY r.data_servico DESC, pr.id DESC LIMIT 500';
    const dados = db.prepare(sql).all(...params);
    res.json({ success: true, total: dados.length, dados });
});

// 2. RELATÓRIO DE OCORRÊNCIAS
router.get('/ocorrencias', (req, res) => {
    try {
        const { data_inicio, data_fim, posto_id, status } = req.query;
        const db = getDb();

        let sql = `
            SELECT 
                o.id,
                o.created_at,
                r.data_servico,
                p.id as posto_id,
                p.nome as posto_nome,
                s.nome as setor_nome,
                o.tipo_ocorrencia,
                o.descricao,
                o.providencias_adotadas,
                o.status,
                r.responsavel_nome as supervisor_nome
            FROM ocorrencias o
            JOIN relatorios r ON o.relatorio_id = r.id
            LEFT JOIN postos p ON o.posto_id = p.id
            LEFT JOIN setores s ON p.setor_id = s.id
            WHERE 1=1
        `;
        const params = [];
        if (data_inicio) { sql += ' AND r.data_servico >= ?'; params.push(data_inicio); }
        if (data_fim) { sql += ' AND r.data_servico <= ?'; params.push(data_fim); }
        if (posto_id) { sql += ' AND o.posto_id = ?'; params.push(posto_id); }
        if (status) { sql += ' AND o.status = ?'; params.push(status); }

        sql += ' ORDER BY r.data_servico DESC, o.id DESC LIMIT 500';
        const dados = db.prepare(sql).all(...params);

        res.json({ success: true, total: dados.length, dados });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. RELATÓRIO CONSOLIDADO POR POSTO (BASE OFICIAL 59 POSTOS)
router.get('/por-posto', (req, res) => {
    try {
        const db = getDb();
        const sql = `
            SELECT 
                p.id,
                p.nome,
                p.endereco,
                p.localidade,
                p.regiao,
                p.empresa,
                s.nome as setor_nome,
                COUNT(pr.id) as total_fiscalizacoes,
                SUM(CASE WHEN pr.supervisionado = 1 AND pr.status_supervisao != 'NAO_SUPERVISIONADO' THEN 1 ELSE 0 END) as total_supervisionados,
                SUM(CASE WHEN pr.supervisionado = 0 OR pr.status_supervisao = 'NAO_SUPERVISIONADO' THEN 1 ELSE 0 END) as total_nao_supervisionados,
                SUM(CASE WHEN pr.tem_ocorrencia = 1 THEN 1 ELSE 0 END) as total_ocorrencias,
                MAX(r.data_servico) as ultima_supervisao
            FROM postos p
            LEFT JOIN setores s ON p.setor_id = s.id
            LEFT JOIN postos_relatorio pr ON p.id = pr.posto_id
            LEFT JOIN relatorios r ON pr.relatorio_id = r.id
            GROUP BY p.id
            ORDER BY s.nome ASC, p.nome ASC
        `;
        const dados = db.prepare(sql).all();
        res.json({ success: true, total: dados.length, dados });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. RELATÓRIO CONSOLIDADO POR SETOR
router.get('/por-setor', (req, res) => {
    try {
        const db = getDb();
        const setores = db.prepare('SELECT id, nome, sigla, status FROM setores ORDER BY id').all();

        const dados = setores.map(setor => {
            const postosCount = db.prepare('SELECT count(*) as c FROM postos WHERE setor_id = ?').get(setor.id).c;
            
            const stats = db.prepare(`
                SELECT 
                    COUNT(pr.id) as total_rondas,
                    SUM(CASE WHEN pr.supervisionado = 1 AND pr.status_supervisao != 'NAO_SUPERVISIONADO' THEN 1 ELSE 0 END) as total_supervisionados,
                    SUM(CASE WHEN pr.supervisionado = 0 OR pr.status_supervisao = 'NAO_SUPERVISIONADO' THEN 1 ELSE 0 END) as total_nao_supervisionados,
                    SUM(CASE WHEN pr.tem_ocorrencia = 1 THEN 1 ELSE 0 END) as total_ocorrencias
                FROM postos_relatorio pr
                JOIN relatorios r ON pr.relatorio_id = r.id
                WHERE r.setor_id = ? OR pr.setor_id_posto = ?
            `).get(setor.id, setor.id);

            const totalRondas = (stats && stats.total_rondas) || 0;
            const sup = (stats && stats.total_supervisionados) || 0;
            const naoSup = (stats && stats.total_nao_supervisionados) || 0;
            const pct = totalRondas > 0 ? Math.round((sup / totalRondas) * 100) : 0;

            return {
                setor_id: setor.id,
                setor_nome: setor.nome,
                sigla: setor.sigla,
                postos_cadastrados: postosCount,
                total_rondas: totalRondas,
                total_supervisionados: sup,
                total_nao_supervisionados: naoSup,
                total_ocorrencias: (stats && stats.total_ocorrencias) || 0,
                taxa_cumprimento_pct: pct
            };
        });

        res.json({ success: true, dados });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. RELATÓRIO CONSOLIDADO POR SUPERVISOR
router.get('/por-supervisor', (req, res) => {
    try {
        const db = getDb();
        const sql = `
            SELECT 
                sup.id,
                sup.nome,
                sup.matricula,
                s.nome as setor_nome,
                COUNT(DISTINCT r.id) as total_plantões,
                COUNT(pr.id) as postos_avaliados,
                SUM(CASE WHEN pr.supervisionado = 1 AND pr.status_supervisao != 'NAO_SUPERVISIONADO' THEN 1 ELSE 0 END) as postos_supervisionados,
                SUM(CASE WHEN pr.supervisionado = 0 OR pr.status_supervisao = 'NAO_SUPERVISIONADO' THEN 1 ELSE 0 END) as postos_nao_supervisionados,
                ROUND(SUM(COALESCE(r.km_rodado, 0)), 1) as km_total_rodado,
                MAX(r.data_servico) as ultimo_servico
            FROM supervisores sup
            LEFT JOIN setores s ON sup.setor_id = s.id
            LEFT JOIN relatorios r ON sup.id = r.supervisor_id
            LEFT JOIN postos_relatorio pr ON r.id = pr.relatorio_id
            GROUP BY sup.id
            ORDER BY postos_supervisionados DESC, sup.nome ASC
        `;
        const dados = db.prepare(sql).all();
        res.json({ success: true, total: dados.length, dados });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
