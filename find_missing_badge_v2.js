
const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.next') && !file.includes('.git')) {
                results = results.concat(walk(file));
            }
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('.');
files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('<Badge') && !content.includes('import') && !content.includes('Badge')) {
        // This logic is flawed because content.includes('Badge') will always be true if <Badge is there.
    }

    // Better logic:
    const lines = content.split('\n');
    const hasBadgeTag = lines.some(line => line.includes('<Badge'));
    const hasBadgeImport = lines.some(line => (line.includes('import') && line.includes('Badge')) || (line.includes('const') && line.includes('require') && line.includes('Badge')));

    if (hasBadgeTag && !hasBadgeImport) {
        console.log(`MISSING IMPORT in ${file}`);
    }
});
