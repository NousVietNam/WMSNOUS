# Task: Centralized Short Pick & Exception Management

## 1. Context
The user wants to manage "Short Picks" (hàng thiếu) and other exceptions during Picking and Counting (Audit) processes in a centralized way.
Currently, the system forces a full pick confirmation or nothing. We need a way to report missing items without blocking the workflow, and a central place to manage these exceptions.

## 2. Strategy
- **Database**: Create `picking_exceptions` table to store shortage/damage reports.
- **Backend (RPC)**: Create `report_picking_exception` to handle logic:
    - Update task status (Partially Picked / Completed with Exception).
    - Log exception.
    - Do NOT auto-correct inventory (Manager decision).
- **Mobile UI**: Add "Report Issue" (Báo lỗi/Thiếu) flow in Picking Screen.
- **Admin UI**: Create "Exception Management" page to resolve issues (Re-allocate vs Shrinkage).

## 3. Implementation Steps

### Phase 1: Database & RPC
1.  **Create Table**: `picking_exceptions`
2.  **Create RPC**: `report_picking_exception`
    - Inputs: `p_job_id`, `p_task_id`, `p_user_id`, `p_actual_qty`, `p_reason`.
    - Logic:
        - If `p_actual_qty > 0`: Call internal confirm logic for that amount.
        - Log exception for `expected - actual`.
        - Mark task as COMPLETED (to clear it from list) but flagged.

### Phase 2: Mobile UI (`app/mobile/picking/[id]/page.tsx`)
1.  Add `ReportIssueDialog` component.
2.  Add "Alert/Warning" button next to "Check" button on picking rows.
3.  Implement `handleReportIssue` calling the new RPC.

### Phase 3: Admin UI (`app/admin/exceptions/page.tsx`)
1.  Create standard table view of `picking_exceptions`.
2.  Add Actions:
    - **Resolve (Found)**: Create new task / Re-alloc.
    - **Resolve (Confirm Lost)**: Inventory Adjustment + Cancel Order Line.

## 4. Verification
- Test "Happy Path" (Normal Pick) -> No Change.
- Test "Short Pick" (Report 3/5) -> Exception Created, Task Completed.
- Check Admin Page -> Exception visible.
