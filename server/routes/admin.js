const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');

// Middleware: require Admin Read capability
router.use(async (req, res, next) => {
  const userId = req.currentUser?.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = await User.findOne({ userId }).lean();
  if (!user?.role) return res.status(403).json({ error: 'Access denied' });
  const role = await mongoose.connection.collection('roles').findOne({ name: user.role });
  const hasAdmin = role?.capabilities?.some(c => c.function === 'Admin' && (c.permission === 'Read' || c.permission === 'Write'));
  if (!hasAdmin) return res.status(403).json({ error: 'Access denied' });
  req.adminWrite = role.capabilities.some(c => c.function === 'Admin' && c.permission === 'Write');
  next();
});

// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
  const users = await User.find({}, 'userId displayName role lastLogin createdAt').lean();
  res.json(users);
});

// GET /api/admin/roles — list all roles
router.get('/roles', async (_req, res) => {
  const roles = await mongoose.connection.collection('roles').find({}, { projection: { name: 1, description: 1 } }).toArray();
  res.json(roles);
});

// POST /api/admin/users — create a user
router.post('/users', async (req, res) => {
  if (!req.adminWrite) return res.status(403).json({ error: 'Write access required' });
  const { userId, displayName, role, password } = req.body;
  if (!userId?.trim()) return res.status(400).json({ error: 'User ID is required' });
  const existing = await User.findOne({ userId: userId.trim() });
  if (existing) return res.status(409).json({ error: 'User already exists' });
  const user = await User.create({
    userId: userId.trim(),
    displayName: displayName?.trim() || userId.trim(),
    role: role || null,
    password: password || null,
  });
  res.status(201).json({ _id: user._id, userId: user.userId, displayName: user.displayName, role: user.role });
});

// PUT /api/admin/users/:id — update user role/displayName
router.put('/users/:id', async (req, res) => {
  if (!req.adminWrite) return res.status(403).json({ error: 'Write access required' });
  const { displayName, role } = req.body;
  const update = {};
  if (displayName !== undefined) update.displayName = displayName;
  if (role !== undefined) update.role = role || null;
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, fields: 'userId displayName role lastLogin' }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// DELETE /api/admin/users/:id — delete a user
router.delete('/users/:id', async (req, res) => {
  if (!req.adminWrite) return res.status(403).json({ error: 'Write access required' });
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

module.exports = router;
