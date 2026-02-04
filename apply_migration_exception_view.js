
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    // Hardcoded from .env.local view since passing env might be tricky in some environments
    const connectionString = "postgresql://postgres.syjqmspmlctadbaeqyxb:Chien6677-28%3D@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

    const client = new Client({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        const sqlPath = path.join(__dirname, 'database', 'migrations', 'migration_create_exception_view.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration...');
        await client.query(sql);
        console.log('Migration executed successfully!');

    } catch (err) {
        console.error('Error executing migration:', err);
    } finally {
        await client.end();
    }
}

runMigration();
