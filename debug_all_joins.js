
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
                pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c
            JOIN pg_class r ON r.oid = c.conrelid
            JOIN pg_class f ON f.oid = c.confrelid
            WHERE r.relname = 'pick_waves' AND f.relname = 'users';
        `);

        console.log("Joins found:", JSON.stringify(res.rows, null, 2));

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

debug();
