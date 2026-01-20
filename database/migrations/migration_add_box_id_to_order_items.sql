
-- Add box_id to order_items to track specific box sales
ALTER TABLE order_items 
ADD COLUMN box_id UUID REFERENCES boxes(id),
ADD COLUMN is_box_line BOOLEAN DEFAULT false;
