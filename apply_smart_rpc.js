
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const connectionString = "postgresql://postgres.syjqmspmlctadbaeqyxb:Chien6677-28%3D@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

    try {
        await client.connect();
        const sqlPath = path.join(__dirname, 'database', 'migrations', 'migration_smart_replacement.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await client.query(sql);
        console.log('Smart replacement RPC created.');
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

runMigration();
