/**
 * Script para Zerar os Dados de Plantões, Supervisões e Relatórios do CCO CEDAE
 * Preserva 100% dos cadastros (Setores, Supervisores, Viaturas, Postos e Usuários)
 * Reinicia o contador de relatórios a partir do ID #1
 */
const { getDb } = require('../database/db');

try {
    const db = getDb();
    console.log('============================================================');
    console.log('   INICIANDO LIMPEZA OPERACIONAL DO HISTORICO CCO CEDAE    ');
    console.log('============================================================');

    // Executa a limpeza em uma transação segura
    const transaction = db.transaction(() => {
        db.exec(`
            DELETE FROM postos_relatorio;
            DELETE FROM ocorrencias;
            DELETE FROM relatorios;
            DELETE FROM sqlite_sequence WHERE name IN (
                'relatorios', 
                'postos_relatorio', 
                'ocorrencias'
            );
        `);
    });

    transaction();

    // Verificação dos dados
    const relatorios = db.prepare('SELECT COUNT(*) as total FROM relatorios').get().total;
    const postosRel = db.prepare('SELECT COUNT(*) as total FROM postos_relatorio').get().total;
    const ocorrencias = db.prepare('SELECT COUNT(*) as total FROM ocorrencias').get().total;
    
    const setores = db.prepare('SELECT COUNT(*) as total FROM setores').get().total;
    const supervisores = db.prepare('SELECT COUNT(*) as total FROM supervisores').get().total;
    const viaturas = db.prepare('SELECT COUNT(*) as total FROM viaturas').get().total;
    const postos = db.prepare('SELECT COUNT(*) as total FROM postos').get().total;
    const usuarios = db.prepare('SELECT COUNT(*) as total FROM usuarios').get().total;

    console.log('[OK] Historico de relatorios apagado: ' + relatorios + ' relatorios');
    console.log('[OK] Postos fiscalizados limpos:     ' + postosRel);
    console.log('[OK] Ocorrencias operacionais limpas: ' + ocorrencias);
    console.log('------------------------------------------------------------');
    console.log(' CADASTROS PRESERVADOS COM SUCESSO:');
    console.log(' * Setores Operacionais: ' + setores);
    console.log(' * Supervisores:        ' + supervisores);
    console.log(' * Viaturas:            ' + viaturas);
    console.log(' * Postos Cadastrados:  ' + postos);
    console.log(' * Usuarios do Sistema: ' + usuarios);
    console.log('============================================================');
    console.log(' SUCESSO: HISTORICO ZERADO! NOVOS REGISTROS COMECARAO NO ID #1.');
    console.log('============================================================');
    process.exit(0);
} catch (error) {
    console.error('ERRO ao zerar dados:', error.message);
    process.exit(1);
}