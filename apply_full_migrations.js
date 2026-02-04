
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
    // Connection string
    const connectionString = "postgresql://postgres.syjqmspmlctadbaeqyxb:Chien6677-28%3D@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

    const client = new Client({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        const files = [
            'migration_picking_exceptions.sql',
            'migration_picking_approval_system.sql',
            'migration_create_exception_view.sql'
        ];

        for (const file of files) {
            console.log(`Running ${file}...`);
            const sqlPath = path.join(__dirname, 'database', 'migrations', file);
            const sql = fs.readFileSync(sqlPath, 'utf8');

            // Simple split by semicolon might break functions. 
            // Better to try running whole file as one query block if possible, 
            // or if it contains transaction blocks, pg might handle it.
            // Let's try running the whole file content.
            await client.query(sql);
            console.log(`Successfully executed ${file}`);
        }

        console.log('All migrations executed successfully!');

    } catch (err) {
        console.error('Error executing migration:', err);
    } finally {
        await client.end();
    }
}

runMigrations();
