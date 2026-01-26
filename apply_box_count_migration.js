const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const statements = [
    // 1. Add column
    "ALTER TABLE outbound_shipments ADD COLUMN IF NOT EXISTS box_count INT DEFAULT 0;",

    // 2. Update RPC - Minified / Cleaned
    `CREATE OR REPLACE FUNCTION ship_outbound_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_box_ids UUID[];
    v_pxk_code TEXT;
    v_shipment_id UUID;
    v_item_count INT;
    v_box_count INT;
    v_job_id UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Order not found'); 
    END IF;
    
    IF v_order.status = 'SHIPPED' THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Order already shipped'); 
    END IF;

    IF v_order.status != 'PACKED' AND v_order.status != 'COMPLETED' THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Order not ready (PACKED)'); 
    END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM outbound_order_items WHERE outbound_order_id = p_order_id;
    
    SELECT COUNT(*) INTO v_box_count FROM boxes WHERE outbound_order_id = p_order_id;

    SELECT id INTO v_job_id FROM picking_jobs WHERE outbound_order_id = p_order_id ORDER BY created_at DESC LIMIT 1;

    v_pxk_code := generate_pxk_code();

    INSERT INTO outbound_shipments (
        code, source_type, source_id, created_by, outbound_order_id, picking_job_id, customer_name, box_count, metadata
    )
    VALUES (
        v_pxk_code, v_order.type, p_order_id, v_user_id, p_order_id, v_job_id, COALESCE(v_order.customer_name, 'N/A'), v_box_count,
        jsonb_build_object('item_count', v_item_count, 'original_code', v_order.code, 'order_type', v_order.type)
    )
    RETURNING id INTO v_shipment_id;

    UPDATE outbound_orders SET status = 'SHIPPED', updated_at = NOW() WHERE id = p_order_id;

    SELECT array_agg(id) INTO v_box_ids FROM boxes WHERE outbound_order_id = p_order_id;

    IF v_box_ids IS NOT NULL THEN
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, user_id, note, created_at)
        SELECT 
            CASE WHEN v_order.type = 'TRANSFER' THEN 'TRANSFER_OUT' ELSE 'SHIP' END,
            'ITEM', -i.quantity, p.sku, v_shipment_id, i.box_id, v_user_id, 'Export ' || v_order.code || ' (' || v_pxk_code || ')', NOW()
        FROM inventory_items i 
        JOIN products p ON i.product_id = p.id 
        WHERE i.box_id = ANY(v_box_ids);
        
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);
        UPDATE boxes SET status = 'SHIPPED', updated_at = NOW() WHERE id = ANY(v_box_ids);
    END IF;

    IF v_job_id IS NOT NULL THEN
        UPDATE picking_jobs SET status = 'COMPLETED', completed_at = NOW() WHERE id = v_job_id AND status != 'COMPLETED';
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Shipped: ' || v_pxk_code, 'shipment_code', v_pxk_code, 'shipment_id', v_shipment_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;`
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
    console.log("Migration applied successfully!")
}

runSteps().catch(console.error)
