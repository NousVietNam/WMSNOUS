-- Migration to add Master Data columns to products table
-- CSV Headers mapped to Columns:
-- "ID" -> external_id
-- "Đối tượng" -> target_audience
-- "Thương hiệu" -> brand
-- "Giới tính" -> gender
-- "Chủng loại" -> category (Existing?)
-- "Nhóm hàng" -> product_group
-- "Mã tổng" -> general_code
-- "Mã màu" -> color_code
-- "Mã chi tiết" -> sku (Existing)
-- "Barcode" -> barcode (Existing)
-- "Tên hàng hóa" -> name (Existing)
-- "Đơn vị" -> uom
-- "Giá bán lẻ" -> price (Existing)
-- "Năm SX" -> production_year
-- "Size" -> size
-- "Chất liệu" -> material
-- "Thành phần" -> composition
-- "Mùa bán hàng" -> season
-- "Tháng bán hàng kế hoạch" -> planned_month
-- "Note" -> note
-- "Kênh bán" -> sales_channel
-- "Số lượng sản xuất" -> production_qty
-- "Tình trạng mở bán" -> sales_status
-- "Năm mở bán" -> launch_year
-- "Tháng mở bán" -> launch_month
-- "Ngày mở bán" -> launch_date
-- "Tháng/Năm" -> launch_month_year
-- "Created" -> external_created_at
-- "Modified" -> external_updated_at
-- "Link" -> image_url (Existing)

ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "external_id" TEXT,
ADD COLUMN IF NOT EXISTS "target_audience" TEXT,
ADD COLUMN IF NOT EXISTS "brand" TEXT,
ADD COLUMN IF NOT EXISTS "gender" TEXT,
ADD COLUMN IF NOT EXISTS "category" TEXT,
ADD COLUMN IF NOT EXISTS "product_group" TEXT,
ADD COLUMN IF NOT EXISTS "general_code" TEXT,
ADD COLUMN IF NOT EXISTS "color_code" TEXT,
ADD COLUMN IF NOT EXISTS "uom" TEXT,
ADD COLUMN IF NOT EXISTS "production_year" TEXT,
ADD COLUMN IF NOT EXISTS "size" TEXT,
ADD COLUMN IF NOT EXISTS "material" TEXT,
ADD COLUMN IF NOT EXISTS "composition" TEXT,
ADD COLUMN IF NOT EXISTS "season" TEXT,
ADD COLUMN IF NOT EXISTS "planned_month" TEXT,
ADD COLUMN IF NOT EXISTS "note" TEXT,
ADD COLUMN IF NOT EXISTS "sales_channel" TEXT,
ADD COLUMN IF NOT EXISTS "production_qty" NUMERIC,
ADD COLUMN IF NOT EXISTS "sales_status" TEXT,
ADD COLUMN IF NOT EXISTS "launch_year" TEXT,
ADD COLUMN IF NOT EXISTS "launch_month" TEXT,
ADD COLUMN IF NOT EXISTS "launch_date" DATE,
ADD COLUMN IF NOT EXISTS "launch_month_year" TEXT,
ADD COLUMN IF NOT EXISTS "external_created_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "external_updated_at" TIMESTAMPTZ;

-- Create indexes for commonly filtered new columns
CREATE INDEX IF NOT EXISTS "idx_products_general_code" ON "products" ("general_code");
CREATE INDEX IF NOT EXISTS "idx_products_color_code" ON "products" ("color_code");
CREATE INDEX IF NOT EXISTS "idx_products_brand" ON "products" ("brand");
CREATE INDEX IF NOT EXISTS "idx_products_season" ON "products" ("season");
