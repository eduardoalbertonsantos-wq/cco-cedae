require('dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
const fs = require('fs');
const path = require('path');

async function migrate() {
    const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (!connStr) {
        console.log('ℹ️ Para migrar para o Supabase ou PostgreSQL na nuvem:');
        console.log('   Defina a variável DATABASE_URL no arquivo backend/.env com a URL de conexão do Supabase/PostgreSQL:');
        console.log('   Exemplo: DATABASE_URL="postgresql://postgres:[SENHA]@db.[REF].supabase.co:5432/postgres"');
        console.log('   Ou copie e cole o arquivo "database/supabase_schema_complete.sql" diretamente no SQL Editor do Supabase!');
        return;
    }

    try {
        const { Client } = require('../backend/node_modules/pg');
        const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
        console.log('Conectando ao banco PostgreSQL/Supabase...');
        await client.connect();
        console.log('✅ Conexão estabelecida com sucesso!');

        const sqlFile = path.join(__dirname, 'supabase_schema_complete.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');

        console.log('Executando migração das tabelas e dos 59 postos...');
        await client.query(sql);
        console.log('✅ Migração para Supabase / PostgreSQL concluída com sucesso!');
        await client.end();
    } catch (err) {
        console.error('❌ Falha na migração:', err.message);
    }
}

migrate();
