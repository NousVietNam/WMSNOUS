
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
    console.log('Seeding robust test data (Retry 2)...');

    // 1. Get User
    const { data: users } = await supabase.from('users').select('id, name').limit(1);
    if (!users || users.length === 0) { console.error('No users!'); return; }
    const user = users[0];
    console.log(`User: ${user.name}`);

    // 2. Upsert Location "A-01-01"
    const locCode = 'A-01-01';
    const { data: loc, error: locErr } = await supabase.from('locations').upsert({
        code: locCode,
        type: 'SHELF',
        capacity: 100,
        pos_x: 2,
        pos_y: 2,
        width: 2,
        height: 2
    }, { onConflict: 'code' }).select().single();

    if (locErr) { console.error('Loc Error:', locErr); return; }
    console.log(`Location: ${loc.code}`);

    // 3. Upsert Box
    const boxCode = 'BOX-TEST-001';
    const { data: box, error: boxErr } = await supabase.from('boxes').upsert({
        code: boxCode,
        location_id: loc.id,
        status: 'OPEN', // Fixed status
        type: 'STORAGE' // Fixed type
    }, { onConflict: 'code' }).select().single();

    if (boxErr) { console.error('Box Error:', boxErr); return; }
    console.log(`Box: ${box.code}`);

    // 4. Insert Transaction
    const { error: txErr } = await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'PUTAWAY',
        status: 'COMPLETED',
        to_box_id: box.id,
        created_at: new Date().toISOString()
    });

    if (txErr) console.error('Tx Error:', txErr);
    else console.log('Transaction inserted successfully!');
}

seed();
