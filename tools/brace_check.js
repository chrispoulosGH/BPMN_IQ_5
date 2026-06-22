const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'server', 'routes', 'customFactories.js');
const src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');
let count = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  for (const ch of l) {
    if (ch === '{') count += 1;
    else if (ch === '}') count -= 1;
  }
  if (count < 0) {
    console.log('NEGATIVE_AT_LINE', i + 1);
    console.log('LINE_CONTENT:', lines[i]);
    process.exit(1);
  }
}
console.log('FINAL_COUNT', count);
process.exit(0);
