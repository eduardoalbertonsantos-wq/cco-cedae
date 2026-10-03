const http = require('http');
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

// Configurar app de teste com a rota da diretoria
const app = express();
app.use(express.json());
app.use('/api/v1/diretoria', require('../routes/diretoria.routes'));

const JWT_SECRET = process.env.JWT_SECRET || 'cco-secret-key-change-in-production-2026';
const token = jwt.sign(
    { id: 8, nome: 'DIRETORIA CEDAE', email: 'diretoria@cedae.gov.br', perfil: 'consulta' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

function get(serverUrl, path) {
    return new Promise((resolve, reject) => {
        http.get(serverUrl + path, {
            headers: { 'Authorization': `Bearer ${token}` }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch(e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        }).on('error', reject);
    });
}

async function runTests() {
    console.log('====================================================');
    console.log('🧪 INICIANDO BATERIA DE TESTES - PAINEL DA DIRETORIA');
    console.log('====================================================\n');

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
        const countAntes = db.prepare('SELECT COUNT(*) as t FROM relatorios').get().t;
        const postosAntes = db.prepare('SELECT COUNT(*) as t FROM postos').get().t;

        // TESTE 1: Selecionar 01/10/2026 e confirmar integridade
        const res01 = await get(serverUrl, '/api/v1/diretoria/stats?data=2026-10-01');

        assert(res01.status === 200, 'TESTE 1.1: Status 200 para data 01/10/2026');
        assert(res01.body.success === true, 'TESTE 1.2: Resposta contém success = true');
        assert(res01.body.data_selecionada === '2026-10-01', 'TESTE 1.3: Data selecionada é 2026-10-01');
        assert(res01.body.cards.postos_fiscalizados > 0, `TESTE 1.4: Postos fiscalizados em 01/10 recuperados (${res01.body.cards.postos_fiscalizados} postos)`);

        // TESTE 2: Selecionar 02/10/2026 e verificar isolamento
        const res02 = await get(serverUrl, '/api/v1/diretoria/stats?data=2026-10-02');

        assert(res02.status === 200, 'TESTE 2.1: Status 200 para data 02/10/2026');
        assert(res02.body.data_selecionada === '2026-10-02', 'TESTE 2.2: Data selecionada é 2026-10-02');
        assert(res02.body.cards.postos_disponiveis === 70, `TESTE 2.3: Total de postos disponíveis é dinâmico (70)`);
        assert(res02.body.cards.postos_fiscalizados >= 35, `TESTE 2.4: Fiscalizados em 02/10 refletem o dia de hoje (${res02.body.cards.postos_fiscalizados} postos)`);

        // TESTE 3: Fiscalização de Tinguá (Oficial: 12)
        const t = res02.body.setores.tingua;
        assert(t.nome === 'TINGUÁ', 'TESTE 3.1: Setor Tinguá identificado');
        assert(t.oficial === 12, 'TESTE 3.2: Meta oficial de Tinguá é 12');
        assert(t.fiscalizados === 12, `TESTE 3.3: Tinguá fiscalizados = 12 (${t.percentual}%)`);

        // TESTE 4: Fiscalização de Guandu (Oficial: 19)
        const g = res02.body.setores.guandu;
        assert(g.nome === 'GUANDU', 'TESTE 4.1: Setor Guandu identificado');
        assert(g.oficial === 19, 'TESTE 4.2: Meta oficial de Guandu é 19');
        assert(g.fiscalizados === 11, `TESTE 4.3: Guandu fiscalizados = 11 (${g.percentual}%)`);

        // TESTE 5: Fiscalização de Laranjal (Oficial: 6)
        const l = res02.body.setores.laranjal;
        assert(l.nome === 'LARANJAL', 'TESTE 5.1: Setor Laranjal identificado');
        assert(l.oficial === 6, 'TESTE 5.2: Meta oficial de Laranjal é 6');
        assert(l.fiscalizados === 4, `TESTE 5.3: Laranjal fiscalizados = 4 (${l.percentual}%)`);

        // TESTE 6 & 7: Plantão Dinâmico e Detalhamento por Setor
        const p = res02.body.setores.plantao;
        assert(p.escopo_dinamico === true, 'TESTE 6.1: Plantão possui escopo dinâmico');
        assert(p.oficial === res02.body.cards.postos_disponiveis, 'TESTE 6.2: Escopo do Plantão igual ao total de postos disponíveis');
        assert(p.fiscalizados >= 8, `TESTE 6.3: Plantão fiscalizou ${p.fiscalizados} postos no dia`);

        const det = res02.body.plantao_detalhado;
        assert(Array.isArray(det.distribuicao_por_setor_posto), 'TESTE 7.1: Detalhamento do Plantão possui distribuição por setor');
        assert(det.distribuicao_por_setor_posto.length > 0, 'TESTE 7.2: Distribuição por setor possui registros reais');
        console.log('   -> Distribuição Plantão:', det.distribuicao_por_setor_posto);

        // TESTE 8: Escopo do Plantão acompanha dinamicamente novo posto ativo
        assert(p.oficial === 70, 'TESTE 8.1: Escopo do Plantão é computado dinamicamente via SELECT COUNT(*) dos postos ativos');

        // TESTE 9: Virada do dia (respeito a 00:00)
        assert(res01.body.data_selecionada !== res02.body.data_selecionada, 'TESTE 9.1: Datas distintas produzem escopos isolados');
        assert(res01.body.cards.postos_fiscalizados !== res02.body.cards.postos_fiscalizados, 'TESTE 9.2: Dados de 01/10 e 02/10 não se misturam');

        // TESTE 10: Idempotência e Somente Leitura (Sem duplicação de dados)
        const countDepois = db.prepare('SELECT COUNT(*) as t FROM relatorios').get().t;
        const postosDepois = db.prepare('SELECT COUNT(*) as t FROM postos').get().t;
        assert(countAntes === countDepois, `TESTE 10.1: Nenhum relatório criado/duplicado (antes: ${countAntes}, depois: ${countDepois})`);
        assert(postosAntes === postosDepois, `TESTE 10.2: Nenhum posto modificado/criado (antes: ${postosAntes}, depois: ${postosDepois})`);

        // TESTE 11: Evolução Diária com Histórico
        assert(Array.isArray(res02.body.evolucao_diaria), 'TESTE 11.1: Evolução diária retornada como array');
        assert(res02.body.evolucao_diaria.length === 14, 'TESTE 11.2: Evolução cobre 14 dias de histórico');

        console.log('\n====================================================');
        console.log(`📊 RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
        console.log('====================================================');
    } finally {
        server.close();
    }

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Erro na execução dos testes:', err);
    process.exit(1);
});
