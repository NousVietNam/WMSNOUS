---
description: Quy chuẩn Logic & API Tạo Đơn Hàng (Outbound Order)
---

# Quy Chuẩn Tạo Đơn Hàng (Outbound Order Creation)

## 1. Tổng Quan Quy Trình
Khi tạo một đơn hàng xuất kho mới (Outbound Order), hệ thống cần đảm bảo tính toàn vẹn dữ liệu từ bước nhận request đến khi lưu vào database.

Đường dẫn API chuẩn: `POST /app/api/outbound`

## 2. Dữ Liệu Đầu Vào (Input Requirements)
Request Body bắt buộc phải có các trường sau:

*   **`type`**: Loại đơn hàng. Chỉ chấp nhận các giá trị:
    *   `SALE`: Đơn bán hàng (Bắt buộc có `customer_id`).
    *   `TRANSFER`: Chuyển kho (Bắt buộc có `destination_id`).
    *   `INTERNAL`: Xuất nội bộ.
    *   `GIFT`: Xuất quà tặng.
*   **`items`**: Danh sách sản phẩm. Phải là mảng `[]` và không được rỗng.
    *   Mỗi item phải có: `product_id` (UUID), `quantity` (Integer > 0).

*   **Các trường khác**: `note`, `discount_info` (tùy chọn).

## 3. Các Bước Xử Lý (Processing Steps)

1.  **Validate**: Kiểm tra `type` hợp lệ và `items` có dữ liệu.
2.  **Generate Code**: Gọi RPC `generate_outbound_code(type)` để sinh mã phiếu (ví dụ: `SO-231024-001`).
3.  **Create Header**: Insert vào bảng `outbound_orders` với trạng thái `PENDING`.
    *   *Lưu ý*: Chưa trừ tồn kho ở bước này (Tồn kho chỉ trừ khi Ship hoặc Allocate).
4.  **Create Items**: Insert chi tiết vào `outbound_order_items`.
5.  **Return**: Trả về thông tin đơn hàng vừa tạo.

4.  **Các Quy Tắc An Toàn (Safety Rules)**

*   **Atomic Transaction**: Tuyệt đối không được tạo Header thành công mà Items bị lỗi. Nếu Items lỗi, phải Rollback cả Header.
*   **Status Init**: Trạng thái khởi tạo luôn là `PENDING`. 
*   **Approval**: Không set `is_approved = true` ngay khi tạo (trừ khi có logic Auto-Approve rõ ràng). Việc Duyệt đơn là bước riêng biệt.
*   **Customer/Desination Check**: Phải đảm bảo `customer_id` hoặc `destination_id` tồn tại.

## 5. Mẫu Lỗi Thường Gặp
*   `Missing items`: Mảng items rỗng.
*   `Invalid Code`: Lỗi sinh mã trùng lặp (nếu RPC lỗi).
*   `Foreign Key Violation`: ID sản phẩm hoặc khách hàng không tồn tại.