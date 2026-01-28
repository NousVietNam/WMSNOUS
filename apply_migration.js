
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
    connectionString: 'postgresql://postgres.syjqmspmlctadbaeqyxb:Chien6677-28%3D@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
});

async function run() {
    try {
        await client.connect();
        const sql = fs.readFileSync('database/migrations/migration_bypass_restricted_for_htl.sql', 'utf8');
        await client.query(sql);
        console.log('Migration applied successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
