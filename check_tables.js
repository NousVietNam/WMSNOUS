
const { Client } = require('pg');

async function checkTables() {
    const connectionString = "postgresql://postgres.syjqmspmlctadbaeqyxb:Chien6677-28%3D@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

    try {
        await client.connect();
        const res = await client.query(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'users';
        `);
        console.log('Public tables:', res.rows);

        const cols = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'auth' AND table_name = 'users';
        `);
        console.log('Auth users columns:', cols.rows.map(r => r.column_name));

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkTables();
