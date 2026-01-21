-- Create internal_staff table for internal purchasing staff
-- These are employee codes used for INTERNAL orders (staff purchases), not system users

CREATE TABLE IF NOT EXISTS internal_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE, -- Mã nhân viên
    name VARCHAR(255) NOT NULL,
    department VARCHAR(100), -- Phòng ban
    phone VARCHAR(50),
    email VARCHAR(255),
    note TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index
CREATE INDEX IF NOT EXISTS idx_internal_staff_code ON internal_staff(code);
CREATE INDEX IF NOT EXISTS idx_internal_staff_name ON internal_staff(name);

-- Update customers table to have a code column and sale_staff_id
ALTER TABLE customers ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sale_staff_id UUID REFERENCES internal_staff(id);

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_code_key') THEN
        ALTER TABLE customers ADD CONSTRAINT customers_code_key UNIQUE (code);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_sale_staff ON customers(sale_staff_id);

-- Enable RLS
ALTER TABLE internal_staff ENABLE ROW LEVEL SECURITY;

-- Create policy for all access (Drop if exists for idempotency)
DROP POLICY IF EXISTS "Allow all operations on internal_staff" ON internal_staff;
CREATE POLICY "Allow all operations on internal_staff" ON internal_staff FOR ALL USING (true);

COMMENT ON TABLE internal_staff IS 'Danh sách nhân viên nội bộ dùng cho đơn mua hàng INTERNAL';
