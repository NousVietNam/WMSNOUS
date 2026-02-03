
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
    const sqlPath = path.join(__dirname, 'database/migrations/migration_enhance_ship_safety.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('Applying Safety Check Migration...')

    // Try explicit RPC if available
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error("RPC exec_sql failed (maybe not installed?):", error)
        console.log("---------------------------------------------------")
        console.log("Please copy/paste the content of 'database/migrations/migration_enhance_ship_safety.sql' to Supabase SQL Editor.")
    } else {
        console.log("✅ Success! Shipping Logic secured.")
    }
}

run()
