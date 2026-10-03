const { Client } = require('pg');
const { getDb } = require('../database/db');

function getConnectionString() {
    return process.env.DATABASE_URL || 
           process.env.SUPABASE_DB_URL || 
           'postgresql://postgres:GjbOn7qwzEAsxKn7@db.pdfgbhbtsyjykkguznik.supabase.co:5432/postgres';
}

function getPgClient() {
    const connStr = getConnectionString();
    if (!connStr) return null;
    return new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false }
    });
}

/**
 * Sincroniza dados do Supabase para o SQLite local na inicialização do servidor.
 * Garante que reinicializações do Render tragam todos os relatórios da nuvem em segundos.
 */
async function syncFromSupabaseOnStartup() {
    const client = getPgClient();
    if (!client) {
        console.log('ℹ️ Supabase: DATABASE_URL não configurada. Operando somente local.');
        return;
    }

    try {
        await client.connect();
        console.log('☁️ [SUPABASE] Conectado! Sincronizando dados da nuvem para o SQLite local...');

        const db = getDb();

        // 1. Sincronizar Relatórios da Nuvem
        const resRels = await client.query('SELECT * FROM relatorios ORDER BY id ASC');
        if (resRels.rows && resRels.rows.length > 0) {
            const stmtRel = db.prepare(`
                INSERT INTO relatorios (
                    id, setor_id, supervisor_id, viatura_id, viatura_outros_texto,
                    data_servico, turno, km_inicial, km_final, km_rodado,
                    responsavel_nome, observacoes_gerais, providencias_gerais, pendencias_gerais,
                    status, client_uuid, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    km_final = excluded.km_final,
                    km_rodado = excluded.km_rodado,
                    observacoes_gerais = excluded.observacoes_gerais,
                    providencias_gerais = excluded.providencias_gerais,
                    pendencias_gerais = excluded.pendencias_gerais
            `);

            for (const r of resRels.rows) {
                let dtServico = r.data_servico;
                if (dtServico instanceof Date) {
                    dtServico = dtServico.toISOString().split('T')[0];
                }
                stmtRel.run(
                    r.id,
                    r.setor_id,
                    r.supervisor_id,
                    r.viatura_id,
                    r.viatura_outros_texto,
                    dtServico,
                    r.turno,
                    r.km_inicial,
                    r.km_final,
                    r.km_rodado,
                    r.responsavel_nome,
                    r.observacoes_gerais,
                    r.providencias_gerais,
                    r.pendencias_gerais,
                    r.status,
                    r.client_uuid,
                    r.created_at ? new Date(r.created_at).toISOString() : null
                );
            }
            console.log(`☁️ [SUPABASE] ${resRels.rows.length} relatórios sincronizados para o banco local.`);
        }

        // 2. Sincronizar Postos_Relatorio da Nuvem
        const resPostosRel = await client.query('SELECT * FROM postos_relatorio ORDER BY id ASC');
        if (resPostosRel.rows && resPostosRel.rows.length > 0) {
            const stmtPr = db.prepare(`
                INSERT INTO postos_relatorio (
                    id, relatorio_id, posto_id, nome_posto_digitado, horario_supervisao,
                    situacao_encontrada, efetivo_presente, status_supervisao, supervisionado,
                    motivo_nao_supervisao, km_posto, efetivo_completo, falta_efetivo_qtd,
                    tem_ocorrencia, descricao_ocorrencia, observacao, endereco, localidade,
                    empresa, setor_id_posto, setor_nome_posto
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    horario_supervisao = excluded.horario_supervisao,
                    situacao_encontrada = excluded.situacao_encontrada,
                    status_supervisao = excluded.status_supervisao,
                    supervisionado = excluded.supervisionado,
                    motivo_nao_supervisao = excluded.motivo_nao_supervisao,
                    km_posto = excluded.km_posto,
                    efetivo_completo = excluded.efetivo_completo,
                    falta_efetivo_qtd = excluded.falta_efetivo_qtd,
                    tem_ocorrencia = excluded.tem_ocorrencia,
                    descricao_ocorrencia = excluded.descricao_ocorrencia,
                    observacao = excluded.observacao
            `);

            for (const pr of resPostosRel.rows) {
                stmtPr.run(
                    pr.id,
                    pr.relatorio_id,
                    pr.posto_id,
                    pr.nome_posto_digitado,
                    pr.horario_supervisao,
                    pr.situacao_encontrada,
                    pr.efetivo_presente,
                    pr.status_supervisao,
                    pr.supervisionado,
                    pr.motivo_nao_supervisao,
                    pr.km_posto,
                    pr.efetivo_completo,
                    pr.falta_efetivo_qtd,
                    pr.tem_ocorrencia,
                    pr.descricao_ocorrencia,
                    pr.observacao,
                    pr.endereco,
                    pr.localidade,
                    pr.empresa,
                    pr.setor_id_posto,
                    pr.setor_nome_posto
                );
            }
            console.log(`☁️ [SUPABASE] ${resPostosRel.rows.length} fiscalizações sincronizadas para o banco local.`);
        }

        await client.end();
        console.log('✅ [SUPABASE] Sincronização inicial concluída com sucesso!');
    } catch (err) {
        console.warn('⚠️ [SUPABASE] Falha na sincronização inicial:', err.message);
        try { await client.end(); } catch (_) {}
    }
}

/**
 * Envia um relatório (e seus postos) imediatamente para o Supabase em segundo plano.
 * Chamado logo após POST /salvar e POST /enviar.
 */
async function pushRelatorioToSupabase(relatorioId) {
    if (!relatorioId) return;
    const client = getPgClient();
    if (!client) return;

    try {
        const db = getDb();
        const r = db.prepare('SELECT * FROM relatorios WHERE id = ?').get(relatorioId);
        if (!r) return;

        const postos = db.prepare('SELECT * FROM postos_relatorio WHERE relatorio_id = ?').all(relatorioId);
        const ocorrencias = db.prepare('SELECT * FROM ocorrencias WHERE relatorio_id = ?').all(relatorioId);

        await client.connect();

        let dtServico = r.data_servico;
        if (dtServico instanceof Date) {
            dtServico = dtServico.toISOString().split('T')[0];
        }

        await client.query(`
            INSERT INTO relatorios (
                id, setor_id, supervisor_id, viatura_id, viatura_outros_texto,
                data_servico, turno, km_inicial, km_final, km_rodado,
                responsavel_nome, observacoes_gerais, providencias_gerais, pendencias_gerais,
                status, client_uuid, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (id) DO UPDATE SET
                setor_id = EXCLUDED.setor_id,
                supervisor_id = EXCLUDED.supervisor_id,
                viatura_id = EXCLUDED.viatura_id,
                viatura_outros_texto = EXCLUDED.viatura_outros_texto,
                data_servico = EXCLUDED.data_servico,
                turno = EXCLUDED.turno,
                km_inicial = EXCLUDED.km_inicial,
                km_final = EXCLUDED.km_final,
                km_rodado = EXCLUDED.km_rodado,
                responsavel_nome = EXCLUDED.responsavel_nome,
                observacoes_gerais = EXCLUDED.observacoes_gerais,
                providencias_gerais = EXCLUDED.providencias_gerais,
                pendencias_gerais = EXCLUDED.pendencias_gerais,
                status = EXCLUDED.status
        `, [
            r.id, r.setor_id, r.supervisor_id, r.viatura_id, r.viatura_outros_texto,
            dtServico, r.turno, r.km_inicial, r.km_final, r.km_rodado,
            r.responsavel_nome, r.observacoes_gerais, r.providencias_gerais, r.pendencias_gerais,
            r.status, r.client_uuid, r.created_at || new Date().toISOString()
        ]);

        await client.query("SELECT setval('relatorios_id_seq', COALESCE((SELECT MAX(id) FROM relatorios), 1))");

        await client.query('DELETE FROM postos_relatorio WHERE relatorio_id = $1', [r.id]);
        for (const pr of postos) {
            await client.query(`
                INSERT INTO postos_relatorio (
                    id, relatorio_id, posto_id, nome_posto_digitado, horario_supervisao,
                    situacao_encontrada, efetivo_presente, status_supervisao, supervisionado,
                    motivo_nao_supervisao, km_posto, efetivo_completo, falta_efetivo_qtd,
                    tem_ocorrencia, descricao_ocorrencia, observacao, endereco, localidade,
                    empresa, setor_id_posto, setor_nome_posto
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                ON CONFLICT (id) DO UPDATE SET
                    horario_supervisao = EXCLUDED.horario_supervisao,
                    situacao_encontrada = EXCLUDED.situacao_encontrada,
                    status_supervisao = EXCLUDED.status_supervisao,
                    supervisionado = EXCLUDED.supervisionado
            `, [
                pr.id, pr.relatorio_id, pr.posto_id, pr.nome_posto_digitado, pr.horario_supervisao,
                pr.situacao_encontrada, pr.efetivo_presente, pr.status_supervisao, pr.supervisionado,
                pr.motivo_nao_supervisao, pr.km_posto, pr.efetivo_completo, pr.falta_efetivo_qtd,
                pr.tem_ocorrencia, pr.descricao_ocorrencia, pr.observacao, pr.endereco, pr.localidade,
                pr.empresa, pr.setor_id_posto, pr.setor_nome_posto
            ]);
        }
        await client.query("SELECT setval('postos_relatorio_id_seq', COALESCE((SELECT MAX(id) FROM postos_relatorio), 1))");

        await client.end();
        console.log(`☁️ [SUPABASE] Relatório #${relatorioId} sincronizado na nuvem com sucesso!`);
    } catch (err) {
        console.warn(`⚠️ [SUPABASE] Erro ao sincronizar relatório #${relatorioId}:`, err.message);
        try { await client.end(); } catch (_) {}
    }
}

/**
 * Sincroniza periodicamente todos os relatórios do SQLite para o Supabase
 * garantindo redundância total e resiliência contra qualquer falha de rede transitória.
 */
async function syncAllLocalToSupabase() {
    const client = getPgClient();
    if (!client) return;

    try {
        const db = getDb();
        const rels = db.prepare('SELECT id FROM relatorios').all();
        if (!rels || rels.length === 0) return;

        await client.connect();

        for (const rel of rels) {
            const r = db.prepare('SELECT * FROM relatorios WHERE id = ?').get(rel.id);
            if (!r) continue;
            const postos = db.prepare('SELECT * FROM postos_relatorio WHERE relatorio_id = ?').all(rel.id);

            let dtServico = r.data_servico;
            if (dtServico instanceof Date) {
                dtServico = dtServico.toISOString().split('T')[0];
            }

            await client.query(`
                INSERT INTO relatorios (
                    id, setor_id, supervisor_id, viatura_id, viatura_outros_texto,
                    data_servico, turno, km_inicial, km_final, km_rodado,
                    responsavel_nome, observacoes_gerais, providencias_gerais, pendencias_gerais,
                    status, client_uuid, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                ON CONFLICT (id) DO UPDATE SET
                    setor_id = EXCLUDED.setor_id,
                    supervisor_id = EXCLUDED.supervisor_id,
                    viatura_id = EXCLUDED.viatura_id,
                    viatura_outros_texto = EXCLUDED.viatura_outros_texto,
                    data_servico = EXCLUDED.data_servico,
                    turno = EXCLUDED.turno,
                    km_inicial = EXCLUDED.km_inicial,
                    km_final = EXCLUDED.km_final,
                    km_rodado = EXCLUDED.km_rodado,
                    responsavel_nome = EXCLUDED.responsavel_nome,
                    observacoes_gerais = EXCLUDED.observacoes_gerais,
                    providencias_gerais = EXCLUDED.providencias_gerais,
                    pendencias_gerais = EXCLUDED.pendencias_gerais,
                    status = EXCLUDED.status
            `, [
                r.id, r.setor_id, r.supervisor_id, r.viatura_id, r.viatura_outros_texto,
                dtServico, r.turno, r.km_inicial, r.km_final, r.km_rodado,
                r.responsavel_nome, r.observacoes_gerais, r.providencias_gerais, r.pendencias_gerais,
                r.status, r.client_uuid, r.created_at || new Date().toISOString()
            ]);

            await client.query('DELETE FROM postos_relatorio WHERE relatorio_id = $1', [r.id]);
            for (const pr of postos) {
                await client.query(`
                    INSERT INTO postos_relatorio (
                        id, relatorio_id, posto_id, nome_posto_digitado, horario_supervisao,
                        situacao_encontrada, efetivo_presente, status_supervisao, supervisionado,
                        motivo_nao_supervisao, km_posto, efetivo_completo, falta_efetivo_qtd,
                        tem_ocorrencia, descricao_ocorrencia, observacao, endereco, localidade,
                        empresa, setor_id_posto, setor_nome_posto
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                    ON CONFLICT (id) DO UPDATE SET
                        horario_supervisao = EXCLUDED.horario_supervisao,
                        situacao_encontrada = EXCLUDED.situacao_encontrada,
                        status_supervisao = EXCLUDED.status_supervisao,
                        supervisionado = EXCLUDED.supervisionado
                `, [
                    pr.id, pr.relatorio_id, pr.posto_id, pr.nome_posto_digitado, pr.horario_supervisao,
                    pr.situacao_encontrada, pr.efetivo_presente, pr.status_supervisao, pr.supervisionado,
                    pr.motivo_nao_supervisao, pr.km_posto, pr.efetivo_completo, pr.falta_efetivo_qtd,
                    pr.tem_ocorrencia, pr.descricao_ocorrencia, pr.observacao, pr.endereco, pr.localidade,
                    pr.empresa, pr.setor_id_posto, pr.setor_nome_posto
                ]);
            }
        }
        await client.query("SELECT setval('relatorios_id_seq', COALESCE((SELECT MAX(id) FROM relatorios), 1))");
        await client.query("SELECT setval('postos_relatorio_id_seq', COALESCE((SELECT MAX(id) FROM postos_relatorio), 1))");
        await client.end();
        console.log(`☁️ [SUPABASE] Sync periódico: ${rels.length} relatórios sincronizados.`);
    } catch (err) {
        console.warn('⚠️ [SUPABASE] Falha no sync periódico:', err.message);
        try { await client.end(); } catch (_) {}
    }
}

module.exports = {
    syncFromSupabaseOnStartup,
    pushRelatorioToSupabase,
    syncAllLocalToSupabase,
    getConnectionString
};
