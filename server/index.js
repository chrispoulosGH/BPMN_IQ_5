require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const diagramsRouter = require('./routes/diagrams');
const filesRouter = require('./routes/files');
const capabilitiesRouter = require('./routes/capabilities');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/diagrams', diagramsRouter);
app.use('/api/files', filesRouter);
app.use('/api/capabilities', capabilitiesRouter);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Connect to MongoDB then start server
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log(`Connected to MongoDB at ${MONGO_URI}`);
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
