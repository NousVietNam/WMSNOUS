---
description: Quy chuẩn kiểm tra an toàn khi viết Migration Database
---

# Quy Chuẩn Migration Database

Mọi thay đổi liên quan đến Database (SQL) BẮT BUỘC phải tuân thủ các bước sau:

1.  **Kiểm tra Tồn Tại (Check Existence)**:
    *   Luôn dùng `IF NOT EXISTS` khi tạo bảng hoặc thêm cột.
    *   Kiểm tra xem bảng/cột đã tồn tại chưa trước khi truy vấn (tránh lỗi `column does not exist`).
    *   Ví dụ:
        ```sql
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ten_bang' AND column_name = 'ten_cot') THEN
            ALTER TABLE ten_bang ADD COLUMN ten_cot KIEU_DU_LIEU;
        END IF;
        ```

2.  **Kiểm tra Kiểu Dữ Liệu (Data Types)**:
    *   **TUYỆT ĐỐI KHÔNG** nhầm lẫn giữa `TEXT` (chuỗi) và `INT`/`NUMERIC` (số).
    *   Khi insert/update, phải đảm bảo thứ tự giá trị khớp với thứ tự cột (không đảo lộn SKU và Số lượng).

3.  **Bảo Toàn Dữ Liệu**:
    *   Không được `DROP TABLE` hoặc `DROP COLUMN` nếu không có yêu cầu rõ ràng.
    *   Nếu sửa logic (Function/RPC), hãy dùng `CREATE OR REPLACE` và giữ lại các logic cũ nếu nó vẫn cần thiết (hoặc migrate lóa cũ sang mới an toàn).

4.  **Xử Lý Logic Nghiệp Vụ (Business Logic)**:
    *   Khi thay đổi trạng thái (ví dụ: `SHIPPED`), phải kiểm tra xem có cần cập nhật các bảng liên quan không (ví dụ: Xóa `location_id` trong bảng `boxes`).
    *   Kiểm tra ràng buộc khóa ngoại (Foreign Key) để tránh lỗi khi user không tồn tại hoặc dữ liệu rác.

5.  **Test Migration**:
    *   Viết script (Node.js hoặc SQL) để chạy thử migration trên môi trường dev trước khi báo cáo hoàn thành.
