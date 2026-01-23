
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testOptimizedFetch() {
    console.time('FetchData')

    // 1. Fetch Locations with box count
    const { data: locations, error: locError } = await supabase
        .from('locations')
        .select('*, boxes(count)')
        .order('code')

    if (locError) throw locError

    // 2. Fetch Transactions (only needed for update date)
    // We only need the latest per location, but fetching all is simpler and small enough
    const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('from_location_id, to_location_id, created_at')
        .order('created_at', { ascending: false })

    if (txError) throw txError

    console.timeEnd('FetchData')

    console.time('ProcessData')
    // 3. Map transactions to locations
    const lastUpdateMap = new Map()
    transactions?.forEach(tx => {
        if (tx.from_location_id && !lastUpdateMap.has(tx.from_location_id)) {
            lastUpdateMap.set(tx.from_location_id, tx.created_at)
        }
        if (tx.to_location_id && !lastUpdateMap.has(tx.to_location_id)) {
            lastUpdateMap.set(tx.to_location_id, tx.created_at)
        }
    })

    const enriched = locations.map(l => ({
        ...l,
        box_count: l.boxes?.[0]?.count || 0,
        last_update: lastUpdateMap.get(l.id) || null
    }))
    console.timeEnd('ProcessData')

    console.log(`Successfully enriched ${enriched.length} locations.`)
    console.log(`Example: ${enriched[0].code} last update: ${enriched[0].last_update}`)
}

testOptimizedFetch().catch(console.error)
