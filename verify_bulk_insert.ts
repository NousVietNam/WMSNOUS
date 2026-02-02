
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verifyBulkInsert() {
    console.log("Verifying Bulk Insert...")

    // 1. Generate Code
    const { data: code } = await supabase.rpc('generate_outbound_order_code', { prefix: 'TEST' })
    const orderCode = code || `TEST-${Date.now()}`

    // 2. Insert Bulk Order
    const { data, error } = await supabase
        .from('outbound_orders')
        .insert({
            code: orderCode,
            type: 'SALE',
            transfer_type: 'ITEM',
            inventory_type: 'BULK', // The key field
            status: 'PENDING',
            total: 0,
            subtotal: 0,
            discount_value: 0,
            discount_amount: 0,
            source: 'TEST_SCRIPT'
        })
        .select()
        .single()

    if (error) {
        console.error("Insert Failed:", error)
        process.exit(1)
    }

    if (data.inventory_type !== 'BULK') {
        console.error("Critical: Inventory Type mismatch! Expected BULK, got", data.inventory_type)
        process.exit(1)
    }

    console.log("✅ Success! Created Bulk Order:", data.code, "Type:", data.inventory_type)

    // Cleanup
    await supabase.from('outbound_orders').delete().eq('id', data.id)
    console.log("Cleanup done.")
}

verifyBulkInsert()
