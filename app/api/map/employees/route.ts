import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    // Use Service Role to ensure we can see all employees regardless of RLS for this Admin Map
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        // 1. Get cutoff time (4 hours ago)
        const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

        // 2. Fetch recent transactions with user and location info
        // We only care about transactions that have a 'to_box_id' (putaway/move) or 'from_box_id' (pick)
        // Adjust logic: Ideally we want the LAST transaction per user.

        // Since Supabase doesn't support "distinct on" easily via JS client builder in complex joins sometimes, 
        // we'll fetch a reasonable batch of recent logs and process in JS, or use a raw RPC if performance is bad later.
        // For now, JS processing for < 100 employees is fine.

        const { data, error } = await supabase
            .from('transactions')
            .select(`
                id,
                created_at,
                user_id,
                users!user_id (id, name),
                to_box:to_box_id (
                    id, 
                    code, 
                    locations (
                        id, 
                        code, 
                        pos_x, 
                        pos_y
                    )
                ),
                from_box:from_box_id (
                     id, 
                    code, 
                    locations (
                        id, 
                        code, 
                        pos_x, 
                        pos_y
                    )
                )
            `)
            .gte('created_at', cutoff)
            .order('created_at', { ascending: false })
            .limit(500) // 500 recent actions should fail-safe cover all active employees

        if (error) throw error

        // 3. Process to find latest unique location per user
        const userMap = new Map()

        data?.forEach((tx: any) => {
            const userId = tx.user_id
            if (!userId || userMap.has(userId)) return

            // users might be array or object depending on relationship, usually object if 1:1 or N:1
            const user = Array.isArray(tx.users) ? tx.users[0] : tx.users
            if (!user) return

            // Determine Location: To Box > From Box
            // Logic: If I put something TO a box, I am AT that box. 
            // If I take FROM a box, I am AT that box.

            const locationData = tx.to_box?.locations || tx.from_box?.locations

            if (locationData) {
                userMap.set(userId, {
                    id: user.id,
                    name: user.name || 'Unknown',
                    lastActive: tx.created_at,
                    locationCode: locationData.code,
                    // We might not need coordinates here if frontend maps code -> 3D pos, 
                    // BUT sending them saves frontend lookup if DB has them.
                    // However, `pos_x` in DB might be grid-based. Let's assume frontend does the mapping to be safe/consistent with `stacks` prop.
                    // Actually, sending code is safer.
                })
            }
        })

        const employees = Array.from(userMap.values())

        return NextResponse.json({ employees })

    } catch (error: any) {
        console.error('Error fetching employee locations:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
