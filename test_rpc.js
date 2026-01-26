const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testRpc() {
    console.log("Testing run_sql_query...")
    const { data, error } = await supabase.rpc('run_sql_query', { query: 'SELECT 1 as result' })
    if (error) {
        console.error("run_sql_query failed:", error.message)
    } else {
        console.log("run_sql_query Success:", data)
    }
}

testRpc()
