/* =========================================================================
   CCO — BATERIA DE TESTES: PREENCHIMENTO EM TEMPO REAL
   Aplicativo -> Painel de Controle -> Painel da Diretoria
   ========================================================================= */

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

const app = express();
app.use(express.json());

// Montar rotas necessárias
app.use('/api/v1/formulario', require('../routes/formulario.routes'));
app.use('/api/v1/dashboard', require('../routes/dashboard.routes'));
app.use('/api/v1/diretoria', require('../routes/diretoria.routes'));
app.use('/api/v1/plantoes', require('../routes/plantoes.routes'));
const { subscribeRealtime } = require('../services/realtime.service');
app.get('/api/v1/realtime/stream', subscribeRealtime);

const JWT_SECRET = process.env.JWT_SECRET || 'cco-secret-key-change-in-production-2026';
const adminToken = jwt.sign(
    { id: 1, nome: 'ADMIN TESTE', email: 'admin@cedae.gov.br', perfil: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

let server;
let port;
const db = getDb();

function makeRequest(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: '127.0.0.1',
            port: port,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch (_) {
                    json = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: json });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runRealtimeSuite() {
    console.log('================================================================');
    console.log('🧪 BATERIA DE TESTES: PREENCHIMENTO EM TEMPO REAL CCO');
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

    try {
        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                port = server.address().port;
                resolve();
            });
        });

        // 1. Validar Token de Admin
        assert(!!adminToken, 'Token de autenticação administrativo gerado com sucesso');

        // 2. Testar Endpoint SSE
        console.log('\n--- 1. CONEXÃO SERVER-SENT EVENTS (SSE) ---');
        await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: port,
                path: '/api/v1/realtime/stream',
                method: 'GET'
            }, (res) => {
                assert(res.statusCode === 200, 'GET /api/v1/realtime/stream retorna HTTP 200');
                assert(res.headers['content-type'] === 'text/event-stream', 'Header Content-Type é text/event-stream');
                assert(res.headers['cache-control'] && res.headers['cache-control'].includes('no-cache'), 'Header Cache-Control contém no-cache');
                
                res.on('data', (chunk) => {
                    const str = chunk.toString();
                    if (str.includes('CONECTADO') || str.includes('data:')) {
                        assert(true, 'Mensagem inicial SSE recebida com sucesso');
                        req.destroy();
                        resolve();
                    }
                });
            });
            req.on('error', (err) => {
                if (err.code === 'ECONNRESET' || req.destroyed) resolve();
                else reject(err);
            });
            req.end();
        });

        // 3. Teste de Salvamento Parcial (SALVAR != ENVIAR)
        console.log('\n--- 2. FISCAL PREENCHENDO (SALVAR EM ABERTO) ---');
        const testUuid = 'realtime-test-' + Date.now();
        const testDate = '2026-10-03';

        const saveRes = await makeRequest('POST', '/api/v1/formulario/salvar', {
            client_uuid: testUuid,
            data_servico: testDate,
            setor_id: 1, // Tinguá
            supervisor_id: 1,
            turno: 'DIURNO',
            km_inicial: 100,
            km_final: 120,
            responsavel_nome: 'FISCAL TESTE REALTIME',
            postos: [
                {
                    posto_id: 1,
                    supervisionado: true,
                    status_supervisao: 'SUPERVISIONADO',
                    horario_supervisao: '09:30',
                    condicao: 'NORMAL',
                    efetivo_previsto: 2,
                    efetivo_real: 2
                },
                {
                    posto_id: 2,
                    supervisionado: true,
                    status_supervisao: 'SUPERVISIONADO',
                    horario_supervisao: '10:15',
                    condicao: 'NORMAL',
                    efetivo_previsto: 1,
                    efetivo_real: 1
                }
            ]
        }, adminToken);

        assert(saveRes.status === 200 || saveRes.status === 201, 'POST /formulario/salvar processa com sucesso');
        const relId = saveRes.body?.relatorio_id || saveRes.body?.id;
        assert(!!relId, `Relatório temporário gerado com ID #${relId}`);

        const relDb = db.prepare('SELECT status FROM relatorios WHERE id = ?').get(relId);
        assert(relDb.status === 'em_aberto', 'Relatório possui status "em_aberto" (não considerado concluído)');

        // 4. Teste Painel de Controle (Dashboard Stats)
        console.log('\n--- 3. PAINEL DE CONTROLE REFLETINDO EM TEMPO REAL ---');
        const dashRes = await makeRequest('GET', `/api/v1/dashboard/stats?data_inicio=${testDate}&data_fim=${testDate}`, null, adminToken);
        assert(dashRes.status === 200, 'GET /dashboard/stats retorna HTTP 200');
        
        const fiscaisDash = dashRes.body.fiscais_em_atividade || [];
        const fiscalEncontradoDash = fiscaisDash.find(f => f.relatorio_id === relId);
        assert(!!fiscalEncontradoDash, 'Fiscal em preenchimento listado em fiscais_em_atividade no Dashboard');
        if (fiscalEncontradoDash) {
            assert(fiscalEncontradoDash.postos_preenchidos === 2, `Progresso contabilizado: ${fiscalEncontradoDash.progresso_texto}`);
            assert(fiscalEncontradoDash.percentual > 0, `Percentual calculado corretamente: ${fiscalEncontradoDash.percentual}%`);
            assert(fiscalEncontradoDash.setor_nome === 'ACARI / TINGUÁ' || fiscalEncontradoDash.setor_nome.includes('TINGUÁ'), `Setor correto: ${fiscalEncontradoDash.setor_nome}`);
        }

        // 5. Teste Painel da Diretoria (Diretoria Stats)
        console.log('\n--- 4. PAINEL DA DIRETORIA REFLETINDO EM TEMPO REAL ---');
        const dirRes = await makeRequest('GET', `/api/v1/diretoria/stats?data=${testDate}`, null, adminToken);
        assert(dirRes.status === 200, 'GET /diretoria/stats retorna HTTP 200');
        
        const cardsDir = dirRes.body.cards;
        assert(cardsDir.postos_em_preenchimento >= 2, `Card executivo 🟡 Em Preenchimento: ${cardsDir.postos_em_preenchimento}`);
        
        const setorTingua = dirRes.body.setores.tingua;
        assert(setorTingua.em_preenchimento >= 2, `Tinguá contabiliza ${setorTingua.em_preenchimento} postos em preenchimento`);
        assert(setorTingua.status === 'EM_PREENCHIMENTO' || setorTingua.status === 'PARCIAL', `Status do setor é ${setorTingua.status}`);
        
        const fiscaisDir = dirRes.body.fiscais_em_atividade || [];
        const fiscalEncontradoDir = fiscaisDir.find(f => f.relatorio_id === relId);
        assert(!!fiscalEncontradoDir, 'Fiscal em preenchimento listado no Painel da Diretoria');

        // 6. Teste de Conclusão / Envio (ENVIAR -> CONCLUIDO)
        console.log('\n--- 5. FINALIZAÇÃO E ENVIO DO RELATÓRIO (ENVIAR) ---');
        const sendRes = await makeRequest('POST', '/api/v1/formulario/enviar', {
            relatorio_id: relId,
            client_uuid: testUuid,
            data_servico: testDate,
            setor_id: 1,
            supervisor_id: 1,
            turno: 'DIURNO',
            km_inicial: 100,
            km_final: 120,
            responsavel_nome: 'FISCAL TESTE REALTIME',
            postos: [
                {
                    posto_id: 1,
                    supervisionado: true,
                    status_supervisao: 'SUPERVISIONADO',
                    horario_supervisao: '09:30',
                    condicao: 'NORMAL',
                    efetivo_previsto: 2,
                    efetivo_real: 2
                },
                {
                    posto_id: 2,
                    supervisionado: true,
                    status_supervisao: 'SUPERVISIONADO',
                    horario_supervisao: '10:15',
                    condicao: 'NORMAL',
                    efetivo_previsto: 1,
                    efetivo_real: 1
                }
            ]
        }, adminToken);

        assert(sendRes.status === 200 || sendRes.status === 201, 'POST /formulario/enviar finaliza relatório com sucesso');
        const relFinal = db.prepare('SELECT status FROM relatorios WHERE id = ?').get(relId);
        assert(relFinal.status === 'concluido', 'Status promovido para "concluido"');

        // 7. Verificar que o fiscal foi promovido e saiu de "em preenchimento"
        const dirAfterSend = await makeRequest('GET', `/api/v1/diretoria/stats?data=${testDate}`, null, adminToken);
        const fiscaisAfter = dirAfterSend.body.fiscais_em_atividade || [];
        const aindaEmAtividade = fiscaisAfter.some(f => f.relatorio_id === relId);
        assert(!aindaEmAtividade, 'Relatório concluído não aparece mais em "fiscais_em_atividade"');

        // 8. Limpar relatório de teste
        console.log('\n--- 6. LIMPEZA SEGURA DO TESTE ---');
        const deleteRes = await makeRequest('DELETE', `/api/v1/plantoes/${relId}`, null, adminToken);
        assert(deleteRes.status === 200, 'DELETE limpa relatório de teste sem afetar base de produção');

    } catch (err) {
        console.error('Erro na execução dos testes:', err);
        failed++;
    } finally {
        if (server) {
            server.close();
        }
        console.log('\n================================================================');
        console.log(`📊 RESULTADO REALTIME: ${passed} PASSOU | ${failed} FALHOU`);
        console.log('================================================================');
        process.exit(failed > 0 ? 1 : 0);
    }
}

runRealtimeSuite();
