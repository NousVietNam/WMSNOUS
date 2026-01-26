---
description: Quy chuẩn Logic & Flow Duyệt Đơn Hàng (Order Approval)
---

# Quy Chuẩn Duyệt Đơn Hàng (Order Approval Workflow)

## 1. Khái Niệm
Duyệt đơn hàng là bước chuyển đổi trạng thái từ xác nhận sơ bộ sang sẵn sàng xử lý. Đây là "chốt chặn" kiểm soát rủi ro trước khi đơn hàng đi vào kho vận.

## 2. API Thực Thi
RPC: `approve_outbound_order(order_id)` hoặc Logic Frontend gọi API Update Status.

## 3. Checklist Kiểm Tra (Pre-Approval Checks)
Trước khi duyệt, hệ thống/User phải đảm bảo:

1.  **Thông Tin Khách Hàng**:
    *   Khách hàng (`customer_id`) ở trạng thái `ACTIVE`.
    *   Địa chỉ giao hàng (`shipping_address`) đầy đủ, hợp lệ.

2.  **Tồn Kho Sơ Bộ (Soft Check)**:
    *   *(Tùy chọn)* Kiểm tra nhanh xem kho có *khả năng* đáp ứng không (Total Stock > Order Quantity).
    *   *Lưu ý*: Không cần giữ stock cứng ở bước này (việc đó là của Phân Bổ).

3.  **Công Nợ & Giới Hạn (Business Rules)**:
    *   Check hạn mức tín dụng (Credit Limit) nếu áp dụng.
    *   Check nợ quá hạn.

## 4. Dòng Chảy Trạng Thái (State Flow)
*   **Hiện tại**: `PENDING` (Mới tạo) hoặc `DRAFT`.
*   **Hành động**: Duyệt (Approve).
*   **Kết quả**:
    *   Status chuyển sang `APPROVED` (hoặc `READY` để chờ Phân bổ).
    *   Hệ thống ghi log: `User A approved at [Time]`.

## 5. Tự Động Hóa (Automation Triggers)
Sau khi Duyệt thành công, hệ thống có thể:
1.  **Auto AI Allocation**: Tự động chạy thuật toán phân bổ nếu cấu hình bật.
2.  **Notification**: Gửi thông báo cho kho "Có đơn mới cần soạn".

## 6. Logic Hủy Duyệt (Un-Approve)
*   Chỉ được phép khi đơn hàng **CHƯA Phân Bổ** (`status` vẫn là `APPROVED`/`READY`).
*   Nếu đã `ALLOCATED` -> Phải gọi `release_outbound_order` trước.
