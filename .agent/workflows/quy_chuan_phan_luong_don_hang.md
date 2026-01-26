---
description: Quy chuẩn Logic Phân Luồng Đơn Hàng (Box vs Item)
---

# Quy Chuẩn Phân Luồng & Phân Bổ (Allocation Strategy)

Hệ thống hỗ trợ 2 luồng xử lý chính dựa trên tính chất đơn hàng. Logic này được quyết định tại bước **Tạo Đơn** (`transfer_type`) và thực thi tại bước **Phân Bổ** (`allocate_outbound`).

## 1. Luồng Đơn Lẻ (Item Picking)
*   **Định nghĩa**: Bất kỳ loại đơn nào (`SALE`, `TRANSFER`...) có `transfer_type = 'ITEM'`.
*   **Đặc điểm**:
    *   Người dùng chỉ quan tâm số lượng sản phẩm.
    *   Hệ thống tự động tìm các thùng có chứa hàng này.
*   **Logic Phân Bổ**:
    1.  Duyệt từng dòng sản phẩm.
    2.  Tìm thùng chứa (ưu tiên thùng Lẻ).
    3.  Tạo Task `ITEM_PICK`.

## 2. Luồng Đơn Nguyên Thùng (Box Picking)
*   **Định nghĩa**: Bất kỳ loại đơn nào (`SALE`, `TRANSFER`...) có `transfer_type = 'BOX'`.
*   **Đặc điểm**:
    *   Mục đích là xuất/chuyển toàn bộ vật lý thùng.
    *   Thường được tạo bằng cách quét mã Thùng.
*   **Logic Phân Bổ**:
    1.  Hệ thống nhận diện `transfer_type = 'BOX'`.
    2.  Tạo Picking Job với Type = `BOX_PICK`.
    3.  **Quan trọng**:
        *   Nếu trong input `items` có chỉ định `from_box_id`, hệ thống sẽ **BẮT BUỘC** lấy đúng thùng đó.
        *   Nếu không chỉ định thùng, hệ thống sẽ cố gắng tìm thùng nguyên đai nguyên kiện (Full Box) trùng khớp số lượng (Logic nâng cao).
*   **Lưu ý**: Khi Pick nguyên thùng, UI Pick nên hiển thị chỉ dẫn "Lấy cả thùng X" thay vì "Lấy 5 món trong thùng X".

## 3. Bảng So Sánh

| Đặc Điểm | Item Picking | Box Picking |
| :--- | :--- | :--- |
| **Outbound Order Type** | `SALE`, `TRANSFER` (Item) | `TRANSFER` (Box) |
| **Picking Job Type** | `ITEM_PICK` | `BOX_PICK` |
| **Chiến lược tìm kho** | Gom lẻ, tối ưu đi ít thùng nhất (Brain Strategy) | Ưu tiên nguyên thùng, hoặc theo chỉ định `from_box_id` |
| **Thao tác Pick** | Mở nắp, đếm số lượng, lấy ra | Bê cả thùng đi |

## 4. Checklist Kiểm Tra Code (Dev Only)
Khi sửa logic Allocation:
*   [ ] Kiểm tra `picking_jobs.type` được set đúng chưa?
*   [ ] Với `BOX_PICK`, đảm bảo không xé lẻ thùng nếu đơn yêu cầu nguyên thùng.
*   [ ] Kiểm tra xem UI Picking có hiển thị đúng chế độ (Lẻ vs Thùng) không.
