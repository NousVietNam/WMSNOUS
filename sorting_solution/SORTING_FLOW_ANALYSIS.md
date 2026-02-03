# Phân Tích & Thiết Kế Giải Pháp Sorting (Chia Chọn)

## 1. Mục Tiêu & Nguyên Tắc
Giải pháp Sorting này nhằm giải quyết bài toán: **Chia hàng từ các mẻ Wave Picking (đã nhặt gộp) vào từng đơn hàng lẻ để đóng gói.**

### Nguyên Tắc Cốt Lõi:
1.  **Parallel Processing (Xử Lý Song Song):** Không chờ Picking hoàn thành 100%. Có hàng về là chia ngay (Cuốn chiếu).
2.  **Wave Ownership (Quyền Sở Hữu Wave):** Mỗi Wave cần được một nhân viên Sorting "nhận trách nhiệm" (Claim/Assign) để tránh tranh chấp.
3.  **Setup-First Workflow:** Phải chuẩn bị "vỏ" (Outbox) trước khi chia "ruột" (Item).
4.  **Put-to-Order (Hướng Dẫn Chia Chọn):** Quét hàng -> Hệ thống chỉ đích đến.

---

## 2. Luồng Nghiệp Vụ (Workflow Diagram)

### Phase 1: Nhận Nhiệm Vụ (Assignment)
**Actor:** Nhân viên Sorting (Sorter)
1.  Sorter vào màn hình **"Danh sách Wave Chờ Xử Lý"**.
2.  Chọn một Wave (Trạng thái: `PICKING` hoặc `PICKED`).
    *   *Yêu cầu:* Wave chưa có ai nhận, hoặc Sorter đó đã nhận trước đó.
3.  Hệ thống gán `sorter_id` cho Wave đó.

### Phase 2: Chuẩn Bị (Preparation)
**Mục tiêu:** Dựng sẵn các thùng rỗng cho các đơn hàng trong Wave.
1.  Hệ thống hiển thị danh sách các Đơn Hàng trong Wave:
    *   Đơn #A: 5 SP (Gợi ý: Thùng Nhỏ)
    *   Đơn #B: 20 SP (Gợi ý: Thùng To)
2.  Sorter lấy thùng thực tế -> Dán tem Outbox (hoặc dùng Outbox có sẵn).
3.  **Action:** Quét mã Đơn hàng (trên màn hình/phiếu) + Quét mã Thùng (Outbox).
    *   *Kết quả:* Link `Outbox A` <-> `Order A`.
4.  Hoàn tất chuẩn bị -> Chuyển sang Phase 3.

### Phase 3: Thực Thi (Execution) - "Scan & Put"
**Mục tiêu:** Chia hàng từ Xe Đẩy/Giỏ vào từng Outbox.
1.  Sorter cầm một sản phẩm bất kỳ từ Xe Đẩy.
2.  Quét mã vạch sản phẩm (SKU/Barcode).
3.  **Hệ thống xử lý:**
    *   Tìm trong Wave xem đơn nào đang CẦN sản phẩm này.
    *   *Logic ưu tiên:* Nếu nhiều đơn cùng cần -> Ưu tiên đơn nào "sắp đủ" hoặc theo thứ tự ABCD.
4.  **Hệ thống hiển thị chỉ dẫn (BIG UI):**
    *   **"BỎ VÀO THÙNG SỐ 5"** (Kèm Tên Khách Hàng / Mã Đơn).
    *   Số lượng cần bỏ: **"1 / 3"** (Hiển thị tiến độ).
5.  Sorter bỏ hàng vào Thùng số 5 -> Xác nhận (Bấm nút trên màn hình hoặc Quét lại mã thùng để confirm - tuỳ cấu hình độ chặt chẽ).
6.  Lặp lại cho đến khi hết hàng trên xe.

---

## 3. Xử Lý Ngoại Lệ (Edge Cases)

### A. Hàng Thiếu (Shortage from Pick)
*   **Tình huống:** Pick task báo xong, nhưng thực tế không tìm thấy hàng khi sort.
*   **Xử lý:** Nút **"Báo Thiếu"** ngay trên giao diện Sorting.
    *   Hệ thống đánh dấu `ItemMissing` cho đơn đó.
    *   Đơn sẽ không thể `PACKED` cho đến khi bù hàng hoặc Admin xử lý (Huỷ dòng thiếu).

### B. Hàng Thừa / Sai (Over/Wrong Pick)
*   **Tình huống:** Quét món hàng không có trong danh sách chờ của Wave này.
*   **Xử lý:** Hệ thống báo lỗi âm thanh (Buzz) + Màn hình đỏ: **"KHÔNG CÓ TRONG WAVE"**.
    *   Hướng dẫn: "Vui lòng bỏ ra khay Hàng Thừa".

### C. Đơn Quá To (Multi-box)
*   **Tình huống:** Đang chia vào Thùng A thì đầy.
*   **Xử lý:** Sorter bấm **"Thêm Thùng"**.
    *   Quét mã Thùng B.
    *   Hệ thống xác nhận Đơn này có 2 kiện (1/2, 2/2).
    *   Tiếp tục chia các món còn lại vào Thùng B.

---

## 4. Thiết Kế Cơ Sở Dữ Liệu (Dự Kiến)

Cần bổ sung/cập nhật các bảng sau:

### 4.1. Bảng `pick_waves` (Cập nhật)
*   `sorter_id`: UUID (Người đang phụ trách sort).
*   `sorting_status`: `PENDING`, `PROCESSING`, `COMPLETED`.
*   `sorting_started_at`: Timestamp.

### 4.2. Bảng `outbound_orders` (Liên kết Outbox)
*   Hiện tại đã có bảng liên kết `boxes` (type=OUTBOX) với `order`. Cơ chế này vẫn ổn.
*   Cần đảm bảo logic: Một đơn có thể link nhiều Outbox.

### 4.3. Bảng `sorting_transactions` (Mới - Tùy chọn)
*   Ghi log lịch sử chia chọn chi tiết:
    *   `wave_id`
    *   `product_id`
    *   `target_outbox_id`
    *   `sorted_by`
    *   `timestamp`
*   *Mục đích:* Truy vết nếu khách khiếu nại nhận sai hàng, ta biết ai, lúc nào đã bỏ cái áo đó vào thùng.

---

## 5. Đề Xuất UI/UX (Màn Hình Sorting Station)

### Layout: 2 Cột
*   **Trái (To): Hướng Dẫn Hiện Hành (Current Action)**
    *   Hiện Ảnh SP + Tên SP vừa quét.
    *   Chỉ dẫn Đích đến (Màu sắc tương phản cao).
*   **Phải (Nhỏ): Danh Sách Đơn (Order List Status)**
    *   List các đơn trong Wave.
    *   Thanh tiến độ (Progress Bar) cho từng đơn (Ví dụ: 5/10 items).
    *   Đơn nào đủ -> Hiện dấu Tick Xanh + Nút "In Tem".

### Phím Tắt (Hotkeys)
*   Hỗ trợ tối đa phím tắt để không cần dùng chuột (Space để Confirm, F1 để Báo lỗi...).
