
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkStock() {
    console.log("Checking stock for BOX-TEST-0002...")
    const boxCode = 'BOX-TEST-0002'
    const { data: box } = await supabase.from('boxes').select('id').eq('code', boxCode).single()
    if (!box) { console.log("Box not found"); return }

    const { data: items, error } = await supabase
        .from('inventory_items')
        .select(`
            id, quantity, allocated_quantity, 
            products(sku)
        `)
        .eq('box_id', box.id)

    if (error) { console.log("Error:", error); return }

    items.forEach(i => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sku = (i.products as any)?.sku
        console.log(`SKU: ${sku}`)
        console.log(`  Qty: ${i.quantity}`)
        console.log(`  Alloc: ${i.allocated_quantity}`)
        console.log(`  Avail: ${i.quantity - i.allocated_quantity}`)
    })
}

checkStock()
