
const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return [];
    try {
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            file = path.join(dir, file);
            const stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                if (!file.includes('node_modules') && !file.includes('.next') && !file.includes('.git')) {
                    results = results.concat(walk(file));
                }
            } else {
                if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                    results.push(file);
                }
            }
        });
    } catch (e) { }
    return results;
}

const files = walk('./');
files.forEach(file => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        // Look for literal Badge usage as a component or variable
        // but ignore the definition file itself
        if (file.includes('badge.tsx')) return;

        const badgeUsage = content.match(/<Badge\b/);
        const badgeImport = content.match(/import\s+.*\{?.*Badge.*\}?.*\s+from/);

        if (badgeUsage && !badgeImport) {
            console.log(`MISSING IMPORT: Badge used in ${file}`);
        }
    } catch (e) { }
});
