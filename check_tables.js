const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Check outbound_orders
    const ob = await client.query("SELECT code FROM outbound_orders WHERE code = 'INB-0126-1117'");
    console.log("outbound_orders with INB:", ob.rows);

    // Any picking_jobs?
    const pj = await client.query("SELECT code FROM picking_jobs WHERE code = 'INB-0126-1117'");
    console.log("picking_jobs with INB:", pj.rows);

    client.end();
}
run();
