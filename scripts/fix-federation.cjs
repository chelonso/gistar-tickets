const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '../dist/assets');

function fixDirectory(dir) {
    try {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        const remoteEntryPath = path.join(dir, 'remoteEntry.js');
        if (!fs.existsSync(remoteEntryPath)) return;

        let content = fs.readFileSync(remoteEntryPath, 'utf8');
        let modified = false;

        for (const file of files) {
            const match = file.match(/^__federation_expose_(.+)-[a-zA-Z0-9_]+\.js$/);
            if (match) {
                const key = match[1]; // e.g. "App"
                const placeholder = `"\${__federation_expose_./${key}}"`;
                const replacement = `"./${file}"`;

                if (content.includes(placeholder)) {
                    content = content.replace(placeholder, replacement);
                    console.log(`[Fix Federation] Replaced ${placeholder} with ${replacement} in ${remoteEntryPath}`);
                    modified = true;
                }
            }
        }

        if (modified) {
            fs.writeFileSync(remoteEntryPath, content, 'utf8');
        }
    } catch (err) {
        console.error(`[Fix Federation] Error fixing directory ${dir}:`, err.message);
    }
}

fixDirectory(dir);
