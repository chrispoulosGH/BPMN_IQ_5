const express = require('express');
const router = express.Router();
const Diagram = require('../models/Diagram');
const { BusinessFlow } = require('../models/ReferenceData');

/** Strip title/status housekeeping text annotations from the XML (they clutter the canvas) */
function stripTitleAnnotations(xml) {
  if (!xml) return xml;
  // Remove known housekeeping textAnnotation elements
  xml = xml.replace(/<bpmn:textAnnotation id="TextAnnotation_DiagramTitle">[\s\S]*?<\/bpmn:textAnnotation>\s*/g, '');
  xml = xml.replace(/<bpmn:textAnnotation id="TextAnnotation_LastUpdated">[\s\S]*?<\/bpmn:textAnnotation>\s*/g, '');
  xml = xml.replace(/<bpmn:textAnnotation id="TextAnnotation_Status">[\s\S]*?<\/bpmn:textAnnotation>\s*/g, '');

  // Remove one-off annotations whose text is purely housekeeping metadata.
  // Keep task/application annotations intact.
  xml = xml.replace(
    /<bpmn:textAnnotation\s+id="([^"]+)"[^>]*>[\s\S]*?<bpmn:text>([\s\S]*?)<\/bpmn:text>[\s\S]*?<\/bpmn:textAnnotation>\s*/gi,
    (match, annId, annText) => {
      const text = String(annText || '').trim();
      if (/^(status|factory status)\s*:/i.test(text)) return '';
      return match;
    }
  );

  // Remove their DI shapes
  xml = xml.replace(/<bpmndi:BPMNShape id="TextAnnotation_DiagramTitle_di"[\s\S]*?<\/bpmndi:BPMNShape>\s*/g, '');
  xml = xml.replace(/<bpmndi:BPMNShape id="TextAnnotation_LastUpdated_di"[\s\S]*?<\/bpmndi:BPMNShape>\s*/g, '');
  xml = xml.replace(/<bpmndi:BPMNShape id="TextAnnotation_Status_di"[\s\S]*?<\/bpmndi:BPMNShape>\s*/g, '');
  xml = xml.replace(/<bpmndi:BPMNShape[^>]+bpmnElement="TextAnnotation_Status"[\s\S]*?<\/bpmndi:BPMNShape>\s*/g, '');
  return xml;
}

/** Extract tasks array with source, target, and applications from BPMN XML */
function extractTasks(xml) {
  if (!xml) return [];

  // 1. Collect all elements (tasks, gateways, events) with their ids and names
  const elementMap = new Map(); // id -> { id, name, isTask }
  const taskTypes = /task|subProcess/i;

  // Match task-like elements (self-closing or with body)
  const elRegex = /<bpmn:(\w+)\s+id="([^"]+)"(?:\s+name="([^"]*)")?[^>]*?\/?>/gi;
  let m;
  while ((m = elRegex.exec(xml)) !== null) {
    const [, type, id, name] = m;
    const isTask = taskTypes.test(type);
    elementMap.set(id, { id, name: name || id, isTask });
  }

  // 2. Parse sequence flows into adjacency lists
  const outgoing = new Map(); // id -> [targetId, ...]
  const incoming = new Map(); // id -> [sourceId, ...]
  const flowRegex = /<bpmn:sequenceFlow[^>]+sourceRef="([^"]+)"[^>]+targetRef="([^"]+)"[^>]*\/?>/gi;
  while ((m = flowRegex.exec(xml)) !== null) {
    const [, src, tgt] = m;
    if (!outgoing.has(src)) outgoing.set(src, []);
    outgoing.get(src).push(tgt);
    if (!incoming.has(tgt)) incoming.set(tgt, []);
    incoming.get(tgt).push(src);
  }

  // 3. Trace through non-task nodes (gateways/events) to find connected tasks
  function findConnectedTasks(startId, direction) {
    const visited = new Set();
    const tasks = [];
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const neighbors = direction === 'out' ? (outgoing.get(id) || []) : (incoming.get(id) || []);
      for (const nid of neighbors) {
        const el = elementMap.get(nid);
        if (!el) continue;
        if (el.isTask) {
          tasks.push(el.name);
        } else {
          queue.push(nid);
        }
      }
    }
    return tasks;
  }

  // 4. Parse per-task applications from bpmniq:TaskApplications extension elements
  //    Pattern: <bpmn:task id="...">...<bpmniq:Application name="AppName"/>...</bpmn:task>
  const taskAppExtMap = new Map(); // taskId -> [appName, ...]
  const taskBlockRegex = /<bpmn:(?:task|userTask|serviceTask|sendTask|receiveTask|manualTask|businessRuleTask|scriptTask|subProcess)\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/bpmn:(?:task|userTask|serviceTask|sendTask|receiveTask|manualTask|businessRuleTask|scriptTask|subProcess)>/gi;
  while ((m = taskBlockRegex.exec(xml)) !== null) {
    const [, taskId, body] = m;
    const appNames = [];
    const appAttrRegex = /<(?:bpmniq|ns\d+):(?:A|a)pplication[^>]+name="([^"]+)"/gi;
    let am;
    while ((am = appAttrRegex.exec(body)) !== null) {
      appNames.push(am[1].trim());
    }
    // Also handle element-style: <bpmniq:application><bpmniq:name>X</bpmniq:name></bpmniq:application>
    const appElRegex = /<(?:bpmniq|ns\d+):application>[\s\S]*?<(?:bpmniq|ns\d+):name>([\s\S]*?)<\/(?:bpmniq|ns\d+):name>[\s\S]*?<\/(?:bpmniq|ns\d+):application>/gi;
    while ((am = appElRegex.exec(body)) !== null) {
      const name = am[1].trim();
      if (name && !appNames.includes(name)) appNames.push(name);
    }
    if (appNames.length) taskAppExtMap.set(taskId, appNames);
  }

  // 5. Parse text annotations and associations (fallback for apps)
  const annotationMap = new Map(); // annotationId -> text
  const annRegex = /<bpmn:textAnnotation\s+id="([^"]+)"[^>]*>[\s\S]*?<bpmn:text>([\s\S]*?)<\/bpmn:text>[\s\S]*?<\/bpmn:textAnnotation>/gi;
  while ((m = annRegex.exec(xml)) !== null) {
    const [, annId, text] = m;
    const trimmed = text.trim();
    // Skip metadata annotations (contain | and :) and empty annotations
    if (!trimmed || (trimmed.includes('|') && trimmed.includes(':'))) continue;
    annotationMap.set(annId, trimmed);
  }

  const assocAppMap = new Map(); // taskId -> [appName, ...]
  const assocRegex = /<bpmn:association[^>]+sourceRef="([^"]+)"[^>]+targetRef="([^"]+)"[^>]*\/?>/gi;
  while ((m = assocRegex.exec(xml)) !== null) {
    const [, srcRef, tgtRef] = m;
    // One of them is a textAnnotation, the other is a task
    const annId = annotationMap.has(srcRef) ? srcRef : annotationMap.has(tgtRef) ? tgtRef : null;
    const taskId = annId === srcRef ? tgtRef : srcRef;
    if (!annId) continue;
    const el = elementMap.get(taskId);
    if (!el || !el.isTask) continue;
    const apps = annotationMap.get(annId).split(',').map(s => s.trim()).filter(Boolean);
    if (apps.length) {
      const existing = assocAppMap.get(taskId) || [];
      assocAppMap.set(taskId, [...existing, ...apps]);
    }
  }

  // 6. Build tasks array
  const tasks = [];
  for (const [id, el] of elementMap) {
    if (!el.isTask) continue;
    const sourceTasks = findConnectedTasks(id, 'in');
    const targetTasks = findConnectedTasks(id, 'out');

    // Get applications: prefer extension elements, fall back to annotations
    const apps = taskAppExtMap.get(id) || assocAppMap.get(id) || [];

    tasks.push({
      name: el.name,
      source: sourceTasks.length ? sourceTasks.join(', ') : null,
      target: targetTasks.length ? targetTasks.join(', ') : null,
      applications: apps.map(name => ({ name })),
    });
  }

  return tasks;
}

/** Parse metadata from TextAnnotation_DiagramTitle text content (primary),
 *  falling back to <bpmndi:BPMNDiagram name="..."> attribute.
 *  Format: "Line of Business: X | Channel: Y | ... | Business Flow: Z"
 */
function parseDiagramMetadata(xml) {
  const meta = {};
  if (!xml) return meta;

  // 1. Prefer TextAnnotation_DiagramTitle (standard for BPMN Bender exports)
  let metaString = null;
  const annMatch = xml.match(/<bpmn:textAnnotation\s+id="TextAnnotation_DiagramTitle"[^>]*>[\s\S]*?<bpmn:text>([\s\S]*?)<\/bpmn:text>/i);
  if (annMatch) metaString = annMatch[1].trim();

  // 2. Fall back to BPMNDiagram name attribute
  if (!metaString) {
    const diagMatch = xml.match(/<bpmndi:BPMNDiagram[^>]+name="([^"]+)"/i);
    if (diagMatch) metaString = diagMatch[1];
  }

  if (!metaString) return meta;

  const pairs = metaString.split('|').map(s => s.trim());
  for (const pair of pairs) {
    const idx = pair.indexOf(':');
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim().toLowerCase();
    const value = pair.slice(idx + 1).trim();
    if (!value) continue;
    if (key === 'line of business') meta.lineOfBusiness = value;
    else if (key === 'channel') meta.channel = value;
    else if (key === 'domain') meta.domain = value;
    else if (key === 'subdomain') meta.subdomain = value;
    else if (key === 'product') meta.product = value;
    else if (key === 'business flow') meta.businessFlow = value;
  }
  return meta;
}

function normalizeBusinessFlowLookupValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

async function hasMatchingBusinessFlowReference(name) {
  const normalizedName = normalizeBusinessFlowLookupValue(name);
  if (!normalizedName) return false;
  const refs = await BusinessFlow.find({}, { name: 1 }).lean();
  return refs.some((ref) => normalizeBusinessFlowLookupValue(ref.name) === normalizedName);
}

async function resolveImportedDiagramStatus(requestedStatus, sourcedFrom, businessFlowName) {
  const normalizedStatus = String(requestedStatus || '').trim().toLowerCase();
  const isImportLike = normalizedStatus === 'staged' || Boolean(sourcedFrom);
  if (!isImportLike) {
    return requestedStatus || 'Draft';
  }

  const hasMatchingReference = await hasMatchingBusinessFlowReference(businessFlowName);
  return hasMatchingReference ? 'staged' : 'invalid';
}

// GET /api/diagrams — list all (Viewers only see published)
router.get('/', async (req, res) => {
  try {
    const role = req.currentUser?.role;
    const { getNeighborhoodName, buildNeighborhoodFilter } = require('../utils/neighborhoodScope');
    const neighborhoodName = getNeighborhoodName(req);
    const filter = (!role || role === 'Viewer')
      ? { $and: [buildNeighborhoodFilter(neighborhoodName), { status: 'published' }] }
      : buildNeighborhoodFilter(neighborhoodName);
    const diagrams = await Diagram.find(filter, '-xml').sort({ updatedAt: -1 });
    res.json(diagrams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/diagrams/flow-breadcrumbs?names=Flow+A,Flow+B — returns breadcrumb metadata per flow name
router.get('/flow-breadcrumbs', async (req, res) => {
  try {
    const rawNames = req.query.names;
    if (!rawNames) return res.json([]);
    const names = String(rawNames).split(',').map(n => n.trim()).filter(Boolean);
    if (!names.length) return res.json([]);
    const { getNeighborhoodName, buildNeighborhoodFilter } = require('../utils/neighborhoodScope');
    const docs = await Diagram.find(
      { $and: [buildNeighborhoodFilter(getNeighborhoodName(req)), { businessFlow: { $in: names } }] },
      { businessFlow: 1, lineOfBusiness: 1, channel: 1, product: 1, domain: 1, subdomain: 1 }
    ).lean();
    // De-dupe: keep one record per businessFlow name
    const seen = new Set();
    const result = [];
    for (const d of docs) {
      if (!d.businessFlow || seen.has(d.businessFlow)) continue;
      seen.add(d.businessFlow);
      result.push({
        name: d.businessFlow,
        lineOfBusiness: d.lineOfBusiness || null,
        channel: d.channel || null,
        product: d.product || null,
        domain: d.domain || null,
        subdomain: d.subdomain || null,
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/diagrams/business-flow-map — returns { flowName: diagramId } for all diagrams with a businessFlow
router.get('/business-flow-map', async (req, res) => {
  try {
    const { getNeighborhoodName, buildNeighborhoodFilter } = require('../utils/neighborhoodScope');
    const docs = await Diagram.find({ $and: [buildNeighborhoodFilter(getNeighborhoodName(req)), { businessFlow: { $ne: null } }] }, { businessFlow: 1 }).lean();
    const map = {};
    for (const d of docs) {
      if (d.businessFlow) map[d.businessFlow] = d._id.toString();
    }
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/diagrams/search?q=term — full-text + regex fallback search
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }
  const role = req.currentUser?.role;
  const isViewer = !role || role === 'Viewer';
  const { getNeighborhoodName, buildNeighborhoodFilter } = require('../utils/neighborhoodScope');
  const neighborhoodName = getNeighborhoodName(req);
  try {
    // Try full-text search first
    const textFilter = isViewer
      ? { $and: [buildNeighborhoodFilter(neighborhoodName), { $text: { $search: q.trim() } }, { status: 'published' }] }
      : { $and: [buildNeighborhoodFilter(neighborhoodName), { $text: { $search: q.trim() } }] };
    let results = await Diagram.find(
      textFilter,
      { score: { $meta: 'textScore' }, xml: 0 }
    ).sort({ score: { $meta: 'textScore' } });
    // Fallback to regex (partial/prefix match) if text search yields nothing
    if (!results.length) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      const orConditions = [{ name: regex }, { businessFlow: regex }, { lineOfBusiness: regex }, { domain: regex }, { subdomain: regex }, { product: regex }, { channel: regex }, { status: regex }, { createdBy: regex }, { 'tasks.name': regex }];
      const regexFilter = isViewer
        ? { $and: [buildNeighborhoodFilter(neighborhoodName), { $or: orConditions }, { status: 'published' }] }
        : { $and: [buildNeighborhoodFilter(neighborhoodName), { $or: orConditions }] };
      results = await Diagram.find(regexFilter, { xml: 0 }).limit(50);
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/diagrams/:id — get single diagram with XML
router.get('/:id', async (req, res) => {
  try {
    const { getNeighborhoodName, buildNeighborhoodFilter } = require('../utils/neighborhoodScope');
    const diagram = await Diagram.findOne({ $and: [buildNeighborhoodFilter(getNeighborhoodName(req)), { _id: req.params.id }] });
    if (!diagram) return res.status(404).json({ error: 'Diagram not found.' });
    res.json(diagram);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/diagrams — create new diagram
router.post('/', async (req, res) => {
  const { name, description, xml, tags, capabilities, status, sourcedFrom, createdBy } = req.body;
  if (!name || !xml) {
    return res.status(400).json({ error: 'Fields "name" and "xml" are required.' });
  }
  try {
    const meta = parseDiagramMetadata(xml);
    // Use the caller-supplied name; meta.businessFlow is informational metadata only
    const diagramName = name;
    const cleanXml = stripTitleAnnotations(xml);
    const tasks = extractTasks(xml);
    const resolvedStatus = await resolveImportedDiagramStatus(status, sourcedFrom, meta.businessFlow || diagramName);
    const diagram = await Diagram.create({
      name: diagramName, description, xml: cleanXml, tags, capabilities, tasks,
      status: resolvedStatus,
      neighborhoodName: req.headers['x-neighborhood-name'] ? String(req.headers['x-neighborhood-name']).trim() : 'AT&T Journey',
      sourcedFrom: sourcedFrom || null,
      createdBy: createdBy || null,
      updatedBy: createdBy || null,
      ...meta,
    });
    res.status(201).json(diagram);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/diagrams/:id — update diagram
router.put('/:id', async (req, res) => {
  const { name, description, xml, tags, capabilities, changeNote, status, sourcedFrom, updatedBy } = req.body;
  try {
    const $set = {};
    if (name !== undefined) $set.name = name;
    if (description !== undefined) $set.description = description;
    if (status !== undefined) $set.status = status;
    if (sourcedFrom !== undefined) $set.sourcedFrom = sourcedFrom;
    if (updatedBy !== undefined) $set.updatedBy = updatedBy;
    if (xml !== undefined) {
      $set.xml = stripTitleAnnotations(xml);
      // Re-parse metadata from updated XML
      const meta = parseDiagramMetadata(xml);
      $set.lineOfBusiness = meta.lineOfBusiness || null;
      $set.channel = meta.channel || null;
      $set.domain = meta.domain || null;
      $set.subdomain = meta.subdomain || null;
      $set.product = meta.product || null;
      $set.businessFlow = meta.businessFlow || null;
      // Extract tasks with source/target/applications
      $set.tasks = extractTasks(xml);
    }
    if (tags !== undefined) $set.tags = tags;
    if (capabilities !== undefined) $set.capabilities = capabilities;

    const update = { $set, $inc: { version: 1 } };

    // Append change note to history
    if (changeNote) {
      update.$push = {
        changeHistory: {
          date: new Date(),
          userId: changeNote.userId,
          note: changeNote.note,
        },
      };
    }

    const { getNeighborhoodName, buildNeighborhoodFilter } = require('../utils/neighborhoodScope');
    const neighborhoodName = getNeighborhoodName(req);
    const diagram = await Diagram.findOneAndUpdate(
      { $and: [buildNeighborhoodFilter(neighborhoodName), { _id: req.params.id }] },
      update,
      { new: true, runValidators: true }
    );
    if (!diagram) return res.status(404).json({ error: 'Diagram not found.' });
    res.json(diagram);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/diagrams/:id — delete diagram
router.delete('/:id', async (req, res) => {
  try {
    const { getNeighborhoodName, buildNeighborhoodFilter } = require('../utils/neighborhoodScope');
    const diagram = await Diagram.findOneAndDelete({ $and: [buildNeighborhoodFilter(getNeighborhoodName(req)), { _id: req.params.id }] });
    if (!diagram) return res.status(404).json({ error: 'Diagram not found.' });
    res.json({ message: 'Diagram deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/diagrams/batch — batch import multiple diagrams with status "Staged"
router.post('/batch', async (req, res) => {
  const { files, createdBy } = req.body;
  if (!Array.isArray(files) || !files.length) {
    return res.status(400).json({ error: 'Array of files is required.' });
  }
  const results = { success: [], failed: [] };
  for (const file of files) {
    try {
      const { xml, fileName } = file;
      if (!xml) {
        results.failed.push({ fileName, error: 'No XML content' });
        continue;
      }
      const meta = parseDiagramMetadata(xml);
      const name = meta.businessFlow || fileName?.replace(/\.bpmn$/i, '').replace(/\.xml$/i, '') || 'Untitled';
      const cleanXml = stripTitleAnnotations(xml);
      const tasks = extractTasks(xml);
      const resolvedStatus = await resolveImportedDiagramStatus('staged', fileName, meta.businessFlow || name);
      const diagram = await Diagram.create({
          neighborhoodName: req.headers['x-neighborhood-name'] ? String(req.headers['x-neighborhood-name']).trim() : 'AT&T Journey',
        name,
        xml: cleanXml,
        tasks,
        status: resolvedStatus,
        sourcedFrom: fileName || null,
        createdBy: createdBy || null,
        updatedBy: createdBy || null,
        ...meta,
      });
      results.success.push({ _id: diagram._id, name: diagram.name, fileName, status: diagram.status });
    } catch (err) {
      results.failed.push({ fileName: file.fileName, error: err.message });
    }
  }
  res.status(201).json(results);
});

module.exports = router;
