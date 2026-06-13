const fs = require('fs');
const path = require('path');

const res = new Set();
const pattern = /api\.(get|post|put|patch|delete)\(([`'"].*?[`'"])/g;
const srcDir = 'p:\\HOMESQRE CLONE\\homesqre\\frontend\\src';

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (/\.(js|jsx|ts|tsx)$/.test(file)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            let match;
            while ((match = pattern.exec(content)) !== null) {
                res.add(`${match[1].toUpperCase()} ${match[2]}`);
            }
        }
    }
}

walkDir(srcDir);
const sorted = Array.from(res).sort();
fs.writeFileSync('p:\\HOMESQRE CLONE\\homesqre\\frontend_api_calls.txt', sorted.join('\n'));
