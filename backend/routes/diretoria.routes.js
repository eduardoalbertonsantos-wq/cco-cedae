const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Autenticação obrigatória (somente leitura para Diretoria, Admin e Supervisores)
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

// GET /api/v1/diretoria/stats?data=YYYY-MM-DD
router.get('/stats', (req, res) => {
    try {
        const db = getDb();
        const dataAlvo = req.query.data || getSaoPauloDate(0);

        // 1. TOTAL DE POSTOS DISPONÍVEIS NO SISTEMA (Cálculo Dinâmico dos Postos Ativos)
        const totalPostosAtivos = db.prepare("SELECT COUNT(*) as total FROM postos WHERE status = 'ativo'").get().total;

        // 2. POSTOS FISCALIZADOS (CONCLUÍDOS) NA DATA SELECIONADA
        const rowFiscalizados = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE r.data_servico = ? 
              AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL)
              AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
              AND pr.posto_id IS NOT NULL
              AND (r.status = 'concluido' OR r.status IS NULL)
        `).get(dataAlvo);
        const postosFiscalizados = rowFiscalizados ? rowFiscalizados.total : 0;

        // 2.1 POSTOS EM PREENCHIMENTO NA DATA SELECIONADA
        const rowEmPreenchimento = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE r.data_servico = ? 
              AND r.status = 'em_aberto'
              AND pr.posto_id IS NOT NULL
              AND pr.posto_id NOT IN (
                  SELECT pr2.posto_id
                  FROM postos_relatorio pr2
                  JOIN relatorios r2 ON pr2.relatorio_id = r2.id
                  WHERE r2.data_servico = ? 
                    AND (pr2.supervisionado = 1 OR pr2.supervisionado IS NULL)
                    AND pr2.status_supervisao != 'NAO_SUPERVISIONADO'
                    AND (r2.status = 'concluido' OR r2.status IS NULL)
              )
        `).get(dataAlvo, dataAlvo);
        const postosEmPreenchimento = rowEmPreenchimento ? rowEmPreenchimento.total : 0;

        // 3. COBERTURA E PENDÊNCIAS
        const coberturaPercentual = totalPostosAtivos > 0 
            ? parseFloat(((postosFiscalizados / totalPostosAtivos) * 100).toFixed(1)) 
            : 0;
        const postosPendentes = Math.max(0, totalPostosAtivos - postosFiscalizados - postosEmPreenchimento);

        // 4. FISCALIZAÇÃO POR SETOR
        // Regra Oficial do CCO:
        // - Tinguá: 12 postos
        // - Guandu: 19 postos
        // - Laranjal: 6 postos
        // - Plantão: Dinâmico (Todos os postos ativos do sistema)

        // 4.1 TINGUÁ (Oficial: 12 postos)
        const tDesc = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN postos p ON pr.posto_id = p.id
            WHERE r.data_servico = ? 
              AND p.setor_id = 1
              AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL)
              AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
              AND (r.status = 'concluido' OR r.status IS NULL)
        `).get(dataAlvo);
        const tinguaFiscalizados = tDesc ? tDesc.total : 0;

        const tPreench = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN postos p ON pr.posto_id = p.id
            WHERE r.data_servico = ? 
              AND (p.setor_id = 1 OR r.setor_id = 1)
              AND r.status = 'em_aberto'
        `).get(dataAlvo);
        const tinguaEmPreenchimento = tPreench ? tPreench.total : 0;
        const tinguaOficial = 12;
        const tinguaPendentes = Math.max(0, tinguaOficial - tinguaFiscalizados - tinguaEmPreenchimento);
        const tinguaPercentual = parseFloat(((tinguaFiscalizados / tinguaOficial) * 100).toFixed(1));
        const tinguaStatus = tinguaFiscalizados >= tinguaOficial ? 'CONCLUIDO' : (tinguaEmPreenchimento > 0 ? 'EM_PREENCHIMENTO' : (tinguaFiscalizados > 0 ? 'PARCIAL' : 'NAO_INICIADO'));
        const tinguaStatusLabel = tinguaStatus === 'CONCLUIDO' ? '🟢 CONCLUÍDO' : (tinguaStatus === 'EM_PREENCHIMENTO' ? '🟡 EM PREENCHIMENTO' : (tinguaStatus === 'PARCIAL' ? '🔵 EM ANDAMENTO' : '⚪ NÃO INICIADO'));

        // 4.2 GUANDU (Oficial: 19 postos)
        const gDesc = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN postos p ON pr.posto_id = p.id
            WHERE r.data_servico = ? 
              AND p.setor_id = 2
              AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL)
              AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
              AND (r.status = 'concluido' OR r.status IS NULL)
        `).get(dataAlvo);
        const guanduFiscalizados = gDesc ? gDesc.total : 0;

        const gPreench = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN postos p ON pr.posto_id = p.id
            WHERE r.data_servico = ? 
              AND (p.setor_id = 2 OR r.setor_id = 2)
              AND r.status = 'em_aberto'
        `).get(dataAlvo);
        const guanduEmPreenchimento = gPreench ? gPreench.total : 0;
        const guanduOficial = 19;
        const guanduPendentes = Math.max(0, guanduOficial - guanduFiscalizados - guanduEmPreenchimento);
        const guanduPercentual = parseFloat(((guanduFiscalizados / guanduOficial) * 100).toFixed(1));
        const guanduStatus = guanduFiscalizados >= guanduOficial ? 'CONCLUIDO' : (guanduEmPreenchimento > 0 ? 'EM_PREENCHIMENTO' : (guanduFiscalizados > 0 ? 'PARCIAL' : 'NAO_INICIADO'));
        const guanduStatusLabel = guanduStatus === 'CONCLUIDO' ? '🟢 CONCLUÍDO' : (guanduStatus === 'EM_PREENCHIMENTO' ? '🟡 EM PREENCHIMENTO' : (guanduStatus === 'PARCIAL' ? '🔵 EM ANDAMENTO' : '⚪ NÃO INICIADO'));

        // 4.3 LARANJAL (Oficial: 6 postos)
        const lDesc = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN postos p ON pr.posto_id = p.id
            WHERE r.data_servico = ? 
              AND p.setor_id = 3
              AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL)
              AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
              AND (r.status = 'concluido' OR r.status IS NULL)
        `).get(dataAlvo);
        const laranjalFiscalizados = lDesc ? lDesc.total : 0;

        const lPreench = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN postos p ON pr.posto_id = p.id
            WHERE r.data_servico = ? 
              AND (p.setor_id = 3 OR r.setor_id = 3)
              AND r.status = 'em_aberto'
        `).get(dataAlvo);
        const laranjalEmPreenchimento = lPreench ? lPreench.total : 0;
        const laranjalOficial = 6;
        const laranjalPendentes = Math.max(0, laranjalOficial - laranjalFiscalizados - laranjalEmPreenchimento);
        const laranjalPercentual = parseFloat(((laranjalFiscalizados / laranjalOficial) * 100).toFixed(1));
        const laranjalStatus = laranjalFiscalizados >= laranjalOficial ? 'CONCLUIDO' : (laranjalEmPreenchimento > 0 ? 'EM_PREENCHIMENTO' : (laranjalFiscalizados > 0 ? 'PARCIAL' : 'NAO_INICIADO'));
        const laranjalStatusLabel = laranjalStatus === 'CONCLUIDO' ? '🟢 CONCLUÍDO' : (laranjalStatus === 'EM_PREENCHIMENTO' ? '🟡 EM PREENCHIMENTO' : (laranjalStatus === 'PARCIAL' ? '🔵 EM ANDAMENTO' : '⚪ NÃO INICIADO'));

        // 4.4 PLANTÃO (Rota Geral - Escopo Dinâmico = Todos os postos ativos)
        const pDesc = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN setores s ON r.setor_id = s.id
            WHERE r.data_servico = ? 
              AND (s.sigla = 'PLANTAO' OR s.id = 4 OR s.nome LIKE '%PLANT%')
              AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL)
              AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
              AND (r.status = 'concluido' OR r.status IS NULL)
        `).get(dataAlvo);
        const plantaoFiscalizados = pDesc ? pDesc.total : 0;

        const pPreench = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN setores s ON r.setor_id = s.id
            WHERE r.data_servico = ? 
              AND (s.sigla = 'PLANTAO' OR s.id = 4 OR s.nome LIKE '%PLANT%')
              AND r.status = 'em_aberto'
        `).get(dataAlvo);
        const plantaoEmPreenchimento = pPreench ? pPreench.total : 0;
        const plantaoEscopo = totalPostosAtivos;
        const plantaoPendentes = Math.max(0, plantaoEscopo - plantaoFiscalizados - plantaoEmPreenchimento);
        const plantaoPercentual = plantaoEscopo > 0 
            ? parseFloat(((plantaoFiscalizados / plantaoEscopo) * 100).toFixed(1)) 
            : 0;
        const plantaoStatus = plantaoFiscalizados >= plantaoEscopo ? 'CONCLUIDO' : (plantaoEmPreenchimento > 0 ? 'EM_PREENCHIMENTO' : (plantaoFiscalizados > 0 ? 'PARCIAL' : 'NAO_INICIADO'));
        const plantaoStatusLabel = plantaoStatus === 'CONCLUIDO' ? '🟢 CONCLUÍDO' : (plantaoStatus === 'EM_PREENCHIMENTO' ? '🟡 EM PREENCHIMENTO' : (plantaoStatus === 'PARCIAL' ? '🔵 EM ANDAMENTO' : '⚪ NÃO INICIADO'));

        // 4.5 FISCAIS EM ATIVIDADE (Acompanhamento em Tempo Real)
        const fiscaisEmAtividade = db.prepare(`
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
                MAX(pr.horario_supervisao) as ultimo_horario_posto,
                (
                    SELECT COALESCE(pr2.nome_posto_digitado, p.nome, 'Posto ' || pr2.id)
                    FROM postos_relatorio pr2
                    LEFT JOIN postos p ON pr2.posto_id = p.id
                    WHERE pr2.relatorio_id = r.id
                    ORDER BY pr2.id DESC LIMIT 1
                ) as posto_atual
            FROM relatorios r
            JOIN setores s ON r.setor_id = s.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            LEFT JOIN postos_relatorio pr ON pr.relatorio_id = r.id
            WHERE r.data_servico = ? AND r.status = 'em_aberto'
            GROUP BY r.id
            ORDER BY r.id DESC
        `).all(dataAlvo).map(f => {
            let totalSetor = 12;
            if (f.setor_id === 1) totalSetor = 12;
            else if (f.setor_id === 2) totalSetor = 19;
            else if (f.setor_id === 3) totalSetor = 6;
            else if (f.setor_id === 4) totalSetor = totalPostosAtivos || 70;

            const pct = totalSetor > 0 ? Math.min(100, Math.round((f.postos_preenchidos / totalSetor) * 100)) : 0;
            let horaAtualizacao = f.ultimo_horario_posto;
            if (!horaAtualizacao && f.created_at) {
                const parts = String(f.created_at).split(' ');
                horaAtualizacao = parts[1] ? parts[1].substring(0, 8) : String(f.created_at);
            }
            if (!horaAtualizacao) horaAtualizacao = 'Em andamento';

            let horaInicio = '-';
            if (f.created_at) {
                const parts = String(f.created_at).split(' ');
                horaInicio = parts[1] ? parts[1].substring(0, 5) : String(f.created_at);
            }

            const postoAtualDesc = f.posto_atual 
                ? f.posto_atual 
                : (f.postos_preenchidos === 0 ? 'Aguardando 1º posto' : 'Em preenchimento');

            return {
                relatorio_id: f.relatorio_id,
                setor_id: f.setor_id,
                setor_nome: f.setor_nome,
                setor_sigla: f.setor_sigla,
                fiscal_nome: f.fiscal_nome,
                turno: f.turno,
                data_servico: f.data_servico,
                hora_inicio: horaInicio,
                posto_atual: postoAtualDesc,
                postos_preenchidos: f.postos_preenchidos,
                postos_total_setor: totalSetor,
                progresso_texto: `${f.postos_preenchidos}/${totalSetor} postos`,
                percentual: pct,
                status_operacional: 'EM PREENCHIMENTO',
                ultima_atualizacao: horaAtualizacao
            };
        });

        // 5. DETALHAMENTO DO PLANTÃO: DISTRIBUIÇÃO POR SETOR DO POSTO
        // Mostra em quais setores originais os postos fiscalizados pelo Plantão estão localizados
        const plantaoDistribuicao = db.prepare(`
            SELECT 
                COALESCE(s_posto.nome, 'OUTROS / NÃO ESPECIFICADO') as setor_do_posto,
                COALESCE(s_posto.sigla, 'OUTROS') as setor_sigla,
                COUNT(DISTINCT pr.posto_id) as total_fiscalizados
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN setores s_rel ON r.setor_id = s_rel.id
            LEFT JOIN postos p ON pr.posto_id = p.id
            LEFT JOIN setores s_posto ON p.setor_id = s_posto.id
            WHERE r.data_servico = ? 
              AND (s_rel.sigla = 'PLANTAO' OR s_rel.id = 4 OR s_rel.nome LIKE '%PLANT%')
              AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL)
              AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
            GROUP BY s_posto.nome, s_posto.sigla
            ORDER BY total_fiscalizados DESC, setor_do_posto ASC
        `).all(dataAlvo);

        // Lista dos postos específicos cobertos pelo Plantão na data
        const plantaoPostosDetalhes = db.prepare(`
            SELECT 
                p.id as posto_id,
                p.nome as posto_nome,
                COALESCE(s_posto.nome, 'PLANTÃO') as setor_origem_posto,
                pr.horario_supervisao,
                sup.nome as fiscal_nome,
                r.turno,
                pr.status_supervisao
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN setores s_rel ON r.setor_id = s_rel.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            LEFT JOIN postos p ON pr.posto_id = p.id
            LEFT JOIN setores s_posto ON p.setor_id = s_posto.id
            WHERE r.data_servico = ? 
              AND (s_rel.sigla = 'PLANTAO' OR s_rel.id = 4 OR s_rel.nome LIKE '%PLANT%')
              AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL)
              AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
            ORDER BY pr.horario_supervisao ASC, p.nome ASC
        `).all(dataAlvo);

        // 6. EVOLUÇÃO DIÁRIA (ÚLTIMOS 14 DIAS HISTÓRICOS)
        // Permite consultar os dias anteriores preservando a integridade original
        const evolucaoDiaria = [];
        for (let i = 13; i >= 0; i--) {
            const dt = getSaoPauloDate(-i);
            const rowFisc = db.prepare(`
                SELECT COUNT(DISTINCT pr.posto_id) as total
                FROM postos_relatorio pr
                JOIN relatorios r ON pr.relatorio_id = r.id
                WHERE r.data_servico = ? 
                  AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL)
                  AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
                  AND pr.posto_id IS NOT NULL
            `).get(dt);
            
            const fiscDia = rowFisc ? rowFisc.total : 0;
            const pendDia = Math.max(0, totalPostosAtivos - fiscDia);
            const cobDia = totalPostosAtivos > 0 ? parseFloat(((fiscDia / totalPostosAtivos) * 100).toFixed(1)) : 0;

            const partes = dt.split('-');
            const labelDia = `${partes[2]}/${partes[1]}`;

            evolucaoDiaria.push({
                data: dt,
                data_formatada: labelDia,
                postos_fiscalizados: fiscDia,
                postos_pendentes: pendDia,
                cobertura_percentual: cobDia
            });
        }

        // 7. RELATÓRIOS DO DIA (VISÃO GERAL OPERACIONAL)
        const relatoriosDoDia = db.prepare(`
            SELECT 
                r.id,
                r.data_servico,
                r.turno,
                r.status,
                s.nome as setor_nome,
                sup.nome as fiscal_nome,
                v.tipo_modelo as viatura_modelo,
                v.placa as viatura_placa,
                COUNT(pr.id) as total_postos_rel,
                SUM(CASE WHEN (pr.supervisionado = 1 OR pr.supervisionado IS NULL) AND pr.status_supervisao != 'NAO_SUPERVISIONADO' THEN 1 ELSE 0 END) as fiscalizados_concluidos
            FROM relatorios r
            JOIN setores s ON r.setor_id = s.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            LEFT JOIN viaturas v ON r.viatura_id = v.id
            LEFT JOIN postos_relatorio pr ON pr.relatorio_id = r.id
            WHERE r.data_servico = ?
            GROUP BY r.id
            ORDER BY r.id ASC
        `).all(dataAlvo);

        res.json({
            success: true,
            data_selecionada: dataAlvo,
            data_atual_brasilia: getSaoPauloDate(0),
            cards: {
                postos_disponiveis: totalPostosAtivos,
                postos_fiscalizados: postosFiscalizados,
                postos_em_preenchimento: postosEmPreenchimento,
                cobertura_percentual: coberturaPercentual,
                postos_pendentes: postosPendentes
            },
            setores: {
                tingua: {
                    nome: 'TINGUÁ',
                    fiscalizados: tinguaFiscalizados,
                    em_preenchimento: tinguaEmPreenchimento,
                    pendentes: tinguaPendentes,
                    oficial: tinguaOficial,
                    percentual: tinguaPercentual,
                    status: tinguaStatus,
                    status_label: tinguaStatusLabel
                },
                guandu: {
                    nome: 'GUANDU',
                    fiscalizados: guanduFiscalizados,
                    em_preenchimento: guanduEmPreenchimento,
                    pendentes: guanduPendentes,
                    oficial: guanduOficial,
                    percentual: guanduPercentual,
                    status: guanduStatus,
                    status_label: guanduStatusLabel
                },
                laranjal: {
                    nome: 'LARANJAL',
                    fiscalizados: laranjalFiscalizados,
                    em_preenchimento: laranjalEmPreenchimento,
                    pendentes: laranjalPendentes,
                    oficial: laranjalOficial,
                    percentual: laranjalPercentual,
                    status: laranjalStatus,
                    status_label: laranjalStatusLabel
                },
                plantao: {
                    nome: 'PLANTÃO (ROTA GERAL)',
                    fiscalizados: plantaoFiscalizados,
                    em_preenchimento: plantaoEmPreenchimento,
                    pendentes: plantaoPendentes,
                    oficial: plantaoEscopo,
                    percentual: plantaoPercentual,
                    status: plantaoStatus,
                    status_label: plantaoStatusLabel,
                    escopo_dinamico: true
                }
            },
            fiscais_em_atividade: fiscaisEmAtividade,
            plantao_detalhado: {
                total_fiscalizado_plantao: plantaoFiscalizados,
                distribuicao_por_setor_posto: plantaoDistribuicao,
                postos_fiscalizados_lista: plantaoPostosDetalhes
            },
            evolucao_diaria: evolucaoDiaria,
            relatorios_do_dia: relatoriosDoDia
        });

    } catch (err) {
        console.error('Erro no /api/v1/diretoria/stats:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
