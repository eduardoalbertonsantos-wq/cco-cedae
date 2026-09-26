const { getDb } = require('../database/db');

class KmService {
    static calcularKmRodado(plantao_id) {
        const db = getDb();
        const plantao = db.prepare('SELECT km_inicial, km_final FROM plantoes WHERE id = ?').get(plantao_id);
        if (plantao && plantao.km_final && plantao.km_inicial) {
            return plantao.km_final - plantao.km_inicial;
        }
        return 0;
    }
}

module.exports = KmService;
