# Thiết Kế UI/UX: Màn Hình Sorting Station

## 1. Màn Hình Dashboard (Danh Sách Wave)
`/admin/sorting`

*   **Bộ lọc:** Chờ Xử Lý | Đang Xử Lý Của Tôi | Đã Hoàn Thành.
*   **Card view cho từng Wave:**
    *   **Header:** Mã Wave (WAVE-0226-0001) - Màu Tím đặc trưng.
    *   **Info:** 20 Đơn hàng | 150 Sản phẩm.
    *   **Tiến độ Picking:** 100% (Hoặc 80% - vẫn cho phép vào Sort).
    *   **Trạng thái Sort:** "Chưa ai nhận" (Nút: CLAIM) hoặc "Đang xử lý bởi Nguyễn Văn A" (Nút: TIẾP TỤC).

## 2. Màn Hình Setup (Gán Thùng)
`/admin/sorting/[wave_id]/setup`

*   **Giao diện:** Chia lưới các đơn hàng (Grid View).
*   **Mỗi ô đơn hàng:**
    *   Tên Khách / Mã Đơn.
    *   Tổng số lượng SP.
    *   Trạng thái Outbox: "Chưa gán" (Màu xám) -> "BOX-001" (Màu xanh).
*   **Thao tác:**
    1.  Focus vào ô input "Quét Đơn/Thùng".
    2.  User quét tem Đơn hàng -> Hệ thống highlight ô đơn đó.
    3.  User quét tem Outbox -> Hệ thống link & chuyển màu xanh.
*   **Nút:** "Bắt Đầu Chia Chọn" (Chỉ sáng khi đã gán ít nhất 1 thùng, hoặc bắt buộc gán hết tùy cấu hình).

## 3. Màn Hình Thực Thi (Execution)
`/admin/sorting/[wave_id]/run`

### Khu vực A: Input (Trên cùng)
*   Ô input luôn focus (Auto-focus). Sẵn sàng nhận mã vạch sản phẩm.

### Khu vực B: Chỉ Dẫn Chính (Giữa - Chiếm 60% diện tích)
*   **Trạng thái Chờ:** "Sẵn sàng quét sản phẩm..."
*   **Trạng thái Sau khi quét:**
    *   **DESTINATION BIG TEXT:** "THÙNG SỐ #3" (Hoặc Mã Outbox: BOX-A1).
    *   **Product Info:** Ảnh to + Tên SP + SKU.
    *   **Order Info:** Đơn hàng: DOZEN-HN (A. Hùng).
    *   **Quantity:** "Cầm 2 cái" (Nếu quét 1 lần xử lý nhiều, nhưng khuyến nghị quét 1-1 để chính xác).

### Khu vực C: Tiến Độ Wave (Bên phải - 30% diện tích)
*   Danh sách cuộn dọc các đơn hàng.
*   Mỗi dòng đơn:
    *   Mã đơn.
    *   Progress Bar: [====..] 8/10.
    *   Trạng thái: Đang chia / Đã xong / Thiếu.
    *   Nếu Đã Xong: Hiện nút "IN TEM VẬN ĐƠN" ngay cạnh.

### Khu vực D: Công Cụ (Dưới cùng)
*   Các nút chức năng phụ:
    *   [F2] Báo Thiếu Hàng.
    *   [F4] Thêm Thùng Mới (Vỡ thùng).
    *   [F8] Tạm dừng / Ra chơi.
    *   [F10] Hoàn thành Wave.

## 4. Flow Tương Tác Âm Thanh (Audio Feedback)
*   **Thành công (Valid Scan):** "Tíng!" (Ngắn, thanh thoát).
*   **Lỗi (Wrong Item):** "Èèèè!" (Trầm, khó chịu).
*   **Hoàn thành Đơn (Order Complete):** "Tada!" (Vui vẻ) -> Báo hiệu dán tem, đóng thùng ngay.
