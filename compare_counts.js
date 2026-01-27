
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

async function compare() {
    const { count: countPiece, error: errPiece } = await supabase
        .from('inventory_items')
        .select('*', { count: 'exact', head: true });

    const { count: countBulk, error: errBulk } = await supabase
        .from('bulk_inventory')
        .select('*', { count: 'exact', head: true });

    console.log("Piece Count:", countPiece, "Error:", errPiece);
    console.log("Bulk Count:", countBulk, "Error:", errBulk);
}

compare();
