
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
    const sqlPath = path.join(process.cwd(), 'database/migrations/migration_strict_wave_v4.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log("Applying Strict Wave Suggestion RPC v4...")
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error("Migration Failed:", error)
    } else {
        console.log("Migration Success! suggest_bulk_waves_v4 created.")
    }
}

applyMigration()
