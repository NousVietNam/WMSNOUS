const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSpecificBox() {
    const code = 'BOX-0126-0007'
    const { data, error } = await supabase.from('boxes').select('*').eq('code', code).single()
    if (error) {
        console.error("Error:", error)
        return
    }
    console.log("BOX DATA:", JSON.stringify(data, null, 2))

    if (data.order_id) {
        const { data: order } = await supabase.from('orders').select('*').eq('id', data.order_id).single()
        console.log("LINKED ORDER:", JSON.stringify(order, null, 2))
    } else {
        console.log("No order linked to this box.")
    }
}

checkSpecificBox()
