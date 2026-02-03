
const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return [];
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
    return results;
}

const files = walk('./');
files.forEach(file => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('<Badge')) {
            const lines = content.split('\n');
            const hasImport = lines.some(line => (line.includes('import') || line.includes('require')) && line.includes('Badge'));
            if (!hasImport) {
                console.log(`Badge found without import in ${file}`);
            }
        }
    } catch (e) { }
});
