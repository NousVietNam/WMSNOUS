-- =====================================================
-- Migration: Unified Outbound Schema
-- Description: Consolidate Orders/TransferOrders into outbound_orders
--              Create structured Picking Jobs/Tasks
--              Drop legacy Triggers to move to RPC-driven logic
-- =====================================================

-- 1. DROP LEGACY TRIGGERS (CRITICAL)
-- Stop "magic" inventory updates. All updates will now go through RPCs.
DROP TRIGGER IF EXISTS tr_picking_allocation ON picking_tasks;
DROP FUNCTION IF EXISTS fn_update_inventory_allocation();

-- 2. Create Outbound Orders Table (Unified)
CREATE TABLE IF NOT EXISTS outbound_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE, -- Format: SO-MMYY-XXXXX or TO-MMYY-XXXXX
    
    -- Types
    type TEXT NOT NULL CHECK (type IN ('SALE', 'TRANSFER', 'INTERNAL', 'GIFT')),
    transfer_type TEXT CHECK (transfer_type IN ('ITEM', 'BOX')), -- Only for TRANSFER/INTERNAL

    -- Status & Workflow
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED')),
    is_approved BOOLEAN DEFAULT FALSE,
    approved_at TIMESTAMPTZ,
    approved_by UUID, -- FK to auth.users
    
    -- Partners / Key Relations
    customer_id UUID REFERENCES customers(id), -- For SALE
    destination_id UUID REFERENCES destinations(id), -- For TRANSFER
    sale_staff_id UUID REFERENCES users(id), -- Sales Person
    created_by UUID REFERENCES users(id),
    
    -- Financials
    currency TEXT DEFAULT 'VND',
    subtotal DECIMAL(15, 2) DEFAULT 0,
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    total DECIMAL(15, 2) DEFAULT 0,
    note TEXT,
    
    -- Metadata
    external_ref TEXT, -- e.g. imported from Excel
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2b. Ensure Columns Exist (Safety for existing tables)
DO $$ 
BEGIN
    -- Core Fields
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS code TEXT;
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('SALE', 'TRANSFER', 'INTERNAL', 'GIFT'));
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS transfer_type TEXT CHECK (transfer_type IN ('ITEM', 'BOX'));
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';
    
    -- Approval Workflow
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS approved_by UUID;
    
    -- Financials 
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15, 2) DEFAULT 0;
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(15, 2) DEFAULT 0;
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS total DECIMAL(15, 2) DEFAULT 0;
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'VND';
    
    -- Partners & References
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS sale_staff_id UUID REFERENCES users(id);
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES destinations(id);
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS external_ref TEXT;
    
    -- Timestamps
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
END $$;

-- 3. Create Outbound Order Items
CREATE TABLE IF NOT EXISTS outbound_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES outbound_orders(id) ON DELETE CASCADE,
    
    product_id UUID NOT NULL REFERENCES products(id),
    
    -- Quantities
    quantity INT NOT NULL CHECK (quantity > 0),
    picked_quantity INT DEFAULT 0, -- Accumulated from tasks
    
    -- Financial (Snapshot)
    unit_price DECIMAL(15, 2) DEFAULT 0,
    line_total DECIMAL(15, 2) DEFAULT 0,
    
    -- Linking (For Box Mode, purely informational or for pre-alloc)
    from_box_id UUID REFERENCES boxes(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Picking Jobs (Header)
-- Replaces/Enhances old logic. Manages a "Batch" of picking.
CREATE TABLE IF NOT EXISTS picking_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outbound_order_id UUID NOT NULL REFERENCES outbound_orders(id),
    
    code TEXT, -- Optional short code
    type TEXT CHECK (type IN ('ITEM_PICK', 'BOX_PICK')),
    status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    
    assigned_to UUID REFERENCES users(id), -- Specific staff assignment
    
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Picking Tasks (Detailed execution)
-- Note: Check if table exists (legacy), if so, we might need to alter or recreate.
-- For safety in this script, we assume we migrate/drop old or ALTER.
-- Let's ALTER existing if exists, or CREATE if not.

CREATE TABLE IF NOT EXISTS picking_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relations
    job_id UUID REFERENCES picking_jobs(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES outbound_order_items(id),
    
    -- What to pick
    product_id UUID NOT NULL REFERENCES products(id),
    box_id UUID NOT NULL REFERENCES boxes(id), -- Source Box
    quantity INT NOT NULL,
    
    -- Execution
    picked_quantity INT DEFAULT 0,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PICKED', 'SHORT', 'SKIPPED')),
    
    -- Audit
    picked_by UUID REFERENCES users(id),
    picked_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Update Boxes (Add LOCKED status)
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE boxes ADD COLUMN status TEXT DEFAULT 'OPEN';
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    
    -- Fix existing invalid statuses before applying constraint (Critical fix)
    UPDATE boxes 
    SET status = 'OPEN' 
    WHERE status IS NULL OR status NOT IN ('OPEN', 'LOCKED', 'SHIPPED');

    -- Add check constraint if not exists (Drop old one to be safe)
    ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_status_check;
    ALTER TABLE boxes ADD CONSTRAINT boxes_status_check CHECK (status IN ('OPEN', 'LOCKED', 'SHIPPED'));
END $$;
