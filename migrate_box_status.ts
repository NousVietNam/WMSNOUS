import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function migrateBoxStatus() {
    console.log("Starting Box Status Migration...")

    // Find all boxes with order_id that are not already LOCKED
    const { data: boxes, error } = await supabase
        .from('boxes')
        .select('id, code, status, order_id')
        .not('order_id', 'is', null)

    if (error) {
        console.error("Fetch Error:", error)
        return
    }

    if (!boxes || boxes.length === 0) {
        console.log("No boxes found with order_id.")
        return
    }

    console.log(`Found ${boxes.length} boxes to update.`)

    for (const box of boxes) {
        if (box.status !== 'LOCKED') {
            const { error: updateError } = await supabase
                .from('boxes')
                .update({ status: 'LOCKED' })
                .eq('id', box.id)

            if (updateError) {
                console.error(`Error updating box ${box.code}:`, updateError)
            } else {
                console.log(`Updated box ${box.code} to LOCKED`)
            }
        }
    }

    console.log("Migration complete.")
}

migrateBoxStatus()
