const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function resetAllocatedQuantity() {
    try {
        const sku = 'NE1W24-OP2-M03-SB-NB'
        const boxCodes = ['BOX-TEST-99', 'BOX-0126-0008']

        console.log(`Resetting allocated_quantity for SKU: ${sku}`)
        console.log(`In boxes: ${boxCodes.join(', ')}`)

        // Get product ID
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id, sku')
            .eq('sku', sku)
            .single()

        if (productError || !product) {
            console.error('Product not found:', productError)
            return
        }

        console.log(`Found product: ${product.sku} (ID: ${product.id})`)

        // Get box IDs
        const { data: boxes, error: boxError } = await supabase
            .from('boxes')
            .select('id, code')
            .in('code', boxCodes)

        if (boxError || !boxes || boxes.length === 0) {
            console.error('Boxes not found:', boxError)
            return
        }

        console.log(`Found ${boxes.length} boxes:`)
        boxes.forEach(box => console.log(`  - ${box.code} (ID: ${box.id})`))

        // Reset allocated_quantity for each box
        for (const box of boxes) {
            const { data: before, error: beforeError } = await supabase
                .from('inventory_items')
                .select('allocated_quantity, quantity')
                .eq('product_id', product.id)
                .eq('box_id', box.id)
                .single()

            if (beforeError) {
                console.log(`  ⚠️  No inventory item found for ${box.code}`)
                continue
            }

            console.log(`\n  Box: ${box.code}`)
            console.log(`    Before: allocated=${before.allocated_quantity}, total=${before.quantity}`)

            const { error: updateError } = await supabase
                .from('inventory_items')
                .update({ allocated_quantity: 0 })
                .eq('product_id', product.id)
                .eq('box_id', box.id)

            if (updateError) {
                console.error(`    ❌ Error updating:`, updateError)
            } else {
                console.log(`    ✅ Reset allocated_quantity to 0`)
            }
        }

        console.log('\n✅ Done!')

    } catch (error) {
        console.error('Error:', error)
    }
}

resetAllocatedQuantity()
