
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { Client } from 'pg'

dotenv.config({ path: '.env.local' })

async function runMigration() {
    console.log("Starting migration...")

    // Check for connection string
    const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL
    if (!dbUrl) {
        console.error("No database URL found in .env.local")
        process.exit(1)
    }

    const client = new Client({
        connectionString: dbUrl,
    })

    try {
        await client.connect()
        console.log("Connected to DB")

        const sqlPath = path.join(process.cwd(), 'database', 'migrations', 'migration_add_inventory_type.sql')
        const sql = fs.readFileSync(sqlPath, 'utf8')

        console.log("Running SQL...")
        await client.query(sql)
        console.log("Migration successful!")

    } catch (e) {
        console.error("Migration failed:", e)
    } finally {
        await client.end()
    }
}

runMigration()
