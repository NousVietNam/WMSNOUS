
-- Add outbox_code to picking_tasks instead of jobs (1 Job = Many Outboxes)
ALTER TABLE "picking_tasks"
ADD COLUMN IF NOT EXISTS "outbox_code" TEXT;

-- If you ran the previous migration, you can drop the column from picking_jobs (Optional but clean)
-- ALTER TABLE "picking_jobs" DROP COLUMN IF EXISTS "outbox_code";
