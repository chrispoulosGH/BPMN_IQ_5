const fs = require('fs');
const path = require('path');

// Same function as in diagrams.js
function extractDiagramTags(xml) {
  if (!xml) return [];
  const titleMatch = xml.match(/<bpmn2?:textAnnotation[^>]*id="[^"]*[Tt]itle[^"]*"[^>]*>[\s\S]*?<bpmn2?:text>([\s\S]*?)<\/bpmn2?:text>/i);
  let text = titleMatch ? titleMatch[1] : null;
  if (!text) {
    const diagramNameMatch = xml.match(/<bpmndi:BPMNDiagram[^>]*\sname="([^"]+)"/i);
    if (diagramNameMatch && diagramNameMatch[1].includes('|') && diagramNameMatch[1].includes(':')) {
      text = diagramNameMatch[1];
    }
  }
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

function extractApplications(xml) {
  if (!xml) return [];
  const appNames = new Set();

  // Source 1: ns1:applications
  const ns1Apps = xml.match(/<ns1:application>[\s\S]*?<ns1:name>([\s\S]*?)<\/ns1:name>[\s\S]*?<\/ns1:application>/gi) || [];
  for (const block of ns1Apps) {
    const nameMatch = block.match(/<ns1:name>([\s\S]*?)<\/ns1:name>/i);
    if (nameMatch && nameMatch[1].trim()) appNames.add(nameMatch[1].trim());
  }

  // Source 2: text annotations with numeric IDs (task app lists)
  const taskAnnotations = xml.match(/<bpmn2?:textAnnotation\s+id="TextAnnotation_\d+"[^>]*>[\s\S]*?<bpmn2?:text>([\s\S]*?)<\/bpmn2?:text>/gi) || [];
  for (const ann of taskAnnotations) {
    const textMatch = ann.match(/<bpmn2?:text>([\s\S]*?)<\/bpmn2?:text>/i);
    if (!textMatch || !textMatch[1].trim()) continue;
    const text = textMatch[1].trim();
    if (text.includes('|') && text.includes(':')) continue;
    const names = text.split(',').map((s) => s.trim()).filter(Boolean);
    for (const n of names) appNames.add(n);
  }

  return [...appNames].sort();
}

const xml = fs.readFileSync('C:\\Users\\cp1853\\Downloads\\TechFast_BPMN2.0_di_save2.xml', 'utf8');

console.log('=== Diagram Tags ===');
const tags = extractDiagramTags(xml);
tags.forEach(t => console.log(`  ${t.name}: ${t.value}`));

console.log('\n=== Applications (' + extractApplications(xml).length + ') ===');
extractApplications(xml).forEach(a => console.log(`  ${a}`));
