const fs = require('fs');
const xml = fs.readFileSync('./bpmn-files/TechFast_BPMN2.0_di_save2.xml.bpmn', 'utf8');

// Find associations (sourceRef → targetRef links between annotations and tasks)
const assocs = xml.match(/<bpmn2?:association[^>]*\/>/gi) || [];
console.log('Associations:', assocs.length);
assocs.slice(0, 10).forEach(a => {
  const src = a.match(/sourceRef="([^"]+)"/);
  const tgt = a.match(/targetRef="([^"]+)"/);
  console.log('  ', (src && src[1]) || '?', '→', (tgt && tgt[1]) || '?');
});
