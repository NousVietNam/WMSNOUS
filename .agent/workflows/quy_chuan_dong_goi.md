---
description: Quy chuẩn Logic & Flow Đóng Gói (Packing Process)
---

# Quy Chuẩn Đóng Gói (Packing Standard)

## 1. Khái Niệm
Đóng gói là quy trình chuyển đổi hàng hóa từ trạng thái "Đã Nhặt" (Picked) sang "Sẵn Sàng Xuất" (Ready/Packed). 
Mục tiêu: Đóng hàng vào thùng carton/bao bì cuối cùng, dán tem vận đơn (Shipping Label).

## 2. Điều Kiện Tiên Quyết (Pre-requisites)
*   **Order Status**: Đơn hàng phải đang ở trạng thái `PICKING` hoặc `PICKED`.
*   **Items**: Toàn bộ (hoặc một phần) hàng hóa đã được nhặt thành công ra khỏi kho và đang nằm ở khu vực `PACKING_ZONE` hoặc trong xe đẩy (Tote).

## 3. Quy Trình Tạo Job Đóng Hàng (Logic Flow)
Hệ thống WMS này **không tạo "Packing Job" thủ công**. Quy trình là **Real-time Packing**:

1.  **Scan Order/Item**:
    *   Nhân viên scan Mã Đơn hoặc Mã sản phẩm để bắt đầu.
    *   Hệ thống hiển thị danh sách hàng cần đóng.

2.  **Thao Tác Đóng Hàng (Packing Action)**:
    *   **Tạo Outbox**: Hệ thống sinh mã thùng đóng gói mới (`OUTBOX-XXX`).
    *   **Scan to Pack**: Scan từng món hàng để đưa vào Outbox.
    *   **Validate**: Không được đóng quá số lượng đã nhặt.

3.  **Hoàn Thành Đóng Gói (Finalize)**:
    *   User xác nhận "Xong thùng".
    *   In tem dán thùng.

## 4. API & Database Impact
Chức năng chính: `confirm_packing` hoặc Logic Frontend gọi update trực tiếp.

*   **Bảng `boxes`**:
    *   Tạo mới record với `type = 'OUTBOX'`.
    *   `outbound_order_id` = ID đơn hàng (BẮT BUỘC).
    *   `location_id` = `GATE-OUT` hoặc `PACKING-STATION`.

*   **Bảng `inventory_items`**:
    *   Move items từ Xe đẩy/Tote/Source Box -> Vào `OUTBOX` mới tạo.
    *   Sau bước này, hàng nằm trong Outbox, sẵn sàng Ship.

*   **Trigger Trạng Thái Đơn**:
    *   Gọi `check_order_packed_status` sau mỗi lần đóng.
    *   Nếu tất cả items đã vào Outbox -> Update Order Status = `PACKED`.

## 5. Quy Chuẩn Validation
*   [x] **Cấm đóng dư**: Số lượng đóng <= Số lượng đã nhặt.
*   [x] **Link Outbox**: Mọi Outbox phải gắn liền với 1 Order ID duy nhất.
*   [x] **Trọng Lượng**: Cập nhật trọng lượng thực tế (nếu có cân) vào bảng `boxes`.
