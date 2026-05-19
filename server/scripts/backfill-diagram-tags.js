const mongoose = require('mongoose');
const Diagram = require('../models/Diagram');

function extractDiagramTags(xml) {
  if (!xml) return [];
  const titleMatch = xml.match(/<bpmn2?:textAnnotation[^>]*id="[^"]*[Tt]itle[^"]*"[^>]*>[\s\S]*?<bpmn2?:text>([\s\S]*?)<\/bpmn2?:text>/i);
  let text = titleMatch ? titleMatch[1] : null;
  if (!text) {
    const allAnnotations = xml.match(/<bpmn2?:text>([\s\S]*?)<\/bpmn2?:text>/gi) || [];
    for (const ann of allAnnotations) {
      const inner = ann.replace(/<\/?bpmn2?:text>/gi, '').trim();
      if (inner.includes('|') && inner.includes(':') && /(?:channel|domain|product|business flow)/i.test(inner)) {
        text = inner;
        break;
      }
    }
  }
  if (!text) return [];
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const pairs = cleaned.split('|').map((s) => s.trim());
  const tags = [];
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx < 0) continue;
    const name = pair.substring(0, colonIdx).trim();
    const value = pair.substring(colonIdx + 1).trim();
    if (name && value) tags.push({ name, value });
  }
  return tags;
}

mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq').then(async () => {
  const diagrams = await Diagram.find({});
  let updated = 0;
  for (const d of diagrams) {
    const tags = extractDiagramTags(d.xml);
    if (tags.length > 0) {
      await Diagram.updateOne({ _id: d._id }, { $set: { diagramTags: tags } });
      updated++;
      console.log('Updated:', d.name, '->', tags.map((t) => t.name + ':' + t.value).join(', '));
    }
  }
  console.log('Done. Updated', updated, 'of', diagrams.length, 'diagrams.');
  mongoose.disconnect();
});
