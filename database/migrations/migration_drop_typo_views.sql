-- =============================================
-- Migration: Drop Obsolete Views with Typos
-- Date: 2026-02-06
-- Description: Remove unused views that have spelling errors
--              These views are duplicates with incorrect names
-- =============================================

-- Drop view with typo "avalibility" instead of "availability"
DROP VIEW IF EXISTS view_product_avalibility_bulk CASCADE;

-- Drop view with typo "avalibility" instead of "availability"  
DROP VIEW IF EXISTS view_product_avalibility_retail CASCADE;

-- =============================================
-- Verification: Run this after applying migration
-- =============================================
-- SELECT table_name FROM information_schema.views 
-- WHERE table_schema = 'public' 
-- AND table_name LIKE 'view_product%';
