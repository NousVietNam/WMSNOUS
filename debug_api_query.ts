
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=')
    if (key && val) env[key.trim()] = val.trim().replace(/"/g, '')
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function run() {
    console.log("🐞 Debugging API Query Join...")

    // Find transfer ID
    const { data: tf } = await supabase.from('transfer_orders').select('id').eq('transfer_type', 'BOX').limit(1).single()
    if (!tf) { console.log("No Box Transfer"); return }
    const transferId = tf.id
    console.log("Testing with Transfer ID:", transferId)

    const { data: items, error: itemsError } = await supabase
        .from('transfer_order_items')
        .select(`
                *,
                products (id, sku, name),
                boxes (id, code, location_id) 
            `)
        .eq('transfer_id', transferId)

    if (itemsError) console.error("Query Error:", itemsError)
    else {
        console.log(`Found ${items.length} items.`)
        items.forEach(i => {
            console.log(`Item ID: ${i.id}, BoxID: ${i.box_id}`)
            console.log(`Boxes Linked:`, i.boxes)
        })
    }
}
run()
