const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const boxId = 'ae69c304-6d88-4f0e-8b9d-8c9f05429f07';
    const res = await client.query(`SELECT * FROM view_boxes_with_counts WHERE id = '${boxId}'`);
    console.log('view_boxes_with_counts:', res.rows[0]);

    const res2 = await client.query(`SELECT * FROM view_box_contents_unified WHERE box_id = '${boxId}'`);
    console.log('view_box_contents_unified:', res2.rows);

    client.end();
}
run();
