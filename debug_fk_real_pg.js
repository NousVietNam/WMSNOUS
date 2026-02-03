
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
                contype AS constraint_type,
                pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE n.nspname = 'public' AND conrelid = 'pick_waves'::regclass;
        `);

        console.log("Constraints found:", JSON.stringify(res.rows, null, 2));

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

debug();
