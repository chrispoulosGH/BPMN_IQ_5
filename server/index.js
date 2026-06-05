require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const diagramsRouter = require('./routes/diagrams');
const filesRouter = require('./routes/files');
const capabilitiesRouter = require('./routes/capabilities');
const tasksRouter = require('./routes/tasks');
const actorsRouter = require('./routes/actors');
const serversRouter = require('./routes/servers');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const statesRouter = require('./routes/states');
const dashboardRouter = require('./routes/dashboard');
const reportsRouter   = require('./routes/reports');
const databasesRouter = require('./routes/databases');
const customFactoriesRouter = require('./routes/customFactories');
const Session = require('./models/Session');
const User = require('./models/User');
const Diagram = require('./models/Diagram');
const Task = require('./models/Task');
const Actor = require('./models/Actor');
const Capability = require('./models/Capability');
const { BusinessFlow, Product, Application, Channel, Domain, Subdomain, LineOfBusiness } = require('./models/ReferenceData');
const CustomFactory = require('./models/CustomFactory');
const FactoryNeighborhood = require('./models/FactoryNeighborhood');
const { DEFAULT_NEIGHBORHOOD_NAME } = require('./utils/neighborhoodScope');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Simple cookie parser (no external package needed)
app.use((req, _res, next) => {
  req.cookies = {};
  const header = req.headers.cookie;
  if (header) {
    header.split(';').forEach((c) => {
      const [key, ...v] = c.split('=');
      req.cookies[key.trim()] = decodeURIComponent(v.join('=').trim());
    });
  }
  next();
});

// Health check (before auth guard so wait-on can reach it)
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Auth routes (no session guard)
app.use('/api/auth', authRouter);

// Session guard — protect all other /api routes
app.use('/api', async (req, res, next) => {
  const token = req.cookies?.bpmn_iq_sid;
  if (!token) return res.status(401).json({ error: 'Session expired. Please log in again.' });
  const sess = await Session.findOne({ token, expiresAt: { $gt: new Date() } }).lean();
  if (!sess) {
    res.clearCookie('bpmn_iq_sid');
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  // Resolve user role
  const userDoc = await User.findOne({ userId: sess.userId }).lean();
  req.currentUser = { userId: sess.userId, displayName: sess.displayName, role: userDoc?.role || null };
  next();
});

// Routes
app.use('/api/diagrams', diagramsRouter);
app.use('/api/files', filesRouter);
app.use('/api/capabilities', capabilitiesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/actors', actorsRouter);
app.use('/api/servers', serversRouter);
app.use('/api/admin', adminRouter);
app.use('/api/states', statesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports',   reportsRouter);
app.use('/api/databases', databasesRouter);
app.use('/api/custom-factories', customFactoriesRouter);

// Connect to MongoDB then start server
async function backfillNeighborhoods() {
  await FactoryNeighborhood.updateOne(
    { name: DEFAULT_NEIGHBORHOOD_NAME },
    { $setOnInsert: { name: DEFAULT_NEIGHBORHOOD_NAME, owner: 'System', createdBy: 'system' } },
    { upsert: true }
  );

  const collections = [Diagram, Task, Actor, Capability, BusinessFlow, Product, Application, Channel, Domain, Subdomain, LineOfBusiness, CustomFactory];
  await Promise.all(collections.map((Model) => Model.updateMany(
    { $or: [{ neighborhoodName: { $exists: false } }, { neighborhoodName: null }, { neighborhoodName: '' }] },
    { $set: { neighborhoodName: DEFAULT_NEIGHBORHOOD_NAME } }
  )));

  await Application.updateMany(
    { correlationId: '' },
    { $set: { correlationId: null } }
  );
}

async function syncNeighborhoodIndexes() {
  const models = [Diagram, Task, Actor, Capability, BusinessFlow, Product, Application, Channel, Domain, Subdomain, LineOfBusiness];
  await Promise.all(models.map((Model) => Model.syncIndexes()));
}

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log(`Connected to MongoDB at ${MONGO_URI}`);
    await backfillNeighborhoods();
    await syncNeighborhoodIndexes();
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
