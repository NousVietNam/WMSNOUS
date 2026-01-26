---
description: Quy chuẩn viết và xử lý lỗi API Backend
---

# Quy Chuẩn Phát Triển API

Khi viết mới hoặc sửa API (`app/api/...`), cần tuân thủ:

1.  **Cấu Trúc Try-Catch**:
    *   Luôn bọc logic chính trong block `try { ... } catch (error) { ... }`.
    *   Không để server bị crash (lỗi 500 không rõ nguyên nhân) ra ngoài client.

2.  **Validate Input Đầu Vào**:
    *   Kiểm tra kỹ `req.body` hoặc `params`.
    *   Nếu thiếu dữ liệu bắt buộc -> Trả về lỗi 400 ngay.
    *   Ví dụ:
        ```typescript
        if (!jobId) return NextResponse.json({ success: false, error: 'Thiếu jobId' }, { status: 400 });
        ```

3.  **Xử Lý Lỗi Database (Supabase)**:
    *   Luôn kiểm tra `error` sau mỗi lệnh gọi Supabase.
    *   **Đặc biệt**: Chú ý lỗi Khóa Ngoại (`23503` - Foreign Key Violation).
    *   Nếu gặp lỗi liên quan đến User ID (do user bị xóa hoặc không đồng bộ), hãy có cơ chế Fallback (ví dụ: gán `null` hoặc user mặc định) để hệ thống không bị tắc nghẽn.

4.  **Format Trả Về Chuẩn**:
    *   Luôn trả về JSON nhất quán:
        *   Thành công: `{ "success": true, "data": ... }`
        *   Thất bại: `{ "success": false, "error": "Mô tả lỗi chi tiết" }`

5.  **Log Lỗi (Logging)**:
    *   `console.error` chi tiết lỗi để dễ debug (bao gồm cả mã lỗi và message).
    *   Không giấu lỗi (swallow error) mà không log gì cả.
