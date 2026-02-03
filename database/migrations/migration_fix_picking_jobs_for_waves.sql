
-- Fix picking_jobs table to support Waves
DO $$ 
BEGIN
    -- Add code column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='picking_jobs' AND column_name='code') THEN
        ALTER TABLE picking_jobs ADD COLUMN code TEXT UNIQUE;
    END IF;

    -- Add wave_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='picking_jobs' AND column_name='wave_id') THEN
        ALTER TABLE picking_jobs ADD COLUMN wave_id UUID REFERENCES pick_waves(id);
    END IF;

    -- Add product_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='picking_jobs' AND column_name='product_id') THEN
        ALTER TABLE picking_jobs ADD COLUMN product_id UUID REFERENCES products(id);
    END IF;

    -- Add quantity_requested column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='picking_jobs' AND column_name='quantity_requested') THEN
        ALTER TABLE picking_jobs ADD COLUMN quantity_requested INT DEFAULT 0;
    END IF;

    -- Add quantity_picked column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='picking_jobs' AND column_name='quantity_picked') THEN
        ALTER TABLE picking_jobs ADD COLUMN quantity_picked INT DEFAULT 0;
    END IF;

    -- Add assigned_to column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='picking_jobs' AND column_name='assigned_to') THEN
        ALTER TABLE picking_jobs ADD COLUMN assigned_to UUID REFERENCES auth.users(id);
    END IF;

    -- Add from_location column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='picking_jobs' AND column_name='from_location') THEN
        ALTER TABLE picking_jobs ADD COLUMN from_location TEXT;
    END IF;

    -- Add updated_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='picking_jobs' AND column_name='updated_at') THEN
        ALTER TABLE picking_jobs ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
