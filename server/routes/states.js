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

async function validateDiagramForSubmission(diagram) {
  const businessFlow = (diagram.name || diagram.businessFlow || '').trim();
  const taskNames = [...new Set((diagram.tasks || []).map((task) => String(task.name || '').trim()).filter(Boolean))];
  const applicationNames = [...new Set(
    (diagram.tasks || []).flatMap((task) =>
      (task.applications || []).map((app) => String(app?.name || '').trim()).filter(Boolean)
    )
  )];
  const laneNames = extractLaneNames(diagram.xml || '');

  const [knownTaskNames, knownApplicationNames, knownActorNames] = await Promise.all([
    Task.distinct('name', businessFlow ? { businessFlow } : {}),
    Application.distinct('name'),
    Actor.distinct('name'),
  ]);

  const taskSet = new Set(knownTaskNames.map((name) => String(name || '').toLowerCase().trim()));
  const applicationSet = new Set(knownApplicationNames.map((name) => String(name || '').toLowerCase().trim()));
  const actorSet = new Set(knownActorNames.map((name) => String(name || '').toLowerCase().trim()));

  const invalidTasks = taskNames.filter((name) => !taskSet.has(name.toLowerCase().trim()));
  const invalidApplications = applicationNames.filter((name) => !applicationSet.has(name.toLowerCase().trim()));
  const invalidActors = laneNames.filter((name) => !actorSet.has(name.toLowerCase().trim()));

  return { invalidTasks, invalidApplications, invalidActors };
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
      const { invalidTasks, invalidApplications, invalidActors } = await validateDiagramForSubmission(record);
      if (invalidTasks.length || invalidApplications.length || invalidActors.length) {
        const problems = [];
        if (invalidTasks.length) problems.push(`invalid tasks: ${invalidTasks.join(', ')}`);
        if (invalidApplications.length) problems.push(`invalid applications: ${invalidApplications.join(', ')}`);
        if (invalidActors.length) problems.push(`invalid actors: ${invalidActors.join(', ')}`);
        return res.status(400).json({
          error: `Cannot submit diagram with invalid objects: ${problems.join(' | ')}`,
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
