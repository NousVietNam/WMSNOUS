const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
    const filePath = process.argv[2]
    if (!filePath) {
        console.error("Please provide a SQL file path")
        process.exit(1)
    }

    const fullPath = path.resolve(process.cwd(), filePath)
    console.log(`Reading SQL from: ${fullPath}`)

    try {
        const sql = fs.readFileSync(fullPath, 'utf8')
        console.log("Executing SQL...")

        // Try RPC first
        const { error } = await supabase.rpc('exec_sql', { sql_query: sql })

        if (error) {
            console.error("RPC Error:", error.message)
            console.log("Falling back to direct instruction if possible, or fail.")
            // Ideally we'd have a direct connection but Supabase-js relies on API.
            // If exec_sql is missing, we are stuck unless we use the Management API or user does it.
            process.exit(1)
        } else {
            console.log("Success!")
        }
    } catch (e) {
        console.error("Error:", e.message)
        process.exit(1)
    }
}

run()
