
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
    const { data: boxes } = await supabase.from('boxes').select('*').limit(1);
    console.log('Box columns:', boxes && boxes.length > 0 ? Object.keys(boxes[0]) : 'No data');

    const { data: locations } = await supabase.from('locations').select('*').limit(1);
    console.log('Location columns:', locations && locations.length > 0 ? Object.keys(locations[0]) : 'No data');
}

inspect();
