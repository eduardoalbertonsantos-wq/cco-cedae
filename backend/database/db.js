const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'cco.db');

let db;

function getDb() {
    if (!db) {
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

function initializeDatabase() {
    const database = getDb();
    
    // Executar Schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    database.exec(schema);
    
    // Inserir Seed Data SOMENTE se o banco estiver vazio (primeira inicialização)
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

    // Garantir usuário Diretoria
    const diretoria = database.prepare('SELECT id FROM usuarios WHERE email = ?').get('diretoria@cedae.gov.br');
    if (!diretoria) {
        const senhaHash = bcrypt.hashSync('cco@2026', 12);
        database.prepare(
            'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)'
        ).run('DIRETORIA CEDAE', 'diretoria@cedae.gov.br', senhaHash, 'consulta');
        console.log('✅ Usuário Diretoria garantido no banco de dados');
    }
    
    console.log('✅ Banco de dados sincronizado com estrutura CEDAE');
    return database;
}

function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, initializeDatabase, closeDatabase };
