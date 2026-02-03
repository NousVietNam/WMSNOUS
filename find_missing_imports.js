
const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.next')) {
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
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('AlertCircle') && !content.includes('AlertCircle') || (content.includes('AlertCircle') && !content.includes('lucide-react'))) {
        // Check if imported
        if (content.includes('AlertCircle') && !content.includes('import') && !content.includes('from "lucide-react"') && !content.includes("from 'lucide-react'")) {
            console.log(`Potential issue in ${file}`);
        }

        // More robust check
        if (content.match(/<AlertCircle/) && !content.includes('AlertCircle') && !content.includes('import')) {
            console.log(`Confirmed issue in ${file}`);
        }
    }

    // Simple check: if AlertCircle is in content but 'AlertCircle' is not in an import or variable declaration
    if (content.includes('AlertCircle')) {
        const lines = content.split('\n');
        const hasImport = lines.some(line => (line.includes('import') || line.includes('require')) && line.includes('AlertCircle'));
        if (!hasImport) {
            console.log(`AlertCircle found without import in ${file}`);
        }
    }
});
