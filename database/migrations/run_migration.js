const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runMigration() {
    const filePath = process.argv[2]
    if (!filePath) {
        console.error("Please provide a path to a SQL file.")
        process.exit(1)
    }

    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)

    if (!fs.existsSync(absolutePath)) {
        console.error(`File not found: ${absolutePath}`)
        process.exit(1)
    }

    const sql = fs.readFileSync(absolutePath, 'utf8')

    console.log(`Running SQL migration from ${absolutePath}...`)

    // Split SQL by semicolons or just run as one block if exec_sql supports it
    // Most likely exec_sql handles a single block.
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error("Migration failed:", JSON.stringify(error, null, 2))
        process.exit(1)
    } else {
        console.log("Migration successful!")
        console.log("Result:", data)
    }
}

runMigration()
