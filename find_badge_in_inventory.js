
const fs = require('fs');
const content = fs.readFileSync('app/admin/inventory/page.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('Badge')) {
        console.log(`FOUND Badge on line ${i + 1}: ${line.trim()}`);
    }
});
