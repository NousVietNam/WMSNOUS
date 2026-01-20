import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getBoxStatus() {
    const { data } = await supabase.from('boxes').select('id, code, status, order_id').limit(20)
    console.log("BOX STATUS CHECK:")
    console.log(JSON.stringify(data, null, 2))
}

getBoxStatus()
