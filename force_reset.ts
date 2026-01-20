
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function forceReset() {
    const boxCode = 'BOX-TEST-0002'
    const sku = 'NB2S25-TB2-M04-OW-0M'
    console.log(`Force resetting allocated for ${sku} in ${boxCode}...`)

    // 1. Get Box
    const { data: box } = await supabase.from('boxes').select('id').eq('code', boxCode).single()
    if (!box) { console.log("Box not found"); return }

    // 2. Get Product
    const { data: product } = await supabase.from('products').select('id').eq('sku', sku).single()
    if (!product) { console.log("Product not found"); return }

    // 3. Get Inventory Item
    const { data: item } = await supabase
        .from('inventory_items')
        .select('id, quantity, allocated_quantity')
        .eq('box_id', box.id)
        .eq('product_id', product.id)
        .single()

    if (!item) { console.log("Item not found"); return }

    console.log(`Current Alloc: ${item.allocated_quantity}`)

    // 4. Reset
    const { error } = await supabase
        .from('inventory_items')
        .update({ allocated_quantity: 0 })
        .eq('id', item.id)

    if (error) console.log("Error:", error.message)
    else console.log("✅ Reset to 0 success.")
}

forceReset()
