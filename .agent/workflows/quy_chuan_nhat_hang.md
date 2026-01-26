---
description: Quy chuẩn Logic & Thực thi Nhặt Hàng (Picking Execution)
---

# Quy Chuẩn Nhặt Hàng (Picking Workflow)

## 1. Tổng Quan
Sau khi đơn hàng đã được phân bổ (Allocated), nhân viên kho sẽ thực hiện nhặt hàng từ vị trí lưu trữ (Storage Box) sang thùng trung chuyển (Outbox).

## 2. API Chốt Nhặt Hàng
RPC chuẩn: `confirm_picking_batch(task_ids[], outbox_id)`

### Logic Xử Lý (Backend)
1.  **Validate Outbox**: Thùng đích phải là thùng loại `OUTBOX`.
2.  **Deduction (Trừ Kho Nguồn)**:
    *   Tìm tồn kho (`inventory_items`) trong Box Nguồn khớp với Task.
    *   **CRITICAL**: Nếu hàng thực tế < hàng yêu cầu -> Báo lỗi ngay (Không cho phép pick âm).
    *   Trừ số lượng tồn kho nguồn. Nếu hết -> Xóa record source.
3.  **Accumulation (Cộng Kho Đích)**:
    *   Chuyển số lượng đó sang `inventory_items` của Outbox.
    *   Gán `allocated_quantity` tương ứng để giữ hàng cho đơn.
4.  **Transaction**: Ghi log `type = MOVE` (từ Box A sang Outbox B).
5.  **Status Update**:
    *   Update Task status -> `COMPLETED`.
    *   Link Outbox -> Order (`boxes.outbound_order_id = current_order`).
    *   Update Order status -> `PICKING` (nếu đang ở trạng thái trước đó).

## 3. Quy Tắc Frontend (Mobile App)
*   **Scan First**: Bắt buộc scan mã vạch Outbox trước khi pick.
*   **Validation**: Chỉ cho phép pick các task thuộc cùng 1 Đơn hàng vào cùng 1 Outbox (Đảm bảo sự cô lập đơn hàng).
*   **Partial Pick**: Nếu thùng nguồn thiếu hàng, hệ thống phải hướng dẫn User báo lỗi (Shortage) thay vì cho phép pick thiếu mà không xử lý.

## 4. Bảng Trạng Thái Picking Task
*   `PENDING`: Mới tạo, chưa làm gì.
*   `COMPLETED`: Đã nhặt xong vào Outbox.
*   `CANCELLED`: Hủy.
