const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requirePainel } = require('../middleware/permissions');

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

// Proteção estrita: Somente CCO (admin) e Diretoria (consulta)
router.use(authenticateToken, requirePainel);

router.get('/stats', (req, res) => {
    try {
        const { periodo, data_inicio, data_fim, setor_id, supervisor_id, viatura_id, turno } = req.query;
        const db = getDb();
        
        let dateCondition = '';
        let dateParams = [];
        
        if (periodo === 'hoje') {
            dateCondition = "AND date(r.data_servico) = ?";
            dateParams = [getSaoPauloDate(0)];
        } else if (periodo === 'ontem') {
            dateCondition = "AND date(r.data_servico) = ?";
            dateParams = [getSaoPauloDate(-1)];
        } else if (periodo === '7dias') {
            dateCondition = "AND date(r.data_servico) >= ?";
            dateParams = [getSaoPauloDate(-7)];
        } else if (periodo === '30dias') {
            dateCondition = "AND date(r.data_servico) >= ?";
            dateParams = [getSaoPauloDate(-30)];
        } else if (periodo === 'personalizado' && data_inicio && data_fim) {
            dateCondition = 'AND date(r.data_servico) BETWEEN ? AND ?';
            dateParams = [data_inicio, data_fim];
        }

        let filtrosRel = '';
        let extraParams = [];
        if (setor_id) {
            filtrosRel += ' AND r.setor_id = ?';
            extraParams.push(setor_id);
        }
        if (supervisor_id) {
            filtrosRel += ' AND r.supervisor_id = ?';
            extraParams.push(supervisor_id);
        }
        if (viatura_id) {
            filtrosRel += ' AND r.viatura_id = ?';
            extraParams.push(viatura_id);
        }
        if (turno) {
            filtrosRel += ' AND r.turno = ?';
            extraParams.push(turno);
        }
        
        const paramsRel = [...dateParams, ...extraParams];
        const whereRel = `1=1 ${dateCondition} ${filtrosRel}`;
        
        // 1. Total de Setores
        const total_setores = db.prepare("SELECT COUNT(*) as total FROM setores WHERE status = 'ativo'").get().total;
        
        // 2. Supervisores Ativos
        let supSql = "SELECT COUNT(*) as total FROM supervisores WHERE status = 'ativo'";
        if (setor_id) supSql += ` AND setor_id = ${parseInt(setor_id)}`;
        const supervisores_ativos = db.prepare(supSql).get().total;
        
        // 3. Viaturas Ativas
        let viaSql = "SELECT COUNT(*) as total FROM viaturas WHERE status = 'ativo'";
        if (setor_id) viaSql += ` AND setor_id = ${parseInt(setor_id)}`;
        const viaturas_ativas = db.prepare(viaSql).get().total;
        
        // 4. Postos Cadastrados
        let postSql = "SELECT COUNT(*) as total FROM postos WHERE status = 'ativo'";
        if (setor_id === 'sem_setor') {
            postSql = "SELECT COUNT(*) as total FROM postos WHERE status = 'ativo' AND setor_id IS NULL";
        } else if (setor_id && !isNaN(parseInt(setor_id))) {
            const sIdNum = parseInt(setor_id);
            if (sIdNum === 4) {
                postSql = "SELECT COUNT(*) as total FROM postos WHERE status = 'ativo'";
            } else {
                postSql = `
                    SELECT COUNT(DISTINCT pss.posto_id) as total 
                    FROM posto_setor_supervisao pss 
                    JOIN postos p ON p.id = pss.posto_id 
                    WHERE pss.setor_id = ${sIdNum} AND pss.ativo = 1 AND p.status = 'ativo'
                `;
            }
        }
        const postos_cadastrados = db.prepare(postSql).get().total;
        
        // 5. Relatórios do dia / período
        const relatorios_periodo = db.prepare(`SELECT COUNT(*) as total FROM relatorios r WHERE ${whereRel}`).get(...paramsRel).total;
        
        // 6. Postos supervisionados no período (DISTINCT para nunca inflar além dos cadastrados)
        const postos_supervisionados = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE ${whereRel} AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL) 
              AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
              AND (r.status = 'concluido' OR r.status IS NULL)
        `).get(...paramsRel).total;

        // 6.1 Postos em preenchimento (com preenchimento salvo em aberto no período e ainda não concluídos)
        const postos_em_preenchimento = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE ${whereRel} AND r.status = 'em_aberto'
              AND pr.posto_id NOT IN (
                  SELECT pr2.posto_id
                  FROM postos_relatorio pr2
                  JOIN relatorios r2 ON pr2.relatorio_id = r2.id
                  WHERE ${whereRel} AND (pr2.supervisionado = 1 OR pr2.supervisionado IS NULL) 
                    AND pr2.status_supervisao != 'NAO_SUPERVISIONADO'
                    AND (r2.status = 'concluido' OR r2.status IS NULL)
              )
        `).get(...paramsRel, ...paramsRel).total;

        // 6.2 Postos NÃO supervisionados no período (cadastrados menos os supervisionados e os em preenchimento)
        const postos_nao_supervisionados = Math.max(0, postos_cadastrados - postos_supervisionados - postos_em_preenchimento);
        
        // 7. Ocorrências no período
        const total_ocorrencias = db.prepare(`
            SELECT COUNT(oc.id) as total
            FROM ocorrencias oc
            JOIN relatorios r ON oc.relatorio_id = r.id
            WHERE ${whereRel}
        `).get(...paramsRel).total;

        // 7.1 Postos com Ocorrência (DISTINCT)
        const postos_com_ocorrencia = db.prepare(`
            SELECT COUNT(DISTINCT oc.posto_id) as total
            FROM ocorrencias oc
            JOIN relatorios r ON oc.relatorio_id = r.id
            WHERE ${whereRel} AND oc.posto_id IS NOT NULL
        `).get(...paramsRel).total;

        // 7.2 Postos sem Ocorrência (Supervisionados menos os com ocorrência)
        const postos_sem_ocorrencia = Math.max(0, postos_supervisionados - postos_com_ocorrencia);
        
        // 8. Pendências ativas no período
        const total_pendencias = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE pr.status_supervisao = 'PENDENCIA' AND ${whereRel}
        `).get(...paramsRel).total;

        // 8.1 Postos Pendentes (Cadastrados que ainda não foram supervisionados no período)
        const postos_pendentes = Math.max(0, postos_cadastrados - postos_supervisionados);
        const percentual_supervisao = postos_cadastrados > 0 
            ? Math.min(100, Math.round((postos_supervisionados / postos_cadastrados) * 100)) 
            : 0;

        // 9. KM Rodados no período
        const kmResult = db.prepare(`SELECT COALESCE(SUM(r.km_rodado), 0) as total FROM relatorios r WHERE ${whereRel}`).get(...paramsRel);
        const km_rodados = kmResult ? kmResult.total : 0;

        // 9.1 Último Relatório Enviado no Geral
        const ultimo_relatorio = db.prepare(`
            SELECT r.*, s.nome as setor_nome, sup.nome as supervisor_nome,
                   v.tipo_modelo as viatura_modelo, v.placa as viatura_placa
            FROM relatorios r
            JOIN setores s ON r.setor_id = s.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            LEFT JOIN viaturas v ON r.viatura_id = v.id
            ORDER BY r.data_servico DESC, r.id DESC LIMIT 1
        `).get();

        // 10. Status detalhado por Setor
        const status_setores = db.prepare("SELECT id, nome, sigla FROM setores WHERE status = 'ativo' ORDER BY nome ASC").all().map(s => {
            const ultRel = db.prepare(`
                SELECT r.*, sup.nome as supervisor_nome, v.tipo_modelo as viatura_modelo, v.placa as viatura_placa
                FROM relatorios r
                LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
                LEFT JOIN viaturas v ON r.viatura_id = v.id
                WHERE r.setor_id = ?
                ORDER BY r.data_servico DESC, r.id DESC LIMIT 1
            `).get(s.id);
            
            const isPlantao = s.sigla === 'PLANTAO' || s.nome.toUpperCase().includes('PLANT') || s.id === 4;
            let postosSetor = 0;
            if (isPlantao) {
                postosSetor = db.prepare("SELECT COUNT(*) as total FROM postos WHERE status = 'ativo'").get().total;
            } else {
                postosSetor = db.prepare(`
                    SELECT COUNT(DISTINCT pss.posto_id) as total 
                    FROM posto_setor_supervisao pss 
                    JOIN postos p ON p.id = pss.posto_id 
                    WHERE pss.setor_id = ? AND pss.ativo = 1 AND p.status = 'ativo'
                `).get(s.id).total;
            }
            
            let postosSupervisionadosHoje = 0;
            let postosEmPreenchimentoHoje = 0;
            let postosNaoSupervisionadosHoje = 0;
            let ocorrenciasHoje = 0;
            let pendenciasHoje = 0;
            
            // Relatórios do setor no período selecionado
            const relatoriosSetor = db.prepare(`
                SELECT r.id, r.status FROM relatorios r
                WHERE r.setor_id = ? AND ${whereRel}
            `).all(s.id, ...paramsRel);
            
            const relIds = relatoriosSetor.map(r => r.id);
            const relConcluidosIds = relatoriosSetor.filter(r => r.status === 'concluido' || r.status === null).map(r => r.id);
            const relAbertosIds = relatoriosSetor.filter(r => r.status === 'em_aberto').map(r => r.id);

            if (relConcluidosIds.length > 0) {
                const placeholders = relConcluidosIds.map(() => '?').join(',');
                postosSupervisionadosHoje = db.prepare(`
                    SELECT COUNT(DISTINCT posto_id) as total 
                    FROM postos_relatorio 
                    WHERE relatorio_id IN (${placeholders}) 
                    AND (supervisionado = 1 OR supervisionado IS NULL) 
                    AND status_supervisao != 'NAO_SUPERVISIONADO'
                `).get(...relConcluidosIds).total;
            }

            if (relAbertosIds.length > 0) {
                const placeholders = relAbertosIds.map(() => '?').join(',');
                postosEmPreenchimentoHoje = db.prepare(`
                    SELECT COUNT(DISTINCT posto_id) as total 
                    FROM postos_relatorio 
                    WHERE relatorio_id IN (${placeholders})
                `).get(...relAbertosIds).total;
            }

            if (relIds.length > 0) {
                const placeholders = relIds.map(() => '?').join(',');
                ocorrenciasHoje = db.prepare(`
                    SELECT COUNT(*) as total 
                    FROM ocorrencias 
                    WHERE relatorio_id IN (${placeholders})
                `).get(...relIds).total;

                pendenciasHoje = db.prepare(`
                    SELECT COUNT(DISTINCT posto_id) as total 
                    FROM postos_relatorio 
                    WHERE relatorio_id IN (${placeholders}) 
                    AND status_supervisao = 'PENDENCIA'
                `).get(...relIds).total;
            }

            postosNaoSupervisionadosHoje = Math.max(0, postosSetor - postosSupervisionadosHoje - postosEmPreenchimentoHoje);
            
            let statusOperacional = 'SEM_REGISTRO';
            if (relIds.length > 0) {
                if (pendenciasHoje > 0) statusOperacional = 'PENDENCIA';
                else if (ocorrenciasHoje > 0) statusOperacional = 'COM_OCORRENCIA';
                else if (postosSupervisionadosHoje > 0) statusOperacional = 'NORMAL';
                else if (postosEmPreenchimentoHoje > 0) statusOperacional = 'EM_PREENCHIMENTO';
                else statusOperacional = 'NORMAL';
            }
            
            return {
                id: s.id,
                nome: s.nome,
                sigla: s.sigla,
                postos_cadastrados: postosSetor,
                supervisor_atual: ultRel ? (ultRel.supervisor_nome || ultRel.responsavel_nome) : 'Nenhum plantão recente',
                viatura_atual: ultRel ? `${ultRel.viatura_modelo || ultRel.viatura_outros_texto || 'VTR'} (${ultRel.viatura_placa || 'N/A'})` : 'Sem viatura',
                ultimo_relatorio_data: ultRel ? ultRel.data_servico : null,
                ultimo_relatorio_turno: ultRel ? ultRel.turno : null,
                postos_supervisionados: postosSupervisionadosHoje,
                postos_em_preenchimento: postosEmPreenchimentoHoje,
                postos_nao_supervisionados: postosNaoSupervisionadosHoje,
                ocorrencias: ocorrenciasHoje,
                pendencias: pendenciasHoje,
                status_operacional: statusOperacional
            };
        });

        // 11. Gráfico de Situação dos Postos
        const grafico_situacao = db.prepare(`
            SELECT pr.status_supervisao, COUNT(pr.id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE ${whereRel}
            GROUP BY pr.status_supervisao
        `).all(...paramsRel);
        
        // 12. Gráfico por Setor
        const grafico_setores = db.prepare(`
            SELECT s.nome as setor, COUNT(pr.id) as fiscalizados
            FROM setores s
            LEFT JOIN relatorios r ON r.setor_id = s.id ${dateCondition}
            LEFT JOIN postos_relatorio pr ON pr.relatorio_id = r.id AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL) AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
            WHERE s.status = 'ativo'
            GROUP BY s.id
            ORDER BY s.nome ASC
        `).all(...dateParams);

        // 13. Gráfico de KM por Data
        const grafico_km = db.prepare(`
            SELECT r.data_servico as data, COALESCE(SUM(r.km_rodado), 0) as km
            FROM relatorios r
            WHERE ${whereRel}
            GROUP BY r.data_servico
            ORDER BY r.data_servico ASC
        `).all(...paramsRel);

        // 14. Acompanhamento Semanal de Postos Sem Vistoria (Atualização Semanal Contínua)
        const filterSemanalSetor = (setor_id && parseInt(setor_id) !== 4) ? ` AND p.setor_id = ${parseInt(setor_id)}` : '';
        const postosAuditoriaSemanal = db.prepare(`
            SELECT p.id, p.nome, p.setor_id, s.nome as setor_nome, s.sigla as setor_sigla,
                   p.empresa, p.tipo_posto, p.endereco, p.localidade,
                   MAX(r.data_servico) as ultima_data_vistoria,
                   (
                       SELECT pr2.horario_supervisao 
                       FROM postos_relatorio pr2 
                       JOIN relatorios r2 ON pr2.relatorio_id = r2.id 
                       WHERE pr2.posto_id = p.id AND (pr2.supervisionado = 1 OR pr2.supervisionado IS NULL) AND pr2.status_supervisao != 'NAO_SUPERVISIONADO'
                       ORDER BY r2.data_servico DESC, pr2.id DESC LIMIT 1
                   ) as ultimo_horario,
                   (
                       SELECT r3.responsavel_nome 
                       FROM postos_relatorio pr3 
                       JOIN relatorios r3 ON pr3.relatorio_id = r3.id 
                       WHERE pr3.posto_id = p.id AND (pr3.supervisionado = 1 OR pr3.supervisionado IS NULL) AND pr3.status_supervisao != 'NAO_SUPERVISIONADO'
                       ORDER BY r3.data_servico DESC, pr3.id DESC LIMIT 1
                   ) as ultimo_supervisor
            FROM postos p
            JOIN setores s ON p.setor_id = s.id
            LEFT JOIN postos_relatorio pr ON pr.posto_id = p.id AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL) AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
            LEFT JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE p.status = 'ativo' ${filterSemanalSetor}
            GROUP BY p.id
            ORDER BY p.id ASC
        `).all();

        const agora = new Date();
        let postos_criticos_cont = 0;
        let postos_atencao_cont = 0;
        let postos_em_dia_cont = 0;

        const listaSemanal = postosAuditoriaSemanal.map(p => {
            let diasSemVistoria = null;
            let statusVistoria = 'CRITICO';

            if (p.ultima_data_vistoria) {
                const diffMs = agora.getTime() - new Date(p.ultima_data_vistoria + 'T12:00:00').getTime();
                diasSemVistoria = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                if (diasSemVistoria >= 15) {
                    statusVistoria = 'CRITICO';
                    postos_criticos_cont++;
                } else if (diasSemVistoria >= 7) {
                    statusVistoria = 'ATENCAO';
                    postos_atencao_cont++;
                } else {
                    statusVistoria = 'EM_DIA';
                    postos_em_dia_cont++;
                }
            } else {
                statusVistoria = 'CRITICO';
                postos_criticos_cont++;
            }

            return {
                id: p.id,
                nome: p.nome,
                setor_id: p.setor_id,
                setor_nome: p.setor_nome,
                setor_sigla: p.setor_sigla,
                empresa: p.empresa,
                tipo_posto: p.tipo_posto,
                ultima_data_vistoria: p.ultima_data_vistoria,
                ultimo_horario: p.ultimo_horario,
                ultimo_supervisor: p.ultimo_supervisor || 'Não informado',
                dias_sem_vistoria: diasSemVistoria,
                status_vistoria: statusVistoria
            };
        }).sort((a, b) => {
            const da = a.dias_sem_vistoria === null ? 99999 : a.dias_sem_vistoria;
            const db = b.dias_sem_vistoria === null ? 99999 : b.dias_sem_vistoria;
            return db - da;
        });

        const total_sem_vistoria_semana = postos_criticos_cont + postos_atencao_cont;

        // 15. Fiscais em Atividade (Preenchendo no momento da data/período selecionado)
        const fiscais_em_atividade = db.prepare(`
            SELECT 
                r.id as relatorio_id,
                r.setor_id,
                s.nome as setor_nome,
                s.sigla as setor_sigla,
                r.data_servico,
                r.turno,
                COALESCE(sup.nome, r.responsavel_nome, 'Fiscal Operacional') as fiscal_nome,
                r.created_at,
                COUNT(pr.id) as postos_preenchidos,
                MAX(pr.horario_supervisao) as ultimo_horario_posto
            FROM relatorios r
            JOIN setores s ON r.setor_id = s.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            LEFT JOIN postos_relatorio pr ON pr.relatorio_id = r.id
            WHERE r.status = 'em_aberto' ${dateCondition}
            GROUP BY r.id
            ORDER BY r.id DESC
        `).all(...dateParams).map(f => {
            let totalSetor = 12;
            if (f.setor_id === 1) totalSetor = 12;
            else if (f.setor_id === 2) totalSetor = 19;
            else if (f.setor_id === 3) totalSetor = 6;
            else if (f.setor_id === 4) totalSetor = postos_cadastrados || 70;

            const pct = totalSetor > 0 ? Math.min(100, Math.round((f.postos_preenchidos / totalSetor) * 100)) : 0;
            let horaAtualizacao = f.ultimo_horario_posto;
            if (!horaAtualizacao && f.created_at) {
                const parts = String(f.created_at).split(' ');
                horaAtualizacao = parts[1] ? parts[1].substring(0, 8) : String(f.created_at);
            }
            if (!horaAtualizacao) horaAtualizacao = 'Em andamento';

            return {
                relatorio_id: f.relatorio_id,
                setor_id: f.setor_id,
                setor_nome: f.setor_nome,
                setor_sigla: f.setor_sigla,
                fiscal_nome: f.fiscal_nome,
                turno: f.turno,
                data_servico: f.data_servico,
                postos_preenchidos: f.postos_preenchidos,
                postos_total_setor: totalSetor,
                progresso_texto: `${f.postos_preenchidos}/${totalSetor} postos`,
                percentual: pct,
                ultima_atualizacao: horaAtualizacao
            };
        });

        res.json({
            total_setores,
            supervisores_ativos,
            viaturas_ativas,
            postos_cadastrados,
            relatorios_periodo,
            postos_supervisionados,
            postos_em_preenchimento,
            postos_nao_supervisionados,
            postos_pendentes,
            percentual_supervisao,
            total_ocorrencias,
            postos_com_ocorrencia,
            postos_sem_ocorrencia,
            total_pendencias,
            km_rodados,
            ultimo_relatorio,
            status_setores,
            fiscais_em_atividade,
            grafico_situacao,
            grafico_setores,
            grafico_km,
            postos_sem_vistoria_semana: total_sem_vistoria_semana,
            postos_criticos_semana: postos_criticos_cont,
            postos_atencao_semana: postos_atencao_cont,
            postos_em_dia_semana: postos_em_dia_cont,
            postos_acompanhamento_semanal: listaSemanal
        });
    } catch (error) {
        console.error('Erro no /dashboard/stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint exclusivo: ACOMPANHAMENTO SEMANAL DE POSTOS SEM VISTORIA
router.get('/postos-sem-vistoria', authenticateToken, (req, res) => {
    try {
        const { filtro, setor_id } = req.query;
        const db = getDb();

        let sql = `
            SELECT p.id, p.nome, p.setor_id, s.nome as setor_nome, s.sigla as setor_sigla,
                   p.empresa, p.tipo_posto,
                   MAX(r.data_servico) as ultima_data_vistoria,
                   (
                       SELECT pr2.horario_supervisao 
                       FROM postos_relatorio pr2 
                       JOIN relatorios r2 ON pr2.relatorio_id = r2.id 
                       WHERE pr2.posto_id = p.id AND (pr2.supervisionado = 1 OR pr2.supervisionado IS NULL) AND pr2.status_supervisao != 'NAO_SUPERVISIONADO'
                       ORDER BY r2.data_servico DESC, pr2.id DESC LIMIT 1
                   ) as ultimo_horario,
                   (
                       SELECT r3.responsavel_nome 
                       FROM postos_relatorio pr3 
                       JOIN relatorios r3 ON pr3.relatorio_id = r3.id 
                       WHERE pr3.posto_id = p.id AND (pr3.supervisionado = 1 OR pr3.supervisionado IS NULL) AND pr3.status_supervisao != 'NAO_SUPERVISIONADO'
                       ORDER BY r3.data_servico DESC, pr3.id DESC LIMIT 1
                   ) as ultimo_supervisor
            FROM postos p
            JOIN setores s ON p.setor_id = s.id
            LEFT JOIN postos_relatorio pr ON pr.posto_id = p.id AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL) AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
            LEFT JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE p.status = 'ativo'
        `;
        const params = [];
        if (setor_id && parseInt(setor_id) !== 4) {
            sql += ' AND p.setor_id = ?';
            params.push(setor_id);
        }
        sql += ' GROUP BY p.id ORDER BY p.id ASC';

        const postos = db.prepare(sql).all(...params);
        const agora = new Date();

        let criticos = 0;
        let atencao = 0;
        let emDia = 0;

        let resultado = postos.map(p => {
            let diasSemVistoria = null;
            let statusVistoria = 'CRITICO';

            if (p.ultima_data_vistoria) {
                const diffMs = agora.getTime() - new Date(p.ultima_data_vistoria + 'T12:00:00').getTime();
                diasSemVistoria = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                if (diasSemVistoria >= 15) {
                    statusVistoria = 'CRITICO';
                    criticos++;
                } else if (diasSemVistoria >= 7) {
                    statusVistoria = 'ATENCAO';
                    atencao++;
                } else {
                    statusVistoria = 'EM_DIA';
                    emDia++;
                }
            } else {
                statusVistoria = 'CRITICO';
                criticos++;
            }

            return {
                id: p.id,
                nome: p.nome,
                setor_id: p.setor_id,
                setor_nome: p.setor_nome,
                setor_sigla: p.setor_sigla,
                empresa: p.empresa,
                tipo_posto: p.tipo_posto,
                ultima_data_vistoria: p.ultima_data_vistoria,
                ultimo_horario: p.ultimo_horario,
                ultimo_supervisor: p.ultimo_supervisor || 'Não informado',
                dias_sem_vistoria: diasSemVistoria,
                status_vistoria: statusVistoria
            };
        }).sort((a, b) => {
            const da = a.dias_sem_vistoria === null ? 99999 : a.dias_sem_vistoria;
            const db = b.dias_sem_vistoria === null ? 99999 : b.dias_sem_vistoria;
            return db - da;
        });

        if (filtro === 'critico') {
            resultado = resultado.filter(p => p.status_vistoria === 'CRITICO');
        } else if (filtro === 'atencao') {
            resultado = resultado.filter(p => p.status_vistoria === 'ATENCAO');
        } else if (filtro === 'em_dia') {
            resultado = resultado.filter(p => p.status_vistoria === 'EM_DIA');
        } else if (filtro === 'sem_vistoria') {
            resultado = resultado.filter(p => p.status_vistoria === 'CRITICO' || p.status_vistoria === 'ATENCAO');
        }

        res.json({
            totais: {
                total_postos: postos.length,
                sem_vistoria_semana: criticos + atencao,
                criticos,
                atencao,
                em_dia: emDia
            },
            postos: resultado
        });
    } catch (error) {
        console.error('Erro no /dashboard/postos-sem-vistoria:', error);
        res.status(500).json({ error: error.message });
    }
});


// Endpoint exclusivo: RELATÓRIO DO PLANTÃO
// Mostra todos os postos que deveriam ser supervisionados pelo Plantão naquele período,
// agrupados visualmente por setor original (TINGUÁ, GUANDU, LARANJAL, PLANTÃO) com seus status.
router.get('/relatorio-plantao', authenticateToken, (req, res) => {
    try {
        const { data, turno, relatorio_id } = req.query;
        const db = getDb();

        const dataServico = data || getSaoPauloDate(0);

        // Buscar relatório do plantão especificado ou o mais recente da data
        let relatorioPlantao = null;
        if (relatorio_id) {
            relatorioPlantao = db.prepare(`
                SELECT r.*, s.nome as setor_nome, sup.nome as supervisor_nome,
                       v.tipo_modelo as viatura_modelo, v.placa as viatura_placa
                FROM relatorios r
                JOIN setores s ON r.setor_id = s.id
                LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
                LEFT JOIN viaturas v ON r.viatura_id = v.id
                WHERE r.id = ?
            `).get(relatorio_id);
        } else {
            let plantaoSql = `
                SELECT r.*, s.nome as setor_nome, sup.nome as supervisor_nome,
                       v.tipo_modelo as viatura_modelo, v.placa as viatura_placa
                FROM relatorios r
                JOIN setores s ON r.setor_id = s.id
                LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
                LEFT JOIN viaturas v ON r.viatura_id = v.id
                WHERE s.nome LIKE '%PLANT%' AND r.data_servico = ?
            `;
            const params = [dataServico];
            if (turno) {
                plantaoSql += " AND r.turno = ?";
                params.push(turno);
            }
            plantaoSql += " ORDER BY r.id DESC LIMIT 1";
            relatorioPlantao = db.prepare(plantaoSql).get(...params);
        }

        // Buscar todos os postos ativos da CEDAE agrupados pelo setor de origem
        const setores = db.prepare("SELECT id, nome, sigla FROM setores WHERE status = 'ativo' ORDER BY (CASE WHEN nome LIKE '%PLANT%' THEN 1 ELSE 0 END), nome ASC").all();

        const resultadoSetores = setores.map(setor => {
            const postos = db.prepare(`
                SELECT p.id, p.nome, p.endereco, p.empresa, p.tipo_posto, p.setor_id
                FROM postos p
                WHERE p.setor_id = ? AND p.status = 'ativo'
                ORDER BY p.nome ASC
            `).all(setor.id);

            const postosComStatus = postos.map(posto => {
                let statusInfo = {
                    supervisionado: false,
                    status_supervisao: 'PENDENTE',
                    horario_supervisao: null,
                    efetivo_presente: null,
                    motivo_nao_supervisao: null,
                    observacao: null
                };

                if (relatorioPlantao) {
                    const registro = db.prepare(`
                        SELECT * FROM postos_relatorio
                        WHERE relatorio_id = ? AND posto_id = ?
                    `).get(relatorioPlantao.id, posto.id);

                    if (registro) {
                        statusInfo = {
                            supervisionado: registro.supervisionado === 1,
                            status_supervisao: registro.status_supervisao,
                            horario_supervisao: registro.horario_supervisao,
                            efetivo_presente: registro.efetivo_presente,
                            motivo_nao_supervisao: registro.motivo_nao_supervisao,
                            observacao: registro.observacao,
                            km_posto: registro.km_posto,
                            efetivo_completo: registro.efetivo_completo,
                            falta_efetivo_qtd: registro.falta_efetivo_qtd,
                            tem_ocorrencia: registro.tem_ocorrencia,
                            descricao_ocorrencia: registro.descricao_ocorrencia
                        };
                    }
                }

                return {
                    ...posto,
                    ...statusInfo
                };
            });

            return {
                setor_id: setor.id,
                setor_nome: setor.nome,
                setor_sigla: setor.sigla,
                total_postos: postos.length,
                postos: postosComStatus
            };
        });

        res.json({
            data_servico: dataServico,
            relatorio_plantao: relatorioPlantao || null,
            setores: resultadoSetores
        });
    } catch (error) {
        console.error('Erro no /dashboard/relatorio-plantao:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint de Auditoria Exata e Validação Automática de Integridade
router.get('/auditoria-dados', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const dataServico = req.query.data || getSaoPauloDate(0);

        // 1. Cadastros no Banco
        const totalPostosCadastrados = db.prepare("SELECT COUNT(*) as t FROM postos WHERE status = 'ativo'").get().t;
        const totalSupervisores = db.prepare("SELECT COUNT(*) as t FROM supervisores WHERE status = 'ativo'").get().t;
        const totalViaturas = db.prepare("SELECT COUNT(*) as t FROM viaturas WHERE status = 'ativo'").get().t;

        // 2. Postos por Setor
        const postosPorSetor = db.prepare(`
            SELECT s.nome as setor, s.sigla, COUNT(p.id) as total_postos
            FROM setores s
            LEFT JOIN postos p ON p.setor_id = s.id AND p.status = 'ativo'
            GROUP BY s.id
            ORDER BY s.id ASC
        `).all();

        // 3. Indicadores do Dia (Distinct para garantir fidelidade)
        const postosSupervisionados = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE date(r.data_servico) = ? AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL) AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
        `).get(dataServico).total;

        const postosNaoSupervisionados = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE date(r.data_servico) = ? AND (pr.supervisionado = 0 OR pr.status_supervisao = 'NAO_SUPERVISIONADO')
            AND pr.posto_id NOT IN (
                SELECT pr2.posto_id
                FROM postos_relatorio pr2
                JOIN relatorios r2 ON pr2.relatorio_id = r2.id
                WHERE date(r2.data_servico) = ? AND (pr2.supervisionado = 1 OR pr2.supervisionado IS NULL) AND pr2.status_supervisao != 'NAO_SUPERVISIONADO'
            )
        `).get(dataServico, dataServico).total;

        const postosPendentes = Math.max(0, totalPostosCadastrados - postosSupervisionados);

        const totalOcorrencias = db.prepare(`
            SELECT COUNT(oc.id) as total
            FROM ocorrencias oc
            JOIN relatorios r ON oc.relatorio_id = r.id
            WHERE date(r.data_servico) = ?
        `).get(dataServico).total;

        const postosComOcorrencia = db.prepare(`
            SELECT COUNT(DISTINCT oc.posto_id) as total
            FROM ocorrencias oc
            JOIN relatorios r ON oc.relatorio_id = r.id
            WHERE date(r.data_servico) = ? AND oc.posto_id IS NOT NULL
        `).get(dataServico).total;

        const postosSemOcorrencia = Math.max(0, postosSupervisionados - postosComOcorrencia);

        // 4. Verificações de Integridade
        const postosDuplicados = db.prepare(`
            SELECT nome, COUNT(*) as qtd
            FROM postos WHERE status = 'ativo'
            GROUP BY UPPER(TRIM(nome)) HAVING qtd > 1
        `).all();

        const relatoriosOrfaos = db.prepare(`
            SELECT COUNT(*) as t FROM postos_relatorio WHERE relatorio_id NOT IN (SELECT id FROM relatorios)
        `).get().t;

        const ocorrenciasOrfas = db.prepare(`
            SELECT COUNT(*) as t FROM ocorrencias WHERE relatorio_id NOT IN (SELECT id FROM relatorios)
        `).get().t;

        const postosSemSetor = db.prepare(`
            SELECT COUNT(*) as t FROM postos WHERE setor_id IS NULL OR setor_id NOT IN (SELECT id FROM setores)
        `).get().t;

        const integridadeOk = postosDuplicados.length === 0 && relatoriosOrfaos === 0 && ocorrenciasOrfas === 0 && postosSemSetor === 0;

        res.json({
            data_servico: dataServico,
            status_auditoria: integridadeOk ? '100%_CONCILIADO_SEM_DIVERGENCIAS' : 'INCONSISTENCIAS_ENCONTRADAS',
            totais: {
                total_postos: totalPostosCadastrados,
                supervisionados: postosSupervisionados,
                nao_supervisionados: postosNaoSupervisionados,
                pendentes: postosPendentes,
                total_ocorrencias: totalOcorrencias,
                com_ocorrencia: postosComOcorrencia,
                sem_ocorrencia: postosSemOcorrencia,
                supervisores: totalSupervisores,
                viaturas: totalViaturas
            },
            postos_por_setor: postosPorSetor,
            auditoria_integridade: {
                postos_duplicados: postosDuplicados,
                relatorios_orfaos: relatoriosOrfaos,
                ocorrencias_orfas: ocorrenciasOrfas,
                postos_sem_setor: postosSemSetor,
                consistencia_matematica: (postosSupervisionados + postosPendentes === totalPostosCadastrados) ? 'EXATA' : 'DIVERGENTE'
            }
        });
    } catch (error) {
        console.error('Erro na auditoria de dados:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
