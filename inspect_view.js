
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://syjqmspmlctadbaeqyxb.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5anFtc3BtbGN0YWRiYWVxeXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk4MDk4NDYsImV4cCI6MjAyNTM4NTg0Nn0.M2zW_aZ_3J_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1_1';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log("Fetching view...");
    const { data, error } = await supabase
        .from('view_box_contents_unified')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error:", error);
    } else {
        if (data && data.length > 0) {
            console.log("Columns:", Object.keys(data[0]));
            console.log("Sample:", data[0]);
        } else {
            console.log("View is empty or accessible but no data.");
        }
    }
}

inspect();
