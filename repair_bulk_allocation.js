
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: '.env.local' });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error("No POSTGRES_URL or DATABASE_URL found.");
    process.exit(1);
}

const client = new Client({ connectionString });

async function runRepair() {
    try {
        await client.connect();
        console.log("Starting Bulk Inventory Allocation Repair...");

        // Logic:
        // Update bulk_inventory b
        // SET allocated_quantity = COALESCE((
        //    SELECT SUM(t.quantity) 
        //    FROM picking_tasks t 
        //    WHERE t.box_id = b.box_id 
        //    AND t.product_id = b.product_id
        // ), 0)
        // WHERE allocated_quantity != ...

        const query = `
            WITH computed_alloc AS (
                SELECT 
                    box_id, 
                    product_id, 
                    SUM(quantity) as correct_qty
                FROM picking_tasks
                WHERE box_id IS NOT NULL
                GROUP BY box_id, product_id
            )
            UPDATE bulk_inventory b
            SET allocated_quantity = COALESCE(c.correct_qty, 0)
            FROM bulk_inventory b2
            LEFT JOIN computed_alloc c ON b2.box_id = c.box_id AND b2.product_id = c.product_id
            WHERE b.id = b2.id
            AND b.allocated_quantity != COALESCE(c.correct_qty, 0)
            RETURNING b.id, b.product_id, b.allocated_quantity as new_val;
        `;

        // Wait, the FROM clause in UPDATE is tricky in Postgres.
        // Correct syntax:
        /*
        UPDATE bulk_inventory b
        SET allocated_quantity = COALESCE((
            SELECT SUM(quantity) FROM picking_tasks t
            WHERE t.box_id = b.box_id AND t.product_id = b.product_id
        ), 0)
        WHERE allocated_quantity != COALESCE((
             SELECT SUM(quantity) FROM picking_tasks t
             WHERE t.box_id = b.box_id AND t.product_id = b.product_id
        ), 0);
        */

        // This might be slow if table is huge, but it's safe.
        // Let's verify row count first.

        console.log("Executing repair query...");

        const res = await client.query(`
            UPDATE bulk_inventory b
            SET allocated_quantity = COALESCE((
                SELECT SUM(quantity) FROM picking_tasks t
                WHERE t.box_id = b.box_id AND t.product_id = b.product_id
            ), 0)
            WHERE allocated_quantity IS DISTINCT FROM COALESCE((
                SELECT SUM(quantity) FROM picking_tasks t
                WHERE t.box_id = b.box_id AND t.product_id = b.product_id
            ), 0);
        `);

        console.log(`Repaired ${res.rowCount} rows in bulk_inventory.`);

        // Also repair inventory_items (PIECE) just in case
        console.log("Repairing Piece Inventory (inventory_items)...");
        const res2 = await client.query(`
             UPDATE inventory_items b
            SET allocated_quantity = COALESCE((
                SELECT SUM(quantity) FROM picking_tasks t
                WHERE t.box_id = b.box_id AND t.product_id = b.product_id
            ), 0)
            WHERE allocated_quantity IS DISTINCT FROM COALESCE((
                SELECT SUM(quantity) FROM picking_tasks t
                WHERE t.box_id = b.box_id AND t.product_id = b.product_id
            ), 0);
        `);
        console.log(`Repaired ${res2.rowCount} rows in inventory_items.`);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await client.end();
    }
}

runRepair();
