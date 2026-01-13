import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { orderId, isApproved, userId } = await request.json();

        if (!orderId) return NextResponse.json({ success: false, error: 'Missing orderId' });

        const { error } = await supabase
            .from('orders')
            .update({
                is_approved: isApproved,
                approved_at: isApproved ? new Date().toISOString() : null,
                approved_by: isApproved ? userId : null
            })
            .eq('id', orderId);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
