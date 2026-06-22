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
  console.log(`${i+1}\t${count}\t${lines[i]}`);
}
process.exit(0);
