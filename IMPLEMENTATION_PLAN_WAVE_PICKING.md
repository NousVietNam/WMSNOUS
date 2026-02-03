# Kế hoạch Triển khai: Advanced Wave Picking System

## 1. Mục tiêu
Nâng cấp hệ thống nhặt hàng theo đợt (Wave Picking) hỗ trợ phân vùng (Zoning), đa nhân viên, và chiến lược phân bổ động (Dynamic Allocation).

## 2. Các thỏa thuận về Dữ liệu (Data Schema)
- **Cấp độ quản lý:** Wave (Cha) -> Picking Job (Con - Lệnh nhặt) -> Picking Task (Cháu - Thao tác).
- **Trạng thái Đơn hàng:** 
    - Khi vào Wave: `PENDING` -> `ALLOCATED` (is_approved = true).
    - Khoá đơn: Không cho phép sửa/phê duyệt lẻ khi đơn đã nằm trong Wave.
- **Phân biệt Job:** 
    - `type` trong `picking_jobs` sẽ có thêm loại `WAVE_PICK`.
    - Cột `wave_id` và `zone` để quản lý.

## 3. Thuật toán Phân bổ (Edge Function: `release-wave`)
- **Tư duy:** Chuyển từ RPC SQL sang Edge Function (TypeScript) để xử lý logic phức tạp.
- **Tính năng Động:** Hỗ trợ tính toán dựa trên Strategy phối hợp:
    - Ưu tiên Tầng (Level 1, 2...).
    - Ưu tiên dọn sạch thùng (Pick-to-clean).
    - Ưu tiên FIFO (Hàng cũ nhất).
- **Zoning:** Tự động chia 1 Wave thành nhiều Jobs dựa trên Phân vùng của vị trí chứa hàng.

## 4. Đặc tả Quy trình Vận hành (Workflow)
1. **Admin:** Gom đơn -> Tạo Wave -> Chọn Chiến lược -> Nhấn "Duyệt Wave".
2. **System (Edge Function):**
    - Khóa các đơn hàng.
    - Phân bổ hàng cứng.
    - Tạo các Job theo Zone.
    - Duyệt thành công.
3. **Mobile:** 
    - Nhân viên thấy Job có nhãn **WAVE** (Màu tím/Xanh đậm).
    - Nhóm các Task theo Thùng để nhân viên nhặt tập trung (Gom nhóm ảo).
4. **Sorting (Future):** Sau khi nhặt xong gom về bàn đóng gói để chia lại đơn.

## 5. Danh sách việc cần làm (Checklist)
- [x] Thêm cột `zone` vào bảng `locations`.
- [x] Cập nhật giao diện Admin Quản lý Vị trí (Thêm Zone).
- [x] Phác thảo tài liệu `Logic Allocation/Wave_Picking_Allocation.md`.
- [x] Thiết lập Boilerplate cho Supabase Edge Function `release-wave`.
- [x] Viết logic Allocation Engine trong Edge Function (Tầng 1 -> LIFO Box Code).
- [x] Cập nhật giao diện chi tiết Wave (Nút Duyệt gọi Edge Function).
- [x] Deploy Edge Function `release-wave` lên Supabase.
- [x] Cập nhật App Mobile hiển thị Job Wave (Phân biệt màu sắc & Gom nhóm).
- [x] Cập nhật Database RPC (`confirm_picking_batch`) hỗ trợ cả kho BULK và PIECE.

---
*Cập nhật lần cuối: 11:05 - 03/02/2026 bởi Antigravity AI*
