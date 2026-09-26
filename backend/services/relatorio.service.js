const { getDb } = require('../database/db');

class RelatorioService {
    static gerarRelatorio(tipo, filtros) {
        const db = getDb();
        // Implementação básica
        return db.prepare('SELECT * FROM plantoes LIMIT 10').all();
    }
}

module.exports = RelatorioService;
