const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Find where INB-0126-1117 exists
    console.log('Searching for INB-0126-1117...');
    const result = await client.query(`
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND data_type IN ('text', 'character varying');
    `);

    for (const row of result.rows) {
        try {
            const res = await client.query(`SELECT * FROM ${row.table_name} WHERE ${row.column_name} = 'INB-0126-1117' LIMIT 1`);
            if (res.rows.length > 0) {
                console.log(`Found in [${row.table_name}].[${row.column_name}]`);
            }
        } catch (e) { }
    }

    const boxId = 'ae69c304-6d88-4f0e-8b9d-8c9f05429f07';
    console.log(`Searching for box ID: ${boxId}...`);

    for (const row of result.rows) {
        try {
            // Also search UUIDs? No, just search for uuid matches if possible
            const res = await client.query(`SELECT * FROM ${row.table_name} WHERE ${row.column_name}::text = '${boxId}' LIMIT 1`);
            if (res.rows.length > 0) {
                console.log(`Found ID in [${row.table_name}].[${row.column_name}]`);
            }
        } catch (e) { }
    }

    // Also UUID columns specifically
    const uuidRes = await client.query(`
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND data_type = 'uuid';
    `);

    for (const row of uuidRes.rows) {
        try {
            const res = await client.query(`SELECT * FROM ${row.table_name} WHERE ${row.column_name} = '${boxId}' LIMIT 1`);
            if (res.rows.length > 0) {
                console.log(`Found ID in [${row.table_name}].[${row.column_name}] (uuid)`);
            }
        } catch (e) { }
    }

    client.end();
}
run();
