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

        // 2. POSTOS FISCALIZADOS NA DATA SELECIONADA
        // Considera postos com fiscalização concluída e supervisionada na data
        const rowFiscalizados = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            WHERE r.data_servico = ? 
              AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL)
              AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
              AND pr.posto_id IS NOT NULL
        `).get(dataAlvo);
        const postosFiscalizados = rowFiscalizados ? rowFiscalizados.total : 0;

        // 3. COBERTURA E PENDÊNCIAS
        const coberturaPercentual = totalPostosAtivos > 0 
            ? parseFloat(((postosFiscalizados / totalPostosAtivos) * 100).toFixed(1)) 
            : 0;
        const postosPendentes = Math.max(0, totalPostosAtivos - postosFiscalizados);

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
        `).get(dataAlvo);
        const tinguaFiscalizados = tDesc ? tDesc.total : 0;
        const tinguaOficial = 12;
        const tinguaPercentual = parseFloat(((tinguaFiscalizados / tinguaOficial) * 100).toFixed(1));

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
        `).get(dataAlvo);
        const guanduFiscalizados = gDesc ? gDesc.total : 0;
        const guanduOficial = 19;
        const guanduPercentual = parseFloat(((guanduFiscalizados / guanduOficial) * 100).toFixed(1));

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
        `).get(dataAlvo);
        const laranjalFiscalizados = lDesc ? lDesc.total : 0;
        const laranjalOficial = 6;
        const laranjalPercentual = parseFloat(((laranjalFiscalizados / laranjalOficial) * 100).toFixed(1));

        // 4.4 PLANTÃO (Rota Geral - Escopo Dinâmico = Todos os postos ativos)
        // Fiscalizações onde a equipe do Plantão (r.setor_id = 4 ou sigla PLANTAO) realizou a supervisão
        const pDesc = db.prepare(`
            SELECT COUNT(DISTINCT pr.posto_id) as total
            FROM postos_relatorio pr
            JOIN relatorios r ON pr.relatorio_id = r.id
            JOIN setores s ON r.setor_id = s.id
            WHERE r.data_servico = ? 
              AND (s.sigla = 'PLANTAO' OR s.id = 4 OR s.nome LIKE '%PLANT%')
              AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL)
              AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
        `).get(dataAlvo);
        const plantaoFiscalizados = pDesc ? pDesc.total : 0;
        const plantaoEscopo = totalPostosAtivos;
        const plantaoPercentual = plantaoEscopo > 0 
            ? parseFloat(((plantaoFiscalizados / plantaoEscopo) * 100).toFixed(1)) 
            : 0;

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
                cobertura_percentual: coberturaPercentual,
                postos_pendentes: postosPendentes
            },
            setores: {
                tingua: {
                    nome: 'TINGUÁ',
                    fiscalizados: tinguaFiscalizados,
                    oficial: tinguaOficial,
                    percentual: tinguaPercentual
                },
                guandu: {
                    nome: 'GUANDU',
                    fiscalizados: guanduFiscalizados,
                    oficial: guanduOficial,
                    percentual: guanduPercentual
                },
                laranjal: {
                    nome: 'LARANJAL',
                    fiscalizados: laranjalFiscalizados,
                    oficial: laranjalOficial,
                    percentual: laranjalPercentual
                },
                plantao: {
                    nome: 'PLANTÃO (ROTA GERAL)',
                    fiscalizados: plantaoFiscalizados,
                    oficial: plantaoEscopo,
                    percentual: plantaoPercentual,
                    escopo_dinamico: true
                }
            },
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
