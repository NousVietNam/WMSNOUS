
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const statements = [
    `DO $$
    BEGIN
        -- FK for user_id
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'picking_jobs_user_id_fkey') THEN
            ALTER TABLE picking_jobs ADD CONSTRAINT picking_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
        END IF;

        -- FK for assigned_to
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'picking_jobs_assigned_to_fkey') THEN
            ALTER TABLE picking_jobs ADD CONSTRAINT picking_jobs_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id);
        END IF;
    END $$;`,

    `NOTIFY pgrst, 'reload schema';`
];

async function runSteps() {
    console.log("Applying picking_jobs FK fixes...");
    for (let i = 0; i < statements.length; i++) {
        console.log(`Executing step ${i + 1}...`)
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: statements[i] })
        if (error) {
            console.error(`Step ${i + 1} failed:`, error.message)
            // If exec_sql doesn't exist, this will fail.
            // In that case, we can't do much without user intervention or a proper migration system.
        } else {
            console.log(`Step ${i + 1} distinct success.`)
        }
    }
    console.log("Migration steps completed.")
}

runSteps().catch(err => console.error("Script error:", err))
