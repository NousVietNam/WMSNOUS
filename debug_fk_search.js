
const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

async function debug() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        const res = await client.query(`
            SELECT
                conname AS constraint_name,
                relname AS table_name,
                pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c
            JOIN pg_class r ON r.oid = c.conrelid
            WHERE conname = 'pick_waves_created_by_fkey';
        `);

        console.log("Constraint Detail:", JSON.stringify(res.rows, null, 2));

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

debug();
