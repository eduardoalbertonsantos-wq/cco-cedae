const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'cco.db');
const BACKUPS_DIR = path.join(__dirname, '..', '..', 'data', 'backups');

let db;

/**
 * Cria snapshot automático do banco de dados para segurança absoluta
 */
function criarSnapshotSeguranca() {
    try {
        if (fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size > 0) {
            fs.mkdirSync(BACKUPS_DIR, { recursive: true });
            const timestamp = Date.now();
            const snapPath = path.join(BACKUPS_DIR, `cco_auto_snapshot_${timestamp}.db`);
            fs.copyFileSync(DB_PATH, snapPath);
            console.log(`🛡️ [PROTEÇÃO TOTAL CCO] Snapshot automático criado: cco_auto_snapshot_${timestamp}.db`);
        }
    } catch (e) {
        console.warn('Aviso ao criar snapshot automático:', e.message);
    }
}

function getDb() {
    if (!db) {
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Criar snapshot preventivo antes de qualquer conexão
        criarSnapshotSeguranca();

        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');

        // Blindagem contra consultas destrutivas globais
        const originalExec = db.exec.bind(db);
        db.exec = function(sql) {
            const upper = String(sql).toUpperCase();
            if (upper.includes('DROP TABLE') && !upper.includes('DROP TABLE IF EXISTS TEMP_')) {
                throw new Error('[REGRA MESTRE CCO] Execução de DROP TABLE bloqueada pelo sistema de proteção total.');
            }
            if (upper.includes('TRUNCATE')) {
                throw new Error('[REGRA MESTRE CCO] Execução de TRUNCATE bloqueada pelo sistema de proteção total.');
            }
            return originalExec(sql);
        };
    }
    return db;
}

function initializeDatabase() {
    const database = getDb();
    
    // Executar Schema com os Triggers de Imutabilidade
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    database.exec(schema);
    
    // Inserir Seed Data SOMENTE se o banco estiver completamente vazio (primeira inicialização)
    const countPostos = database.prepare('SELECT COUNT(*) as count FROM postos').get();
    if (countPostos.count === 0) {
        const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
        database.exec(seed);
        console.log('✅ Carga inicial (seed) inserida no banco de dados');
    }
    
    // Garantir usuário Administrador
    const admin = database.prepare('SELECT id FROM usuarios WHERE email = ?').get('eduardoalbertonsantos@gmail.com');
    if (!admin) {
        const senhaHash = bcrypt.hashSync('cco@2026', 12);
        database.prepare(
            'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)'
        ).run('ADMINISTRADOR CCO', 'eduardoalbertonsantos@gmail.com', senhaHash, 'admin');
        console.log('✅ Usuário Administrador garantido no banco de dados');
    }

    // Garantir usuário Diretoria (Perfil Administrador para permissão total de gerenciamento)
    const diretoria = database.prepare('SELECT id FROM usuarios WHERE email = ?').get('diretoria@cedae.gov.br');
    if (!diretoria) {
        const senhaHash = bcrypt.hashSync('cco@2026', 12);
        database.prepare(
            'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)'
        ).run('DIRETORIA CEDAE', 'diretoria@cedae.gov.br', senhaHash, 'admin');
        console.log('✅ Usuário Diretoria garantido no banco de dados');
    } else {
        database.prepare("UPDATE usuarios SET perfil = 'admin' WHERE email = 'diretoria@cedae.gov.br'").run();
    }
    
    // Ativação da Exclusão Manual: remover trigger restritivo caso exista no banco
    try {
        database.exec('DROP TRIGGER IF EXISTS trg_proteger_relatorios_historicos');
    } catch (_) {}

    console.log('✅ Banco de dados sincronizado e exclusão manual autorizada ativa');
    return database;
}

function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, initializeDatabase, closeDatabase };
