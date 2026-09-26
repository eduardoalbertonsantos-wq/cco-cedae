/**
 * Script de Restauração de Backup do CCO
 * Restaura o banco a partir de um backup específico ou do mais recente.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'cco.db');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

function runRestore(backupTargetFile) {
  console.log('--- Iniciando Restauração do Banco de Dados CCO ---');

  let fileToRestore = backupTargetFile;
  if (!fileToRestore) {
    if (!fs.existsSync(BACKUPS_DIR)) {
      console.error('❌ Diretório de backups não encontrado.');
      process.exit(1);
    }
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.db')).sort().reverse();
    if (files.length === 0) {
      console.error('❌ Nenhum arquivo de backup .db encontrado em', BACKUPS_DIR);
      process.exit(1);
    }
    fileToRestore = path.join(BACKUPS_DIR, files[0]);
  }

  console.log(`Restaurando a partir de: ${fileToRestore}`);
  if (!fs.existsSync(fileToRestore)) {
    console.error(`❌ Arquivo de backup não existe: ${fileToRestore}`);
    process.exit(1);
  }

  // Validar se o backup é um SQLite válido e contém os 59 postos
  try {
    const testDb = new Database(fileToRestore, { readonly: true });
    const postosCount = testDb.prepare('SELECT count(*) as c FROM postos').get().c;
    testDb.close();
    console.log(`Verificação de integridade do backup: ${postosCount} postos encontrados.`);
    if (postosCount !== 59) {
      console.warn(`[AVISO] O backup contém ${postosCount} postos.`);
    }
  } catch (err) {
    console.error('❌ Arquivo de backup corrompido ou inválido:', err.message);
    process.exit(1);
  }

  // Fazer backup de segurança do estado atual antes de sobrescrever
  const emergencyTime = Date.now();
  if (fs.existsSync(DB_PATH)) {
    fs.copyFileSync(DB_PATH, path.join(DATA_DIR, `cco_pre_restore_${emergencyTime}.db`));
  }
  if (fs.existsSync(`${DB_PATH}-wal`)) {
    try { fs.unlinkSync(`${DB_PATH}-wal`); } catch (e) {}
  }
  if (fs.existsSync(`${DB_PATH}-shm`)) {
    try { fs.unlinkSync(`${DB_PATH}-shm`); } catch (e) {}
  }

  fs.copyFileSync(fileToRestore, DB_PATH);
  console.log('✅ Banco restaurado com sucesso!');

  // Confirmar estado pós-restauração
  const restoredDb = new Database(DB_PATH);
  const finalCount = restoredDb.prepare('SELECT count(*) as c FROM postos').get().c;
  restoredDb.close();
  console.log(`✅ Base ativa pronta com ${finalCount} postos.`);
}

const target = process.argv[2];
runRestore(target);
