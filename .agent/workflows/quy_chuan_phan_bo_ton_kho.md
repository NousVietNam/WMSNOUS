---
description: Quy chuẩn Logic Phân Bổ Tồn Kho (Allocation Strategy)
---

# Quy Chuẩn Phân Bổ (Allocation Workflow)

## 1. Khái Niệm
Phân bổ là quá trình hệ thống tự động "xí chỗ" (Reserve) hàng hóa trong kho cho một đơn hàng cụ thể. Đây là bước quan trọng biến đơn hàng từ giấy tờ thành kế hoạch kho vận thực tế.

## 2. API Thực Thi
RPC: `allocate_outbound(order_id, strategy)`

## 3. Các Chiến Lược Phân Bổ (Strategies)

### A. FIFO (First - In - First - Out) - Mặc định
*   **Nguyên tắc**: Hàng nào nhập trước xuất trước.
*   **Ưu điểm**: Đảm bảo vòng quay hàng hóa, tránh hàng hết date.
*   **Áp dụng**: Hầu hết các loại hàng thông thường.

### B. BRAIN (Match Order Content) - Thông minh
*   **Nguyên tắc**: Tìm cái thùng nào chứa *nhiều mã hàng* trong đơn nhất.
*   **Mục đích**: Giảm thiểu số lượng thùng phải đi nhặt (Đi 1 thùng lấy được nhiều món).
*   **Áp dụng**: Đơn lẻ có nhiều dòng hàng (Multi-line Orders).

## 4. Logic Chọn Thùng (Box Selection Logic)
Hệ thống chỉ được phép phân bổ từ:
1.  **Thùng OPEN**: Thùng đang ở trạng thái rảnh.
2.  **Thùng LOCKED**: Thùng đang bị khóa **nhưng bởi chính đơn hàng này**. (Cho phép phân bổ bổ sung).

**TUYỆT ĐỐI KHÔNG**:
*   Phân bổ từ thùng đã bị đơn hàng khác khóa.
*   Phân bổ quá số lượng thực tế (`quantity > allocated_quantity`).

## 5. Trạng Thái Sau Phân Bổ
*   Order Status -> `ALLOCATED`.
*   Inventory Item -> Tăng `allocated_quantity`.
*   Job -> Tạo mới Job với status `PLANNED`.

## 6. Xử Lý Khi Thiếu Hàng
Nếu kho không đủ hàng:
*   Hệ thống phải báo lỗi danh sách các mã thiếu.
*   **Không được phép** phân bổ một phần (Partial) rồi để đơn hàng treo lơ lửng (trừ khi có tính năng Backorder rõ ràng).
