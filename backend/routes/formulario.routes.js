const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const emailService = require('../services/email.service');
const { getBrasiliaDateTime, formatDisplayDate, formatDisplayDateTime, formatDisplayTime } = require('../utils/date.utils');

// 0. LISTAR SETORES ATIVOS (Público para o Formulário do Fiscal)
router.get('/setores', (req, res) => {
    try {
        const db = getDb();
        const setores = db.prepare("SELECT id, nome, sigla FROM setores WHERE status = 'ativo' ORDER BY (CASE WHEN nome LIKE '%PLANT%' THEN 1 ELSE 0 END), nome ASC").all();
        res.json(setores);
    } catch (error) {
        console.error('Erro ao listar setores no formulário:', error);
        res.status(500).json({ error: error.message });
    }
});

// 1. CARREGAR ESTRUTURA EM CASCATA POR SETOR
router.get('/setor/:id', (req, res) => {
    try {
        const db = getDb();
        const setor = db.prepare("SELECT * FROM setores WHERE id = ? AND status = 'ativo'").get(req.params.id);
        if (!setor) return res.status(404).json({ error: 'Setor não encontrado ou inativo' });
        
        const isPlantao = setor.nome.toUpperCase().includes('PLANT') || setor.sigla === 'PLANTAO';
        
        const supervisores = db.prepare(
            "SELECT id, nome, matricula, telefone, funcao FROM supervisores WHERE setor_id = ? AND status = 'ativo' ORDER BY nome ASC"
        ).all(setor.id);
        
        const viaturas = db.prepare(
            "SELECT id, tipo_modelo, marca, placa, prefixo, is_outros FROM viaturas WHERE setor_id = ? AND status = 'ativo' ORDER BY tipo_modelo ASC"
        ).all(setor.id);

        let postos = [];
        if (isPlantao) {
            postos = db.prepare(`
                SELECT p.id, p.nome, p.endereco, p.localidade, p.empresa, p.regiao, p.tipo_posto, p.status
                FROM postos p
                WHERE p.status = 'ativo'
                ORDER BY p.id ASC
            `).all();
        } else {
            postos = db.prepare(`
                SELECT p.id, p.nome, p.endereco, p.localidade, p.empresa, p.regiao, p.tipo_posto, p.status
                FROM postos p
                WHERE p.status = 'ativo'
                  AND p.id IN (SELECT posto_id FROM posto_setor_supervisao WHERE setor_id = ? AND ativo = 1)
                ORDER BY p.id ASC
            `).all(setor.id);
        }
        
        res.json({
            setor,
            isPlantao,
            supervisores,
            viaturas,
            postos
        });
    } catch (error) {
        console.error('Erro ao carregar estrutura do setor:', error);
        res.status(500).json({ error: error.message });
    }
});

// 1.05. CONSULTAR COTA DIÁRIA DO FISCAL (Regra do Prompt Mestre: Máximo de 2 relatórios por dia)
router.get('/quota', (req, res) => {
    try {
        const db = getDb();
        const { supervisor_id, responsavel_nome, data_servico } = req.query;
        const spNow = getBrasiliaDateTime();
        const dataAlvo = data_servico || spNow.isoDate;
        
        let count = 0;
        if (supervisor_id) {
            const sId = parseInt(supervisor_id);
            const row = db.prepare(`
                SELECT COUNT(*) as total 
                FROM relatorios 
                WHERE (supervisor_id = ? OR responsavel_nome = (SELECT nome FROM supervisores WHERE id = ?))
                  AND data_servico = ? 
                  AND status = 'concluido'
            `).get(sId, sId, dataAlvo);
            count = row ? row.total : 0;
        } else if (responsavel_nome) {
            const rNome = responsavel_nome.trim();
            const row = db.prepare(`
                SELECT COUNT(*) as total 
                FROM relatorios 
                WHERE (responsavel_nome = ? OR supervisor_id IN (SELECT id FROM supervisores WHERE nome = ?))
                  AND data_servico = ? 
                  AND status = 'concluido'
            `).get(rNome, rNome, dataAlvo);
            count = row ? row.total : 0;
        }
        
        const limite = 2;
        const disponiveis = Math.max(0, limite - count);
        const bloqueado = false; // Desbloqueado: fiscais podem registrar novos expedientes/plantões livremente
        
        res.json({
            relatorios_hoje: count,
            limite,
            disponiveis,
            bloqueado: false,
            label: count > 0 ? `Envio ${count + 1}` : '0/2',
            data_servico: dataAlvo
        });
    } catch (error) {
        console.error('Erro ao consultar quota de relatórios:', error);
        res.status(500).json({ error: error.message });
    }
});

// 1.1. CONSULTAR RELATÓRIO EM ANDAMENTO (PARA CONTINUAÇÃO AUTOMÁTICA)
router.get('/em-andamento', (req, res) => {
    try {
        const db = getDb();
        const { setor_id, supervisor_id, data_servico, turno, relatorio_id } = req.query;

        let relatorio = null;
        if (relatorio_id) {
            relatorio = db.prepare("SELECT * FROM relatorios WHERE id = ? AND status = 'em_aberto'").get(parseInt(relatorio_id));
        }

        if (!relatorio) {
            if (!setor_id) return res.status(400).json({ error: 'setor_id é obrigatório' });

            let sql = "SELECT * FROM relatorios WHERE setor_id = ? AND status = 'em_aberto'";
            const params = [parseInt(setor_id)];

            if (data_servico) {
                sql += " AND data_servico = ?";
                params.push(data_servico);
            }
            if (turno) {
                sql += " AND turno = ?";
                params.push(turno);
            }

            sql += " ORDER BY id DESC LIMIT 1";
            relatorio = db.prepare(sql).get(...params);
        }

        if (!relatorio) {
            return res.json({ tem_relatorio: false });
        }

        const postos = db.prepare(`
            SELECT pr.*, COALESCE(pr.nome_posto_digitado, p.nome, 'Posto') as posto_nome
            FROM postos_relatorio pr
            LEFT JOIN postos p ON pr.posto_id = p.id
            WHERE pr.relatorio_id = ?
            ORDER BY pr.id ASC
        `).all(relatorio.id);

        const ocorrencias = db.prepare(`
            SELECT * FROM ocorrencias WHERE relatorio_id = ? ORDER BY id ASC
        `).all(relatorio.id);

        res.json({
            tem_relatorio: true,
            relatorio,
            postos,
            ocorrencias
        });
    } catch (error) {
        console.error('Erro ao buscar relatório em andamento:', error);
        res.status(500).json({ error: error.message });
    }
});

// FUNÇÃO AUXILIAR: PROCESSAR E VALIDAR POSTOS
function processarPostosDoPayload(db, postos_supervisionados, setor_id, ehFinal = false) {
    const postosValidos = (postos_supervisionados || []).filter(p => {
        const temIdentificacao = (p.posto_id) || (p.posto_nome && String(p.posto_nome).trim());
        return temIdentificacao && (p.horario_supervisao || p.km_posto !== undefined || p.supervisionado !== undefined || p.status_supervisao);
    });

    if (ehFinal && postosValidos.length === 0) {
        throw new Error('Ao menos um posto preenchido deve constar no relatório final.');
    }

    for (const p of postosValidos) {
        let pId = p.posto_id ? parseInt(p.posto_id) : null;
        let dbPosto = null;
        if (pId) {
            dbPosto = db.prepare("SELECT * FROM postos WHERE id = ? AND status = 'ativo'").get(pId);
        } else if (p.posto_nome) {
            dbPosto = db.prepare("SELECT * FROM postos WHERE UPPER(TRIM(nome)) = UPPER(TRIM(?)) AND status = 'ativo'").get(p.posto_nome.trim());
        }

        if (!dbPosto) {
            if (p.posto_nome || p.nome) {
                dbPosto = {
                    id: null,
                    nome: (p.posto_nome || p.nome || 'Posto Informado').trim(),
                    endereco: p.endereco || 'Informado pelo Fiscal',
                    localidade: p.localidade || 'Rio de Janeiro',
                    empresa: p.empresa || 'CEDAE',
                    setor_id: parseInt(setor_id) || 4
                };
            } else {
                throw new Error(`Posto ${p.posto_nome || p.posto_id} não identificado.`);
            }
        }

        p._dbPosto = dbPosto;
    }

    return postosValidos;
}

// 1.5 INICIAR FISCALIZAÇÃO EM TEMPO REAL
// Registra o início do expediente pelo fiscal (status = 'em_aberto', status_operacional = 'EM PROGRESSO')
router.post('/iniciar', async (req, res) => {
    try {
        const db = getDb();
        const {
            setor_id,
            supervisor_id,
            viatura_id,
            data_servico,
            turno,
            responsavel_nome,
            km_inicial,
            client_uuid
        } = req.body;

        if (!setor_id || !data_servico || !turno) {
            return res.status(400).json({ 
                success: false, 
                error: 'Setor, Data do Serviço e Turno são obrigatórios para iniciar a fiscalização.' 
            });
        }

        const spNow = getBrasiliaDateTime();
        const horaInicio = spNow.horaCurta; // HH:MM

        // Verificar se já existe um relatório em aberto para este fiscal/setor/data/turno
        let relExistente = null;
        if (client_uuid) {
            relExistente = db.prepare("SELECT * FROM relatorios WHERE client_uuid = ?").get(client_uuid);
        }
        if (!relExistente) {
            relExistente = db.prepare(`
                SELECT * FROM relatorios 
                WHERE setor_id = ? AND data_servico = ? AND turno = ? AND status = 'em_aberto'
                ORDER BY id DESC LIMIT 1
            `).get(setor_id, data_servico, turno);
        }

        let relId;
        if (relExistente) {
            relId = relExistente.id;
            db.prepare(`
                UPDATE relatorios 
                SET responsavel_nome = COALESCE(?, responsavel_nome),
                    viatura_id = COALESCE(?, viatura_id),
                    km_inicial = COALESCE(?, km_inicial)
                WHERE id = ?
            `).run(responsavel_nome || null, viatura_id || null, parseFloat(km_inicial) || null, relId);
        } else {
            const insRes = db.prepare(`
                INSERT INTO relatorios (
                    setor_id, supervisor_id, viatura_id, data_servico, turno,
                    km_inicial, responsavel_nome, status, client_uuid, created_at,
                    observacoes_gerais
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'em_aberto', ?, ?, ?)
            `).run(
                setor_id,
                supervisor_id || null,
                viatura_id || null,
                data_servico,
                turno,
                parseFloat(km_inicial) || 0,
                responsavel_nome || 'Fiscal Operacional',
                client_uuid || `rel_iniciado_${Date.now()}`,
                spNow.dataHora,
                `Fiscalização iniciada às ${horaInicio}.`
            );
            relId = Number(insRes.lastInsertRowid);
        }

        const setorObj = db.prepare("SELECT nome, sigla FROM setores WHERE id = ?").get(setor_id);
        const setorNome = setorObj ? setorObj.nome : 'SETOR OPERACIONAL';

        // Sincronizar criação para o Supabase em background
        try {
            const { pushRelatorioToSupabase } = require('../services/supabase_sync.service');
            pushRelatorioToSupabase(relId).catch(() => {});
        } catch (_) {}

        // Registrar auditoria
        try {
            db.prepare(`
                INSERT INTO auditoria_log (tabela, registro_id, acao, detalhes, usuario_nome, ip_origem)
                VALUES ('relatorios', ?, 'INICIAR_FISCALIZACAO', ?, ?, ?)
            `).run(
                relId,
                JSON.stringify({ setor: setorNome, turno, hora_inicio: horaInicio }),
                responsavel_nome || 'Fiscal',
                req.ip || '127.0.0.1'
            );
        } catch (_) {}

        // Transmitir evento SSE para Painel de Controle e Painel da Diretoria
        try {
            const { emitirEventoOperacional } = require('../services/realtime.service');
            emitirEventoOperacional('EM_PROGRESSO', {
                relatorio_id: relId,
                setor_id: parseInt(setor_id),
                setor_nome: setorNome,
                data_servico,
                turno,
                fiscal_nome: responsavel_nome || 'Fiscal Operacional',
                hora_inicio: horaInicio,
                status: 'EM_PROGRESSO',
                postos_preenchidos: 0,
                timestamp: spNow.dataHora
            });
        } catch (_) {}

        res.json({
            success: true,
            relatorio_id: relId,
            id: relId,
            status: 'em_aberto',
            status_operacional: 'EM PROGRESSO',
            hora_inicio: horaInicio,
            data_servico,
            setor_nome: setorNome,
            message: `✓ Fiscalização iniciada às ${horaInicio}. Status: 🟢 EM PROGRESSO no CCO.`
        });

    } catch (err) {
        console.error('Erro ao iniciar fiscalização:', err);
        res.status(500).json({ success: false, error: 'Erro ao iniciar fiscalização: ' + err.message });
    }
});

// 2. SALVAMENTO PARCIAL E PROGRESSIVO DO PROGRESSO (SALVAR)
// Grava postos preenchidos sem finalizar o expediente (Status: 🟡 em_aberto)
router.post('/salvar', async (req, res) => {
    try {
        const db = getDb();
        const {
            relatorio_id: reqRelatorioId,
            client_uuid,
            setor_id,
            supervisor_id,
            viatura_id,
            viatura_outros_texto,
            data_servico,
            turno,
            km_inicial,
            km_final,
            observacoes_gerais,
            providencias_gerais,
            pendencias_gerais,
            responsavel_nome,
            postos_supervisionados: postos_supervisionados_raw,
            ocorrencias
        } = req.body;

        if (!setor_id || !data_servico || !turno) {
            return res.status(400).json({ error: 'Setor, Data do Serviço e Turno são obrigatórios para salvar o progresso.' });
        }

        const postosValidos = processarPostosDoPayload(db, postos_supervisionados_raw || req.body.postos || [], setor_id, false);

        const kmIni = parseFloat(km_inicial) || 0;
        const kmFim = parseFloat(km_final) || 0;
        const km_rodado = (kmFim >= kmIni && kmFim > 0) ? (kmFim - kmIni) : 0;
        const spNow = getBrasiliaDateTime();

        // 1. Procurar relatório em andamento existente (ou pelo ID informado)
        let relatorioExistente = null;
        if (reqRelatorioId) {
            relatorioExistente = db.prepare("SELECT * FROM relatorios WHERE id = ?").get(reqRelatorioId);
        } else if (client_uuid) {
            relatorioExistente = db.prepare("SELECT * FROM relatorios WHERE client_uuid = ?").get(client_uuid);
        }

        if (!relatorioExistente) {
            // Buscar por setor + data + turno com status 'em_aberto'
            let buscaSql = "SELECT * FROM relatorios WHERE setor_id = ? AND data_servico = ? AND turno = ? AND status = 'em_aberto'";
            const buscaParams = [setor_id, data_servico, turno];
            if (supervisor_id) {
                buscaSql += " AND (supervisor_id = ? OR supervisor_id IS NULL)";
                buscaParams.push(supervisor_id);
            }
            buscaSql += " ORDER BY id DESC LIMIT 1";
            relatorioExistente = db.prepare(buscaSql).get(...buscaParams);
        }

        // Se o relatório encontrado já estiver 'concluido', preserva o concluído intacto e cria um novo rascunho em aberto
        if (relatorioExistente && relatorioExistente.status === 'concluido') {
            relatorioExistente = null;
        }

        const runTransaction = db.transaction(() => {
            let activeRelId;

            if (relatorioExistente) {
                activeRelId = relatorioExistente.id;
                db.prepare(`
                    UPDATE relatorios SET
                        supervisor_id = COALESCE(?, supervisor_id),
                        viatura_id = ?,
                        viatura_outros_texto = ?,
                        km_inicial = ?,
                        km_final = ?,
                        km_rodado = ?,
                        responsavel_nome = COALESCE(?, responsavel_nome),
                        observacoes_gerais = ?,
                        providencias_gerais = ?,
                        pendencias_gerais = ?
                    WHERE id = ?
                `).run(
                    supervisor_id || null,
                    (viatura_id && viatura_id !== 'OUTROS' && viatura_id !== 'null') ? viatura_id : null,
                    viatura_outros_texto || null,
                    kmIni,
                    kmFim,
                    km_rodado,
                    responsavel_nome || null,
                    observacoes_gerais || '',
                    providencias_gerais || '',
                    pendencias_gerais || '',
                    activeRelId
                );
            } else {
                const insertRes = db.prepare(`
                    INSERT INTO relatorios (
                        setor_id, supervisor_id, viatura_id, viatura_outros_texto,
                        data_servico, turno, km_inicial, km_final, km_rodado,
                        responsavel_nome, observacoes_gerais, providencias_gerais, pendencias_gerais,
                        status, client_uuid, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'em_aberto', ?, ?)
                `).run(
                    setor_id,
                    supervisor_id || null,
                    (viatura_id && viatura_id !== 'OUTROS' && viatura_id !== 'null') ? viatura_id : null,
                    viatura_outros_texto || null,
                    data_servico,
                    turno,
                    kmIni,
                    kmFim,
                    km_rodado,
                    responsavel_nome || null,
                    observacoes_gerais || '',
                    providencias_gerais || '',
                    pendencias_gerais || '',
                    client_uuid || `rel_temp_${Date.now()}`,
                    spNow.dataHora
                );
                activeRelId = Number(insertRes.lastInsertRowid);
            }

            // Gravar postos (deletar e re-inserir para garantir sincronização progressiva exata)
            db.prepare('DELETE FROM postos_relatorio WHERE relatorio_id = ?').run(activeRelId);
            const stmtPosto = db.prepare(`
                INSERT INTO postos_relatorio (
                    relatorio_id, posto_id, nome_posto_digitado, horario_supervisao, situacao_encontrada,
                    efetivo_presente, status_supervisao, supervisionado, motivo_nao_supervisao,
                    km_posto, efetivo_completo, falta_efetivo_qtd, tem_ocorrencia, descricao_ocorrencia, observacao,
                    endereco, localidade, empresa, setor_id_posto, setor_nome_posto
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const p of postosValidos) {
                const dbPosto = p._dbPosto;
                const isSup = (p.supervisionado === false || p.supervisionado === 0 || p.status_supervisao === 'NAO_SUPERVISIONADO') ? 0 : 1;
                const statusSupervisaoFinal = isSup === 0 ? 'NAO_SUPERVISIONADO' : (p.status_supervisao || 'NORMAL');
                const efetivoComp = (p.efetivo_completo === false || p.efetivo_completo === 0 || p.efetivo_completo === 'NAO') ? 0 : 1;
                const temOcorr = (p.tem_ocorrencia === true || p.tem_ocorrencia === 1 || p.tem_ocorrencia === 'SIM' || isSup === 0 || statusSupervisaoFinal === 'COM_OCORRENCIA') ? 1 : 0;
                const descOcorr = isSup === 0 
                    ? (p.motivo_nao_supervisao || p.descricao_ocorrencia || 'Posto não fiscalizado')
                    : (p.descricao_ocorrencia || p.observacao || '');
                const kmNum = (p.km_posto !== undefined && p.km_posto !== null && p.km_posto !== '') ? parseFloat(p.km_posto) : null;

                const sPostoId = dbPosto.setor_id || 4;
                let sPostoNome = 'PLANTÃO';
                if (sPostoId === 1) sPostoNome = 'TINGUÁ';
                else if (sPostoId === 2) sPostoNome = 'GUANDU';
                else if (sPostoId === 3) sPostoNome = 'LARANJAL';

                stmtPosto.run(
                    activeRelId,
                    dbPosto.id,
                    dbPosto.nome,
                    p.horario_supervisao || '',
                    p.situacao_encontrada || '',
                    p.efetivo_presente !== undefined ? p.efetivo_presente : (efetivoComp ? 1 : 0),
                    statusSupervisaoFinal,
                    isSup,
                    isSup === 0 ? (p.motivo_nao_supervisao || '') : null,
                    kmNum,
                    efetivoComp,
                    efetivoComp === 0 ? (p.falta_efetivo_qtd || '') : null,
                    temOcorr,
                    temOcorr === 1 ? descOcorr : null,
                    p.observacao || '',
                    dbPosto.endereco || null,
                    dbPosto.localidade || null,
                    dbPosto.empresa || null,
                    sPostoId,
                    sPostoNome
                );
            }

            // Ocorrências: limpar e reinserir tanto as do array quanto as automáticas de postos
            db.prepare('DELETE FROM ocorrencias WHERE relatorio_id = ?').run(activeRelId);
            const stmtOc = db.prepare(`
                INSERT INTO ocorrencias (relatorio_id, posto_id, tipo_ocorrencia, descricao, providencias_adotadas, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            // 1. Ocorrências originadas diretamente dos postos (não supervisionados ou reportados com ocorrência)
            for (const p of postosValidos) {
                const dbPosto = p._dbPosto;
                const isSup = (p.supervisionado === false || p.supervisionado === 0 || p.status_supervisao === 'NAO_SUPERVISIONADO') ? 0 : 1;
                const temOcorr = (p.tem_ocorrencia === true || p.tem_ocorrencia === 1 || p.tem_ocorrencia === 'SIM' || isSup === 0 || p.status_supervisao === 'COM_OCORRENCIA') ? 1 : 0;
                
                if (isSup === 0) {
                    stmtOc.run(
                        activeRelId,
                        dbPosto.id,
                        'Posto Não Fiscalizado',
                        p.motivo_nao_supervisao || 'Posto não fiscalizado no expediente.',
                        'Reagendar fiscalização para o próximo turno.',
                        'pendente'
                    );
                } else if (temOcorr === 1 && (p.descricao_ocorrencia || p.observacao)) {
                    stmtOc.run(
                        activeRelId,
                        dbPosto.id,
                        'COM_OCORRENCIA',
                        p.descricao_ocorrencia || p.observacao,
                        'Informado no posto pelo fiscal',
                        'resolvido'
                    );
                }
            }

            // 2. Ocorrências gerais adicionais
            if (ocorrencias && Array.isArray(ocorrencias) && ocorrencias.length > 0) {
                for (const oc of ocorrencias) {
                    stmtOc.run(
                        activeRelId,
                        oc.posto_id || null,
                        oc.tipo_ocorrencia || 'Geral',
                        oc.descricao || '',
                        oc.providencias_adotadas || '',
                        oc.status || 'resolvido'
                    );
                }
            }

            // Registrar Auditoria
            try {
                db.prepare(`
                    INSERT INTO auditoria_log (tabela, registro_id, acao, dados_novos, ip)
                    VALUES ('relatorios', ?, 'SALVAMENTO_PARCIAL', ?, ?)
                `).run(
                    activeRelId,
                    JSON.stringify({ postos_salvos: postosValidos.length, hora: spNow.horaCurta }),
                    req.ip || '127.0.0.1'
                );
            } catch(eAud) {}

            return activeRelId;
        });

        const activeRelId = runTransaction();

        // Sincronização em nuvem com Supabase (background)
        try {
            const { pushRelatorioToSupabase } = require('../services/supabase_sync.service');
            pushRelatorioToSupabase(activeRelId).catch(e => console.warn('Supabase push warning:', e.message));
        } catch (_) {}

        // Emissão do evento de atualização em tempo real para Painel de Controle e Diretoria
        try {
            const { emitirEventoOperacional } = require('../services/realtime.service');
            emitirEventoOperacional('EM_PREENCHIMENTO', {
                relatorio_id: activeRelId,
                setor_id: parseInt(setor_id),
                data_servico,
                turno,
                fiscal_nome: responsavel_nome,
                postos_preenchidos: postosValidos.length,
                timestamp: spNow.dataHora
            });
        } catch (_) {}

        res.json({
            success: true,
            id: activeRelId,
            relatorio_id: activeRelId,
            numero_relatorio: String(activeRelId).padStart(5, '0'),
            status: 'em_aberto',
            status_label: '🟡 EM PREENCHIMENTO',
            postos_salvos: postosValidos.length,
            horario_salvo: spNow.horaCurta,
            timestamp_salvo: spNow.dataHora,
            message: `✓ Progresso salvo no CCO (${postosValidos.length} postos gravados). Relatório mantido em preenchimento.`
        });

    } catch (error) {
        console.error('Erro ao salvar progresso do relatório:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. ENVIAR RELATÓRIO CONSOLIDADO DO EXPEDIENTE (ENVIO FINAL: 🟢 concluido)
router.post('/enviar', async (req, res) => {
    try {
        const db = getDb();
        const {
            relatorio_id: reqRelatorioId,
            client_uuid,
            setor_id,
            supervisor_id,
            viatura_id,
            viatura_outros_texto,
            data_servico,
            turno,
            km_inicial,
            km_final,
            observacoes_gerais,
            providencias_gerais,
            pendencias_gerais,
            responsavel_nome,
            postos_supervisionados: postos_supervisionados_raw,
            ocorrencias
        } = req.body;

        if (!setor_id || !data_servico || !turno) {
            return res.status(400).json({ error: 'Setor, Data do Serviço e Turno são obrigatórios' });
        }

        if (!supervisor_id && !responsavel_nome) {
            return res.status(400).json({ error: 'Identificação do Fiscal ou Responsável é obrigatória' });
        }

        const postosValidos = processarPostosDoPayload(db, postos_supervisionados_raw || req.body.postos || [], setor_id, true);

        const kmIni = parseFloat(km_inicial) || 0;
        const kmFim = parseFloat(km_final) || 0;
        const km_rodado = (kmFim >= kmIni && kmFim > 0) ? (kmFim - kmIni) : 0;
        const spNow = getBrasiliaDateTime();

        // Verificar limite de 2 relatórios por fiscal por dia (Prompt Mestre - Regra 4)
        const activeIdNum = reqRelatorioId ? parseInt(reqRelatorioId) : null;
        let countConcluidosHoje = 0;
        if (supervisor_id) {
            const sId = parseInt(supervisor_id);
            const rowCount = db.prepare(`
                SELECT COUNT(*) as total 
                FROM relatorios 
                WHERE (supervisor_id = ? OR responsavel_nome = (SELECT nome FROM supervisores WHERE id = ?))
                  AND data_servico = ? 
                  AND status = 'concluido'
                  AND (? IS NULL OR id != ?)
            `).get(sId, sId, data_servico, activeIdNum, activeIdNum);
            countConcluidosHoje = rowCount ? rowCount.total : 0;
        } else if (responsavel_nome) {
            const rNome = responsavel_nome.trim();
            const rowCount = db.prepare(`
                SELECT COUNT(*) as total 
                FROM relatorios 
                WHERE (responsavel_nome = ? OR supervisor_id IN (SELECT id FROM supervisores WHERE nome = ?))
                  AND data_servico = ? 
                  AND status = 'concluido'
                  AND (? IS NULL OR id != ?)
            `).get(rNome, rNome, data_servico, activeIdNum, activeIdNum);
            countConcluidosHoje = rowCount ? rowCount.total : 0;
        }

        // Removido bloqueio por limite diário: fiscais podem registrar novos expedientes/plantões livremente

        // Buscar se existe relatório em aberto para atualizar para concluído
        let activeRelId = activeIdNum;
        if (!activeRelId) {
            let buscaAbertoSql = "SELECT id FROM relatorios WHERE setor_id = ? AND data_servico = ? AND turno = ? AND status = 'em_aberto'";
            const buscaAbertoParams = [setor_id, data_servico, turno];
            if (supervisor_id) {
                buscaAbertoSql += " AND (supervisor_id = ? OR supervisor_id IS NULL)";
                buscaAbertoParams.push(supervisor_id);
            }
            buscaAbertoSql += " ORDER BY id DESC LIMIT 1";
            const relEmAberto = db.prepare(buscaAbertoSql).get(...buscaAbertoParams);
            if (relEmAberto) activeRelId = relEmAberto.id;
        }

        const runTransaction = db.transaction(() => {
            if (activeRelId) {
                db.prepare(`
                    UPDATE relatorios SET
                        supervisor_id = COALESCE(?, supervisor_id),
                        viatura_id = ?,
                        viatura_outros_texto = ?,
                        km_inicial = ?,
                        km_final = ?,
                        km_rodado = ?,
                        responsavel_nome = COALESCE(?, responsavel_nome),
                        observacoes_gerais = ?,
                        providencias_gerais = ?,
                        pendencias_gerais = ?,
                        status = 'concluido'
                    WHERE id = ?
                `).run(
                    supervisor_id || null,
                    (viatura_id && viatura_id !== 'OUTROS' && viatura_id !== 'null') ? viatura_id : null,
                    viatura_outros_texto || null,
                    kmIni,
                    kmFim,
                    km_rodado,
                    responsavel_nome || null,
                    observacoes_gerais || '',
                    providencias_gerais || '',
                    pendencias_gerais || '',
                    activeRelId
                );
            } else {
                const insertRes = db.prepare(`
                    INSERT INTO relatorios (
                        setor_id, supervisor_id, viatura_id, viatura_outros_texto,
                        data_servico, turno, km_inicial, km_final, km_rodado,
                        responsavel_nome, observacoes_gerais, providencias_gerais, pendencias_gerais,
                        status, client_uuid, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'concluido', ?, ?)
                `).run(
                    setor_id,
                    supervisor_id || null,
                    (viatura_id && viatura_id !== 'OUTROS' && viatura_id !== 'null') ? viatura_id : null,
                    viatura_outros_texto || null,
                    data_servico,
                    turno,
                    kmIni,
                    kmFim,
                    km_rodado,
                    responsavel_nome || null,
                    observacoes_gerais || '',
                    providencias_gerais || '',
                    pendencias_gerais || '',
                    client_uuid || `rel_${Date.now()}`,
                    spNow.dataHora
                );
                activeRelId = Number(insertRes.lastInsertRowid);
            }

            // Postos
            db.prepare('DELETE FROM postos_relatorio WHERE relatorio_id = ?').run(activeRelId);
            const stmtPosto = db.prepare(`
                INSERT INTO postos_relatorio (
                    relatorio_id, posto_id, nome_posto_digitado, horario_supervisao, situacao_encontrada,
                    efetivo_presente, status_supervisao, supervisionado, motivo_nao_supervisao,
                    km_posto, efetivo_completo, falta_efetivo_qtd, tem_ocorrencia, descricao_ocorrencia, observacao,
                    endereco, localidade, empresa, setor_id_posto, setor_nome_posto
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const stmtOcorrencia = db.prepare(`
                INSERT INTO ocorrencias (
                    relatorio_id, posto_id, tipo_ocorrencia, descricao, providencias_adotadas, status
                ) VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const p of postosValidos) {
                const dbPosto = p._dbPosto;
                const isSup = (p.supervisionado === false || p.supervisionado === 0 || p.status_supervisao === 'NAO_SUPERVISIONADO') ? 0 : 1;
                const statusSupervisaoFinal = isSup === 0 ? 'NAO_SUPERVISIONADO' : (p.status_supervisao || 'NORMAL');
                const efetivoComp = (p.efetivo_completo === false || p.efetivo_completo === 0 || p.efetivo_completo === 'NAO') ? 0 : 1;
                const temOcorr = (p.tem_ocorrencia === true || p.tem_ocorrencia === 1 || p.tem_ocorrencia === 'SIM' || isSup === 0 || statusSupervisaoFinal === 'COM_OCORRENCIA') ? 1 : 0;
                const descOcorr = isSup === 0 
                    ? (p.motivo_nao_supervisao || p.descricao_ocorrencia || 'Posto não fiscalizado')
                    : (p.descricao_ocorrencia || p.observacao || '');
                const kmNum = (p.km_posto !== undefined && p.km_posto !== null && p.km_posto !== '') ? parseFloat(p.km_posto) : null;

                const sPostoId = dbPosto.setor_id || 4;
                let sPostoNome = 'PLANTÃO';
                if (sPostoId === 1) sPostoNome = 'TINGUÁ';
                else if (sPostoId === 2) sPostoNome = 'GUANDU';
                else if (sPostoId === 3) sPostoNome = 'LARANJAL';

                stmtPosto.run(
                    activeRelId,
                    dbPosto.id,
                    dbPosto.nome,
                    p.horario_supervisao || '',
                    p.situacao_encontrada || '',
                    p.efetivo_presente !== undefined ? p.efetivo_presente : (efetivoComp ? 1 : 0),
                    statusSupervisaoFinal,
                    isSup,
                    isSup === 0 ? (p.motivo_nao_supervisao || '') : null,
                    kmNum,
                    efetivoComp,
                    efetivoComp === 0 ? (p.falta_efetivo_qtd || '') : null,
                    temOcorr,
                    temOcorr === 1 ? descOcorr : null,
                    p.observacao || '',
                    dbPosto.endereco || null,
                    dbPosto.localidade || null,
                    dbPosto.empresa || null,
                    sPostoId,
                    sPostoNome
                );

                if (isSup === 0) {
                    stmtOcorrencia.run(
                        activeRelId,
                        dbPosto.id,
                        'Posto Não Fiscalizado',
                        p.motivo_nao_supervisao || 'Posto não fiscalizado no expediente.',
                        'Reagendar fiscalização para o próximo turno.',
                        'pendente'
                    );
                } else if (temOcorr === 1 && (p.descricao_ocorrencia || p.observacao)) {
                    stmtOcorrencia.run(
                        activeRelId,
                        dbPosto.id,
                        'COM_OCORRENCIA',
                        p.descricao_ocorrencia || p.observacao,
                        'Informado no posto pelo fiscal',
                        'resolvido'
                    );
                }
            }

            // Ocorrências gerais
            if (ocorrencias && Array.isArray(ocorrencias) && ocorrencias.length > 0) {
                for (const oc of ocorrencias) {
                    stmtOcorrencia.run(
                        activeRelId,
                        oc.posto_id || null,
                        oc.tipo_ocorrencia || 'Geral',
                        oc.descricao || '',
                        oc.providencias_adotadas || '',
                        oc.status || 'resolvido'
                    );
                }
            }

            // Registrar Auditoria
            try {
                db.prepare(`
                    INSERT INTO auditoria_log (tabela, registro_id, acao, dados_novos, ip)
                    VALUES ('relatorios', ?, 'ENVIO_FINAL', ?, ?)
                `).run(
                    activeRelId,
                    JSON.stringify({ postos_enviados: postosValidos.length, hora: spNow.horaCurta }),
                    req.ip || '127.0.0.1'
                );
            } catch(eAud) {}

            return activeRelId;
        });

        const newRelatorioId = runTransaction();

        // Sincronização em nuvem com Supabase (background)
        try {
            const { pushRelatorioToSupabase } = require('../services/supabase_sync.service');
            pushRelatorioToSupabase(newRelatorioId).catch(e => console.warn('Supabase push warning:', e.message));
        } catch (_) {}

        // Emissão do evento de atualização em tempo real para Painel de Controle e Diretoria
        try {
            const { emitirEventoOperacional } = require('../services/realtime.service');
            emitirEventoOperacional('ENVIADO', {
                relatorio_id: newRelatorioId,
                setor_id: parseInt(setor_id),
                data_servico,
                turno,
                fiscal_nome: responsavel_nome,
                postos_concluidos: postosValidos.length,
                timestamp: spNow.dataHora
            });
        } catch (_) {}

        // 4. Montar Texto Padronizado para WhatsApp
        const dadosCompletos = db.prepare(`
            SELECT r.*, s.nome as setor_nome, sup.nome as supervisor_nome,
                   v.tipo_modelo as viatura_modelo, v.placa as viatura_placa
            FROM relatorios r
            JOIN setores s ON r.setor_id = s.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            LEFT JOIN viaturas v ON r.viatura_id = v.id
            WHERE r.id = ?
        `).get(newRelatorioId);

        const postosSalvos = db.prepare(`
            SELECT pr.*, COALESCE(pr.nome_posto_digitado, p.nome, 'Posto') as posto_nome
            FROM postos_relatorio pr
            LEFT JOIN postos p ON pr.posto_id = p.id
            WHERE pr.relatorio_id = ?
        `).all(newRelatorioId);

        const ocorrenciasSalvas = db.prepare(`
            SELECT oc.*, p.nome as posto_nome
            FROM ocorrencias oc
            LEFT JOIN postos p ON oc.posto_id = p.id
            WHERE oc.relatorio_id = ?
        `).all(newRelatorioId);

        let textoWhatsApp = `*CEDAE — CCO CONTROLE OPERACIONAL*\n`;
        textoWhatsApp += `*RELATÓRIO DO EXPEDIENTE (#${newRelatorioId})*\n\n`;
        textoWhatsApp += `📍 *SETOR:* ${dadosCompletos.setor_nome}\n`;
        textoWhatsApp += `👮 *FISCAL:* ${dadosCompletos.supervisor_nome || dadosCompletos.responsavel_nome || 'N/A'}\n`;
        textoWhatsApp += `🚗 *VIATURA:* ${dadosCompletos.viatura_modelo || dadosCompletos.viatura_outros_texto || 'OUTROS'} (${dadosCompletos.viatura_placa || 'N/A'})\n`;
        textoWhatsApp += `📅 *DATA DA FISCALIZAÇÃO:* ${formatDisplayDate(dadosCompletos.data_servico)} | ⏱️ *TURNO:* ${dadosCompletos.turno}\n`;
        textoWhatsApp += `🕒 *FECHAMENTO / ENVIO:* ${spNow.displayDateTime} (Horário de Brasília)\n`;
        textoWhatsApp += `🛣️ *KM RODADOS GERAL:* ${dadosCompletos.km_rodado || 0} km (Inicial: ${dadosCompletos.km_inicial} | Final: ${dadosCompletos.km_final})\n\n`;
        
        textoWhatsApp += `📋 *FISCALIZAÇÃO INDIVIDUAL DOS POSTOS (${postosSalvos.length}):*\n`;
        postosSalvos.forEach((p, index) => {
            if (p.supervisionado === 0) {
                textoWhatsApp += `${index + 1}. *${p.posto_nome}* — 🔴 NÃO FISCALIZADO (Motivo: ${p.motivo_nao_supervisao || 'Sem motivo'})\n`;
            } else {
                const efetivoStr = (p.efetivo_completo === 0) ? `FALTA (${p.falta_efetivo_qtd || '1'})` : `COMPLETO`;
                const ocorrStr = (p.tem_ocorrencia === 1 || p.descricao_ocorrencia) ? `SIM (${p.descricao_ocorrencia})` : `NÃO`;
                const kmStr = (p.km_posto !== null && p.km_posto !== undefined) ? `${p.km_posto} km` : `-`;
                textoWhatsApp += `${index + 1}. *${p.posto_nome}* | ⏱️ ${p.horario_supervisao || '-'} | 🛣️ ${kmStr} | 📊 ${p.status_supervisao} | 👥 ${efetivoStr} | 🚨 Ocorrência: ${ocorrStr}\n`;
            }
        });
        
        if (ocorrenciasSalvas.length > 0) {
            textoWhatsApp += `\n🚨 *OCORRÊNCIAS / PROVIDÊNCIAS:*\n`;
            ocorrenciasSalvas.forEach((oc) => {
                textoWhatsApp += `• [${oc.posto_nome || 'Geral'}] ${oc.descricao} (Providência: ${oc.providencias_adotadas || 'Registrada'})\n`;
            });
        }
        
        if (dadosCompletos.observacoes_gerais) {
            textoWhatsApp += `\n📝 *OBSERVAÇÕES GERAIS:*\n${dadosCompletos.observacoes_gerais}\n`;
        }
        
        textoWhatsApp += `\n*RESPONSÁVEL PELO RELATÓRIO:* ${dadosCompletos.responsavel_nome || dadosCompletos.supervisor_nome || 'Fiscal'}\n`;
        textoWhatsApp += `*STATUS:* RECEBIDO E CONSOLIDADO NO CCO CEDAE`;

        // 5. Enviar Notificação por E-mail (Async)
        try {
            if (emailService && typeof emailService.enviarRelatorioCedae === 'function') {
                emailService.enviarRelatorioCedae(dadosCompletos, postosSalvos, ocorrenciasSalvas);
            }
        } catch (e) {
            console.warn('Alerta e-mail:', e.message);
        }
        
        let countAtualizado = 1;
        if (dadosCompletos.supervisor_id) {
            const rCount = db.prepare(`
                SELECT COUNT(*) as total FROM relatorios 
                WHERE (supervisor_id = ? OR responsavel_nome = (SELECT nome FROM supervisores WHERE id = ?))
                  AND data_servico = ? AND status = 'concluido'
            `).get(dadosCompletos.supervisor_id, dadosCompletos.supervisor_id, dadosCompletos.data_servico);
            countAtualizado = rCount ? rCount.total : 1;
        } else if (dadosCompletos.responsavel_nome) {
            const rCount = db.prepare(`
                SELECT COUNT(*) as total FROM relatorios 
                WHERE (responsavel_nome = ? OR supervisor_id IN (SELECT id FROM supervisores WHERE nome = ?))
                  AND data_servico = ? AND status = 'concluido'
            `).get(dadosCompletos.responsavel_nome, dadosCompletos.responsavel_nome, dadosCompletos.data_servico);
            countAtualizado = rCount ? rCount.total : 1;
        }

        res.status(201).json({
            success: true,
            id: newRelatorioId,
            numero_relatorio: String(newRelatorioId).padStart(5, '0'),
            data: spNow.displayDate,
            data_servico: dadosCompletos.data_servico,
            data_servico_formatada: formatDisplayDate(dadosCompletos.data_servico),
            horario: spNow.horaCurta,
            timestamp_envio: spNow.dataHora,
            timezone: 'America/Sao_Paulo',
            status: 'concluido',
            status_label: '🟢 ENVIADO',
            quota: {
                relatorios_hoje: countAtualizado,
                limite: 2,
                disponiveis: Math.max(0, 2 - countAtualizado),
                bloqueado: false,
                label: `Envio ${countAtualizado}`
            },
            message: '✅ RELATÓRIO ENVIADO COM SUCESSO',
            texto_whatsapp: textoWhatsApp
        });
        
    } catch (error) {
        console.error('Erro ao processar relatório do expediente:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. CONSULTAR RELATÓRIO DO EXPEDIENTE (Acesso para visualização do comprovante pelo fiscal)
router.get('/relatorio/:id', (req, res) => {
    try {
        const db = getDb();
        const relatorio = db.prepare(`
            SELECT r.*, s.nome as setor_nome, s.sigla as setor_sigla,
                   sup.nome as supervisor_nome, sup.matricula as supervisor_matricula,
                   v.tipo_modelo as viatura_modelo, v.placa as viatura_placa
            FROM relatorios r
            JOIN setores s ON r.setor_id = s.id
            LEFT JOIN supervisores sup ON r.supervisor_id = sup.id
            LEFT JOIN viaturas v ON r.viatura_id = v.id
            WHERE r.id = ?
        `).get(req.params.id);
        
        if (!relatorio) return res.status(404).json({ error: 'Relatório não encontrado' });
        
        const postos = db.prepare(`
            SELECT pr.*, COALESCE(pr.nome_posto_digitado, p.nome, 'Posto') as posto_nome, p.empresa as posto_empresa
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

        res.json({
            ...relatorio,
            postos,
            ocorrencias
        });
    } catch (error) {
        console.error('Erro ao buscar relatório por ID no formulário:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
