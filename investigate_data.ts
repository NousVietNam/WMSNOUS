import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function investigate() {
    let output = ""
    const log = (msg: string) => { output += msg + "\n" }

    const productId = "fe9aa482-b6c8-40b5-bbec-a6c1f9d5031a"

    // 1. Check view_product_availability for this specific product
    log("=== VIEW FOR PRODUCT fe9aa482... ===")
    const { data: viewData, error: viewError } = await supabase
        .from('view_product_availability')
        .select('*')
        .eq('product_id', productId)

    if (viewError) {
        log(`Error: ${viewError.message}`)
    } else if (viewData && viewData.length > 0) {
        log(JSON.stringify(viewData[0], null, 2))
    } else {
        log("No data found for this product")
    }

    // 2. Manually run what the view should calculate
    log("")
    log("=== MANUAL CALCULATION ===")

    // Check transfer_order_items with box_id join
    const { data: toiWithBox, error: toiError } = await supabase
        .from('transfer_order_items')
        .select(`
            id, box_id, quantity,
            transfer_orders!inner(status, transfer_type)
        `)
        .eq('transfer_orders.status', 'approved')
        .eq('transfer_orders.transfer_type', 'BOX')

    if (toiError) {
        log(`Transfer items query error: ${toiError.message}`)
    } else {
        log(`Transfer items with BOX type: ${toiWithBox?.length || 0}`)
        if (toiWithBox) {
            toiWithBox.forEach((item: any) => {
                log(`  box_id=${item.box_id}, qty=${item.quantity}`)
            })
        }
    }

    // Get inventory in that box
    log("")
    log("=== INVENTORY IN TRANSFERRED BOX ===")
    const boxId = "0db184a7-eaa2-435e-9bc9-609f64b53000"
    const { data: invInBox } = await supabase
        .from('inventory_items')
        .select('product_id, quantity, products(sku)')
        .eq('box_id', boxId)

    if (invInBox && invInBox.length > 0) {
        log(`Items in box ${boxId}:`)
        invInBox.forEach((item: any) => {
            log(`  product_id=${item.product_id}, ${item.products?.sku}: ${item.quantity}`)
        })
    }

    // Total expected soft_booked_transfers for this product
    log("")
    log("=== EXPECTED soft_booked_transfers ===")
    log("Should be: 1 (from box transfer for product fe9aa482...)")

    fs.writeFileSync('view_debug.txt', output)
    console.log("Results saved to view_debug.txt")
}

investigate().catch(console.error)
