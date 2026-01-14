import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/stock?channel=RETAIL|WHOLESALE
 * Returns available stock for each product based on the requested channel.
 * Only returns products where `fulfillment_channels` includes the requested channel.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const channel = searchParams.get('channel')?.toUpperCase() || 'RETAIL'
        const product_id = searchParams.get('product_id')

        // 1. Get products that are configured for this channel
        let productQuery = supabase
            .from('products')
            .select('id, name, sku, barcode, fulfillment_channels')

        // Filter by fulfillment_channels array containing the requested channel
        productQuery = productQuery.contains('fulfillment_channels', [channel])

        if (product_id) {
            productQuery = productQuery.eq('id', product_id)
        }

        const { data: products, error: productsError } = await productQuery

        if (productsError) {
            return NextResponse.json({ error: productsError.message }, { status: 500 })
        }

        if (!products || products.length === 0) {
            return NextResponse.json({
                data: [],
                message: `Không có sản phẩm nào được cấu hình cho kênh ${channel}`
            })
        }

        const productIds = products.map(p => p.id)

        // 2. Get stock based on channel
        let stockData: { product_id: string, total: number }[] = []

        if (channel === 'RETAIL') {
            // Query from boxes table (sum items per product)
            const { data: boxStock, error } = await supabase
                .from('boxes')
                .select('product_id, items')
                .in('product_id', productIds)

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 })
            }

            // Aggregate by product
            const aggregated = new Map<string, number>()
            boxStock?.forEach(box => {
                const current = aggregated.get(box.product_id) || 0
                aggregated.set(box.product_id, current + (box.items || 0))
            })
            stockData = Array.from(aggregated.entries()).map(([product_id, total]) => ({ product_id, total }))

        } else if (channel === 'WHOLESALE') {
            // Query from bulk_inventory table
            const { data: bulkStock, error } = await supabase
                .from('bulk_inventory')
                .select('product_id, quantity')
                .in('product_id', productIds)

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 })
            }

            // Aggregate by product
            const aggregated = new Map<string, number>()
            bulkStock?.forEach(inv => {
                const current = aggregated.get(inv.product_id) || 0
                aggregated.set(inv.product_id, current + (inv.quantity || 0))
            })
            stockData = Array.from(aggregated.entries()).map(([product_id, total]) => ({ product_id, total }))
        }

        // 3. Merge product info with stock
        const result = products.map(product => {
            const stock = stockData.find(s => s.product_id === product.id)
            return {
                product_id: product.id,
                name: product.name,
                sku: product.sku,
                barcode: product.barcode,
                channel: channel,
                available: stock?.total || 0
            }
        })

        return NextResponse.json({
            channel,
            data: result,
            summary: {
                total_products: result.length,
                total_available: result.reduce((sum, r) => sum + r.available, 0)
            }
        })

    } catch (error) {
        console.error('Stock API Error:', error)
        return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
    }
}
