-- Fix missing relationship between transfer_orders and users
-- This allows the query: .select('..., created_by_user:users(...)') to work

ALTER TABLE transfer_orders
DROP CONSTRAINT IF EXISTS transfer_orders_created_by_fkey;

ALTER TABLE transfer_orders
ADD CONSTRAINT transfer_orders_created_by_fkey
FOREIGN KEY (created_by)
REFERENCES users (id);
