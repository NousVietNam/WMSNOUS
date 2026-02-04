
# 📦 GIẢI PHÁP TỐI ƯU DỮ LIỆU KHO (DATA ARCHIVING)

**Tình trạng:** Dữ liệu thùng (Boxes) ngày càng phình to do nhiều thùng rỗng (Empty) tích tụ theo thời gian, không thể xóa do cần lưu vết lịch sử giao dịch.
**Mục tiêu:** Tăng tốc độ hệ thống (Phân bổ, kiểm kê) mà không cần xóa dữ liệu cũ, tránh gãy liên kết khóa ngoại (Foreign Key).

---

## 🚀 GIẢI PHÁP ĐỀ XUẤT: SOFT ARCHIVING (Lưu Trữ Mềm)

Thay vì di chuyển dữ liệu sang bảng khác (Hard Archiving), ta sử dụng kỹ thuật "Đánh dấu" kết hợp với "Partial Indexing" của PostgreSQL.

### 1. Thay đổi Cấu trúc Database

Thêm cột cờ đánh dấu vào bảng `boxes`:

```sql
ALTER TABLE boxes ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;
```

### 2. Tối ưu Hiệu Năng (Partial Index)

Đây là bước quan trọng nhất. Tạo Index chỉ chứa các thùng đang hoạt động. Database engine sẽ tự động sử dụng Index nhỏ gọn này cho các truy vấn hàng ngày.

```sql
-- Chỉ index những thùng CÒN DÙNG (Chưa lưu trữ)
-- Kích thước Index này sẽ rất nhỏ, giúp tìm kiếm cực nhanh
CREATE INDEX idx_boxes_active_search 
ON boxes (code, status) 
WHERE is_archived = FALSE;
```

### 3. Quy trình Vận hành (Job Tự động)

Thiết lập một Cronjob (hoặc Supabase Edge Function) chạy định kỳ (Ví dụ: 03:00 AM hàng ngày):

*   **Điều kiện lưu trữ:**
    *   Trạng thái: `EMPTY`
    *   Thời gian cập nhật cuối: `> 90 ngày` (3 tháng không đụng tới)
*   **Hành động:**
    *   Update `is_archived = TRUE`.

```sql
UPDATE boxes 
SET is_archived = TRUE 
WHERE status = 'EMPTY' 
AND updated_at < NOW() - INTERVAL '90 days';
```

### 4. Ưu điểm
*   **Không code lại nhiều:** Backend/Frontend gần như không cần sửa nhiều, chỉ cần thêm filter `is_archived = false` ở các API tìm kiếm mặc định.
*   **Toàn vẹn dữ liệu:** Các bảng `transactions`, `history` vẫn trỏ Foreign Key vào `boxes` bình thường. Lịch sử hiển thị đầy đủ.
*   **Hiệu năng:** Tốc độ truy vấn các thùng đang hoạt động sẽ nhanh tương đương với việc bảng chỉ có vài nghìn dòng.

---

### Ghi chú khi triển khai
*   Cần update lại các View báo cáo tồn kho để loại bỏ (`WHERE is_archived = FALSE`) nếu không muốn hiển thị rác.
*   Trên giao diện Admin, thêm checkbox "Xem thùng lưu trữ" để Admin có thể tra cứu khi cần thiết.
