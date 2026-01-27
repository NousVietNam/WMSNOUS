const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function runAudit() {
    const config = {
        host: 'aws-1-ap-southeast-1.pooler.supabase.com',
        port: 6543,
        database: 'postgres',
        user: 'postgres.syjqmspmlctadbaeqyxb',
        password: 'Chien6677-28=',
        ssl: { rejectUnauthorized: false }
    };

    console.log(`Connecting to database for Audit...`);
    const client = new Client(config);

    try {
        await client.connect();
        console.log("✅ Connected.\n");

        // 1. Check Missing Indexes on Foreign Keys
        console.log("🔍 Checking for Missing Foreign Key Indexes...");
        const resFK = await client.query(`
            select
                conrelid::regclass as table_name,
                a.attname as fk_column
            from pg_constraint c
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
            where c.contype = 'f'
                and not exists (
                    select 1 from pg_index i
                    where i.indrelid = c.conrelid and a.attnum = any(i.indkey)
                );
        `);
        if (resFK.rows.length > 0) {
            console.log("⚠️  Found missing indexes on Foreign Keys (Slow JOINs/Cascades):");
            console.table(resFK.rows);
        } else {
            console.log("✅ All Foreign Keys are indexed.");
        }
        console.log("");

        // 2. Check Tables with RLS Disabled
        console.log("🔍 Checking for Tables with RLS Disabled...");
        const resRLS = await client.query(`
            select relname as table_name
            from pg_class
            join pg_namespace on pg_namespace.oid = pg_class.relnamespace
            where nspname = 'public' and relkind = 'r' and relrowsecurity = false;
        `);
        if (resRLS.rows.length > 0) {
            console.log("⚠️  Tables with RLS DISABLED (Security Risk):");
            resRLS.rows.forEach(r => console.log(` - ${r.table_name}`));
        } else {
            console.log("✅ All public tables have RLS enabled.");
        }
        console.log("");

        // 3. Top 10 Largest Tables
        console.log("🔍 Top 10 Largest Tables:");
        const resSize = await client.query(`
            SELECT
                relname AS table_name,
                pg_size_pretty(pg_total_relation_size(C.oid)) AS total_size
            FROM pg_class C
            LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
            WHERE nspname = 'public'
            AND C.relkind = 'r'
            ORDER BY pg_total_relation_size(C.oid) DESC
            LIMIT 10;
        `);
        console.table(resSize.rows);
        console.log("");

    } catch (err) {
        console.error("❌ Audit failed:", err);
    } finally {
        await client.end();
    }
}

runAudit();
