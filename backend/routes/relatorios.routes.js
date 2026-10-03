const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requirePainel } = require('../middleware/permissions');

// Proteção: Autenticação JWT obrigatória. Permissões de setor são aplicadas por perfil.
router.use(authenticateToken);

function getSaoPauloDate(daysOffset = 0) {
    const now = new Date();
    if (daysOffset !== 0) {
        now.setDate(now.getDate() + daysOffset);
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(now);
}

// 0. LISTAR OPÇÕES DE FILTROS REAIS EXISTENTES NO BANCO
router.get('/filtros-disponiveis', (req, res) => {
    try {
        const db = getDb();
        const setores = db.prepare("SELECT id, nome, sigla FROM setores WHERE status = 'ativo' ORDER BY id").all();
        
        // Fiscais que possuem registros de relatórios
        const fiscais = db.prepare(`
            SELECT DISTINCT sup.id, sup.nome, sup.matricula
            FROM relatorios r
            JOIN supervisores sup ON r.supervisor_id = sup.id
            ORDER BY sup.nome ASC
        `).all();

        // Postos que possuem registros nos relatórios
        const postos = db.prepare(`
            SELECT DISTINCT p.id, COALESCE(p.nome, pr.nome_posto_digitado) as nome, p.setor_id
            FROM postos_relatorio pr
            LEFT JOIN postos p ON pr.posto_id = p.id
            WHERE p.id IS NOT NULL OR pr.nome_posto_digitado IS NOT NULL
            ORDER BY nome ASC
        `).all();

        res.json({ success: true, setores, fiscais, postos });
    } catch (err) {
        console.error('Erro ao listar filtros disponíveis:', err);
        res.status(500).json({ error: err.message });
    }
});

// 1. RELATÓRIO DE SUPERVISÃO OPERACIONAL (DETALHADO E ANALÍTICO)
router.get('/supervisao', (req, res) => {
    try {
        const { 
            periodo, 
            data_inicio, 
            data_fim, 
            setor_id, 
            supervisor_id, 
            fiscal_id,
            posto_id, 
            situacao, 
            ocorrencia 
        } = req.query;
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
                p.setor_id as posto_setor_id,
                r.setor_id as relatorio_setor_id,
                COALESCE(r.responsavel_nome, sup.nome, 'FISCAL') as supervisor_nome,
                s_rel.nome as setor_supervisor,
                COALESCE(v.tipo_modelo || ' (' || v.placa || ')', r.viatura_outros_texto, 'Não informada') as veiculo,
                pr.status_supervisao,
                pr.supervisionado,
                pr.tem_ocorrencia,
                pr.efetivo_presente,
                pr.efetivo_completo,
                pr.falta_efetivo_qtd,
                pr.observacao,
                pr.descricao_ocorrencia,
                pr.motivo_nao_supervisao,
                CASE 
                    WHEN pr.supervisionado = 0 OR pr.status_supervisao = 'NAO_SUPERVISIONADO' THEN 'Não fiscalizado'
                    WHEN pr.tem_ocorrencia = 1 OR pr.status_supervisao = 'COM_OCORRENCIA' THEN 'Com ocorrência'
                    WHEN pr.status_supervisao = 'PENDENCIA' OR pr.status_supervisao = 'IRREGULAR' THEN 'Irregular'
                    ELSE 'Normal'
                END as situacao
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

        // Permissão por perfil: supervisores com setor vinculado visualizam seu setor
        if (req.user && req.user.perfil === 'supervisor' && req.user.setor_id) {
            sql += ' AND (p.setor_id = ? OR r.setor_id = ?)';
            params.push(req.user.setor_id, req.user.setor_id);
        }

        // Filtro de Data / Período (America/Sao_Paulo)
        if (periodo === 'hoje') {
            const hoje = getSaoPauloDate(0);
            sql += ' AND r.data_servico = ?';
            params.push(hoje);
        } else if (periodo === 'ontem') {
            const ontem = getSaoPauloDate(-1);
            sql += ' AND r.data_servico = ?';
            params.push(ontem);
        } else if (periodo === 'personalizado' || (!periodo && (data_inicio || data_fim))) {
            if (data_inicio && data_fim) {
                sql += ' AND r.data_servico BETWEEN ? AND ?';
                params.push(data_inicio, data_fim);
            } else if (data_inicio) {
                sql += ' AND r.data_servico >= ?';
                params.push(data_inicio);
            } else if (data_fim) {
                sql += ' AND r.data_servico <= ?';
                params.push(data_fim);
            }
        }

        // Setor
        if (setor_id) {
            sql += ' AND (p.setor_id = ? OR r.setor_id = ?)';
            params.push(setor_id, setor_id);
        }

        // Fiscal / Supervisor
        const idFiscal = supervisor_id || fiscal_id;
        if (idFiscal) {
            sql += ' AND r.supervisor_id = ?';
            params.push(idFiscal);
        }

        // Posto
        if (posto_id) {
            sql += ' AND pr.posto_id = ?';
            params.push(posto_id);
        }

        // Situação
        if (situacao && situacao !== 'todos') {
            if (situacao === 'normal') {
                sql += " AND (pr.status_supervisao = 'NORMAL' OR (pr.supervisionado = 1 AND (pr.status_supervisao IS NULL OR pr.status_supervisao NOT IN ('IRREGULAR', 'PENDENCIA', 'NAO_SUPERVISIONADO')) AND pr.tem_ocorrencia = 0))";
            } else if (situacao === 'irregular') {
                sql += " AND (pr.status_supervisao IN ('IRREGULAR', 'PENDENCIA', 'NAO_SUPERVISIONADO') OR pr.supervisionado = 0)";
            } else if (situacao === 'supervisionado') {
                sql += " AND pr.supervisionado = 1 AND pr.status_supervisao != 'NAO_SUPERVISIONADO'";
            } else if (situacao === 'nao_supervisionado') {
                sql += " AND (pr.supervisionado = 0 OR pr.status_supervisao = 'NAO_SUPERVISIONADO')";
            } else if (situacao === 'ocorrencia') {
                sql += " AND pr.tem_ocorrencia = 1";
            } else if (situacao === 'outra') {
                sql += " AND (pr.status_supervisao NOT IN ('NORMAL', 'IRREGULAR', 'PENDENCIA', 'NAO_SUPERVISIONADO') AND pr.status_supervisao IS NOT NULL)";
            }
        }

        // Ocorrência
        if (ocorrencia && ocorrencia !== 'todas') {
            if (ocorrencia === 'com_ocorrencia' || ocorrencia === 'sim' || ocorrencia === '1') {
                sql += " AND (pr.tem_ocorrencia = 1 OR pr.status_supervisao = 'COM_OCORRENCIA')";
            } else if (ocorrencia === 'sem_ocorrencia' || ocorrencia === 'nao' || ocorrencia === '0') {
                sql += " AND (pr.tem_ocorrencia = 0 AND (pr.status_supervisao != 'COM_OCORRENCIA' OR pr.status_supervisao IS NULL))";
            }
        }

        sql += ' ORDER BY r.data_servico DESC, pr.id DESC LIMIT 1000';
        const dados = db.prepare(sql).all(...params);

        const total_relatorios = new Set(dados.map(d => d.relatorio_id)).size;
        const total_postos = dados.length;
        const postos_regulares = dados.filter(d => d.situacao === 'Normal').length;
        const postos_irregulares = dados.filter(d => d.situacao === 'Irregular' || d.situacao === 'Não fiscalizado').length;
        const total_ocorrencias = dados.filter(d => d.tem_ocorrencia == 1 || d.situacao === 'Com ocorrência').length;
        const total_efetivo = dados.reduce((acc, d) => acc + (parseInt(d.efetivo_presente) || 1), 0);
        const total_faltas = dados.reduce((acc, d) => acc + (parseInt(d.falta_efetivo_qtd) || 0), 0);

        const indicadores = {
            total_relatorios,
            total_postos,
            postos_regulares,
            postos_irregulares,
            total_ocorrencias,
            total_efetivo,
            total_faltas
        };

        res.json({ success: true, total: dados.length, indicadores, dados });
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

// 7. EXCLUIR RELATÓRIO (ALIAS)
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id || isNaN(id)) {
            return res.status(400).json({ success: false, message: 'ID de relatório inválido' });
        }

        const db = getDb();
        const relatorio = db.prepare(`
            SELECT r.*, s.nome as setor_nome, sup.nome as supervisor_nome,
                   (SELECT COUNT(*) FROM postos_relatorio WHERE relatorio_id = r.id) as total_postos,
                   (SELECT COUNT(*) FROM ocorrencias WHERE relatorio_id = r.id) as total_ocorrencias
            FROM relatorios r
            JOIN setores s ON r.setor_id = s.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            WHERE r.id = ?
        `).get(id);

        if (!relatorio) {
            return res.status(404).json({ success: false, message: `Relatório #${id} não encontrado.` });
        }

        const runDeleteTransaction = db.transaction(() => {
            try {
                db.prepare(`
                    INSERT INTO auditoria_log (tabela, registro_id, acao, detalhes, usuario_id, usuario_nome, ip_origem)
                    VALUES ('relatorios', ?, 'DELETE', ?, ?, ?, ?)
                `).run(
                    id,
                    JSON.stringify({
                        setor: relatorio.setor_nome,
                        fiscal: relatorio.responsavel_nome || relatorio.supervisor_nome,
                        data_servico: relatorio.data_servico,
                        turno: relatorio.turno,
                        total_postos: relatorio.total_postos,
                        status: relatorio.status
                    }),
                    req.user ? req.user.id : null,
                    req.user ? req.user.nome : 'Sistema',
                    req.ip || '127.0.0.1'
                );
            } catch (eAud) {}

            db.prepare('DELETE FROM ocorrencias WHERE relatorio_id = ?').run(id);
            db.prepare('DELETE FROM postos_relatorio WHERE relatorio_id = ?').run(id);
            db.prepare('DELETE FROM relatorios WHERE id = ?').run(id);
        });

        runDeleteTransaction();

        try {
            const { deleteRelatorioFromSupabase } = require('../services/supabase_sync.service');
            deleteRelatorioFromSupabase(id).catch(err => {
                console.warn(`[SUPABASE] Falha na exclusão do relatório #${id}:`, err.message);
            });
        } catch (_) {}

        return res.json({
            success: true,
            message: `Relatório #${id} excluído com sucesso. Fiscal liberado para iniciar novo relatório.`,
            relatorio_excluido: {
                id: relatorio.id,
                setor: relatorio.setor_nome,
                fiscal: relatorio.responsavel_nome || relatorio.supervisor_nome || 'Supervisor',
                data_servico: relatorio.data_servico,
                turno: relatorio.turno,
                total_postos: relatorio.total_postos,
                situacao: relatorio.status === 'concluido' ? 'CONSOLIDADO / ENVIADO' : 'EM PREENCHIMENTO'
            }
        });
    } catch (error) {
        console.error('Erro ao excluir relatório:', error);
        res.status(500).json({ success: false, message: 'Erro ao excluir relatório: ' + error.message });
    }
});

module.exports = router;
