const express = require('express');
const router = express.Router();
const State = require('../models/State');
const { VALID_STATES, getAllowedActions, getTargetState } = require('../services/stateTransitions');

// Models that support state transitions
const { BusinessFlow, Product, Application, Actor: RefActor, Channel, Domain, Subdomain, LineOfBusiness } = require('../models/ReferenceData');
const Task = require('../models/Task');
const Actor = require('../models/Actor');
const Capability = require('../models/Capability');
const Diagram = require('../models/Diagram');

const collectionModelMap = {
  businessFlows: BusinessFlow,
  products: Product,
  applications: Application,
  actors: Actor,
  channels: Channel,
  domains: Domain,
  subdomains: Subdomain,
  linesOfBusiness: LineOfBusiness,
  tasks: Task,
  capabilities: Capability,
  diagrams: Diagram,
};

function extractLaneNames(xml) {
  if (!xml) return [];
  const laneNames = [];
  const laneRegex = /<bpmn:lane\b[^>]*\bname="([^"]+)"/gi;
  let match;
  while ((match = laneRegex.exec(xml)) !== null) {
    const name = String(match[1] || '').trim();
    if (name) laneNames.push(name);
  }
  return [...new Set(laneNames)];
}

function decodeXmlValue(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCharCode(Number(codePoint)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .trim();
}

function extractApplicationIdentifiersFromXml(xml) {
  if (!xml) return [];

  const identifiers = [];
  const taskBlockRegex = /<bpmn:(?:task|userTask|serviceTask|sendTask|receiveTask|manualTask|businessRuleTask|scriptTask|subProcess)\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/bpmn:(?:task|userTask|serviceTask|sendTask|receiveTask|manualTask|businessRuleTask|scriptTask|subProcess)>/gi;
  let taskMatch;

  while ((taskMatch = taskBlockRegex.exec(xml)) !== null) {
    const [, , body] = taskMatch;

    const appAttrRegex = /<(?:bpmniq|ns\d+):(?:A|a)pplication[^>]+name="([^"]+)"/gi;
    let attrMatch;
    while ((attrMatch = appAttrRegex.exec(body)) !== null) {
      const identifier = decodeXmlValue(attrMatch[1]);
      if (identifier) identifiers.push(identifier);
    }

    const appElementRegex = /<(?:bpmniq|ns\d+):application\b[^>]*>([\s\S]*?)<\/(?:bpmniq|ns\d+):application>/gi;
    let appElementMatch;
    while ((appElementMatch = appElementRegex.exec(body)) !== null) {
      const appBody = appElementMatch[1];
      const correlationId = decodeXmlValue((appBody.match(/<(?:bpmniq|ns\d+):correlationIds\b[^>]*>[\s\S]*?<(?:bpmniq|ns\d+):id>([\s\S]*?)<\/(?:bpmniq|ns\d+):id>/i) || [])[1]);
      const acronym = decodeXmlValue((appBody.match(/<(?:bpmniq|ns\d+):acronym>([\s\S]*?)<\/(?:bpmniq|ns\d+):acronym>/i) || [])[1]);
      const name = decodeXmlValue((appBody.match(/<(?:bpmniq|ns\d+):name>([\s\S]*?)<\/(?:bpmniq|ns\d+):name>/i) || [])[1]);
      const identifier = correlationId || acronym || name;
      if (identifier) identifiers.push(identifier);
    }
  }

  return [...new Set(identifiers)];
}

async function validateDiagramForSubmission(diagram) {
  const capabilityNames = [...new Set(
    (diagram.capabilities || [])
      .map((capability) => String(capability?.capabilityName || '').trim())
      .filter(Boolean)
  )];
  const businessFlow = (diagram.name || diagram.businessFlow || '').trim();
  const taskNames = [...new Set((diagram.tasks || []).map((task) => String(task.name || '').trim()).filter(Boolean))];
  const xmlApplicationNames = extractApplicationIdentifiersFromXml(diagram.xml || '');
  const applicationNames = xmlApplicationNames.length
    ? xmlApplicationNames
    : [...new Set(
        (diagram.tasks || []).flatMap((task) =>
          (task.applications || []).map((app) => String(app?.name || '').trim()).filter(Boolean)
        )
      )];
  const laneNames = extractLaneNames(diagram.xml || '');

  const [knownTaskNames, knownApplications, knownActorNames] = await Promise.all([
    Task.distinct('name', businessFlow ? { businessFlow } : {}),
    Application.find({}, { name: 1, acronym: 1, correlationId: 1 }).lean(),
    Actor.distinct('name'),
  ]);

  const taskSet = new Set(knownTaskNames.map((name) => String(name || '').toLowerCase().trim()));
  const applicationSet = new Set(
    knownApplications.flatMap((application) => [application.correlationId, application.acronym, application.name]
      .map((value) => String(value || '').toLowerCase().trim())
      .filter(Boolean))
  );
  const actorSet = new Set(knownActorNames.map((name) => String(name || '').toLowerCase().trim()));

  const invalidTasks = taskNames.filter((name) => !taskSet.has(name.toLowerCase().trim()));
  const invalidApplications = applicationNames.filter((name) => !applicationSet.has(name.toLowerCase().trim()));
  const invalidActors = laneNames.filter((name) => !actorSet.has(name.toLowerCase().trim()));
  const hasCapabilities = capabilityNames.length > 0;

  return { hasCapabilities, invalidTasks, invalidApplications, invalidActors };
}

// GET /api/states — list all valid states
router.get('/', async (_req, res) => {
  try {
    const states = await State.find().sort('order').lean();
    if (states.length) return res.json(states);
    // Fallback to VALID_STATES constant if collection is empty
    res.json(VALID_STATES.map((name, i) => ({ name, order: i })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/states/actions?collection=xxx&id=yyy&role=zzz — get allowed actions for a record
router.get('/actions', async (req, res) => {
  const { collection, id, role } = req.query;
  if (!collection || !id || !role) {
    return res.status(400).json({ error: 'collection, id, and role are required' });
  }
  const Model = collectionModelMap[collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });

  try {
    const record = await Model.findById(id).lean();
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const currentState = (record.state || record.status || 'draft').toLowerCase();
    const actions = getAllowedActions(role, currentState);
    res.json({ currentState, actions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/states/transition — perform a state transition
router.post('/transition', async (req, res) => {
  const { collection, id, action, role } = req.body;
  if (!collection || !id || !action || !role) {
    return res.status(400).json({ error: 'collection, id, action, and role are required' });
  }
  const Model = collectionModelMap[collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });

  try {
    const record = await Model.findById(id);
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const currentState = (record.state || record.status || 'draft').toLowerCase();
    const targetState = getTargetState(role, action.toLowerCase(), currentState);

    if (!targetState) {
      return res.status(403).json({
        error: `Role "${role}" cannot perform "${action}" on a record in state "${currentState}"`,
      });
    }

    if (collection === 'diagrams' && currentState === 'draft' && targetState === 'submitted') {
      const { hasCapabilities, invalidTasks, invalidApplications, invalidActors } = await validateDiagramForSubmission(record);
      if (!hasCapabilities || invalidTasks.length || invalidApplications.length || invalidActors.length) {
        const problems = [];
        if (!hasCapabilities) problems.push('at least one associated business capability is required');
        if (invalidTasks.length) problems.push(`invalid tasks: ${invalidTasks.join(', ')}`);
        if (invalidApplications.length) problems.push(`invalid applications: ${invalidApplications.join(', ')}`);
        if (invalidActors.length) problems.push(`invalid actors: ${invalidActors.join(', ')}`);
        return res.status(400).json({
          error: `Cannot submit diagram with invalid objects: ${problems.join(' | ')}`,
          missingCapabilities: !hasCapabilities,
          invalidTasks,
          invalidApplications,
          invalidActors,
        });
      }
    }

    // Update the state field (use 'state' for ref data, 'status' for diagrams if that's what they use)
    if (collection === 'diagrams') {
      record.status = targetState;
    } else {
      record.state = targetState;
    }
    await record.save();

    res.json({ previousState: currentState, newState: targetState, record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
