
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const statements = [
    // 1. Drop existing potential constraints to avoid conflicts
    `ALTER TABLE picking_jobs DROP CONSTRAINT IF EXISTS picking_jobs_user_id_fkey;`,
    `ALTER TABLE picking_jobs DROP CONSTRAINT IF EXISTS picking_jobs_assigned_to_fkey;`,
    `ALTER TABLE picking_jobs DROP CONSTRAINT IF EXISTS fk_picking_jobs_user;`,
    `ALTER TABLE picking_jobs DROP CONSTRAINT IF EXISTS fk_picking_jobs_assignee;`,

    // 2. Add with EXPLICIT names
    `ALTER TABLE picking_jobs 
     ADD CONSTRAINT fk_picking_jobs_user 
     FOREIGN KEY (user_id) REFERENCES users(id);`,

    `ALTER TABLE picking_jobs 
     ADD CONSTRAINT fk_picking_jobs_assignee 
     FOREIGN KEY (assigned_to) REFERENCES users(id);`,

    // 3. Notify schema reload
    `NOTIFY pgrst, 'reload schema';`
];

async function fix() {
    console.log("Definitive FK Fix...");
    for (const sql of statements) {
        console.log("Exec:", sql);
        const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
        if (error) console.error("Error:", error.message);
    }
    console.log("Done.");
}

fix();
