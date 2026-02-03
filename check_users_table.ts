
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function check() {
    const { data, error } = await s
        .from('users')
        .select('*')
        .limit(1)

    if (error) console.log('Error querying public.users:', error)
    else console.log('public.users exists:', data)
}
check()
