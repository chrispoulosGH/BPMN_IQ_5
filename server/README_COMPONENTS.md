This folder contains the canonical `components` model and a small migration utility to create indexes.

Quick setup

1. Install dependencies in the `server` folder (if not already installed):

```powershell
cd server
npm install
```

2. Ensure `MONGO_URI` env var is set or edit `migrations/create_component_indexes.js` to point to your DB.

3. Run the migration to create indexes:

```powershell
node migrations/create_component_indexes.js
```

Mounting the API routes

In your main server entry (e.g. `server/index.js` or `server/app.js`) add:

```js
const componentsRouter = require('./routes/components');
app.use('/api/components', componentsRouter);
```

Next steps

- Add the materializer (batches -> components) script and schedule it or run on upload.
- Add additional indexes for frequently queried `values.*` fields.
