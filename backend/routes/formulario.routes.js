const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const emailService = require('../services/email.service');
const { getBrasiliaDateTime, formatDisplayDate, formatDisplayDateTime, formatDisplayTime } = require('../utils/date.utils');

// 0. LISTAR SETORES ATIVOS (Público para o Formulário do Supervisor)
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
// Retorna apenas supervisores, viaturas e postos daquele setor específico
router.get('/setor/:id', (req, res) => {
    try {
        const db = getDb();
        const setor = db.prepare("SELECT * FROM setores WHERE id = ? AND status = 'ativo'").get(req.params.id);
        if (!setor) return res.status(404).json({ error: 'Setor não encontrado ou inativo' });
        
        const isPlantao = setor.nome.toUpperCase().includes('PLANT') || setor.sigla === 'PLANTAO';
        
        // REGRA DE ISOLAMENTO RIGOROSO ENTRE SETORES (SEM QUALQUER EXCEÇÃO):
        // CADA SETOR RETORNA EXCLUSIVAMENTE OS SEUS PRÓPRIOS SUPERVISORES E SUAS PRÓPRIAS VIATURAS
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

// 2. ENVIAR RELATÓRIO CONSOLIDADO DO EXPEDIENTE (1 envio por setor)
const enviarRelatorioHandler = async (req, res) => {
    try {
        const db = getDb();
        const {
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
            postos_supervisionados: postos_supervisionados_raw, // Array de postos
            ocorrencias // Array de ocorrencias opcionais
        } = req.body;
        
        const postos_supervisionados = postos_supervisionados_raw || req.body.postos || [];
        
        // Verificação de Idempotência / Anti-Duplicidade via client_uuid
        if (client_uuid) {
            const existente = db.prepare('SELECT id, data_servico, created_at FROM relatorios WHERE client_uuid = ?').get(client_uuid);
            if (existente) {
                return res.status(200).json({
                    success: true,
                    id: existente.id,
                    numero_relatorio: String(existente.id).padStart(5, '0'),
                    data: formatDisplayDate(existente.data_servico),
                    data_servico: existente.data_servico,
                    horario: formatDisplayTime(existente.created_at),
                    timestamp: existente.created_at,
                    timezone: 'America/Sao_Paulo',
                    message: '✅ FISCALIZAÇÃO JÁ SINCRONIZADA ANTERIORMENTE',
                    ja_existia: true
                });
            }
        }

        // Validação de campos obrigatórios
        if (!setor_id || !data_servico || !turno) {
            return res.status(400).json({ error: 'Setor, Data do Serviço e Turno são obrigatórios' });
        }

        if (!supervisor_id && !responsavel_nome) {
            return res.status(400).json({ error: 'Identificação do Fiscal ou Responsável é obrigatória' });
        }

        // Regra de Isolamento: Se supervisor_id informado, deve pertencer obrigatoriamente ao setor_id
        if (supervisor_id) {
            const supValido = db.prepare("SELECT id, nome FROM supervisores WHERE id = ? AND setor_id = ? AND status = 'ativo'").get(supervisor_id, setor_id);
            if (!supValido) {
                return res.status(400).json({ error: 'O fiscal selecionado não pertence ao setor do expediente ou está inativo.' });
            }
        }

        // Regra de Isolamento: Se viatura_id informada (e não OUTROS), deve pertencer obrigatoriamente ao setor_id
        if (viatura_id && viatura_id !== 'OUTROS' && viatura_id !== 'null') {
            const vtrValida = db.prepare("SELECT id FROM viaturas WHERE id = ? AND setor_id = ? AND status = 'ativo'").get(viatura_id, setor_id);
            if (!vtrValida) {
                return res.status(400).json({ error: 'A viatura selecionada não pertence ao setor do expediente ou está inativa.' });
            }
        }


        // Filtrar apenas postos válidos preenchidos (postos vazios não são contabilizados)
        const postosValidos = (postos_supervisionados || []).filter(p => {
            const temIdentificacao = (p.posto_id) || (p.posto_nome && String(p.posto_nome).trim());
            return temIdentificacao && (p.horario_supervisao || p.km_posto !== undefined || p.supervisionado !== undefined);
        });

        if (postosValidos.length === 0) {
            return res.status(400).json({ error: 'Ao menos um posto preenchido deve constar no relatório' });
        }

        // Validação estrita de cada posto preenchido
        for (const p of postosValidos) {
            const rotulo = p.posto_nome ? `"${p.posto_nome}"` : `ID ${p.posto_id}`;
            if (p.supervisionado === false || p.supervisionado === 0 || p.status_supervisao === 'NAO_SUPERVISIONADO') {
                if (!p.motivo_nao_supervisao || !p.motivo_nao_supervisao.trim()) {
                    return res.status(400).json({ error: `O posto ${rotulo} foi marcado como NÃO FISCALIZADO. É obrigatório informar o motivo.` });
                }
            } else {
                // Posto fiscalizado: exigir Hora, KM e Situação
                if (!p.horario_supervisao || !p.horario_supervisao.trim()) {
                    return res.status(400).json({ error: `Informe a Hora da fiscalização para o posto ${rotulo}.` });
                }
                if (p.km_posto === undefined || p.km_posto === null || String(p.km_posto).trim() === '') {
                    return res.status(400).json({ error: `Informe o KM no posto para o posto ${rotulo}.` });
                }
                // Se efetivo incompleto, exigir falta
                if (p.efetivo_completo === false || p.efetivo_completo === 0 || p.efetivo_completo === 'NAO') {
                    if (!p.falta_efetivo_qtd || !String(p.falta_efetivo_qtd).trim()) {
                        return res.status(400).json({ error: `Para o posto ${rotulo}, o efetivo está incompleto. É obrigatório preencher o campo Falta.` });
                    }
                }
                // Se ocorrência SIM, exigir descrição
                if (p.tem_ocorrencia === true || p.tem_ocorrencia === 1 || p.tem_ocorrencia === 'SIM') {
                    if (!p.descricao_ocorrencia || !p.descricao_ocorrencia.trim()) {
                        return res.status(400).json({ error: `Para o posto ${rotulo}, foi indicada ocorrência. É obrigatório descrever a ocorrência.` });
                    }
                }
            }
        }

        // VALIDAÇÃO DE SEGURANÇA E ACESSO POR SETOR (BASE ÚNICA DE 59 POSTOS)
        for (const p of postosValidos) {
            let pId = p.posto_id ? parseInt(p.posto_id) : null;
            let dbPosto = null;
            if (pId) {
                dbPosto = db.prepare("SELECT * FROM postos WHERE id = ? AND status = 'ativo'").get(pId);
            } else if (p.posto_nome) {
                dbPosto = db.prepare("SELECT * FROM postos WHERE UPPER(TRIM(nome)) = UPPER(TRIM(?)) AND status = 'ativo'").get(p.posto_nome.trim());
            }

            if (!dbPosto) {
                return res.status(400).json({ error: 'ACESSO NEGADO: POSTO NÃO PERTENCE À BASE OFICIAL' });
            }

            // Regra de Isolamento e Segurança Multi-Setor:
            // PLANTÃO (setor_id = 4) tem acesso aos 59 postos.
            // TINGUÁ (1), GUANDU (2), LARANJAL (3) só podem enviar postos atribuídos em posto_setor_supervisao.
            if (parseInt(setor_id) !== 4) {
                const autorizado = db.prepare(`
                    SELECT 1 FROM posto_setor_supervisao 
                    WHERE posto_id = ? AND setor_id = ? AND ativo = 1
                `).get(dbPosto.id, parseInt(setor_id));

                if (!autorizado) {
                    return res.status(403).json({
                        error: `ACESSO NEGADO: O posto "${dbPosto.nome}" não pertence ao setor do usuário.`,
                        status: 'ACESSO NEGADO'
                    });
                }
            }

            p._dbPosto = dbPosto;
        }

        // CONTROLE CONTRA DUPLICIDADE: SETOR + DATA + TURNO + SUPERVISOR
        let dupCheckSql = "SELECT id, created_at FROM relatorios WHERE setor_id = ? AND data_servico = ? AND turno = ?";
        const dupParams = [setor_id, data_servico, turno];
        if (supervisor_id) {
            dupCheckSql += " AND supervisor_id = ?";
            dupParams.push(supervisor_id);
        }
        dupCheckSql += " LIMIT 1";

        const relatorioExistente = db.prepare(dupCheckSql).get(...dupParams);
        if (relatorioExistente) {
            return res.status(409).json({
                error: `Atenção: Já existe um relatório registrado para este Setor, Data, Turno e Fiscal (Relatório #${relatorioExistente.id} em ${relatorioExistente.created_at}). Para evitar duplicidade acidental, o novo envio foi bloqueado.`
            });
        }
        
        const kmIni = parseFloat(km_inicial) || 0;
        const kmFim = parseFloat(km_final) || 0;
        const km_rodado = (kmFim >= kmIni && kmFim > 0) ? (kmFim - kmIni) : 0;
        const spNow = getBrasiliaDateTime();
        
        const runTransaction = db.transaction(() => {
            // 1. Inserir Relatório Principal com Timestamp Oficial de Brasília
            const stmtRel = db.prepare(`
                INSERT INTO relatorios (
                    setor_id, supervisor_id, viatura_id, viatura_outros_texto,
                    data_servico, turno, km_inicial, km_final, km_rodado,
                    responsavel_nome, observacoes_gerais, providencias_gerais, pendencias_gerais, status, client_uuid,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'concluido', ?, ?)
            `);
            
            const resultRel = stmtRel.run(
                setor_id,
                supervisor_id || null,
                viatura_id || null,
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
                client_uuid || null,
                spNow.dataHora
            );
            
            const relatorio_id = Number(resultRel.lastInsertRowid);
            
            const stmtOcorrencia = db.prepare(`
                INSERT INTO ocorrencias (
                    relatorio_id, posto_id, tipo_ocorrencia, descricao, providencias_adotadas, status
                ) VALUES (?, ?, ?, ?, ?, ?)
            `);

            // 2. Inserir Postos Supervisionados da Base Única Oficial com Setor Principal do Posto
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
                const pId = dbPosto.id;
                const nomeOficial = dbPosto.nome;
                const endPosto = dbPosto.endereco || null;
                const locPosto = dbPosto.localidade || null;
                const empPosto = dbPosto.empresa || null;

                // Buscar Setor Principal proprietário do posto
                const sPostoId = dbPosto.setor_id || 4;
                let sPostoNome = 'PLANTÃO';
                if (sPostoId === 1) sPostoNome = 'TINGUÁ';
                else if (sPostoId === 2) sPostoNome = 'GUANDU';
                else if (sPostoId === 3) sPostoNome = 'LARANJAL';

                const isSup = (p.supervisionado === false || p.supervisionado === 0 || p.status_supervisao === 'NAO_SUPERVISIONADO') ? 0 : 1;
                const statusSupervisaoFinal = isSup === 0 ? 'NAO_SUPERVISIONADO' : (p.status_supervisao || 'NORMAL');
                const efetivoComp = (p.efetivo_completo === false || p.efetivo_completo === 0 || p.efetivo_completo === 'NAO') ? 0 : 1;
                const temOcorr = (p.tem_ocorrencia === true || p.tem_ocorrencia === 1 || p.tem_ocorrencia === 'SIM') ? 1 : 0;
                const kmNum = (p.km_posto !== undefined && p.km_posto !== null && p.km_posto !== '') ? parseFloat(p.km_posto) : null;
                
                stmtPosto.run(
                    relatorio_id,
                    pId,
                    nomeOficial,
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
                    temOcorr === 1 ? (p.descricao_ocorrencia || '') : null,
                    p.observacao || '',
                    endPosto,
                    locPosto,
                    empPosto,
                    sPostoId,
                    sPostoNome
                );

                if (temOcorr === 1 && p.descricao_ocorrencia) {
                    stmtOcorrencia.run(
                        relatorio_id,
                        pId,
                        'COM_OCORRENCIA',
                        p.descricao_ocorrencia,
                        'Informado no posto pelo fiscal',
                        'resolvido'
                    );
                }
            }
            
            // 3. Inserir Ocorrências Gerais (se enviadas separadamente)
            if (ocorrencias && Array.isArray(ocorrencias) && ocorrencias.length > 0) {
                for (const oc of ocorrencias) {
                    stmtOcorrencia.run(
                        relatorio_id,
                        oc.posto_id || null,
                        oc.tipo_ocorrencia || 'Geral',
                        oc.descricao || '',
                        oc.providencias_adotadas || '',
                        oc.status || 'resolvido'
                    );
                }
            }
            
            return relatorio_id;
        });
        
        const newRelatorioId = runTransaction();
        
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
            ocorrenciasSalvas.forEach((oc, i) => {
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
            message: '✅ FISCALIZAÇÃO ENVIADA COM SUCESSO',
            texto_whatsapp: textoWhatsApp
        });
        
    } catch (error) {
        console.error('Erro ao processar relatório do expediente:', error);
        res.status(500).json({ error: error.message });
    }
};

router.post('/enviar', enviarRelatorioHandler);
router.post('/salvar', enviarRelatorioHandler);

// 3. CONSULTAR RELATÓRIO DO EXPEDIENTE (Acesso para visualização do comprovante pelo supervisor)
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
