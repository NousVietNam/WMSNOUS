
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const sku = 'S26NB2-AO1-F01-SN-L'; // "Khẩu trang màu nâu L"
    const { data: products } = await supabase.from('products').select('*').eq('sku', sku);
    if (!products.length) { console.log("L Product not found"); return; }
    const product = products[0];

    // Check PIECE View
    const { data: viewPiece } = await supabase
        .from('view_product_availability')
        .select('*')
        .eq('product_id', product.id)
        .single();

    console.log(`L - PIECE View Availability: ${viewPiece ? viewPiece.available_quantity : 'N/A'}`);

    // Check BULK View
    const { data: viewBulk } = await supabase
        .from('view_product_availability_bulk')
        .select('*')
        .eq('product_id', product.id)
        .single();

    console.log(`L - BULK View Availability: ${viewBulk ? viewBulk.available_quantity : 'N/A'}`);
}

debug();
