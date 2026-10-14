/**
 * BATERIA DE TESTES AUTOMATIZADOS — MAPA OPERACIONAL DA DIRETORIA
 * CCO CEDAE | ANTIGRAVITY
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/v1/mapa', require('../routes/mapa.routes'));
app.use('/api/v1/diretoria', require('../routes/diretoria.routes'));

const JWT_SECRET = process.env.JWT_SECRET || 'cco-secret-key-change-in-production-2026';

let server;
let port;

function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = {
            'Content-Type': 'application/json'
        };
        if (payload) {
            headers['Content-Length'] = Buffer.byteLength(payload);
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path,
            method,
            headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, headers: res.headers, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, headers: res.headers, raw: data });
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

let passed = 0;
let failed = 0;

function test(descricao, fn) {
    try {
        fn();
        console.log(`✅ [PASS] ${descricao}`);
        passed++;
    } catch (e) {
        console.error(`❌ [FAIL] ${descricao}`);
        console.error('   ->', e.message);
        failed++;
    }
}

async function runTests() {
    console.log('================================================================');
    console.log('🧪 BATERIA DE TESTES: MAPA OPERACIONAL DA DIRETORIA (CEDAE CCO)');
    console.log('================================================================\n');

    server = await new Promise(resolve => {
        const s = app.listen(0, () => resolve(s));
    });
    port = server.address().port;

    const tokenDiretoria = jwt.sign(
        { id: 2, nome: 'DIRETORIA CEDAE', email: 'diretoria@cedae.gov.br', perfil: 'consulta', setor_id: 4 },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    // 1. ENDPOINT DE VIATURAS E FISCAIS
    console.log('--- 1. CONSULTA DE VIATURAS E FISCAIS ---');
    const resVtr = await request('GET', '/api/v1/mapa/viaturas-fiscais', null, tokenDiretoria);
    
    test('GET /api/v1/mapa/viaturas-fiscais retorna HTTP 200', () => {
        assert.strictEqual(resVtr.status, 200);
        assert.strictEqual(resVtr.body.success, true);
    });

    test('Retorna lista de viaturas ativas (mínimo 4 viaturas)', () => {
        assert(Array.isArray(resVtr.body.viaturas), 'viaturas deve ser array');
        assert(resVtr.body.viaturas.length >= 4, `Esperado >= 4, recebido ${resVtr.body.viaturas.length}`);
    });

    test('Cada viatura possui dados completos (placa, modelo, fiscal, setor, coordenadas)', () => {
        const v = resVtr.body.viaturas[0];
        assert(v.viatura_id, 'Deve conter viatura_id');
        assert(v.placa, 'Deve conter placa');
        assert(v.tipo_modelo, 'Deve conter tipo_modelo');
        assert(v.fiscal_responsavel, 'Deve conter fiscal_responsavel');
        assert(v.setor_nome, 'Deve conter setor_nome');
        assert(typeof v.latitude === 'number', 'Latitude deve ser numérica');
        assert(typeof v.longitude === 'number', 'Longitude deve ser numérica');
        assert(v.status_conexao, 'Deve conter status_conexao');
    });

    test('Bases operacionais dos 4 setores estão presentes', () => {
        const bases = resVtr.body.bases_setores;
        assert(Array.isArray(bases), 'bases_setores deve ser array');
        assert.strictEqual(bases.length, 4, 'Deve conter 4 bases operacionais');
        const nomes = bases.map(b => b.nome);
        assert(nomes.includes('TINGUÁ'), 'Deve incluir base Tinguá');
        assert(nomes.includes('GUANDU'), 'Deve incluir base Guandu');
        assert(nomes.includes('LARANJAL'), 'Deve incluir base Laranjal');
        assert(nomes.includes('PLANTÃO'), 'Deve incluir base Plantão');
    });

    // 2. FILTRAGEM POR SETOR
    console.log('\n--- 2. FILTRAGEM POR SETOR OPERACIONAL ---');
    const resTingua = await request('GET', '/api/v1/mapa/viaturas-fiscais?setor_id=1', null, tokenDiretoria);
    test('Filtro por setor_id=1 retorna apenas viaturas de Tinguá', () => {
        assert.strictEqual(resTingua.status, 200);
        const vtrs = resTingua.body.viaturas;
        assert(vtrs.length >= 1, 'Deve retornar ao menos 1 viatura para Tinguá');
        vtrs.forEach(v => {
            assert.strictEqual(v.setor_id, 1, 'Setor deve ser 1 (Tinguá)');
        });
    });

    // 3. ATUALIZAÇÃO E TRANSMISSÃO GPS
    console.log('\n--- 3. TRANSMISSÃO E ATUALIZAÇÃO DE LOCALIZAÇÃO GPS ---');
    const tokenFiscal = jwt.sign(
        { id: 3, nome: 'SUPERVISOR TINGUÁ', email: 'tingua@cedae.gov.br', perfil: 'supervisor', setor_id: 1 },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    const gpsPayload = {
        latitude: -22.5890,
        longitude: -43.4350,
        accuracy: 12,
        gps_authorized: 1,
        setor_id: 1,
        device_info: 'Teste Automatizado Suíte CCO'
    };

    const resGps = await request('POST', '/api/v1/mapa/localizacao', gpsPayload, tokenFiscal);
    test('POST /api/v1/mapa/localizacao registra coordenadas com sucesso', () => {
        assert.strictEqual(resGps.status, 200);
        assert.strictEqual(resGps.body.success, true);
        assert.strictEqual(resGps.body.is_online, 1);
    });

    // 4. PRESERVAÇÃO INTEGRAL DE DADOS HISTÓRICOS
    console.log('\n--- 4. INTEGRIDADE DOS RELATÓRIOS E BANCO DE DADOS ---');
    const db = getDb();
    const countRel = db.prepare('SELECT count(*) as total FROM relatorios').get().total;
    test('Relatórios históricos preservados intactos (total >= 13)', () => {
        assert(countRel >= 13, `Esperado >= 13 relatórios, encontrados ${countRel}`);
    });

    const r01 = db.prepare("SELECT count(*) as total FROM relatorios WHERE data_servico = '2026-10-01'").get().total;
    test('Relatórios de 01/10/2026 intactos (3 registros)', () => {
        assert.strictEqual(r01, 3, `Esperado 3 relatórios em 01/10, encontrados ${r01}`);
    });

    const r02 = db.prepare("SELECT count(*) as total FROM relatorios WHERE data_servico = '2026-10-02'").get().total;
    test('Relatórios de 02/10/2026 intactos (5 registros)', () => {
        assert.strictEqual(r02, 5, `Esperado 5 relatórios em 02/10, encontrados ${r02}`);
    });

    const r03 = db.prepare("SELECT count(*) as total FROM relatorios WHERE data_servico = '2026-10-03'").get().total;
    test('Relatórios de 03/10/2026 intactos (5 registros)', () => {
        assert.strictEqual(r03, 5, `Esperado 5 relatórios em 03/10, encontrados ${r03}`);
    });

    // Limpeza segura da localização de teste
    db.prepare('DELETE FROM fiscal_locations WHERE user_id = 999').run();

    console.log('\n================================================================');
    console.log(`📊 RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
    console.log('================================================================');

    if (server) {
        server.close();
    }

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Erro na execução dos testes:', err);
    process.exit(1);
});
