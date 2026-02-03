
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function runMig() {
    const sql = fs.readFileSync('database/migrations/migration_sorting_init.sql', 'utf8')
    console.log('Running Sorting Migration...')
    const { error } = await s.rpc('exec_sql', { sql_query: sql })
    if (error) console.error(error)
    else console.log('Sorting Migration applied successfully.')
}
runMig()
