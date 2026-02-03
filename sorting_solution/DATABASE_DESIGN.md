# Thiết Kế Cơ Sở Dữ Liệu cho Quy Trình Sorting

## 1. Cập nhật bảng `pick_waves`
Cần thêm các trường để quản lý trạng thái và người phụ trách Sorting.

```sql
ALTER TABLE pick_waves 
ADD COLUMN sorter_id UUID REFERENCES auth.users(id),
ADD COLUMN sorting_status TEXT DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED
ADD COLUMN sorting_started_at TIMESTAMPTZ,
ADD COLUMN sorting_completed_at TIMESTAMPTZ;
```

## 2. Bảng `sorting_sessions` (Tùy chọn nhưng khuyến nghị)
Nếu muốn quản lý ca kíp kỹ hơn (ví dụ 1 wave nhiều người sort, hoặc sort nhiều ngày), có thể tách bảng. Nhưng với yêu cầu hiện tại, nhúng vào `pick_waves` là đủ.

## 3. Nhật ký Sorting (`sorting_logs`)
Lưu vết từng lần quét để audit.

```sql
CREATE TABLE sorting_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wave_id UUID REFERENCES pick_waves(id),
    order_id UUID REFERENCES outbound_orders(id),
    product_id UUID REFERENCES products(id),
    outbox_id UUID REFERENCES boxes(id),
    sorter_id UUID REFERENCES auth.users(id),
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    action_type TEXT -- 'SORT_ITEM', 'MARK_MISSING', 'ADD_BOX'
);
```

## 4. View tổng hợp cho màn hình Dashboard
`view_wave_sorting_progress`
Mục đích: Tính toán % tiến độ Sorting của từng Wave mà không cần query nặng.

```sql
CREATE OR REPLACE VIEW view_wave_sorting_progress AS
SELECT 
    w.id AS wave_id,
    w.code,
    w.sorting_status,
    w.sorter_id,
    COUNT(DISTINCT oo.id) AS total_orders,
    SUM(ooi.quantity) AS total_items,
    -- Cần logic tính items đã sorted. 
    -- Hiện tại ta dựa vào việc item đã nằm trong box có type='OUTBOX' chưa?
    -- Hoặc dùng bảng picking_tasks?
    -- Logic tốt nhất: Dựa vào picking_tasks đã COMPLETED và có box_id là OUTBOX.
    (
        SELECT COUNT(*) 
        FROM picking_tasks pt 
        JOIN boxes b ON pt.box_id = b.id
        WHERE pt.job_id IN (SELECT id FROM picking_jobs WHERE wave_id = w.id)
          AND pt.status = 'COMPLETED'
          AND b.type = 'OUTBOX'
    ) AS sorted_items
FROM pick_waves w
JOIN outbound_orders oo ON w.id = oo.wave_id
JOIN outbound_order_items ooi ON oo.id = ooi.order_id
GROUP BY w.id;
```
*(Lưu ý: Logic này cần tinh chỉnh dựa trên schema thực tế)*
