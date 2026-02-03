
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function runMig() {
    const sql = fs.readFileSync('database/migrations/migration_fix_sorter_fk.sql', 'utf8')
    console.log('Fixing FKs...')
    const { error } = await s.rpc('exec_sql', { sql_query: sql })
    if (error) console.error(error)
    else console.log('FKs updated.')
}
runMig()
