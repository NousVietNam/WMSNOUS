
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

async function apply() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("Connected to DB via pg");

        const sqlPath = process.argv[2];
        if (!sqlPath) {
            console.error("Please provide a SQL file path");
            process.exit(1);
        }
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log(`Applying ${sqlPath}...`);
        try {
            await client.query(sql);
            console.log(`✅ Applied ${sqlPath} successfully via pg!`);
        } catch (queryErr) {
            console.error(`❌ Error applying ${sqlPath}:`, queryErr.message);
            throw queryErr;
        }

    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await client.end();
    }
}

apply();
