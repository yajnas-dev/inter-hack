// Removes UTF-8 byte-order marks (Windows editors/PowerShell add them) from source and config files.
const fs = require('node:fs');
const path = require('node:path');

const SKIP = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report']);
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.mts', '.json', '.css', '.html', '.md', '.yml', '.yaml']);
let fixed = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (EXT.has(path.extname(entry.name))) {
      const buf = fs.readFileSync(full);
      if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
        fs.writeFileSync(full, buf.subarray(3));
        fixed += 1;
        console.log('stripped BOM:', path.relative(process.cwd(), full));
      }
    }
  }
}

walk(path.resolve(__dirname, '..'));
console.log(`${fixed} file(s) fixed`);
