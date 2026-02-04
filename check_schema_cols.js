
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSchema() {
    // Check Locations columns
    const { data: locData, error: locError } = await supabase
        .from('locations')
        .select('*')
        .limit(1)

    // Check Boxes columns
    const { data: boxData, error: boxError } = await supabase
        .from('boxes')
        .select('*')
        .limit(1)

    console.log("Locations Sample:", locData ? Object.keys(locData[0]) : "Error")
    console.log("Boxes Sample:", boxData ? Object.keys(boxData[0]) : "Error")

    console.log("Locations First Row:", locData ? locData[0] : "Empty")
}

checkSchema()
