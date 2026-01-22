const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function searchForJobs() {
    try {
        console.log('🔍 Searching across all tables for job codes...\n')

        const targetCodes = ['JOB-1F93CC58', 'JOB-O0B97AAA', 'JOB-8CD37D93', 'JOB-COB7C91F']

        // Check picking_jobs
        console.log('📋 Checking picking_jobs table:')
        const { data: pickingJobs } = await supabase
            .from('picking_jobs')
            .select('*')
            .in('code', targetCodes)
        console.log(`  Found ${pickingJobs?.length || 0} jobs`)
        if (pickingJobs && pickingJobs.length > 0) {
            pickingJobs.forEach(j => console.log(`    - ${j.code} (${j.status})`))
        }

        // Check outbound_orders
        console.log('\n📦 Checking outbound_orders table:')
        const { data: outboundOrders } = await supabase
            .from('outbound_orders')
            .select('*')
            .in('code', targetCodes)
        console.log(`  Found ${outboundOrders?.length || 0} orders`)
        if (outboundOrders && outboundOrders.length > 0) {
            outboundOrders.forEach(o => console.log(`    - ${o.code} (${o.status})`))
        }

        // Check orders (old table)
        console.log('\n📝 Checking orders table:')
        const { data: orders } = await supabase
            .from('orders')
            .select('*')
            .in('code', targetCodes)
        console.log(`  Found ${orders?.length || 0} orders`)
        if (orders && orders.length > 0) {
            orders.forEach(o => console.log(`    - ${o.code} (${o.status})`))
        }

        // List recent outbound_orders to see what's there
        console.log('\n📊 Recent outbound_orders:')
        const { data: recentOrders } = await supabase
            .from('outbound_orders')
            .select('id, code, status, created_at')
            .order('created_at', { ascending: false })
            .limit(10)

        if (recentOrders) {
            recentOrders.forEach((o, i) => {
                console.log(`  ${i + 1}. ${o.code} - ${o.status} - ${new Date(o.created_at).toLocaleString('vi-VN')}`)
            })
        }

    } catch (e) {
        console.error('❌ Error:', e)
    }
}

searchForJobs()
