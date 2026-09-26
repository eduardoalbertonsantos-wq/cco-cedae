/**
 * Script de Backup Automatizado do CCO
 * Cria cópias consistentes e datadas do banco de dados SQLite e configurações.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'cco.db');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

async function runBackup() {
  console.log('--- Iniciando Backup do Banco de Dados CCO ---');
  
  const db = new Database(DB_PATH);
  const cp = db.pragma('wal_checkpoint(TRUNCATE)');
  console.log('Checkpoint WAL executado:', cp);

  const postosCount = db.prepare('SELECT count(*) as c FROM postos').get().c;
  const setoresCount = db.prepare('SELECT count(*) as c FROM setores').get().c;
  console.log(`Contagem atual: ${postosCount} postos, ${setoresCount} setores.`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `cco_backup_${timestamp}_postos_${postosCount}.db`;
  const backupPath = path.join(BACKUPS_DIR, backupFileName);

  try {
    await db.backup(backupPath);
    db.close();
    console.log(`✅ Backup concluído com sucesso: ${backupFileName}`);
    console.log(`📁 Localização: ${backupPath}`);
    
    const manifest = {
      timestamp: new Date().toISOString(),
      backupFile: backupFileName,
      postosCount,
      setoresCount,
      fileSizeBytes: fs.statSync(backupPath).size
    };
    fs.writeFileSync(path.join(BACKUPS_DIR, `${backupFileName}.json`), JSON.stringify(manifest, null, 2));
    console.log('📄 Manifesto gravado com sucesso.');
  } catch (err) {
    db.close();
    console.error('❌ Falha ao realizar backup:', err);
    process.exit(1);
  }
}

runBackup();
