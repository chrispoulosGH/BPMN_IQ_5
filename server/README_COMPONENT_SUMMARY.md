Component Summary Aggregator

This set contains a small model and a script that builds a per-primaryKey summary document which pivots `componentType` into named columns.

Files:
- `models/ComponentSummary.js` - mongoose model for summary docs
- `routes/componentSummaries.js` - read-only API to list/inspect summaries
- `scripts/build_component_summary.js` - aggregation script that consumes canonical `components` and upserts summaries

Usage:

```powershell
# create indexes first (if not already done)
node migrations/create_component_indexes.js

# Run aggregator for all neighborhoods
node scripts/build_component_summary.js

# Run aggregator for a single neighborhood (faster)
node scripts/build_component_summary.js --neighborhood=CTX
```

Mount the route in your server entry:

```js
const summaries = require('./routes/componentSummaries');
app.use('/api/component-summaries', summaries);
```

Notes:
- The aggregator reads canonical `components` and should be run after materialization.
- It keeps one summary document per `neighborhoodName` + `primaryKey` and stores a `valuesByType` map.
- For large datasets, run the script on a worker and monitor progress.
