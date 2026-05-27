/**
 * Seed roles, permissions, and default users for BPMN IQ.
 * Safe to re-run (upserts).
 * Usage: node scripts/seed-roles-users.js
 */
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

// All factory function names used by the application
const ALL_FUNCTIONS = [
  'BPMN Factory',
  'Task Factory',
  'Application Factory',
  'Capability Factory',
  'Actor Factory',
  'Business Flow Factory',
  'Product Factory',
  'Line of Business Factory',
  'Channel Factory',
  'Domain Factory',
  'Subdomain Factory',
  'Dashboard',
  'Admin',
];

const ALL_PERMISSIONS = ['Read', 'Write', 'Approve', 'Publish', 'Submit'];

const ROLES = [
  {
    name: 'Super',
    description: 'Super user with all permissions across all functions',
    capabilities: ALL_FUNCTIONS.flatMap(fn =>
      ALL_PERMISSIONS.map(permission => ({ function: fn, permission }))
    ),
  },
  {
    name: 'Admin',
    description: 'Full access to all factories and admin panel',
    capabilities: ALL_FUNCTIONS.flatMap(fn => [
      { function: fn, permission: 'Read' },
      { function: fn, permission: 'Write' },
    ]),
  },
  {
    name: 'Editor',
    description: 'Read/Write access to all factories, no admin',
    capabilities: ALL_FUNCTIONS.filter(f => f !== 'Admin').flatMap(fn => [
      { function: fn, permission: 'Read' },
      { function: fn, permission: 'Write' },
    ]),
  },
  {
    name: 'Viewer',
    description: 'Read-only access to all factories',
    capabilities: ALL_FUNCTIONS.filter(f => f !== 'Admin').map(fn => ({
      function: fn,
      permission: 'Read',
    })),
  },
];

// Default users: userId / displayName / role / password
const USERS = [
  { userId: 'super',  displayName: 'Super User',  role: 'Super',  password: 'super123' },
  { userId: 'admin',  displayName: 'Admin User',  role: 'Admin',  password: 'admin123' },
  { userId: 'editor', displayName: 'Editor User', role: 'Editor', password: 'editor123' },
  { userId: 'Viewer', displayName: 'Viewer',      role: 'Viewer', password: null },
];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to', MONGO_URI);

  const db = mongoose.connection;

  // ── Permissions ──────────────────────────────────────────
  await db.collection('permissions').deleteMany({});
  await db.collection('permissions').insertMany(ALL_PERMISSIONS.map(name => ({ name })));
  console.log('Permissions seeded:', ALL_PERMISSIONS.join(', '));

  // ── Roles ────────────────────────────────────────────────
  for (const role of ROLES) {
    await db.collection('roles').findOneAndUpdate(
      { name: role.name },
      { $set: role },
      { upsert: true }
    );
    console.log(`Role upserted: ${role.name} (${role.capabilities.length} capabilities)`);
  }

  // ── Users ────────────────────────────────────────────────
  for (const u of USERS) {
    const existing = await User.findOne({ userId: u.userId });
    if (existing) {
      await User.updateOne({ userId: u.userId }, { $set: { role: u.role, displayName: u.displayName } });
      console.log(`User updated: ${u.userId} → role: ${u.role}`);
    } else {
      await User.create({
        userId: u.userId,
        displayName: u.displayName,
        role: u.role,
        password: u.password || null,
      });
      console.log(`User created: ${u.userId} → role: ${u.role}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone. Login credentials:');
  USERS.filter(u => u.password).forEach(u =>
    console.log(`  ${u.userId} / ${u.password}  (${u.role})`)
  );
  console.log('  Viewer — no password required');
}

run().catch(err => { console.error(err); process.exit(1); });
