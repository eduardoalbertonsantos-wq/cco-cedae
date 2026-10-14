const http = require('http');
const express = require('express');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/v1/plantoes', require('../routes/plantoes.routes'));
app.use('/api/v1/relatorios', require('../routes/relatorios.routes'));

const JWT_SECRET = process.env.JWT_SECRET || 'cco-secret-key-change-in-production-2026';

function makeRequest(serverUrl, method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, serverUrl);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const req = http.request(url, { method, headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
                resolve({ status: res.statusCode, body: parsed });
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTest() {
    console.log('================================================================');
    console.log('🧪 BATERIA DE TESTES: ATIVAÇÃO DA EXCLUSÃO MANUAL DE RELATÓRIOS');
    console.log('================================================================\n');

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const serverUrl = `http://localhost:${port}`;
    const db = getDb();
    let passed = 0;

    try {
        // 1. Criar um relatório sintético para teste de exclusão manual
        const insertRel = db.prepare(`
            INSERT INTO relatorios (setor_id, data_servico, turno, responsavel_nome, status)
            VALUES (1, '2026-10-14', 'DIURNO', 'FISCAL TESTE MANUAL', 'concluido')
        `).run();
        const testRelId = insertRel.lastInsertRowid;
        console.log(`✓ Relatório de teste criado: #${testRelId}`);

        // Inserir postos_relatorio e ocorrencia para este relatório
        db.prepare(`
            INSERT INTO postos_relatorio (relatorio_id, posto_id, nome_posto_digitado, situacao_encontrada, supervisionado, status_supervisao)
            VALUES (?, 1, 'BARRELÃO', 'Normal', 1, 'NORMAL')
        `).run(testRelId);
        db.prepare(`
            INSERT INTO ocorrencias (relatorio_id, posto_id, descricao)
            VALUES (?, 1, 'Ocorrência teste de exclusão')
        `).run(testRelId);

        // 2. Testar exclusão manual como DIRETORIA
        const tokenDiretoria = jwt.sign(
            { id: 8, nome: 'DIRETORIA CEDAE', email: 'diretoria@cedae.gov.br', perfil: 'admin' },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        console.log('\n--- 1. TESTE DE EXCLUSÃO MANUAL POR DIRETORIA ---');
        const resDelete = await makeRequest(serverUrl, 'DELETE', `/api/v1/plantoes/${testRelId}`, null, tokenDiretoria);
        assert.strictEqual(resDelete.status, 200, 'DELETE /api/v1/plantoes/:id deve responder HTTP 200');
        passed++;
        console.log('✅ [PASS] DELETE /api/v1/plantoes/:id como Diretoria responde HTTP 200');

        assert.strictEqual(resDelete.body.success, true, 'Corpo da resposta deve conter success: true');
        passed++;
        console.log('✅ [PASS] Retorno da exclusão possui success: true');

        assert.strictEqual(resDelete.body.relatorio_excluido.id, testRelId, 'ID do relatório excluído deve bater');
        passed++;
        console.log('✅ [PASS] Metadados do relatório excluído retornados corretamente');

        // 3. Verificar se o registro foi removido do banco
        const checkRel = db.prepare('SELECT id FROM relatorios WHERE id = ?').get(testRelId);
        assert.strictEqual(checkRel, undefined, 'Relatório deve ser excluído do banco');
        passed++;
        console.log('✅ [PASS] Relatório removido limpo da tabela relatorios');

        const checkPostos = db.prepare('SELECT COUNT(*) as c FROM postos_relatorio WHERE relatorio_id = ?').get(testRelId);
        assert.strictEqual(checkPostos.c, 0, 'Postos do relatório devem ser excluídos');
        passed++;
        console.log('✅ [PASS] Postos vinculados removidos em cascata');

        const checkOcorrencias = db.prepare('SELECT COUNT(*) as c FROM ocorrencias WHERE relatorio_id = ?').get(testRelId);
        assert.strictEqual(checkOcorrencias.c, 0, 'Ocorrências do relatório devem ser excluídas');
        passed++;
        console.log('✅ [PASS] Ocorrências vinculadas removidas em cascata');

        // 4. Testar exclusão sem token (Operador no terminal do CCO)
        console.log('\n--- 2. TESTE DE EXCLUSÃO MANUAL SEM TOKEN (TERMINAL LOCAL CCO) ---');
        const insertRel2 = db.prepare(`
            INSERT INTO relatorios (setor_id, data_servico, turno, responsavel_nome, status)
            VALUES (2, '2026-10-14', 'DIURNO', 'FISCAL TESTE OPERADOR', 'concluido')
        `).run();
        const testRelId2 = insertRel2.lastInsertRowid;
        console.log(`✓ Segundo relatório de teste criado: #${testRelId2}`);

        const resDelete2 = await makeRequest(serverUrl, 'DELETE', `/api/v1/plantoes/${testRelId2}`);
        assert.strictEqual(resDelete2.status, 200, 'DELETE sem token deve responder HTTP 200');
        passed++;
        console.log('✅ [PASS] Exclusão sem token autenticado processa com sucesso');

        assert.strictEqual(resDelete2.body.success, true, 'Deve excluir com sucesso');
        passed++;
        console.log('✅ [PASS] Retorno da exclusão de terminal possui success: true');

        const checkRel2 = db.prepare('SELECT id FROM relatorios WHERE id = ?').get(testRelId2);
        assert.strictEqual(checkRel2, undefined, 'Segundo relatório deve ser excluído');
        passed++;
        console.log('✅ [PASS] Segundo relatório removido limpo do banco');

        // 5. Testar exclusão via alias em relatorios.routes.js (/api/v1/relatorios/:id)
        console.log('\n--- 3. TESTE DE EXCLUSÃO VIA ROTA ALIAS (/api/v1/relatorios/:id) ---');
        const insertRel3 = db.prepare(`
            INSERT INTO relatorios (setor_id, data_servico, turno, responsavel_nome, status)
            VALUES (3, '2026-10-14', 'NOTURNO', 'FISCAL TESTE ALIAS', 'em_aberto')
        `).run();
        const testRelId3 = insertRel3.lastInsertRowid;

        const resDelete3 = await makeRequest(serverUrl, 'DELETE', `/api/v1/relatorios/${testRelId3}`, null, tokenDiretoria);
        assert.strictEqual(resDelete3.status, 200, 'DELETE /api/v1/relatorios/:id deve responder HTTP 200');
        passed++;
        console.log('✅ [PASS] DELETE /api/v1/relatorios/:id com token responde HTTP 200');

        const checkRel3 = db.prepare('SELECT id FROM relatorios WHERE id = ?').get(testRelId3);
        assert.strictEqual(checkRel3, undefined, 'Relatório alias deve ser excluído');
        passed++;
        console.log('✅ [PASS] Relatório alias removido limpo do banco');

        console.log('\n================================================================');
        console.log(`📊 RESULTADO FINAL: ${passed} PASSOU | 0 FALHOU`);
        console.log('================================================================');
    } finally {
        server.close();
    }
}

runTest().catch(err => {
    console.error('❌ Falha no teste:', err);
    process.exit(1);
});
