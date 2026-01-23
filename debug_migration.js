
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runMigration() {
    const filePath = 'database/migrations/performance_optimize_locations.sql'
    const absolutePath = path.join(process.cwd(), filePath)
    const sql = fs.readFileSync(absolutePath, 'utf8')

    console.log(`Running SQL migration from ${absolutePath}...`)

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error("Migration failed:")
        console.error(JSON.stringify(error, null, 2))
        process.exit(1)
    } else {
        console.log("Migration successful!")
        console.log("Result:", data)
    }
}

runMigration().catch(err => {
    console.error("Script error:", err)
    process.exit(1)
})
