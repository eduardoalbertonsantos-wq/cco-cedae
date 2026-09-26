module.paths.push('C:/Users/laurindolemos/.gemini/antigravity/scratch/cco-sistema/node_modules');
const axios = require('axios');
const path = require('path');
const projectDir = 'C:/Users/laurindolemos/.gemini/antigravity/scratch/cco-sistema';
const { getDb } = require(path.join(projectDir, 'backend/database/db'));
const { getBrasiliaDateTime, formatDisplayDate, formatDisplayDateTime, formatDisplayTime } = require(path.join(projectDir, 'backend/utils/date.utils'));

const PUBLIC_URL = 'https://wood-prime-let-stolen.trycloudflare.com';
const LOCAL_URL = 'http://localhost:3000';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ [PASS] ${message}`);
    } else {
        failedTests++;
        console.error(`  ❌ [FAIL] ${message}`);
    }
}

async function runTests() {
    console.log('\n================================================================');
    console.log('🚨 BATERIA DEFINITIVA DE TESTES — FINALIZAÇÃO TOTAL DO SISTEMA');
    console.log('================================================================\n');

    const db = getDb();

    // 1. DATA E FUSO HORÁRIO OFICIAL (America/Sao_Paulo)
    console.log('--- 1. AUDITORIA DE DATA E HORA OFICIAL (AMERICA/SAO_PAULO) ---');
    const spNow = getBrasiliaDateTime();
    assert(spNow.isoDate && /^\d{4}-\d{2}-\d{2}$/.test(spNow.isoDate), `Data ISO no formato YYYY-MM-DD: ${spNow.isoDate}`);
    assert(spNow.displayDate && /^\d{2}\/\d{2}\/\d{4}$/.test(spNow.displayDate), `Data de apresentação DD/MM/AAAA: ${spNow.displayDate}`);
    assert(spNow.horaCurta && /^\d{2}:\d{2}$/.test(spNow.horaCurta), `Hora oficial no formato HH:MM: ${spNow.horaCurta}`);
    assert(spNow.dataHora && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(spNow.dataHora), `Timestamp SQLite padrão São Paulo: ${spNow.dataHora}`);

    // Teste de conversão sem skew de timezone
    assert(formatDisplayDate('2026-09-25') === '25/09/2026', 'Conversão direta de data YYYY-MM-DD para 25/09/2026 sem skew UTC');
    assert(formatDisplayDateTime('2026-09-25 21:15:00') === '25/09/2026 21:15', 'Conversão de datetime para 25/09/2026 21:15');

    // 2. ENDPOINT DE SAÚDE E METADADOS ONLINE
    console.log('\n--- 2. HEALTH CHECK & CONEXÃO ONLINE ---');
    try {
        const resHealth = await axios.get(`${LOCAL_URL}/api/v1/health`);
        assert(resHealth.status === 200 && resHealth.data.status === 'ok', 'Endpoint /api/v1/health responde 200 OK');
        assert(resHealth.data.timezone === 'America/Sao_Paulo', 'Timezone oficial informado como America/Sao_Paulo');
        assert(resHealth.data.data_formatada === spNow.displayDate, `Data formatada sincronizada com Brasília: ${resHealth.data.data_formatada}`);
        assert(resHealth.data.banco === 'online', 'Status do banco de dados central confirmado online');
    } catch (err) {
        assert(false, `Falha no health check: ${err.message}`);
    }

    // 3. CABEÇALHOS ANTI-CACHE E REDIRECIONAMENTO
    console.log('\n--- 3. CABEÇALHOS ANTI-CACHE & PWA SERVICE WORKER ---');
    try {
        const resSw = await axios.get(`${LOCAL_URL}/sw.js`);
        assert(resSw.status === 200, 'Arquivo sw.js acessível via HTTP 200');
        assert(resSw.data.includes('cco-supervisao-v2.0.0-definitivo'), 'Versão v2.0.0 definitiva ativa no Service Worker');
        assert(resSw.headers['cache-control'] && resSw.headers['cache-control'].includes('no-cache'), 'sw.js servido com Cache-Control: no-cache');

        // Teste de redirect /app.html -> /app
        const resRedirect = await axios.get(`${LOCAL_URL}/app.html`, { maxRedirects: 0, validateStatus: s => s >= 200 && s < 400 });
        assert(resRedirect.status === 301 && resRedirect.headers.location === '/app', 'Redirecionamento 301 de /app.html para /app ativo');

        const resApp = await axios.get(`${LOCAL_URL}/app`);
        assert(resApp.status === 200, 'Endpoint /app carrega aplicativo com HTTP 200');
        assert(resApp.data.includes('getHojeBrasiliaISO'), 'Aplicativo móvel contém helper getHojeBrasiliaISO');
        assert(resApp.data.includes('testarConectividade'), 'Aplicativo móvel contém diagnóstico inteligente de conexão');
        assert(!resApp.data.includes('valueAsDate = new Date()'), 'Removido valueAsDate problemático do formulário mobile');
    } catch (err) {
        assert(false, `Falha nos testes de cabeçalhos: ${err.message}`);
    }

    // 4. INTEGRIDADE DA BASE CENTRAL (59 POSTOS)
    console.log('\n--- 4. INTEGRIDADE DO BANCO CENTRAL (59 POSTOS OFICIAIS) ---');
    const countPostos = db.prepare('SELECT count(*) as c FROM postos').get().c;
    assert(countPostos === 59, `Base oficial possui rigorosamente 59 postos (Obtido: ${countPostos})`);

    const porSetor = db.prepare('SELECT s.nome, count(p.id) as c FROM postos p JOIN setores s ON p.setor_id=s.id GROUP BY s.nome ORDER BY s.nome').all();
    const mapSetores = {};
    porSetor.forEach(r => mapSetores[r.nome] = r.c);
    assert(mapSetores['CCO TINGUÁ'] === 10, `Setor Tinguá: 10 postos oficiais (Obtido: ${mapSetores['CCO TINGUÁ']})`);
    assert(mapSetores['CCO GUANDU'] === 11, `Setor Guandu: 11 postos oficiais (Obtido: ${mapSetores['CCO GUANDU']})`);
    assert(mapSetores['CCO LARANJAL'] === 6, `Setor Laranjal: 6 postos oficiais (Obtido: ${mapSetores['CCO LARANJAL']})`);
    assert(mapSetores['PLANTÃO'] === 32, `Setor Plantão: 32 postos centrais (Obtido: ${mapSetores['PLANTÃO']})`);

    // 5. FLUXO OPERACIONAL COMPLETO DO SUPERVISOR (CELULAR)
    console.log('\n--- 5. FLUXO OPERACIONAL DO SUPERVISOR NO CELULAR ---');
    let loginSup;
    try {
        const resLogin = await axios.post(`${LOCAL_URL}/api/v1/auth/login`, {
            usuario: 'supervisor.tingua',
            senha: '123'
        });
        loginSup = resLogin.data;
        assert(resLogin.status === 200 && loginSup.token, 'Login do supervisor Tinguá realizado com sucesso');
    } catch (e) {
        assert(false, `Falha no login do supervisor: ${e.message}`);
    }

    // Carregar postos do setor
    try {
        const resSetor = await axios.get(`${LOCAL_URL}/api/v1/formulario/setor/1`);
        assert(resSetor.status === 200 && resSetor.data.postos.length === 12, 'Setor Tinguá carrega seus 12 postos autorizados na supervisão');
    } catch (e) {
        assert(false, `Falha ao carregar postos do setor: ${e.message}`);
    }

    // Teste de rejeição amigável: motivo obrigatório (HTTP 400 - NÃO deve mostrar offline)
    try {
        await axios.post(`${LOCAL_URL}/api/v1/formulario/enviar`, {
            setor_id: 1,
            data_servico: '2026-09-25',
            turno: 'DIURNO',
            supervisor_id: 1,
            responsavel_nome: 'SUPERVISOR TINGUÁ',
            postos_supervisionados: [
                { posto_id: 1, supervisionado: false, motivo_nao_supervisao: '' }
            ]
        });
        assert(false, 'Deveria ter rejeitado posto não supervisionado sem motivo');
    } catch (e) {
        assert(e.response && e.response.status === 400, 'Rejeição correta HTTP 400 quando falta motivo de não supervisão (não mascara como offline)');
    }

    // 6. TESTE DE PLANTÃO NOTURNO COM MEIA-NOITE
    console.log('\n--- 6. TESTE ESPECÍFICO DE PLANTÃO NOTURNO (CRUZA MEIA-NOITE) ---');
    let relatorioNoturnoId;
    const clientUuidNoturno = 'test_noturno_' + Date.now();
    try {
        const payloadNoturno = {
            client_uuid: clientUuidNoturno,
            setor_id: 1,
            supervisor_id: 1,
            responsavel_nome: 'SUPERVISOR TINGUÁ NOTURNO',
            viatura_outros_texto: 'VTR-NOTURNA',
            data_servico: '2026-09-25', // Plantão de 25/09
            turno: 'NOTURNO',
            km_inicial: 10000,
            km_final: 10120,
            observacoes_gerais: 'Plantão noturno com rondas antes e após meia-noite',
            providencias_gerais: 'Verificação perimetral realizada',
            pendencias_gerais: 'Nenhuma',
            postos_supervisionados: [
                {
                    posto_id: 1,
                    horario_supervisao: '23:30', // Antes da meia-noite (25/09)
                    situacao_encontrada: 'NORMAL',
                    status_supervisao: 'NORMAL',
                    supervisionado: true,
                    km_posto: 10040,
                    efetivo_completo: 1
                },
                {
                    posto_id: 2,
                    horario_supervisao: '02:15', // Após a meia-noite (26/09)
                    situacao_encontrada: 'NORMAL',
                    status_supervisao: 'NORMAL',
                    supervisionado: true,
                    km_posto: 10085,
                    efetivo_completo: 1
                }
            ]
        };

        const resEnvio = await axios.post(`${LOCAL_URL}/api/v1/formulario/enviar`, payloadNoturno);
        assert(resEnvio.status === 201, 'Relatório noturno registrado com sucesso (HTTP 201)');
        relatorioNoturnoId = resEnvio.data.id;

        // Verificar dados salvos no banco
        const relSalvo = db.prepare('SELECT * FROM relatorios WHERE id = ?').get(relatorioNoturnoId);
        assert(relSalvo.data_servico === '2026-09-25', `Data do serviço preservada como 2026-09-25 (Plantão de origem)`);
        assert(relSalvo.created_at.includes(spNow.isoDate), `Data de fechamento registrada no horário real de Brasília: ${relSalvo.created_at}`);

        // Verificar horários dos postos
        const postosSalvos = db.prepare('SELECT horario_supervisao, km_posto FROM postos_relatorio WHERE relatorio_id = ? ORDER BY id ASC').all(relatorioNoturnoId);
        assert(postosSalvos[0].horario_supervisao === '23:30', 'Posto 1 mantém horário de ronda das 23:30');
        assert(postosSalvos[1].horario_supervisao === '02:15', 'Posto 2 mantém horário de ronda da madrugada das 02:15');

        // Verificar WhatsApp
        const whats = resEnvio.data.texto_whatsapp;
        assert(whats.includes('25/09/2026'), 'WhatsApp exibe data da supervisão formatada como 25/09/2026');
        assert(whats.includes('Horário de Brasília'), 'WhatsApp exibe carimbo oficial de fechamento em Horário de Brasília');
    } catch (e) {
        assert(false, `Falha no teste de plantão noturno: ${e.response?.data?.error || e.message}`);
    }

    // 7. TESTE DE ANTI-DUPLICIDADE
    console.log('\n--- 7. TESTE DE ANTI-DUPLICIDADE ---');
    try {
        // Envio do mesmo relatório (mesmo client_uuid)
        const resDup = await axios.post(`${LOCAL_URL}/api/v1/formulario/enviar`, {
            client_uuid: clientUuidNoturno,
            setor_id: 1,
            data_servico: '2026-09-25',
            turno: 'NOTURNO',
            supervisor_id: 1,
            postos_supervisionados: [{ posto_id: 1, horario_supervisao: '23:30', km_posto: 10040, supervisionado: true }]
        });
        assert(resDup.status === 200 && resDup.data.ja_existia === true, 'Anti-duplicidade via client_uuid reconhece envio anterior e não duplica');
    } catch (e) {
        assert(false, `Falha no teste de anti-duplicidade: ${e.message}`);
    }

    // 8. SINCRONIZAÇÃO CCO EM TEMPO REAL
    console.log('\n--- 8. SINCRONIZAÇÃO NO COMPUTADOR / CCO ---');
    try {
        const resLoginCco = await axios.post(`${LOCAL_URL}/api/v1/auth/login`, {
            usuario: 'eduardoalbertonsantos@gmail.com',
            senha: 'cco@2026'
        });
        const ccoToken = resLoginCco.data.token;

        const resPlantoes = await axios.get(`${LOCAL_URL}/api/v1/plantoes`, {
            headers: { Authorization: `Bearer ${ccoToken}` }
        });
        const achou = resPlantoes.data.find(r => r.id === relatorioNoturnoId);
        assert(achou !== undefined, `CCO visualiza imediatamente o relatório #${relatorioNoturnoId} enviado pelo celular`);
        assert(achou.data_servico === '2026-09-25', `CCO exibe data correta do plantão: ${achou.data_servico}`);
    } catch (e) {
        assert(false, `Falha na sincronização com CCO: ${e.message}`);
    }

    // 9. LIMPEZA SEGURA DO RELATÓRIO DE TESTE
    if (relatorioNoturnoId) {
        db.transaction(() => {
            db.prepare('DELETE FROM ocorrencias WHERE relatorio_id = ?').run(relatorioNoturnoId);
            db.prepare('DELETE FROM postos_relatorio WHERE relatorio_id = ?').run(relatorioNoturnoId);
            db.prepare('DELETE FROM relatorios WHERE id = ?').run(relatorioNoturnoId);
        })();
        console.log(`\n🧹 Registro de teste #${relatorioNoturnoId} limpo com segurança da base.`);
    }

    // 10. ACESSO PÚBLICO EXTERNO VIA HTTPS
    console.log('\n--- 10. ACESSO PÚBLICO HTTPS (SEM DEPENDÊNCIA DE LOCALHOST) ---');
    try {
        const resPublicApp = await axios.get(`${PUBLIC_URL}/app`, { timeout: 10000 });
        assert(resPublicApp.status === 200, `Acesso público HTTPS /app operacional (HTTP 200): ${PUBLIC_URL}/app`);
        assert(resPublicApp.data.includes('CCO CEDAE'), 'Interface do aplicativo do supervisor entregue via HTTPS público');

        const resPublicHealth = await axios.get(`${PUBLIC_URL}/api/v1/health`, { timeout: 10000 });
        assert(resPublicHealth.status === 200 && resPublicHealth.data.status === 'ok', 'Health check responde via URL pública HTTPS com status ok');
        assert(resPublicHealth.data.timezone === 'America/Sao_Paulo', 'URL pública confirma timezone America/Sao_Paulo');
    } catch (e) {
        assert(false, `Falha no acesso público: ${e.message}`);
    }

    console.log('\n================================================================');
    console.log(`📊 RESULTADO FINAL: ${passedTests} PASSOU, ${failedTests} FALHOU (Total: ${totalTests})`);
    console.log('================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runTests();
