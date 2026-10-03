const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

const app = express();
app.use(express.json());

// Montar rotas necessárias
app.use('/api/v1/formulario', require('../routes/formulario.routes'));
app.use('/api/v1/plantoes', require('../routes/plantoes.routes'));
app.use('/api/v1/relatorios', require('../routes/relatorios.routes'));

const JWT_SECRET = process.env.JWT_SECRET || 'cco-secret-key-change-in-production-2026';
const adminToken = jwt.sign(
    { id: 1, nome: 'ADMIN TESTE', email: 'admin@cedae.gov.br', perfil: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
);
const fiscalToken = jwt.sign(
    { id: 10, nome: 'FISCAL TESTE', email: 'fiscal@cedae.gov.br', perfil: 'supervisor', setor_id: 1 },
    JWT_SECRET,
    { expiresIn: '1h' }
);

function makeRequest(serverUrl, method, path, body = null, token = adminToken) {
    return new Promise((resolve, reject) => {
        const url = new URL(serverUrl + path);
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (body) headers['Content-Type'] = 'application/json';

        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTestSuite() {
    console.log('================================================================');
    console.log('🧪 BATERIA DE TESTES: CORREÇÃO DO BOTÃO ENVIAR & EXCLUSÃO SEGURA');
    console.log('================================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(cond, desc) {
        if (cond) {
            console.log(`✅ [PASS] ${desc}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${desc}`);
            failed++;
        }
    }

    const server = app.listen(0);
    const port = server.address().port;
    const serverUrl = `http://127.0.0.1:${port}`;

    try {
        const db = getDb();

        // -------------------------------------------------------------
        // TESTE 1: PRESERVAÇÃO INTEGRAL DE DADOS DESDE 01/10/2026
        // -------------------------------------------------------------
        console.log('\n--- 1. PRESERVAÇÃO DE DADOS HISTÓRICOS (01/10/2026) ---');
        const count01 = db.prepare("SELECT COUNT(*) as t FROM relatorios WHERE data_servico = '2026-10-01'").get();
        assert(count01.t >= 3, `Relatórios de 01/10 preservados intactos (${count01.t} registros)`);

        const countTotal = db.prepare("SELECT COUNT(*) as t FROM relatorios").get();
        assert(countTotal.t > 0, `Banco central possui ${countTotal.t} relatórios no total`);

        // -------------------------------------------------------------
        // TESTE 2: CONSULTA DE QUOTA / NÃO BLOQUEIO DO FISCAL
        // -------------------------------------------------------------
        console.log('\n--- 2. VERIFICAÇÃO DE DESBLOQUEIO DE QUOTA ---');
        const resQuota = await makeRequest(serverUrl, 'GET', '/api/v1/formulario/quota?data_servico=2026-10-03&supervisor_id=5', null, fiscalToken);
        assert(resQuota.status === 200, 'GET /formulario/quota retorna 200 OK');
        assert(resQuota.body.bloqueado === false, 'Fiscal NÃO é bloqueado pela quota (bloqueado === false)');
        assert(typeof resQuota.body.label === 'string', `Label de cota informativa presente: "${resQuota.body.label}"`);

        // -------------------------------------------------------------
        // TESTE 3: SEPARAÇÃO SALVAR (EM ABERTO) ≠ ENVIAR (CONCLUIDO)
        // -------------------------------------------------------------
        console.log('\n--- 3. TESTE DE SALVAMENTO DE PROGRESSO (EM ABERTO) ---');
        const payloadSalvar = {
            setor_id: 1,
            supervisor_id: 5,
            data_servico: '2026-10-04',
            turno: 'DIURNO',
            km_inicial: 100,
            responsavel_nome: 'JASON',
            postos_supervisionados: [
                {
                    slot: 1,
                    posto_id: 1,
                    posto_nome: 'ETA TINGUÁ',
                    supervisionado: 1,
                    status_supervisao: 'NORMAL',
                    horario_supervisao: '09:00',
                    km_posto: 105,
                    efetivo_completo: 1
                }
            ]
        };

        const resSalvar = await makeRequest(serverUrl, 'POST', '/api/v1/formulario/salvar', payloadSalvar, fiscalToken);
        assert(resSalvar.status === 200 || resSalvar.status === 201, 'POST /formulario/salvar responde 200/201');
        assert(resSalvar.body.status === 'em_aberto', 'Relatório salvo possui status="em_aberto" (não altera consolidados)');
        const idSalvo = resSalvar.body.id;

        // -------------------------------------------------------------
        // TESTE 4: SUBMISSÃO FINAL (ENVIAR RELATÓRIO)
        // -------------------------------------------------------------
        console.log('\n--- 4. TESTE DE ENVIO FINAL DO RELATÓRIO ---');
        const payloadEnviar = {
            relatorio_id: idSalvo,
            setor_id: 1,
            supervisor_id: 5,
            data_servico: '2026-10-04',
            turno: 'DIURNO',
            km_inicial: 100,
            km_final: 150,
            responsavel_nome: 'JASON',
            postos_supervisionados: [
                {
                    slot: 1,
                    posto_id: 1,
                    posto_nome: 'ETA TINGUÁ',
                    supervisionado: 1,
                    status_supervisao: 'NORMAL',
                    horario_supervisao: '09:00',
                    km_posto: 105,
                    efetivo_completo: 1
                },
                {
                    slot: 2,
                    posto_id: 2,
                    posto_nome: 'RESERVATÓRIO CABOCLO',
                    supervisionado: 1,
                    status_supervisao: 'NORMAL',
                    horario_supervisao: '10:30',
                    km_posto: 120,
                    efetivo_completo: 1
                }
            ],
            ocorrencias: []
        };

        const resEnviar = await makeRequest(serverUrl, 'POST', '/api/v1/formulario/enviar', payloadEnviar, fiscalToken);
        assert(resEnviar.status === 201, 'POST /formulario/enviar retorna HTTP 201 Created');
        assert(resEnviar.body.status === 'concluido', 'Status é promovido a "concluido"');
        assert(resEnviar.body.message === '✅ RELATÓRIO ENVIADO COM SUCESSO', 'Mensagem de retorno é "✅ RELATÓRIO ENVIADO COM SUCESSO"');
        assert(resEnviar.body.quota && resEnviar.body.quota.bloqueado === false, 'Quota de envio mantém bloqueado: false');

        // Testar múltiplos envios no mesmo dia para confirmar que NÃO HÁ 429
        console.log('\n--- 5. TESTE DE NÃO-BLOQUEIO EM ENVIOS SUBSEQUENTES ---');
        const payloadSegundoEnvio = {
            setor_id: 1,
            supervisor_id: 5,
            data_servico: '2026-10-04',
            turno: 'NOTURNO',
            km_inicial: 150,
            km_final: 180,
            responsavel_nome: 'JASON',
            postos_supervisionados: [
                {
                    slot: 1,
                    posto_id: 1,
                    posto_nome: 'ETA TINGUÁ',
                    supervisionado: 1,
                    status_supervisao: 'NORMAL',
                    horario_supervisao: '21:00',
                    km_posto: 160,
                    efetivo_completo: 1
                }
            ],
            ocorrencias: []
        };
        const resSegundoEnvio = await makeRequest(serverUrl, 'POST', '/api/v1/formulario/enviar', payloadSegundoEnvio, fiscalToken);
        assert(resSegundoEnvio.status === 201, 'Segundo envio para a mesma data processa com sucesso (SEM erro 429)');
        const idSegundoEnvio = resSegundoEnvio.body.id;

        // -------------------------------------------------------------
        // TESTE 6: EXCLUSÃO SEGURA DE RELATÓRIO (DELETE /api/v1/plantoes/:id)
        // -------------------------------------------------------------
        console.log('\n--- 6. TESTE DE EXCLUSÃO SEGURA E LIBERAÇÃO DO FISCAL ---');
        const resDelete = await makeRequest(serverUrl, 'DELETE', `/api/v1/plantoes/${idSegundoEnvio}`, null, adminToken);
        assert(resDelete.status === 200, 'DELETE /api/v1/plantoes/:id retorna HTTP 200');
        assert(resDelete.body.success === true, 'DELETE retorna success: true');
        assert(resDelete.body.relatorio_excluido && resDelete.body.relatorio_excluido.id === idSegundoEnvio, 'Metadados do relatório excluído retornados corretamente');

        // Confirmar que o relatório e seus postos foram removidos
        const checkRel = db.prepare('SELECT id FROM relatorios WHERE id = ?').get(idSegundoEnvio);
        assert(!checkRel, 'Relatório removido limpo do banco de dados');
        const checkPostos = db.prepare('SELECT COUNT(*) as t FROM postos_relatorio WHERE relatorio_id = ?').get(idSegundoEnvio);
        assert(checkPostos.t === 0, 'Postos associados removidos em cascata sem deixar órfãos');

        // Confirmar log de auditoria da exclusão
        const checkAudit = db.prepare("SELECT * FROM auditoria_log WHERE tabela = 'relatorios' AND registro_id = ? AND acao = 'DELETE'").get(idSegundoEnvio);
        assert(!!checkAudit, 'Ação de DELETE gravada em auditoria_log com metadados anteriores');

        // Limpar também o primeiro relatório criado para o teste 2026-10-04
        await makeRequest(serverUrl, 'DELETE', `/api/v1/plantoes/${idSalvo}`, null, adminToken);

    } catch (err) {
        console.error('❌ ERRO CRÍTICO NA EXECUÇÃO DOS TESTES:', err);
        failed++;
    } finally {
        server.close();
    }

    console.log('\n================================================================');
    console.log(`📊 RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
    console.log('================================================================');

    if (failed > 0) process.exit(1);
}

runTestSuite();
