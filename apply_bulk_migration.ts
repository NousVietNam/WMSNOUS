
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function applyMigration() {
    const sqlPath = path.join(process.cwd(), 'database/migrations/migration_add_inventory_type_to_outbound.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log("Applying migration...")

    // Using exec_sql RPC if available, or trying raw query access if possible (usually RPC is safer in this setup)
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error("Migration Failed:", error)
        // Fallback: try split logic if exec_sql is restricted, but usually it works here
    } else {
        console.log("Migration Success!")
    }
}

applyMigration()
