# Tài liệu Thiết kế Thuật toán Phân bổ (Allocation Strategy Design)

## 1. Tổng quan
Tài liệu này mô tả logic điều phối hàng hóa từ kho (Inventory) vào các Đợt nhặt hàng (Pick Waves) và Lệnh nhặt hàng (Picking Jobs). Mục tiêu là tạo ra một hệ thống linh hoạt, cho phép thay đổi chiến lược nhặt hàng mà không cần can thiệp vào mã nguồn.

## 2. Mô hình Chiến lược Động (Dynamic Strategy)

Hệ thống sẽ không nhặt hàng theo một quy tắc duy nhất. Thay vào đó, nó sử dụng bộ giải thuật dựa trên các tiêu chí (Criteria) xếp chồng.

### A. Các tiêu chí ưu tiên (Sorting Criteria)
Khi tìm kiếm tồn kho cho một SKU, Edge Function sẽ áp dụng các lớp sắp xếp đầu ra (Order By) sau:

1.  **Ưu tiên Tầng thấp (Layer/Level Priority):**
    *   **Quy tắc:** Ưu tiên các thùng ở Tầng 1 (`level_order = 1`). Nếu không đủ hàng mới tính đến các tầng cao hơn (2, 3...).
2.  **LIFO theo Mã Thùng (Box Code LIFO):**
    *   **Qấu trúc mã thùng:** `INB-mmyy-xxxx` (VD: `INB-0226-0001`).
    *   **Quy tắc:** Ưu tiên `mmyy` lớn hơn (Hàng mới về hơn). Nếu cùng `mmyy`, ưu tiên `xxxx` lớn hơn.
3.  **Dọn sạch kho (Pick-to-clean):**
    *   Ưu tiên các thùng (Box) có số lượng ít nhất để giải phóng vị trí nhanh nhất.

### B. Cơ chế Cấu hình (Strategy Configuration)
Dự kiến một bảng cấu hình `allocation_strategies`:
- `name`: Tên chiến lược (Vd: "Ưu tiên tầng thấp", "Dọn sạch kho").
- `sort_json`: JSON quy định thứ tự ưu tiên (Vd: `[{"field": "level_order", "dir": "asc"}, {"field": "created_at", "dir": "asc"}]`).

## 3. Quy trình thực thi (Runtime Logic)

### Bước 1: Thu thập Nhu cầu (Demand)
- Query toàn bộ `outbound_order_items` thuộc `wave_id`.
- Tổng hợp số lượng cần nhặt theo từng SKU.

### Bước 2: Truy vấn Tồn kho Khả dụng (Supply)
- Query bảng `bulk_inventory` Join với `locations`.
- **Lọc:** Chỉ lấy các thùng không bị khóa (`is_restricted = false`).
- **Sắp xếp:** Áp dụng Bộ tiêu chí theo Chiến lược đã chọn.

### Bước 3: Thuật toán Khớp hàng (Matching Engine)
```typescript
for (const item of demand) {
  let remaining = item.quantity;
  for (const inv of sortedInventory) {
    if (remaining <= 0) break;
    const canTake = Math.min(inv.available, remaining);
    // Tạo Task con gắn với order_item_id
    tasks.push({ order_item_id: item.id, box_id: inv.box_id, qty: canTake });
    remaining -= canTake;
  }
}
```

### Bước 4: Gom nhóm Phân vùng (Zoning)
- Sau khi có danh sách `tasks`, thực hiện Group By theo `location.zone`.
- Tạo `picking_jobs` cho mỗi Zone.

## 4. Bảo trì & Mở rộng
- **Thêm Zone mới:** Chỉ cần cập nhật trong bảng `locations`.
- **Thêm thuật toán mới:** Cập nhật logic xử lý `sort_json` trong Edge Function.

---
*Tài liệu này được soạn thảo bới Antigravity AI - 2026*
