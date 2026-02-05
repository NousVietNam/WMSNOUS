
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
        type: 'PRODUCT',
        product,
        piece: pieceItems || [],
        bulk: bulkItems || []
    };
}

export async function getBoxContents(boxCode: string) {
    // Find Box
    const { data: box, error: bErr } = await supabase
        .from('boxes')
        .select('id, code, status, type, locations (code)')
        .eq('code', boxCode)
        .maybeSingle();

    if (bErr || !box) return null;

    // Fetch Contents (Items/Pieces)
    const { data: items } = await supabase
        .from('inventory_items')
        .select(`
            quantity,
            allocated_quantity,
            products (sku, name)
        `)
        .eq('box_id', box.id)
        .gt('quantity', 0);

    // Fetch Bulk Contents
    const { data: bulk } = await supabase
        .from('bulk_inventory')
        .select(`
            quantity,
            allocated_quantity,
            products (sku, name)
        `)
        .eq('box_id', box.id)
        .gt('quantity', 0);

    return {
        type: 'BOX',
        box,
        items: items || [],
        bulk: bulk || []
    };
}

export async function getLocationContents(locCode: string) {
    // Find Location
    const { data: location, error: lErr } = await supabase
        .from('locations')
        .select('id, code, type, description, zone')
        .eq('code', locCode)
        .maybeSingle();

    if (lErr || !location) return null;

    // Find Boxes in this location
    const { data: boxes } = await supabase
        .from('boxes')
        .select('id, code, status')
        .eq('location_id', location.id);

    // Find direct items (Loose) in this location
    const { data: looseItems } = await supabase
        .from('inventory_items')
        .select(`
            quantity,
            allocated_quantity,
            products (sku, name)
        `)
        .eq('location_id', location.id)
        .is('box_id', null)
        .gt('quantity', 0);

    return {
        type: 'LOCATION',
        location,
        boxes: boxes || [],
        looseItems: looseItems || []
    };
}

export async function smartLookup(code: string) {
    // Try Product first
    const product = await getInventoryByBarcode(code);
    if (product) return product;

    // Try Box
    const box = await getBoxContents(code);
    if (box) return box;

    // Try Location
    const location = await getLocationContents(code);
    if (location) return location;

    return null;
}
