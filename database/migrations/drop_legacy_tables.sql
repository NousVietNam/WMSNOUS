-- =====================================================
-- Migration: DROP Legacy Order Tables
-- Description: Permanently remove legacy orders and transfer_orders tables
-- WARNING: This is DESTRUCTIVE and cannot be undone!
-- =====================================================

-- Step 1: Drop foreign key constraints on boxes first
ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_order_id_fkey;

-- Step 2: Drop order_items table
DROP TABLE IF EXISTS order_items CASCADE;

-- Step 3: Drop orders table
DROP TABLE IF EXISTS orders CASCADE;

-- Step 4: Drop transfer_order_items table (if exists)
DROP TABLE IF EXISTS transfer_order_items CASCADE;

-- Step 5: Drop transfer_orders table
DROP TABLE IF EXISTS transfer_orders CASCADE;

-- Step 6: Remove the order_id column from boxes table (optional, cleanup)
ALTER TABLE boxes DROP COLUMN IF EXISTS order_id;
