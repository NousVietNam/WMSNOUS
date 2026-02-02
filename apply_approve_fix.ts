
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
    const sqlPath = path.join(process.cwd(), 'database/migrations/migration_fix_approve_outbound_bulk.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log("Applying Approve Outbound Bulk Fix...")
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error("Migration Failed:", error)
    } else {
        console.log("Migration Success!")
    }
}

applyMigration()
