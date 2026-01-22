-- COMPREHENSIVE REPAIR MIGRATION
-- Ensures picking_jobs and picking_tasks have ALL required columns and constraints.

-- 1. FIX PICKING_JOBS
DO $$ 
BEGIN
    -- Add missing columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_jobs' AND column_name = 'code') THEN
        ALTER TABLE picking_jobs ADD COLUMN code TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_jobs' AND column_name = 'assigned_to') THEN
        ALTER TABLE picking_jobs ADD COLUMN assigned_to UUID REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_jobs' AND column_name = 'started_at') THEN
        ALTER TABLE picking_jobs ADD COLUMN started_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_jobs' AND column_name = 'completed_at') THEN
        ALTER TABLE picking_jobs ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
    
    -- Fix Constraints
    ALTER TABLE picking_jobs DROP CONSTRAINT IF EXISTS picking_jobs_status_check;
    UPDATE picking_jobs SET status = 'PENDING' WHERE status NOT IN ('PLANNED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED', 'PENDING');
    ALTER TABLE picking_jobs ADD CONSTRAINT picking_jobs_status_check 
        CHECK (status IN ('PLANNED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED', 'PENDING'));
END $$;

-- 2. FIX PICKING_TASKS
DO $$
BEGIN
    -- Add missing columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_tasks' AND column_name = 'order_item_id') THEN
        ALTER TABLE picking_tasks ADD COLUMN order_item_id UUID REFERENCES outbound_order_items(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_tasks' AND column_name = 'created_at') THEN
        ALTER TABLE picking_tasks ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_tasks' AND column_name = 'picked_quantity') THEN
        ALTER TABLE picking_tasks ADD COLUMN picked_quantity INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_tasks' AND column_name = 'picked_by') THEN
        ALTER TABLE picking_tasks ADD COLUMN picked_by UUID REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_tasks' AND column_name = 'picked_at') THEN
        ALTER TABLE picking_tasks ADD COLUMN picked_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_tasks' AND column_name = 'outbox_id') THEN
        ALTER TABLE picking_tasks ADD COLUMN outbox_id UUID REFERENCES boxes(id);
    END IF;

    -- Fix Constraints
    ALTER TABLE picking_tasks DROP CONSTRAINT IF EXISTS picking_tasks_status_check;
    UPDATE picking_tasks SET status = 'PENDING' WHERE status NOT IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PICKED', 'SKIPPED', 'COMPLETED', 'CANCELLED', 'DONE');
    ALTER TABLE picking_tasks ADD CONSTRAINT picking_tasks_status_check 
        CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PICKED', 'SKIPPED', 'COMPLETED', 'CANCELLED', 'DONE'));
END $$;
