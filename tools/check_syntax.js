const fs = require('fs');
const path = require('path');
const vm = require('vm');

function walk(dir) {
  const res = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) res.push(...walk(full));
    else if (entry.isFile() && full.endsWith('.js')) res.push(full);
  }
  return res;
}

const base = path.resolve(__dirname, '..', 'server');
let files = walk(base);
// skip node_modules entries
files = files.filter((p) => !p.includes(path.sep + 'node_modules' + path.sep));

for (const f of files) {
  try {
    const src = fs.readFileSync(f, 'utf8');
    // Attempt to compile without executing
    new vm.Script(src, { filename: f });
  } catch (err) {
    console.error('SYNTAX_ERROR_IN:', f);
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

console.log('NO_SYNTAX_ERRORS_FOUND');
process.exit(0);
