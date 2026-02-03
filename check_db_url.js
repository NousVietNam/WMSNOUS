
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

if (process.env.DATABASE_URL) {
    console.log("DATABASE_URL found:", process.env.DATABASE_URL.substring(0, 15) + "...");
} else {
    console.log("DATABASE_URL NOT found");
}
