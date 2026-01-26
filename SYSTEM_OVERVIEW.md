# WMS System Overview

This document serves as the master guide to the WMS architecture, data flow, and key logic.
Created: 2026-01-24

## 1. Core Modules

### 1.1 Orders (Quản lý Đơn hàng)
*   **Entities**: `outbound_orders`, `outbound_order_items`.
*   **Responsibility**: Receiving requests, Validation, Approval (`is_approved`).
*   **Types**: `SALE`, `GIFT`, `INTERNAL`, `TRANSFER`.
*   **Transfer Mode** (Applies to ALL types):
    *   **Item-based**: Request specific quantities of products.
    *   **Box-based**: Request specific physical boxes.

### 1.2 Outbound Execution (Thực thi Xuất kho)
*   **Entities**: `picking_jobs`, `picking_tasks`, `outbound_shipments`.
*   **Flow**:
    1.  **Allocation**: System allocates stock -> Status `ALLOCATED`.
    2.  **Picking**:
        *   **Item Picking**: Standard flow for counting/picking individual items (`ITEM_PICK`).
        *   **Box Picking**: Moving entire physical boxes (`BOX_PICK`).
    3.  **Packing**: Auto-packed when jobs complete -> Status `PACKED`.
    4.  **Shipping**: RPC `ship_outbound_order` -> Status `SHIPPED`.
        *   **CRITICAL**: Must clear location of boxes.

### 1.3 Inventory & Warehouse (Kho bãi)
*   **Core Entities**: `inventory_items`, `products`.
*   **Spatial**: `locations`, `map_elements` (Map).
*   **Containerization**:
    *   `boxes`: Storage units (Type: `STORAGE`).
    *   `outboxes`: Temporary shipping containers (Type: `OUTBOX`).
    *   **Logic**: Inventory *must* be inside a Box. Boxes *must* be at a Location (or NULL if Shipped).

### 1.4 Administration (Quản trị)
*   **Access Control**: `users`, `roles`, `permissions`.
*   **Master Data**: `customers`, `destinations`, `partners`.
*   **Monitoring**: `dashboard`, `transactions` (History).

### 1.5 Mobile Operations (Handheld)
*   **Purpose**: On-the-floor execution (Touch/Scan interface).
*   **Modules**: `picking`, `putaway`, `audit`, `ship`, `transfer`, `lookup`.
*   **Key Tech**: Barcode scanning integration.

### 1.6 System Utilities (Tiện ích)
*   **Bulk Operations**: Import/Export Excel.
*   **Printing**: Label generation (Box, Shipment, Product).
*   **Maintenance**: Audit logs, Data fix scripts.

## 2. Key Database RPCs (Source of Truth)

| Function Name | Purpose | Key Checks |
| :--- | :--- | :--- |
| **Outbound / Shipping** | | |
| `allocate_outbound` | Reserve stock for Order | Select Strategy (Item vs Box), Log Reservation |
| `ship_outbound_order` | Finalize shipment (Order) | Check `PACKED`, Create Shipment, Dedup Tx, **Clear Location** |
| `ship_manual_job` | Finalize shipment (Manual) | Check `COMPLETED`, **Clear Location**, No Double-Ship |
| `release_outbound_order` | Cancel/Release allocation | Revert `allocated_quantity` -> 0 |
| **Picking Execution** | | |
| `confirm_picking_batch` | Execute Item Pick | Check Source Stock, Move to Outbox, Log Tx |
| `confirm_box_pick` | Execute Box Pick | Check Box Status, Move Box to Outbox/Gate |
| **Utilities / Automation** | | |
| `generate_outbound_code` | Auto-gen Order Code | Format: `SO/TR-{YYMMDD}-{Seq}` |
| `check_order_packed_status`| Trigger: Auto-pack Order | Runs after Job completion. Updates Order to `PACKED` |

## 3. Database Schema Conventions

*   **Foreign Keys**:
    *   `outbound_order_id` vs `order_id`: Use `outbound_order_id` in `boxes`, `picking_jobs`.
*   **Status Enum**:
    *   Orders: `PENDING`, `ALLOCATED`, `PICKING`, `READY` (partial), `PACKED`, `SHIPPED`, `CANCELLED`.
    *   **Flags**: `is_approved` (Boolean) - Controls visibility/processing eligibility.
    *   Boxes: `OPEN`, `LOCKED` (picking), `SHIPPED`.

## 4. Workflows & Standards (Quy trình)
*   **System Architecture**: `SYSTEM_OVERVIEW.md` (This file).
*   **Operational Workflows**:
    *   [Tạo Đơn Hàng](.agent/workflows/quy_chuan_tao_don_hang.md)
    *   [Phân Luồng (Box vs Item)](.agent/workflows/quy_chuan_phan_luong_don_hang.md)
    *   [Phân Bổ (Allocation)](.agent/workflows/quy_chuan_phan_bo_ton_kho.md)
    *   [Nhặt Hàng (Picking)](.agent/workflows/quy_chuan_nhat_hang.md)
    *   [Checklist Xuất Hàng](.agent/workflows/shipping_logic_checklist.md)
*   **Dev Standards**:
    *   [Database Migration](.agent/workflows/quy_chuan_migration_database.md)
    *   [API Development](.agent/workflows/quy_chuan_phat_trien_api.md)
