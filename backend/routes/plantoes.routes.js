const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permissions');

// Listar Relatórios com filtros dinâmicos
router.get('/', authenticateToken, (req, res) => {
    try {
        const { setor_id, supervisor_id, viatura_id, turno, data_inicio, data_fim, status } = req.query;
        const db = getDb();
        
        let sql = `
            SELECT r.*, s.nome as setor_nome, s.sigla as setor_sigla,
                   sup.nome as supervisor_nome, sup.matricula as supervisor_matricula,
                   v.tipo_modelo as viatura_modelo, v.placa as viatura_placa
            FROM relatorios r
            JOIN setores s ON r.setor_id = s.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            LEFT JOIN viaturas v ON r.viatura_id = v.id
            WHERE 1=1
        `;
        const params = [];
        
        if (setor_id) {
            sql += ' AND r.setor_id = ?';
            params.push(setor_id);
        }
        if (supervisor_id) {
            sql += ' AND r.supervisor_id = ?';
            params.push(supervisor_id);
        }
        if (viatura_id) {
            sql += ' AND r.viatura_id = ?';
            params.push(viatura_id);
        }
        if (turno) {
            sql += ' AND r.turno = ?';
            params.push(turno);
        }
        if (status) {
            sql += ' AND r.status = ?';
            params.push(status);
        }
        if (data_inicio && data_fim) {
            sql += ' AND r.data_servico BETWEEN ? AND ?';
            params.push(data_inicio, data_fim);
        } else if (data_inicio) {
            sql += ' AND r.data_servico = ?';
            params.push(data_inicio);
        }
        
        sql += ' ORDER BY r.data_servico DESC, r.id DESC';
        
        const relatorios = db.prepare(sql).all(...params);
        
        const result = relatorios.map(r => {
            const postosCount = db.prepare('SELECT COUNT(*) as total FROM postos_relatorio WHERE relatorio_id = ?').get(r.id).total;
            const ocorrenciasCount = db.prepare('SELECT COUNT(*) as total FROM ocorrencias WHERE relatorio_id = ?').get(r.id).total;
            const pendenciasCount = db.prepare("SELECT COUNT(*) as total FROM postos_relatorio WHERE relatorio_id = ? AND status_supervisao = 'PENDENCIA'").get(r.id).total;
            
            return {
                ...r,
                total_postos: postosCount,
                total_ocorrencias: ocorrenciasCount,
                total_pendencias: pendenciasCount
            };
        });
        
        res.json(result);
    } catch (error) {
        console.error('Erro ao listar relatórios:', error);
        res.status(500).json({ error: error.message });
    }
});

// Detalhes completos de 1 relatório
router.get('/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const relatorio = db.prepare(`
            SELECT r.*, s.nome as setor_nome, s.sigla as setor_sigla,
                   sup.nome as supervisor_nome, sup.matricula as supervisor_matricula, sup.telefone as supervisor_telefone,
                   v.tipo_modelo as viatura_modelo, v.marca as viatura_marca, v.placa as viatura_placa, v.prefixo as viatura_prefixo
            FROM relatorios r
            JOIN setores s ON r.setor_id = s.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            LEFT JOIN viaturas v ON r.viatura_id = v.id
            WHERE r.id = ?
        `).get(req.params.id);
        
        if (!relatorio) return res.status(404).json({ error: 'Relatório não encontrado' });
        
        const postos = db.prepare(`
            SELECT pr.*, COALESCE(pr.nome_posto_digitado, p.nome, 'Posto') as posto_nome, p.endereco as posto_endereco, p.empresa as posto_empresa
            FROM postos_relatorio pr
            LEFT JOIN postos p ON pr.posto_id = p.id
            WHERE pr.relatorio_id = ?
            ORDER BY pr.id ASC
        `).all(relatorio.id);
        
        const ocorrencias = db.prepare(`
            SELECT oc.*, p.nome as posto_nome
            FROM ocorrencias oc
            LEFT JOIN postos p ON oc.posto_id = p.id
            WHERE oc.relatorio_id = ?
            ORDER BY oc.id ASC
        `).all(relatorio.id);
        
        // Gerar Texto de WhatsApp estruturado
        let textoWhatsApp = `*CEDAE — CCO CONTROLE OPERACIONAL*\n`;
        textoWhatsApp += `*RELATÓRIO DO EXPEDIENTE (#${relatorio.id})*\n\n`;
        textoWhatsApp += `📍 *SETOR:* ${relatorio.setor_nome}\n`;
        textoWhatsApp += `👮 *SUPERVISOR:* ${relatorio.supervisor_nome || relatorio.responsavel_nome || 'N/A'}\n`;
        textoWhatsApp += `🚗 *VIATURA:* ${relatorio.viatura_modelo || relatorio.viatura_outros_texto || 'OUTROS'} (${relatorio.viatura_placa || 'N/A'})\n`;
        textoWhatsApp += `📅 *DATA:* ${relatorio.data_servico} | ⏱️ *TURNO:* ${relatorio.turno}\n`;
        textoWhatsApp += `🛣️ *KM RODADOS:* ${relatorio.km_rodado || 0} km (Inicial: ${relatorio.km_inicial} | Final: ${relatorio.km_final})\n\n`;
        
        textoWhatsApp += `📋 *SUPERVISÃO INDIVIDUAL DOS POSTOS (${postos.length}):*\n`;
        postos.forEach((p, index) => {
            if (p.supervisionado === 0 || p.status_supervisao === 'NAO_SUPERVISIONADO') {
                textoWhatsApp += `${index + 1}. *${p.posto_nome}* — 🔴 NÃO SUPERVISIONADO (Motivo: ${p.motivo_nao_supervisao || 'Não informado'})\n`;
            } else {
                const efetivoStr = (p.efetivo_completo === 0) ? `FALTA (${p.falta_efetivo_qtd || '1'})` : `COMPLETO`;
                const ocorrStr = (p.tem_ocorrencia === 1 || p.descricao_ocorrencia) ? `SIM (${p.descricao_ocorrencia})` : `NÃO`;
                const kmStr = (p.km_posto !== null && p.km_posto !== undefined) ? `${p.km_posto} km` : `-`;
                textoWhatsApp += `${index + 1}. *${p.posto_nome}* | ⏱️ ${p.horario_supervisao || '-'} | 🛣️ ${kmStr} | 📊 ${p.status_supervisao || 'NORMAL'} | 👥 ${efetivoStr} | 🚨 Ocorrência: ${ocorrStr}\n`;
            }
        });
        
        if (ocorrencias.length > 0) {
            textoWhatsApp += `\n🚨 *OCORRÊNCIAS / PROVIDÊNCIAS:*\n`;
            ocorrencias.forEach(oc => {
                textoWhatsApp += `• [${oc.posto_nome || 'Geral'}] ${oc.descricao} (Providência: ${oc.providencias_adotadas || 'Adotada'})\n`;
            });
        }
        
        if (relatorio.observacoes_gerais) {
            textoWhatsApp += `\n📝 *OBSERVAÇÕES:*\n${relatorio.observacoes_gerais}\n`;
        }
        
        textoWhatsApp += `\n*RESPONSÁVEL:* ${relatorio.responsavel_nome || relatorio.supervisor_nome || 'Supervisor'}\n`;
        textoWhatsApp += `*STATUS:* CONSOLIDADO NO CCO CEDAE`;

        res.json({
            ...relatorio,
            postos,
            ocorrencias,
            texto_whatsapp: textoWhatsApp
        });
    } catch (error) {
        console.error('Erro ao buscar relatório:', error);
        res.status(500).json({ error: error.message });
    }
});

// Excluir Relatório (Acesso restrito ao CCO / Administrador / Diretoria)
// Libera imediatamente o fiscal para iniciar um novo expediente
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id || isNaN(id)) {
            return res.status(400).json({ success: false, message: 'ID de relatório inválido' });
        }

        // Proteção Absoluta: Somente administradores ou supervisores autenticados podem excluir
        if (req.user && req.user.perfil === 'consulta') {
            return res.status(403).json({ 
                success: false, 
                message: 'Acesso negado: Perfil de consulta (somente leitura) não possui permissão para excluir relatórios.' 
            });
        }

        const db = getDb();

        // 1. Verificar se o relatório existe e coletar metadados completos
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

        // 2. Exclusão atômica em cascata no SQLite
        const runDeleteTransaction = db.transaction(() => {
            // Auditoria
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
            } catch (eAud) {
                console.warn('Erro ao registrar log de auditoria na exclusão:', eAud.message);
            }

            // Exclusão dos registros filhos e do relatório
            db.prepare('DELETE FROM ocorrencias WHERE relatorio_id = ?').run(id);
            db.prepare('DELETE FROM postos_relatorio WHERE relatorio_id = ?').run(id);
            db.prepare('DELETE FROM relatorios WHERE id = ?').run(id);
        });

        runDeleteTransaction();

        // 3. Exclusão em segundo plano na nuvem (Supabase)
        try {
            const { deleteRelatorioFromSupabase } = require('../services/supabase_sync.service');
            deleteRelatorioFromSupabase(id).catch(err => {
                console.warn(`[SUPABASE] Aviso na exclusão do relatório #${id}:`, err.message);
            });
        } catch (_) {}

        // 4. Emissão do evento de atualização em tempo real para os painéis
        try {
            const { emitirEventoOperacional } = require('../services/realtime.service');
            emitirEventoOperacional('EXCLUIDO', {
                relatorio_id: id,
                setor: relatorio.setor_nome,
                timestamp: new Date().toISOString()
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
