const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function runMigration() {
    const sqlFilePath = process.argv[2];
    if (!sqlFilePath) {
        console.error('Please provide the path to the SQL file.');
        process.exit(1);
    }

    // Explicit config to bypass parsing issues
    const config = {
        host: 'aws-1-ap-southeast-1.pooler.supabase.com',
        port: 6543,
        database: 'postgres',
        user: 'postgres.syjqmspmlctadbaeqyxb',
        password: 'Chien6677-28=',
        ssl: { rejectUnauthorized: false }
    };

    console.log(`Connecting to database at ${config.host}...`);
    const client = new Client(config);

    try {
        await client.connect();
        console.log(`Connected! Reading SQL file: ${sqlFilePath}`);
        let sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        // Strip BOM if present
        if (sqlContent.charCodeAt(0) === 0xFEFF) {
            sqlContent = sqlContent.slice(1);
        }

        console.log(`Executing migration...`);
        await client.query(sqlContent);

        console.log('Migration executed successfully!');
    } catch (err) {
        console.error('Error executing migration:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigration();
