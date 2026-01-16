# External Web Order App Integration Strategy

## Overview
This document outlines the architectural strategy for integrating a separate **Web Order Application** with the existing WMS (Warehouse Management System).

## Key Decisions
1.  **Single Database**: Both the WMS and the Web Order App will share the same Supabase database.
    *   **Pros**: Centralized data, no need for sync logic, real-time consistency.
    *   **Cons**: Tight coupling (mitigated by clean schema separation).
2.  **Separate Applications**:
    *   **WMS (Current)**: Focus on internal operations (Inventory, Warehouse, Approvals).
    *   **Web Order (Future)**: Focus on Sales staff (Order creation, Customer management, Catalog).

## Architecture
-   **WMS**: Acts as the "Backend" logic for inventory validation.
-   **Web Order**: Acts as a client that consumes inventory data and creates orders.

## Required API Endpoints (WMS Side)

### 1. Real-time Stock Check
*   **Purpose**: Allow Sale staff to check available stock in a specific warehouse before placing an order.
*   **Endpoint**: `GET /api/inventory/check`
*   **Params**:
    *   `sku` (string): Product SKU
    *   `warehouse_id` (string): ID of the warehouse (e.g., Kho Tổng, Kho Lẻ)
*   **Response**:
    ```json
    {
      "sku": "ABC-123",
      "available_stock": 50,
      "warehouse": "Kho Tổng"
    }
    ```

### 2. Create Order (with Validation)
*   **Purpose**: Submit a finalized order from the Web Order App.
*   **Endpoint**: `POST /api/orders/create`
*   **Payload**:
    ```json
    {
      "customer_id": "...",
      "warehouse_id": "...",
      "items": [
        { "product_id": "...", "quantity": 10 }
      ]
    }
    ```
*   **Logic**:
    *   Validate stock availability in `warehouse_id`.
    *   Create Order record with `status = 'PENDING'`.
    *   Reserve inventory (soft allocate).

## Database Schema Enhancements
*   Add `warehouse_id` column to `orders` table.
*   Ensure `locations` table has `warehouse_id` or `type` to distinguish inventory sources.

## Workflow
1.  **Sale (Web Order)**: Browse catalog -> Check Stock (API) -> Create Order.
2.  **System**: Saves Order to DB.
3.  **Warehouse (WMS)**: Sees new `PENDING` order -> Allocates -> Picks -> Ships.
