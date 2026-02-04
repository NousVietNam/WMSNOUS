
-- Create view for picking exceptions if not exists
DROP VIEW IF EXISTS view_picking_exceptions;
CREATE OR REPLACE VIEW view_picking_exceptions AS
SELECT 
    pe.id,
    pe.task_id,
    pe.box_id,
    pe.quantity_expected,
    pe.quantity_actual,
    pe.exception_type,
    pe.status,
    pe.note,
    pe.created_at,
    pe.resolved_at,
    pe.resolved_by,
    pe.resolution_note,
    pe.user_id,
    
    -- Additional Info
    u.name as user_name,
    b.code as box_code,
    
    pt.product_id,
    p.sku as product_sku,
    p.name as product_name,
    
    pj.code as job_code,
    oo.code as order_code

FROM picking_exceptions pe
LEFT JOIN public.users u ON pe.user_id = u.id
LEFT JOIN boxes b ON pe.box_id = b.id
LEFT JOIN picking_tasks pt ON pe.task_id = pt.id
LEFT JOIN products p ON pt.product_id = p.id
LEFT JOIN picking_jobs pj ON pt.job_id = pj.id
LEFT JOIN outbound_orders oo ON pj.outbound_order_id = oo.id;

-- Grant access
GRANT SELECT ON view_picking_exceptions TO service_role;
GRANT SELECT ON view_picking_exceptions TO authenticated;
GRANT SELECT ON view_picking_exceptions TO anon;
