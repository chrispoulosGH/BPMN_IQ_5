const mongoose = require('mongoose');
const Component = require('../models/CanonicalComponent');
const ComponentSummary = require('../models/ComponentSummary');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/yourDbName';

async function buildComponentSummary({ neighborhoodName, batchSize = 1000, dryRun = false } = {}) {
  // Connect only if not already connected
  let disconnected = false;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    disconnected = true;
  }

  const match = {};
  if (neighborhoodName) match.neighborhoodName = neighborhoodName;

  const pipeline = [
    { $match: match },
    { $group: {
        _id: { neighborhoodName: '$neighborhoodName', primaryKey: '$primaryKey' },
        types: { $push: { componentType: '$componentType', values: '$values', _id: '$_id' } },
      }
    },
  ];

  const cursor = Component.aggregate(pipeline).cursor({ batchSize: parseInt(batchSize, 10) }).exec();

  let processed = 0;
  for await (const grp of cursor) {
    const neighborhood = grp._id.neighborhoodName;
    const primaryKey = grp._id.primaryKey;
    const valuesByType = {};
    const sources = [];
    for (const t of grp.types) {
      valuesByType[t.componentType] = t.values || null;
      sources.push({ compId: t._id, type: t.componentType });
    }

    if (!dryRun) {
      await ComponentSummary.updateOne(
        { neighborhoodName: neighborhood, primaryKey },
        { $set: { valuesByType, sources } },
        { upsert: true }
      ).exec();
    }

    processed += 1;
  }

  if (disconnected) await mongoose.disconnect();
  return { processed };
}

module.exports = { buildComponentSummary };
