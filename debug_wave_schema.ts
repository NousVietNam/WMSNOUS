
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugWaveSchema() {
    console.log("--- CHECKING PICK_WAVES SCHEMA ---")
    const { data: cols } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'pick_waves'"
    })
    console.log("Columns:", cols)

    console.log("\n--- CHECKING TRIGGERS ---")
    const { data: triggers } = await supabase.rpc('exec_sql', {
        sql_query: "select tgname, proname, prosrc from pg_trigger join pg_proc on pg_trigger.tgfoid = pg_proc.oid where tgrelid = 'pick_waves'::regclass;"
    })
    console.log("Triggers:", triggers)
}

debugWaveSchema()
