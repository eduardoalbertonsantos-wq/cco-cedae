const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permissions');

// Helper para normalizar identificador ou nome de setor
function normalizeSetorId(val) {
    if (!val) return null;
    if (typeof val === 'number') return val;
    const s = String(val).toUpperCase().trim();
    if (s === 'SEM_SETOR' || s === 'PENDENTE' || s === 'NULL') return 'SEM_SETOR';
    if (s === '1' || s.includes('TINGU')) return 1;
    if (s === '2' || s.includes('GUANDU')) return 2;
    if (s === '3' || s.includes('LARANJAL')) return 3;
    if (s === '4' || s.includes('PLANTAO') || s.includes('PLANTÃO')) return 4;
    const parsed = parseInt(val);
    return isNaN(parsed) ? null : parsed;
}

function getNomeSetor(sId) {
    switch (parseInt(sId)) {
        case 1: return 'TINGUÁ';
        case 2: return 'GUANDU';
        case 3: return 'LARANJAL';
        case 4: return 'PLANTÃO';
        default: return '⚠️ SETOR NÃO DEFINIDO';
    }
}

// =========================================================================
// 0. AUDITORIA DE CADASTRO E ORGANIZAÇÃO DOS POSTOS (MATRIZ ADMINISTRATIVA)
// =========================================================================

// GET /api/v1/postos/auditoria-cadastro - Rotina oficial de validação automática
router.get('/auditoria-cadastro', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const postos = db.prepare(`
            SELECT p.id, p.nome, p.setor_id, s.nome as setor_nome, p.status, p.endereco
            FROM postos p
            LEFT JOIN setores s ON p.setor_id = s.id
            ORDER BY p.id ASC
        `).all();

        const total = postos.length;
        let comSetor = 0;
        let semSetor = 0;
        const semSetorLista = [];

        // Detecção de duplicidade por nome normalizado
        const nomesMap = new Map();
        const duplicadosLista = [];

        postos.forEach(p => {
            if (p.setor_id && [1, 2, 3, 4].includes(p.setor_id)) {
                comSetor++;
            } else {
                semSetor++;
                semSetorLista.push({ id: p.id, nome: p.nome, setor_id: p.setor_id });
            }

            const norm = p.nome.trim().toUpperCase();
            if (nomesMap.has(norm)) {
                duplicadosLista.push({ id: p.id, nome: p.nome, duplicaComId: nomesMap.get(norm) });
            } else {
                nomesMap.set(norm, p.id);
            }
        });

        const supervisoresSemSetor = db.prepare('SELECT id, nome, matricula FROM supervisores WHERE setor_id IS NULL OR setor_id NOT IN (SELECT id FROM setores)').all();
        const viaturasSemSetor = db.prepare('SELECT id, tipo_modelo, placa FROM viaturas WHERE setor_id IS NULL OR setor_id NOT IN (SELECT id FROM setores)').all();
        const comErro = semSetor + duplicadosLista.length + supervisoresSemSetor.length + viaturasSemSetor.length;

        const cTingua = postos.filter(p => p.setor_id === 1).length;
        const cGuandu = postos.filter(p => p.setor_id === 2).length;
        const cLaranjal = postos.filter(p => p.setor_id === 3).length;
        const cPlantao = postos.filter(p => p.setor_id === 4).length;

        res.json({
            success: true,
            auditoria: {
                total_postos: total,
                com_setor: comSetor,
                sem_setor: semSetor,
                duplicados: duplicadosLista.length,
                com_erro: comErro,
                status_geral: comErro === 0 ? 'CONFORME' : 'ATENÇÃO_REQUERIDA'
            },
            distribuicao: {
                tingua: { setor_id: 1, nome: 'TINGUÁ', quantidade: cTingua },
                guandu: { setor_id: 2, nome: 'GUANDU', quantidade: cGuandu },
                laranjal: { setor_id: 3, nome: 'LARANJAL', quantidade: cLaranjal },
                plantao: { setor_id: 4, nome: 'PLANTÃO', quantidade_proprios: cPlantao, quantidade_supervisao_disponivel: total }
            },
            detalhes_erros: {
                postos_sem_setor: semSetorLista,
                postos_duplicados: duplicadosLista,
                supervisores_sem_setor: supervisoresSemSetor,
                viaturas_sem_setor: viaturasSemSetor
            }
        });
    } catch (error) {
        console.error('Erro na auditoria de cadastro:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/postos/organizacao - Retorna matriz oficial dos 59 postos para tela de Organização
router.get('/organizacao', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const postos = db.prepare(`
            SELECT p.id, p.nome, p.endereco, p.localidade, p.empresa, p.status, p.setor_id,
                   s.nome as setor_nome
            FROM postos p
            LEFT JOIN setores s ON p.setor_id = s.id
            ORDER BY p.id ASC
        `).all();

        let cTingua = 0, cGuandu = 0, cLaranjal = 0, cPlantao = 0, cNaoDefinido = 0;

        const lista = postos.map(p => {
            const sId = p.setor_id;
            let setorAtual = '⚠️ SETOR NÃO DEFINIDO';
            let valido = false;

            if (sId === 1) { setorAtual = 'TINGUÁ'; cTingua++; valido = true; }
            else if (sId === 2) { setorAtual = 'GUANDU'; cGuandu++; valido = true; }
            else if (sId === 3) { setorAtual = 'LARANJAL'; cLaranjal++; valido = true; }
            else if (sId === 4) { setorAtual = 'PLANTÃO'; cPlantao++; valido = true; }
            else { cNaoDefinido++; }

            return {
                id: p.id,
                nome: p.nome,
                setor_id: sId,
                setor_atual: setorAtual,
                setor_atual_valido: valido,
                status: p.status || 'ativo',
                endereco: p.endereco || '',
                localidade: p.localidade || '',
                empresa: p.empresa || ''
            };
        });

        res.json({
            success: true,
            total: postos.length,
            totais: {
                total: postos.length,
                tingua: cTingua,
                guandu: cGuandu,
                laranjal: cLaranjal,
                plantao: cPlantao,
                nao_definido: cNaoDefinido,
                plantao_disponivel_supervisao: postos.length
            },
            postos: lista
        });
    } catch (error) {
        console.error('Erro ao buscar organização de postos:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/postos/organizacao/reclassificar - Reclassificação com histórico completo
router.post('/organizacao/reclassificar', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { alteracoes, posto_id, novo_setor_id, usuario_nome } = req.body;
        const db = getDb();
        const usuario = (req.user && req.user.nome) || usuario_nome || 'Administrador / Chefia';

        let listaAlteracoes = [];
        if (Array.isArray(alteracoes) && alteracoes.length > 0) {
            listaAlteracoes = alteracoes;
        } else if (posto_id !== undefined && novo_setor_id !== undefined) {
            listaAlteracoes = [{ posto_id, novo_setor_id }];
        } else {
            return res.status(400).json({ error: 'Nenhuma alteração informada para reclassificação.' });
        }

        const reclassificarTx = db.transaction(() => {
            const stmtPostoAtual = db.prepare('SELECT p.id, p.nome, p.setor_id, s.nome as setor_nome FROM postos p LEFT JOIN setores s ON p.setor_id = s.id WHERE p.id = ?');
            const stmtUpdatePosto = db.prepare('UPDATE postos SET setor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            const stmtDelRegional = db.prepare('DELETE FROM posto_setor_supervisao WHERE posto_id = ? AND setor_id IN (1, 2, 3)');
            const stmtInsRegional = db.prepare(`
                INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel, updated_at)
                VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(posto_id, setor_id) DO UPDATE SET ativo = 1, updated_at = CURRENT_TIMESTAMP
            `);
            const stmtInsPlantao = db.prepare('INSERT OR IGNORE INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel) VALUES (?, 4, 1, ?)');
            const stmtHist = db.prepare(`
                INSERT INTO historico_distribuicao_postos (
                    posto_id, posto_nome, setor_id, setor_nome,
                    setor_anterior_id, setor_anterior_nome,
                    setor_novo_id, setor_novo_nome,
                    acao, usuario_nome
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATRIBUIDO', ?)
            `);

            for (const item of listaAlteracoes) {
                const pid = parseInt(item.posto_id || item.id);
                const nid = parseInt(item.novo_setor_id || item.setor_id);

                if (!pid || isNaN(pid)) continue;
                if (![1, 2, 3, 4].includes(nid)) {
                    throw new Error(`Setor inválido (${nid}) para o posto #${pid}. Selecione TINGUÁ (1), GUANDU (2), LARANJAL (3) ou PLANTÃO (4).`);
                }

                const postoAtual = stmtPostoAtual.get(pid);
                if (!postoAtual) {
                    throw new Error(`Posto #${pid} não encontrado no cadastro oficial.`);
                }

                const sAnteriorId = postoAtual.setor_id;
                const sAnteriorNome = getNomeSetor(sAnteriorId);
                const sNovoNome = getNomeSetor(nid);

                stmtUpdatePosto.run(nid, pid);
                stmtDelRegional.run(pid);

                if (nid !== 4) {
                    stmtInsRegional.run(pid, nid, usuario);
                }

                stmtInsPlantao.run(pid, usuario);

                stmtHist.run(
                    pid,
                    postoAtual.nome,
                    nid,
                    sNovoNome,
                    sAnteriorId || null,
                    sAnteriorNome,
                    nid,
                    sNovoNome,
                    usuario
                );
            }
        });

        reclassificarTx();

        const postos = db.prepare('SELECT id, setor_id FROM postos').all();
        const total = postos.length;
        const cTingua = postos.filter(p => p.setor_id === 1).length;
        const cGuandu = postos.filter(p => p.setor_id === 2).length;
        const cLaranjal = postos.filter(p => p.setor_id === 3).length;
        const cPlantao = postos.filter(p => p.setor_id === 4).length;
        const cNaoDef = postos.filter(p => !p.setor_id || ![1, 2, 3, 4].includes(p.setor_id)).length;

        res.json({
            success: true,
            message: `✅ Reclassificação de ${listaAlteracoes.length} posto(s) realizada e registrada no histórico.`,
            total_afetados: listaAlteracoes.length,
            totais: {
                total,
                tingua: cTingua,
                guandu: cGuandu,
                laranjal: cLaranjal,
                plantao: cPlantao,
                nao_definido: cNaoDef,
                plantao_disponivel_supervisao: total
            }
        });
    } catch (error) {
        console.error('Erro ao reclassificar postos:', error);
        res.status(500).json({ error: error.message });
    }
});

// =========================================================================
// 1. ROTAS DE DISTRIBUIÇÃO E HISTÓRICO
// =========================================================================

// GET /api/v1/postos/distribuicao - Retorna os 59 postos com setor atual e contadores reais
router.get('/distribuicao', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const postos = db.prepare(`
            SELECT id, nome, endereco, localidade, empresa, regiao, tipo_posto, 
                   observacoes, status, setor_id, supervisor_id, supervisor_nome,
                   viatura_id, viatura_placa
            FROM postos
            WHERE status = 'ativo'
            ORDER BY id ASC
        `).all();

        const cTotal = postos.length;
        const cTingua = postos.filter(p => p.setor_id === 1).length;
        const cGuandu = postos.filter(p => p.setor_id === 2).length;
        const cLaranjal = postos.filter(p => p.setor_id === 3).length;
        const cPlantao = postos.filter(p => p.setor_id === 4 || !p.setor_id).length;

        const resultado = postos.map(p => {
            const sId = p.setor_id || 4;
            const sNome = getNomeSetor(sId);

            return {
                id: p.id,
                nome: p.nome,
                endereco: p.endereco,
                localidade: p.localidade,
                empresa: p.empresa,
                regiao: p.regiao,
                tipo_posto: p.tipo_posto,
                observacoes: p.observacoes,
                status: p.status || 'ativo',
                setor_id: sId,
                setor_nome: sNome,
                supervisor: p.supervisor_nome || 'Não atribuído',
                supervisor_nome: p.supervisor_nome || null,
                viatura: p.viatura_placa || '-',
                viatura_placa: p.viatura_placa || null,
                tingua: sId === 1,
                guandu: sId === 2,
                laranjal: sId === 3,
                plantao: sId === 4,
                plantao_operacional: true
            };
        });

        res.json({
            success: true,
            total: cTotal,
            totais: {
                total: cTotal,
                tingua: cTingua,
                guandu: cGuandu,
                laranjal: cLaranjal,
                plantao: cPlantao,
                plantao_operacional: cTotal
            },
            postos: resultado
        });
    } catch (error) {
        console.error('Erro ao obter distribuição de postos:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/postos/distribuicao/atribuir - Atribui lote de postos selecionados a um setor
router.post('/distribuicao/atribuir', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { posto_ids, setor_id, usuario_nome } = req.body;
        if (!posto_ids || !Array.isArray(posto_ids) || posto_ids.length === 0) {
            return res.status(400).json({ error: 'Nenhum posto selecionado para atribuição.' });
        }

        const sId = parseInt(setor_id);
        if (![1, 2, 3, 4].includes(sId)) {
            return res.status(400).json({ error: 'Setor inválido. Selecione TINGUÁ (1), GUANDU (2), LARANJAL (3) ou PLANTÃO (4).' });
        }

        const db = getDb();
        const setorNome = getNomeSetor(sId);
        const usuario = (req.user && req.user.nome) || usuario_nome || 'Administrador / Chefia';

        const atribuirTx = db.transaction(() => {
            const stmtUpdatePosto = db.prepare(`
                UPDATE postos 
                SET setor_id = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `);

            const stmtDelRegional = db.prepare(`
                DELETE FROM posto_setor_supervisao 
                WHERE posto_id = ? AND setor_id IN (1, 2, 3)
            `);

            const stmtInsRegional = db.prepare(`
                INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel, updated_at)
                VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(posto_id, setor_id) DO UPDATE SET
                    ativo = 1,
                    usuario_responsavel = excluded.usuario_responsavel,
                    updated_at = CURRENT_TIMESTAMP
            `);

            const stmtInsPlantao = db.prepare(`
                INSERT OR IGNORE INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel)
                VALUES (?, 4, 1, ?)
            `);

            const stmtHist = db.prepare(`
                INSERT INTO historico_distribuicao_postos (posto_id, posto_nome, setor_id, setor_nome, acao, usuario_nome)
                VALUES (?, ?, ?, ?, 'ATRIBUIDO', ?)
            `);

            const postosMap = {};
            db.prepare('SELECT id, nome FROM postos').all().forEach(p => { postosMap[p.id] = p.nome; });

            for (const pid of posto_ids) {
                const pId = parseInt(pid);
                const pNome = postosMap[pId] || `Posto #${pId}`;

                // 1. Atualizar o setor principal na tabela postos
                stmtUpdatePosto.run(sId, pId);

                // 2. Limpar atribuição regional anterior na tabela de supervisão
                stmtDelRegional.run(pId);

                // 3. Se for um setor regional (1, 2, 3), inserir/ativar na tabela de supervisão
                if (sId !== 4) {
                    stmtInsRegional.run(pId, sId, usuario);
                }

                // 4. Plantão sempre tem acesso operacional global a todos os postos
                stmtInsPlantao.run(pId, usuario);

                // 5. Histórico de auditoria
                stmtHist.run(pId, pNome, sId, setorNome, usuario);
            }
        });

        atribuirTx();

        // Calcular novos contadores reais após a alteração
        const total = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo'").get().c;
        const cTingua = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND setor_id = 1").get().c;
        const cGuandu = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND setor_id = 2").get().c;
        const cLaranjal = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND setor_id = 3").get().c;
        const cPlantao = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND (setor_id = 4 OR setor_id IS NULL)").get().c;

        res.json({
            success: true,
            message: `✅ ${posto_ids.length} postos atribuídos ao setor ${setorNome}.`,
            total_afetados: posto_ids.length,
            setor_nome: setorNome,
            totais: {
                total,
                tingua: cTingua,
                guandu: cGuandu,
                laranjal: cLaranjal,
                plantao: cPlantao,
                plantao_operacional: total
            }
        });
    } catch (error) {
        console.error('Erro ao atribuir postos ao setor:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/v1/postos/distribuicao/individual/:id - Altera o setor de um único posto
router.put('/distribuicao/individual/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const pId = parseInt(req.params.id);
        const { setor_id, usuario_nome } = req.body;
        const sId = parseInt(setor_id);

        if (![1, 2, 3, 4].includes(sId)) {
            return res.status(400).json({ error: 'Setor de destino inválido.' });
        }

        const db = getDb();
        const posto = db.prepare('SELECT id, nome FROM postos WHERE id = ?').get(pId);
        if (!posto) return res.status(404).json({ error: 'Posto não encontrado' });

        const setorNome = getNomeSetor(sId);
        const usuario = (req.user && req.user.nome) || usuario_nome || 'Administrador / Chefia';

        const updateTx = db.transaction(() => {
            db.prepare('UPDATE postos SET setor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sId, pId);
            db.prepare('DELETE FROM posto_setor_supervisao WHERE posto_id = ? AND setor_id IN (1, 2, 3)').run(pId);
            if (sId !== 4) {
                db.prepare(`
                    INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel, updated_at)
                    VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(posto_id, setor_id) DO UPDATE SET ativo = 1, updated_at = CURRENT_TIMESTAMP
                `).run(pId, sId, usuario);
            }
            db.prepare('INSERT OR IGNORE INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel) VALUES (?, 4, 1, ?)').run(pId, usuario);
            db.prepare(`
                INSERT INTO historico_distribuicao_postos (posto_id, posto_nome, setor_id, setor_nome, acao, usuario_nome)
                VALUES (?, ?, ?, ?, 'ATRIBUIDO', ?)
            `).run(pId, posto.nome, sId, setorNome, usuario);
        });

        updateTx();

        const total = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo'").get().c;
        const cTingua = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND setor_id = 1").get().c;
        const cGuandu = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND setor_id = 2").get().c;
        const cLaranjal = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND setor_id = 3").get().c;
        const cPlantao = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND (setor_id = 4 OR setor_id IS NULL)").get().c;

        res.json({
            success: true,
            message: `✅ Posto "${posto.nome}" atribuído ao setor ${setorNome}.`,
            posto_id: pId,
            setor_id: sId,
            setor_nome: setorNome,
            totais: {
                total,
                tingua: cTingua,
                guandu: cGuandu,
                laranjal: cLaranjal,
                plantao: cPlantao,
                plantao_operacional: total
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar posto individualmente:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/postos/distribuicao/salvar - Salva alterações pendentes (individual ou em lote)
router.post('/distribuicao/salvar', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { alteracoes, usuario_nome } = req.body;
        if (!alteracoes || !Array.isArray(alteracoes) || alteracoes.length === 0) {
            return res.status(400).json({ error: 'Nenhuma alteração pendente para salvar.' });
        }

        const db = getDb();
        const usuario = (req.user && req.user.nome) || usuario_nome || 'Administrador / Chefia';

        const saveTx = db.transaction(() => {
            const stmtUpdatePosto = db.prepare('UPDATE postos SET setor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            const stmtDelRegional = db.prepare('DELETE FROM posto_setor_supervisao WHERE posto_id = ? AND setor_id IN (1, 2, 3)');
            const stmtInsRegional = db.prepare(`
                INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel, updated_at)
                VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(posto_id, setor_id) DO UPDATE SET ativo = 1, updated_at = CURRENT_TIMESTAMP
            `);
            const stmtInsPlantao = db.prepare('INSERT OR IGNORE INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel) VALUES (?, 4, 1, ?)');
            const stmtHist = db.prepare(`
                INSERT INTO historico_distribuicao_postos (posto_id, posto_nome, setor_id, setor_nome, acao, usuario_nome)
                VALUES (?, ?, ?, ?, 'ATRIBUIDO', ?)
            `);

            const postosMap = {};
            db.prepare('SELECT id, nome FROM postos').all().forEach(p => { postosMap[p.id] = p.nome; });

            for (const item of alteracoes) {
                const pId = parseInt(item.id);
                if (!pId) continue;

                // Suporta tanto item.setor_id quanto item.tingua/guandu/laranjal
                let sId = item.setor_id ? parseInt(item.setor_id) : null;
                if (!sId) {
                    if (item.tingua) sId = 1;
                    else if (item.guandu) sId = 2;
                    else if (item.laranjal) sId = 3;
                    else sId = 4;
                }

                const sNome = getNomeSetor(sId);
                const pNome = postosMap[pId] || `Posto #${pId}`;

                stmtUpdatePosto.run(sId, pId);
                stmtDelRegional.run(pId);
                if (sId !== 4) {
                    stmtInsRegional.run(pId, sId, usuario);
                }
                stmtInsPlantao.run(pId, usuario);
                stmtHist.run(pId, pNome, sId, sNome, usuario);
            }
        });

        saveTx();

        const total = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo'").get().c;
        const cTingua = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND setor_id = 1").get().c;
        const cGuandu = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND setor_id = 2").get().c;
        const cLaranjal = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND setor_id = 3").get().c;
        const cPlantao = db.prepare("SELECT count(*) as c FROM postos WHERE status = 'ativo' AND (setor_id = 4 OR setor_id IS NULL)").get().c;

        res.json({
            success: true,
            message: '🟢 DISTRIBUIÇÃO SALVA COM SUCESSO',
            total_salvos: alteracoes.length,
            totais: {
                total,
                tingua: cTingua,
                guandu: cGuandu,
                laranjal: cLaranjal,
                plantao: cPlantao,
                plantao_operacional: total
            }
        });
    } catch (error) {
        console.error('Erro ao salvar distribuição:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/postos/distribuicao/em-massa (compatibilidade)
router.post('/distribuicao/em-massa', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { posto_ids, setor_id, acao, usuario_nome } = req.body;
        if (!posto_ids || !Array.isArray(posto_ids) || !setor_id || !acao) {
            return res.status(400).json({ error: 'Parâmetros inválidos para ação em massa.' });
        }

        const sId = parseInt(setor_id);
        const db = getDb();
        const setorNome = getNomeSetor(sId);
        const usuario = (req.user && req.user.nome) || usuario_nome || 'Administrador / Chefia';

        const massTx = db.transaction(() => {
            const stmtUpdatePosto = db.prepare('UPDATE postos SET setor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            const stmtIns = db.prepare(`
                INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel, updated_at)
                VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(posto_id, setor_id) DO UPDATE SET ativo = 1, updated_at = CURRENT_TIMESTAMP
            `);
            const stmtDel = db.prepare('DELETE FROM posto_setor_supervisao WHERE posto_id = ? AND setor_id = ?');
            const stmtHist = db.prepare(`
                INSERT INTO historico_distribuicao_postos (posto_id, posto_nome, setor_id, setor_nome, acao, usuario_nome)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            const postosMap = {};
            db.prepare('SELECT id, nome FROM postos').all().forEach(p => { postosMap[p.id] = p.nome; });

            for (const pid of posto_ids) {
                const pId = parseInt(pid);
                const pNome = postosMap[pId] || `Posto #${pId}`;
                if (acao === 'adicionar') {
                    stmtUpdatePosto.run(sId, pId);
                    stmtIns.run(pId, sId, usuario);
                    stmtHist.run(pId, pNome, sId, setorNome, 'ATRIBUIDO', usuario);
                } else if (acao === 'remover') {
                    stmtUpdatePosto.run(4, pId); // Volta para Plantão se removido
                    stmtDel.run(pId, sId);
                    stmtHist.run(pId, pNome, sId, setorNome, 'REMOVIDO', usuario);
                }
            }
        });

        massTx();

        const countAtual = db.prepare('SELECT count(*) as c FROM posto_setor_supervisao WHERE setor_id = ? AND ativo = 1').get(sId).c;
        res.json({
            success: true,
            message: `Operação em massa concluída com sucesso no setor ${setorNome}!`,
            setor_id: sId,
            total_atribuido: countAtual
        });
    } catch (error) {
        console.error('Erro na ação em massa:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/postos/distribuicao/zerar
router.post('/distribuicao/zerar', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const usuario = (req.user && req.user.nome) || req.body.usuario_nome || 'Administrador / Chefia';

        const resetTx = db.transaction(() => {
            db.prepare('UPDATE postos SET setor_id = 4, updated_at = CURRENT_TIMESTAMP').run();
            db.prepare('DELETE FROM posto_setor_supervisao WHERE setor_id IN (1, 2, 3)').run();
            db.prepare(`
                INSERT INTO historico_distribuicao_postos (posto_id, posto_nome, setor_id, setor_nome, acao, usuario_nome)
                VALUES (0, 'TODOS OS POSTOS REGIONAIS', 4, 'PLANTÃO', 'REINICIADO', ?)
            `).run(usuario);
        });

        resetTx();

        res.json({
            success: true,
            message: 'Distribuição regional reiniciada. Todos os 59 postos retornaram ao Plantão e aguardam classificação.',
            totais: {
                total: 59,
                plantao: 59,
                tingua: 0,
                guandu: 0,
                laranjal: 0,
                plantao_operacional: 59
            }
        });
    } catch (error) {
        console.error('Erro ao zerar distribuição:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/postos/distribuicao/historico
router.get('/distribuicao/historico', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const logs = db.prepare(`
            SELECT id, posto_id, posto_nome, setor_id, setor_nome, acao, usuario_nome,
                   strftime('%d/%m/%Y %H:%M', created_at) as data_hora
            FROM historico_distribuicao_postos
            ORDER BY id DESC
            LIMIT 200
        `).all();
        res.json(logs);
    } catch (error) {
        console.error('Erro ao buscar histórico de distribuição:', error);
        res.status(500).json({ error: error.message });
    }
});

// =========================================================================
// 2. LISTAGEM GERAL DE POSTOS (COM CONTROLE DE ACESSO E SETORES ASSOCIADOS)
// =========================================================================

router.get('/', optionalAuth, (req, res) => {
    try {
        const { setor_id, setor, apenas_ativos } = req.query;
        const db = getDb();

        const requesterParam = setor_id || setor || req.headers['x-setor-id'] || req.headers['x-setor'] || (req.user && req.user.setor_id);
        const effectiveSectorId = normalizeSetorId(requesterParam);

        let sql = `
            SELECT p.*
            FROM postos p
            WHERE 1=1
        `;
        const params = [];

        if (apenas_ativos === 'true') {
            sql += " AND p.status = 'ativo'";
        }

        // Se o solicitante for um setor regional restrito (Tinguá, Guandu, Laranjal)
        if (effectiveSectorId && effectiveSectorId !== 4) {
            sql += ` AND (p.setor_id = ? OR p.id IN (SELECT posto_id FROM posto_setor_supervisao WHERE setor_id = ? AND ativo = 1))`;
            params.push(effectiveSectorId, effectiveSectorId);
        }

        sql += ' ORDER BY p.id ASC';

        const postos = db.prepare(sql).all(...params);

        // Buscar todas as atribuições setoriais para enriquecer a resposta
        const atribuicoes = db.prepare('SELECT posto_id, setor_id FROM posto_setor_supervisao WHERE ativo = 1').all();
        const mapaSetores = {};
        atribuicoes.forEach(a => {
            if (!mapaSetores[a.posto_id]) mapaSetores[a.posto_id] = new Set();
            mapaSetores[a.posto_id].add(a.setor_id);
        });

        const result = postos.map(posto => {
            const setoresDoPosto = mapaSetores[posto.id] || new Set();
            const tingua = posto.setor_id === 1 || setoresDoPosto.has(1);
            const guandu = posto.setor_id === 2 || setoresDoPosto.has(2);
            const laranjal = posto.setor_id === 3 || setoresDoPosto.has(3);
            const plantao = true; // PLANTÃO SEMPRE TEM ACESSO OPERACIONAL AOS 59

            const nomes = [];
            if (tingua) nomes.push('TINGUÁ');
            if (guandu) nomes.push('GUANDU');
            if (laranjal) nomes.push('LARANJAL');
            nomes.push('PLANTÃO');

            const sNome = getNomeSetor(posto.setor_id);

            const ult = db.prepare(`
                SELECT r.data_servico, pr.horario_supervisao, pr.status_supervisao, r.responsavel_nome
                FROM postos_relatorio pr
                JOIN relatorios r ON pr.relatorio_id = r.id
                WHERE pr.posto_id = ? AND (pr.supervisionado = 1 OR pr.supervisionado IS NULL) AND pr.status_supervisao != 'NAO_SUPERVISIONADO'
                ORDER BY r.data_servico DESC, pr.id DESC LIMIT 1
            `).get(posto.id);

            let horas_sem_fiscalizacao = null;
            let dias_sem_fiscalizacao = null;
            let status_vistoria_semanal = 'CRITICO';

            if (ult && ult.data_servico) {
                const diff = db.prepare(`SELECT (julianday('now') - julianday(?)) * 24 as horas`).get(ult.data_servico);
                horas_sem_fiscalizacao = diff ? diff.horas : null;
                dias_sem_fiscalizacao = horas_sem_fiscalizacao !== null ? Math.max(0, Math.floor(horas_sem_fiscalizacao / 24)) : null;
                if (dias_sem_fiscalizacao >= 15) {
                    status_vistoria_semanal = 'CRITICO';
                } else if (dias_sem_fiscalizacao >= 7) {
                    status_vistoria_semanal = 'ATENCAO';
                } else {
                    status_vistoria_semanal = 'EM_DIA';
                }
            }

            return {
                ...posto,
                tingua,
                guandu,
                laranjal,
                plantao,
                setor_nome: sNome,
                setores_nomes: nomes,
                ultima_fiscalizacao: ult ? `${ult.data_servico} ${ult.horario_supervisao || ''}`.trim() : null,
                status_ultima_fiscalizacao: ult ? ult.status_supervisao : 'NUNCA_FISCALIZADO',
                supervisor_ultimo: ult ? ult.responsavel_nome : null,
                horas_sem_fiscalizacao,
                dias_sem_fiscalizacao,
                status_vistoria_semanal
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Erro ao listar postos:', error);
        res.status(500).json({ error: error.message });
    }
});

// =========================================================================
// 3. CONSULTA DE UM POSTO COM BLOQUEIO DE SEGURANÇA
// =========================================================================

router.get('/:id', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const posto = db.prepare('SELECT * FROM postos WHERE id = ?').get(req.params.id);

        if (!posto) return res.status(404).json({ error: 'Posto não encontrado' });

        const setorReq = req.query.setor_id || req.query.setor || req.headers['x-setor-id'] || req.headers['x-setor'] || (req.user && req.user.setor_id);
        const requesterSectorId = normalizeSetorId(setorReq);

        // Bloqueio rigoroso de segurança se não for Plantão nem Admin
        if (requesterSectorId && requesterSectorId !== 4) {
            const autorizado = db.prepare(`
                SELECT 1 FROM posto_setor_supervisao 
                WHERE posto_id = ? AND setor_id = ? AND ativo = 1
            `).get(posto.id, requesterSectorId);

            if (!autorizado && posto.setor_id !== requesterSectorId) {
                const setorSolicitante = db.prepare('SELECT nome FROM setores WHERE id = ?').get(requesterSectorId);
                const setorNome = setorSolicitante ? setorSolicitante.nome : `Setor ${requesterSectorId}`;
                return res.status(403).json({
                    error: `ACESSO NEGADO: O setor ${setorNome} não possui permissão para acessar o posto #${posto.id} ${posto.nome}.`,
                    status: 'ACESSO NEGADO',
                    posto_id: posto.id,
                    posto_nome: posto.nome,
                    setor_solicitante: setorNome
                });
            }
        }

        const setores = db.prepare('SELECT setor_id FROM posto_setor_supervisao WHERE posto_id = ? AND ativo = 1').all(posto.id).map(s => s.setor_id);
        const tingua = posto.setor_id === 1 || setores.includes(1);
        const guandu = posto.setor_id === 2 || setores.includes(2);
        const laranjal = posto.setor_id === 3 || setores.includes(3);

        const nomes = [];
        if (tingua) nomes.push('TINGUÁ');
        if (guandu) nomes.push('GUANDU');
        if (laranjal) nomes.push('LARANJAL');
        nomes.push('PLANTÃO');

        res.json({
            ...posto,
            tingua,
            guandu,
            laranjal,
            plantao: true,
            setor_nome: getNomeSetor(posto.setor_id),
            setores_nomes: nomes
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =========================================================================
// 4. CADASTRO DE NOVO POSTO
// =========================================================================

router.post('/', optionalAuth, (req, res) => {
    try {
        const {
            nome, endereco, empresa, localidade, regiao, setor_id,
            tingua, guandu, laranjal, plantao,
            tipo_posto, latitude, longitude, lat, lng,
            observacoes, status,
            supervisor_id, supervisor_nome,
            viatura_id, viatura_placa
        } = req.body;

        if (!nome || !nome.trim()) {
            return res.status(400).json({ error: 'O nome do posto é obrigatório.' });
        }

        const db = getDb();
        const nomeLimpo = nome.trim().toUpperCase();
        const duplicado = db.prepare('SELECT id, nome, status FROM postos WHERE UPPER(TRIM(nome)) = ?').get(nomeLimpo);
        if (duplicado) {
            return res.status(409).json({ 
                error: `Já existe um posto cadastrado com o nome "${duplicado.nome}" (ID #${duplicado.id}, Status: ${duplicado.status}). Escolha outro nome.` 
            });
        }

        const latVal = latitude !== undefined ? latitude : (lat || null);
        const lngVal = longitude !== undefined ? longitude : (lng || null);
        const usuarioNome = (req.user && req.user.nome) || 'Administrador CCO';

        // Lógica precisa para Setor
        let sId = null;
        if (setor_id !== undefined && setor_id !== null && setor_id !== '' && setor_id !== 'SEM_SETOR') {
            const parsed = parseInt(setor_id);
            if ([1, 2, 3, 4].includes(parsed)) sId = parsed;
        } else if (tingua) {
            sId = 1;
        } else if (guandu) {
            sId = 2;
        } else if (laranjal) {
            sId = 3;
        } else if (plantao) {
            sId = 4;
        }

        // Buscar nome do supervisor se supervisor_id for informado
        let sNome = supervisor_nome || null;
        if (supervisor_id && !sNome) {
            const supObj = db.prepare('SELECT nome FROM supervisores WHERE id = ?').get(supervisor_id);
            if (supObj) sNome = supObj.nome;
        }

        // Buscar placa da viatura se viatura_id for informada
        let vPlaca = viatura_placa || null;
        if (viatura_id && !vPlaca) {
            const vtrObj = db.prepare('SELECT placa FROM viaturas WHERE id = ?').get(viatura_id);
            if (vtrObj) vPlaca = vtrObj.placa;
        }

        const insertTx = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO postos (
                    nome, endereco, empresa, localidade, regiao, setor_id,
                    tipo_posto, latitude, longitude, observacoes,
                    supervisor_id, supervisor_nome, viatura_id, viatura_placa,
                    status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                nome.trim().toUpperCase(),
                endereco ? endereco.trim() : '',
                empresa ? empresa.trim() : 'Segurança Patrimonial',
                localidade ? localidade.trim() : '',
                regiao ? regiao.trim() : '',
                sId,
                tipo_posto || 'Patrimonial',
                latVal,
                lngVal,
                observacoes || '',
                supervisor_id || null,
                sNome,
                viatura_id || null,
                vPlaca,
                status || 'ativo'
            );

            const newId = Number(result.lastInsertRowid);

            // REGRA DO PLANTÃO: Plantão sempre tem acesso operacional aos postos
            db.prepare('INSERT OR IGNORE INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel) VALUES (?, 4, 1, ?)').run(newId, usuarioNome);

            // Se for setor regional (1, 2, 3)
            if (sId && sId !== 4) {
                db.prepare('INSERT OR IGNORE INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel) VALUES (?, ?, 1, ?)').run(newId, sId, usuarioNome);
                db.prepare(`
                    INSERT INTO historico_distribuicao_postos (
                        posto_id, posto_nome, setor_id, setor_nome, acao, usuario_nome
                    ) VALUES (?, ?, ?, ?, 'ATRIBUIDO', ?)
                `).run(newId, nome.trim().toUpperCase(), sId, getNomeSetor(sId), usuarioNome);
            }

            return newId;
        });

        const newId = insertTx();
        res.status(201).json({
            success: true,
            id: newId,
            message: 'Posto cadastrado com sucesso e integrado ao CCO.',
            posto: {
                id: newId,
                nome: nome.trim().toUpperCase(),
                setor_id: sId,
                setor_nome: getNomeSetor(sId),
                status: status || 'ativo'
            }
        });
    } catch (error) {
        console.error('Erro ao cadastrar posto:', error);
        res.status(500).json({ error: error.message });
    }
});

// =========================================================================
// 5. ATUALIZAR POSTO (CADASTRO E SETORES INTEGRADOS)
// =========================================================================

router.put('/:id', optionalAuth, (req, res) => {
    try {
        const {
            nome, endereco, empresa, localidade, regiao, tipo_posto,
            latitude, longitude, lat, lng, observacoes, status,
            tingua, guandu, laranjal, plantao, setor_id,
            supervisor_id, supervisor_nome, viatura_id, viatura_placa
        } = req.body;
        const db = getDb();

        const current = db.prepare('SELECT * FROM postos WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'Posto não encontrado' });

        if (nome && nome.trim()) {
            const nomeLimpo = nome.trim().toUpperCase();
            const duplicado = db.prepare('SELECT id, nome FROM postos WHERE UPPER(TRIM(nome)) = ? AND id != ?').get(nomeLimpo, req.params.id);
            if (duplicado) {
                return res.status(409).json({ 
                    error: `Já existe outro posto cadastrado com o nome "${duplicado.nome}" (ID #${duplicado.id}).` 
                });
            }
        }

        const latVal = latitude !== undefined ? latitude : (lat !== undefined ? lat : current.latitude);
        const lngVal = longitude !== undefined ? longitude : (lng !== undefined ? lng : current.longitude);
        const usuarioNome = (req.user && req.user.nome) || 'Administrador CCO';

        let sIdFinal = current.setor_id;
        if (setor_id !== undefined) {
            if (setor_id === null || setor_id === '' || setor_id === 'SEM_SETOR') {
                sIdFinal = null;
            } else {
                const parsed = parseInt(setor_id);
                sIdFinal = [1, 2, 3, 4].includes(parsed) ? parsed : null;
            }
        } else if (tingua) {
            sIdFinal = 1;
        } else if (guandu) {
            sIdFinal = 2;
        } else if (laranjal) {
            sIdFinal = 3;
        } else if (plantao) {
            sIdFinal = 4;
        }

        // Buscar nomes caso IDs fornecidos
        let sNome = supervisor_nome !== undefined ? supervisor_nome : current.supervisor_nome;
        if (supervisor_id && supervisor_id !== current.supervisor_id && !supervisor_nome) {
            const supObj = db.prepare('SELECT nome FROM supervisores WHERE id = ?').get(supervisor_id);
            if (supObj) sNome = supObj.nome;
        } else if (supervisor_id === null || supervisor_id === '') {
            sNome = null;
        }

        let vPlaca = viatura_placa !== undefined ? viatura_placa : current.viatura_placa;
        if (viatura_id && viatura_id !== current.viatura_id && !viatura_placa) {
            const vtrObj = db.prepare('SELECT placa FROM viaturas WHERE id = ?').get(viatura_id);
            if (vtrObj) vPlaca = vtrObj.placa;
        } else if (viatura_id === null || viatura_id === '') {
            vPlaca = null;
        }

        const updateTx = db.transaction(() => {
            db.prepare(`
                UPDATE postos 
                SET nome = COALESCE(?, nome),
                    endereco = COALESCE(?, endereco),
                    empresa = COALESCE(?, empresa),
                    localidade = COALESCE(?, localidade),
                    regiao = COALESCE(?, regiao),
                    tipo_posto = COALESCE(?, tipo_posto),
                    setor_id = ?,
                    latitude = ?,
                    longitude = ?,
                    observacoes = COALESCE(?, observacoes),
                    supervisor_id = ?,
                    supervisor_nome = ?,
                    viatura_id = ?,
                    viatura_placa = ?,
                    status = COALESCE(?, status),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                nome ? nome.trim().toUpperCase() : current.nome,
                endereco !== undefined ? endereco : current.endereco,
                empresa !== undefined ? empresa : current.empresa,
                localidade !== undefined ? localidade : current.localidade,
                regiao !== undefined ? regiao : current.regiao,
                tipo_posto || current.tipo_posto,
                sIdFinal,
                latVal,
                lngVal,
                observacoes !== undefined ? observacoes : current.observacoes,
                supervisor_id !== undefined ? (supervisor_id || null) : current.supervisor_id,
                sNome,
                viatura_id !== undefined ? (viatura_id || null) : current.viatura_id,
                vPlaca,
                status || current.status,
                req.params.id
            );

            // Atualizar permissões setoriais
            const stmtInsPS = db.prepare('INSERT INTO posto_setor_supervisao (posto_id, setor_id, ativo, usuario_responsavel, updated_at) VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP) ON CONFLICT(posto_id, setor_id) DO UPDATE SET ativo = 1, updated_at = CURRENT_TIMESTAMP');
            const stmtDelPS = db.prepare('DELETE FROM posto_setor_supervisao WHERE posto_id = ? AND setor_id IN (1, 2, 3)');
            const stmtHist = db.prepare('INSERT INTO historico_distribuicao_postos (posto_id, posto_nome, setor_id, setor_nome, acao, usuario_nome) VALUES (?, ?, ?, ?, "ATRIBUIDO", ?)');

            const pNome = nome ? nome.trim().toUpperCase() : current.nome;

            stmtDelPS.run(current.id);
            if (sIdFinal && sIdFinal !== 4) {
                stmtInsPS.run(current.id, sIdFinal, usuarioNome);
                stmtHist.run(current.id, pNome, sIdFinal, getNomeSetor(sIdFinal), usuarioNome);
            }
            // Plantão é sempre mantido ativo
            stmtInsPS.run(current.id, 4, usuarioNome);
        });

        updateTx();

        res.json({ success: true, message: 'Posto atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar posto:', error);
        res.status(500).json({ error: error.message });
    }
});

// Alternar status ativo/inativo
router.put('/:id/status', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const current = db.prepare('SELECT status FROM postos WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'Posto não encontrado' });

        const novoStatus = current.status === 'ativo' ? 'inativo' : 'ativo';
        db.prepare('UPDATE postos SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(novoStatus, req.params.id);

        res.json({ message: `Posto ${novoStatus === 'ativo' ? 'ativado' : 'desativado'} com sucesso`, status: novoStatus });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Exclusão de posto (Admin com confirmação)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const current = db.prepare('SELECT id, nome FROM postos WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'Posto não encontrado' });

        // Verificar se há relatórios associados
        const temRelatorio = db.prepare('SELECT 1 FROM postos_relatorio WHERE posto_id = ? LIMIT 1').get(req.params.id);
        if (temRelatorio) {
            db.prepare("UPDATE postos SET status = 'inativo', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
            return res.json({
                message: `O posto "${current.nome}" possui fiscalizações e relatórios registrados. Ele foi marcado como INATIVO para preservar a integridade histórica.`,
                status: 'inativo'
            });
        }

        const deleteTx = db.transaction(() => {
            db.prepare('DELETE FROM posto_setor_supervisao WHERE posto_id = ?').run(req.params.id);
            db.prepare('DELETE FROM postos WHERE id = ?').run(req.params.id);
        });

        deleteTx();

        res.json({ message: `Posto "${current.nome}" excluído com sucesso.` });
    } catch (error) {
        console.error('Erro ao excluir posto:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
