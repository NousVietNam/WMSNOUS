
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
    const migrationPath = path.join(process.cwd(), 'database', 'migrations', 'migration_fix_wave_release_v2.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    console.log('Applying migration to fix wave release (Jobs & Tasks)...')
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error('Error applying migration:', error.message)
    } else {
        console.log('Migration applied successfully!')
    }
}

applyMigration()
