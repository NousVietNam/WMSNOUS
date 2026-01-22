const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function resetAllocations() {
    try {
        console.log('🔄 Resetting allocated quantities to 0...\n')

        // First, check how many items have allocated_quantity > 0
        const { data: allocatedItems, error: checkError } = await supabase
            .from('inventory_items')
            .select('id, product_id, location_id, quantity, allocated_quantity, products(sku, name)')
            .gt('allocated_quantity', 0)

        if (checkError) {
            console.error('❌ Error checking allocations:', checkError)
            return
        }

        if (!allocatedItems || allocatedItems.length === 0) {
            console.log('ℹ️  No items with allocated_quantity > 0 found')
            return
        }

        console.log(`Found ${allocatedItems.length} items with allocated quantities:`)
        allocatedItems.forEach((item, i) => {
            const product = item.products
            console.log(`  ${i + 1}. ${product?.sku || 'N/A'} - ${product?.name || 'N/A'}`)
            console.log(`     Qty: ${item.quantity}, Allocated: ${item.allocated_quantity}`)
        })

        console.log('\n🔄 Resetting all allocated_quantity to 0...')

        // Reset all allocated_quantity to 0
        const { error: resetError } = await supabase
            .from('inventory_items')
            .update({ allocated_quantity: 0 })
            .gt('allocated_quantity', 0)

        if (resetError) {
            console.error('❌ Error resetting allocations:', resetError)
            return
        }

        console.log(`✅ Successfully reset ${allocatedItems.length} items to allocated_quantity = 0`)

        // Verify
        const { data: remaining, error: verifyError } = await supabase
            .from('inventory_items')
            .select('id')
            .gt('allocated_quantity', 0)

        if (verifyError) {
            console.error('❌ Error verifying:', verifyError)
        } else {
            console.log(`\n✅ Verification: ${remaining?.length || 0} items still have allocated_quantity > 0`)
        }

    } catch (e) {
        console.error('❌ Unexpected error:', e)
    }
}

resetAllocations()
