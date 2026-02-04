
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

export async function getInventoryByBarcode(code: string) {
    // 1. Find Product by barcode or SKU
    const { data: product, error: pErr } = await supabase
        .from('products')
        .select('id, name, sku, barcode, image_url')
        .or(`barcode.eq."${code}",sku.eq."${code}"`)
        .maybeSingle();

    if (pErr || !product) {
        console.log(`Product not found for code: ${code}`);
        return null;
    }

    // 2. Fetch Piece Inventory
    const { data: pieceItems } = await supabase
        .from('inventory_items')
        .select(`
            quantity,
            allocated_quantity,
            locations (code),
            boxes (
                code,
                locations (code)
            )
        `)
        .eq('product_id', product.id)
        .gt('quantity', 0);

    // 3. Fetch Bulk Inventory
    const { data: bulkItems } = await supabase
        .from('bulk_inventory')
        .select(`
            quantity,
            allocated_quantity,
            boxes (
                code,
                locations (code)
            )
        `)
        .eq('product_id', product.id)
        .gt('quantity', 0);

    return {
        product,
        piece: pieceItems || [],
        bulk: bulkItems || []
    };
}
