import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const query = searchParams.get('q')?.trim()

        if (!query) {
            return NextResponse.json({ success: true, data: [] })
        }

        // 1. Search for Products matching the query (Name, SKU, Barcode, etc.)
        // returns item_ids
        const { data: matchedProducts } = await supabase
            .from('products')
            .select('id')
            .or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode.ilike.%${query}%,general_code.ilike.%${query}%`)
            .limit(50)

        const matchedProductIds = matchedProducts?.map(i => i.id) || []

        // 2. Find Boxes containing these items
        // Use 'inventory_items' instead of 'box_items'
        let matchedBoxIds = new Set<string>()

        if (matchedProductIds.length > 0) {
            const { data: inventoryItems } = await supabase
                .from('inventory_items')
                .select('box_id')
                .in('product_id', matchedProductIds)

            inventoryItems?.forEach(bi => matchedBoxIds.add(bi.box_id))
        }

        // 3. Also Search for Boxes explicitly matching query (Box Code)
        const { data: matchedBoxes } = await supabase
            .from('boxes')
            .select('id, location_id')
            .ilike('code', `%${query}%`)
            .limit(50)

        matchedBoxes?.forEach(b => matchedBoxIds.add(b.id))

        const finalBoxIds = Array.from(matchedBoxIds)

        // 4. Find Locations for these Boxes
        let matchedLocationIds = new Set<string>()

        if (finalBoxIds.length > 0) {
            const { data: boxesWithLoc } = await supabase
                .from('boxes')
                .select('location_id')
                .in('id', finalBoxIds)
                .not('location_id', 'is', null) // Only storage boxes

            boxesWithLoc?.forEach(b => {
                if (b.location_id) matchedLocationIds.add(b.location_id)
            })
        }

        // 5. Also Search for Locations explicitly matching query (Location Code)
        const { data: matchedLocations } = await supabase
            .from('locations')
            .select('id')
            .ilike('code', `%${query}%`)
            .limit(50)

        matchedLocations?.forEach(l => matchedLocationIds.add(l.id))

        return NextResponse.json({
            success: true,
            data: Array.from(matchedLocationIds)
        })

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
