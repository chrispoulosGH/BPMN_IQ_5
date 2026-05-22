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
