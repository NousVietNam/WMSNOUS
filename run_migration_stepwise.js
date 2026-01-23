
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const statements = [
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS last_update TIMESTAMPTZ;",
    `UPDATE locations l
     SET last_update = (
         SELECT MAX(created_at)
         FROM transactions t
         WHERE t.from_location_id = l.id OR t.to_location_id = l.id
     );`,
    `CREATE OR REPLACE FUNCTION update_location_last_update()
     RETURNS TRIGGER AS $$
     BEGIN
         -- Update source location
         IF NEW.from_location_id IS NOT NULL THEN
             UPDATE locations
             SET last_update = NEW.created_at
             WHERE id = NEW.from_location_id;
         END IF;
     
         -- Update destination location
         IF NEW.to_location_id IS NOT NULL THEN
             UPDATE locations
             SET last_update = NEW.created_at
             WHERE id = NEW.to_location_id;
         END IF;
     
         RETURN NEW;
     END;
     $$ LANGUAGE plpgsql;`,
    "DROP TRIGGER IF EXISTS tr_update_location_last_update ON transactions;",
    `CREATE TRIGGER tr_update_location_last_update
     AFTER INSERT ON transactions
     FOR EACH ROW
     EXECUTE FUNCTION update_location_last_update();`
];

async function runSteps() {
    for (let i = 0; i < statements.length; i++) {
        console.log(`Step ${i + 1}/${statements.length}...`)
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: statements[i] })
        if (error) {
            console.error(`Step ${i + 1} failed:`)
            console.error(JSON.stringify(error, null, 2))
            process.exit(1)
        }
    }
    console.log("All migration steps completed successfully!")
}

runSteps().catch(console.error)
