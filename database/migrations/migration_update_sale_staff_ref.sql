-- Update outbound_orders.sale_staff_id to reference internal_staff(id) instead of users(id)

DO $$ 
BEGIN
    -- Drop existing constraint if it exists (it might be named differently or point to users)
    -- We'll try to find the constraint name dynamically or just drop the common ones
    ALTER TABLE outbound_orders DROP CONSTRAINT IF EXISTS outbound_orders_sale_staff_id_fkey;
    
    -- Re-add the reference to internal_staff
    ALTER TABLE outbound_orders 
    ADD CONSTRAINT outbound_orders_sale_staff_id_fkey 
    FOREIGN KEY (sale_staff_id) REFERENCES internal_staff(id);
END $$;
