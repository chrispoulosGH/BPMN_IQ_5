const fs = require('fs');
const xml = fs.readFileSync('./bpmn-files/TechFast_BPMN2.0_di_save2.xml.bpmn', 'utf8');

// Find all associations and their source/target
const assocRe = /<bpmn:association[^>]*id="([^"]+)"[^>]*sourceRef="([^"]+)"[^>]*targetRef="([^"]+)"/g;
let m;
const assocs = [];
while ((m = assocRe.exec(xml)) !== null) {
  assocs.push({ id: m[1], src: m[2], tgt: m[3] });
}

// Find element types
const typeMap = {};
const typeRe = /<bpmn:(\w+)\s[^>]*id="([^"]+)"/g;
while ((m = typeRe.exec(xml)) !== null) {
  typeMap[m[2]] = 'bpmn:' + m[1];
}

// Show associations with types
console.log('=== ASSOCIATIONS ===');
for (const a of assocs) {
  const srcType = typeMap[a.src] || '?';
  const tgtType = typeMap[a.tgt] || '?';
  const hasTask = srcType.includes('Task') || tgtType.includes('Task');
  console.log(`${hasTask ? 'OK' : 'MISS'} | ${srcType}(${a.src}) -> ${tgtType}(${a.tgt})`);
}
