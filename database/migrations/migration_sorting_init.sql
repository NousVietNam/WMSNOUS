
-- 1. Alter pick_waves table
ALTER TABLE pick_waves 
ADD COLUMN IF NOT EXISTS sorter_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS sorting_status TEXT DEFAULT 'PENDING' CHECK (sorting_status IN ('PENDING', 'PROCESSING', 'COMPLETED')),
ADD COLUMN IF NOT EXISTS sorting_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sorting_completed_at TIMESTAMPTZ;

-- 2. Create sorting_logs table
CREATE TABLE IF NOT EXISTS sorting_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wave_id UUID REFERENCES pick_waves(id),
    outbound_order_id UUID REFERENCES outbound_orders(id),
    product_id UUID REFERENCES products(id),
    outbox_id UUID REFERENCES boxes(id),
    sorter_id UUID REFERENCES auth.users(id),
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    action_type TEXT -- 'SORT_ITEM', 'MARK_MISSING', 'ADD_BOX'
);

-- Optimize log retrieval
CREATE INDEX IF NOT EXISTS idx_sorting_logs_wave ON sorting_logs(wave_id);
