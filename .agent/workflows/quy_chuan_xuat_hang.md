---
description: Quy chuẩn Logic & Flow Xuất Hàng (Shipping Process)
---

# Quy Chuẩn Xuất Hàng (Shipping Standard)

## 1. Khái Niệm
Xuất hàng là bước cuối cùng, chuyển giao quyền sở hữu/quản lý hàng hóa ra khỏi kho vật lý.
Đây là hành động không thể đảo ngược (Irreversible) về mặt kho vận (muốn trả lại phải làm quy trình Nhập Trả).

## 2. API Thực Thi
*   **Standard Order**: `ship_outbound_order(order_id)`
*   **Manual Job (Disabled)**: `ship_manual_job` (Đã bị ẩn theo policy mới).

## 3. Quy Trình & Trạng Thái (State Flow)
1.  **Điều kiện**: Đơn hàng đang ở `PACKED` hoặc `COMPLETED`.
2.  **Hành động**: User bấm "Xuất Kho" (Ship).
3.  **Kết quả**:
    *   Tạo phiếu xuất kho (`outbound_shipments`).
    *   Trừ tồn kho (`inventory_items` bị xóa).
    *   Trạng thái đơn: `SHIPPED`.
    *   Trạng thái thùng: `SHIPPED` + **Location = NULL**.

## 4. Checklist Kỹ Thuật (Critical Technical Check)
Đây là các điểm "chết người" bắt buộc phải kiểm tra khi sửa code Ship:

1.  **Clear Location (QUAN TRỌNG NHẤT)**:
    *   Tất cả các thùng (Outbox hoặc Source Box) liên quan đến đơn hàng **BẮT BUỘC** phải được set `location_id = NULL`.
    *   *Lý do*: Hàng đã lên xe thì không thể còn nằm ở Gate hay Kệ được.

2.  **Logic "Truy Tìm Kép" (Robust Box Detection)**:
    *   Phải tìm thùng theo 2 đường:
        *   (1) Trực tiếp: `boxes.outbound_order_id = order_id`.
        *   (2) Gián tiếp (Fallback): `picking_tasks` -> `box_id` (Chỉ áp dụng cho `BOX_PICK`).

3.  **Transaction**:
    *   Phải ghi log `TRANSACTION` loại `SHIP` với số lượng ÂM.

## 5. Xử Lý Ngoại Lệ
*   **Đã Ship rồi?**: Chặn (trả về lỗi "Đơn hàng đã xuất").
*   **Chưa đóng gói?**: Chặn (Bắt buộc phải qua bước Packing).

## 6. Logic Release (Hủy Phân Bổ)
Nếu hủy đơn trước khi Ship:
*   Gọi `release_outbound_order`.
*   Tồn kho được trả lại trạng thái `AVAILABLE`.
*   Thùng quay lại trạng thái `OPEN` (hoặc `LOCKED` tùy cấu hình).
