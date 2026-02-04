
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCustomer() {
    const searchName = "Bi&Bê - Hưng Yên";
    console.log(`Searching for customer: "${searchName}"`);

    // 1. Exact Match Check
    const { data: exact, error: err1 } = await supabase
        .from('customers')
        .select('id, code, name')
        .or(`name.eq.${searchName},code.eq.${searchName}`)
        .maybeSingle();

    if (err1) console.error('Exact match error:', err1);
    console.log('Exact match result:', exact);

    // 2. ILIKE Check
    const { data: ilike, error: err2 } = await supabase
        .from('customers')
        .select('id, code, name')
        .ilike('name', searchName)
        .maybeSingle();

    if (err2) console.error('ILIKE error:', err2);
    console.log('ILIKE result:', ilike);

    // 3. Broad Search
    console.log('--- Broad Search for "Bi&Bê" ---');
    const { data: broad, error: err3 } = await supabase
        .from('customers')
        .select('id, code, name')
        .ilike('name', '%Bi&Bê%')
        .limit(5);

    if (err3) console.error('Broad search error:', err3);
    console.log('Broad search results:', JSON.stringify(broad, null, 2));
    // 4. Test problematic .or() syntax
    console.log('--- Testing App Logic .or() syntax ---');
    const cleanName = searchName;
    const { data: appLogic, error: errApp } = await supabase
        .from('customers')
        .select('id, code, name')
        .or(`id.eq.${cleanName},code.eq.${cleanName},name.ilike.${cleanName}`)
        .maybeSingle();

    if (errApp) {
        console.error('App Logic Error:', errApp);
    } else {
        console.log('App Logic Result:', appLogic);
    }
}

checkCustomer();
