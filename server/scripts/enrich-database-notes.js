const mongoose = require('mongoose');

const DatabaseInstance = require('../models/DatabaseInstance');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

const SOURCES = {
  cisaKev: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
  oracleLifetime: 'https://www.oracle.com/support/lifetime-support/',
  microsoftSqlLifecycle: 'https://learn.microsoft.com/lifecycle/products/',
  mongodbReleases: 'https://www.mongodb.com/legal/support-policy/lifecycles',
  mysqlLifecycle: 'https://www.mysql.com/support/eol-notice.html',
  postgresVersioning: 'https://www.postgresql.org/support/versioning/',
  cassandraProject: 'https://cassandra.apache.org/_/index.html',
  db2Lifecycle: 'https://www.ibm.com/support/pages/db2-version-and-fix-pack-information',
};

function clean(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function addNote(notes, label, severity, note, sourceUrl = null, details = {}) {
  notes.push({
    label,
    severity,
    note,
    sourceUrl,
    rationale: details.rationale || null,
    decisionFactors: details.decisionFactors || [],
    vulnerabilities: details.vulnerabilities || [],
  });
}

function parseMajorVersion(version) {
  const text = clean(version);
  if (!text) return null;
  const match = text.match(/(\d{1,2})/);
  if (!match) return null;
  const major = Number(match[1]);
  return Number.isFinite(major) ? major : null;
}

function getVendorName(database) {
  return (clean(database.normalizedVendor) || clean(database.vendor) || clean(database.databaseClassName) || 'Unknown').toLowerCase();
}

function getVersionText(database) {
  return clean(database.version);
}

function inferDatabaseNotes(database) {
  const notes = [];
  const vendorName = getVendorName(database);
  const versionText = getVersionText(database);
  const major = parseMajorVersion(versionText);
  const className = clean(database.databaseClassName);
  const lifecycleStatus = clean(database.lifecycleStageStatus).toLowerCase();

  if (!versionText) {
    addNote(
      notes,
      'INVENTORY_GAP',
      'medium',
      'Database version is missing. Lifecycle, patch, and vulnerability posture cannot be validated confidently.',
      null,
      {
        rationale: 'The source data does not include a usable DB version string.',
        decisionFactors: ['Missing dbinstance_version in source data'],
      }
    );
  }

  if (/oracle/.test(vendorName)) {
    if (major !== null && major <= 12) {
      addNote(notes, 'DB_EOL', 'high', 'Oracle Database 12c or older detected. Validate Oracle Lifetime Support status and upgrade plan.', SOURCES.oracleLifetime, {
        rationale: 'Oracle database major version is 12 or older, which is commonly beyond premier support windows.',
        decisionFactors: [`Detected Oracle version: ${versionText || 'unknown'}`],
        vulnerabilities: [
          'Review Oracle Critical Patch Update coverage for database and client components',
          'Validate protection against widely targeted Oracle deserialization and auth-bypass classes of issues where applicable',
        ],
      });
    } else if (major === 19) {
      addNote(notes, 'DB_LIFECYCLE_WATCH', 'medium', 'Oracle 19c detected. Confirm current Release Update level and long-term support plan.', SOURCES.oracleLifetime, {
        rationale: 'Oracle 19c is a long-lived release, but patch level still matters materially for security posture.',
        decisionFactors: [`Detected Oracle version: ${versionText || 'unknown'}`],
        vulnerabilities: ['Confirm the latest applicable Oracle Critical Patch Update has been applied'],
      });
    }
  } else if (/microsoft sql|msft sql|sql instance/.test(vendorName)) {
    if (major !== null && major <= 12) {
      addNote(notes, 'DB_EOL', 'high', 'Legacy Microsoft SQL Server generation detected. Verify lifecycle status and accelerated modernization plan.', SOURCES.microsoftSqlLifecycle, {
        rationale: 'Older SQL Server major versions map to 2014-era or earlier product lines.',
        decisionFactors: [`Detected SQL Server version: ${versionText || 'unknown'}`],
        vulnerabilities: [
          'Validate patch status against known SQL Server remote code execution and privilege-escalation advisories',
          'Review unsupported TLS, encryption, and authentication defaults in older SQL Server deployments',
        ],
      });
    } else if (major === 13 || major === 14) {
      addNote(notes, 'DB_LIFECYCLE_WATCH', 'medium', 'Older supported SQL Server major version detected. Confirm servicing branch and patch currency.', SOURCES.microsoftSqlLifecycle, {
        rationale: 'SQL Server 2016/2017 generations require tighter lifecycle planning than current major versions.',
        decisionFactors: [`Detected SQL Server version: ${versionText || 'unknown'}`],
      });
    }
  } else if (/mongodb/.test(vendorName)) {
    if (major !== null && major <= 5) {
      addNote(notes, 'DB_EOL', 'high', 'MongoDB major version appears old relative to the current release stream. Validate support policy and upgrade path.', SOURCES.mongodbReleases, {
        rationale: 'Older MongoDB major versions age out quickly relative to current release cadence.',
        decisionFactors: [`Detected MongoDB version: ${versionText || 'unknown'}`],
        vulnerabilities: [
          'Validate authentication, TLS, and exposure controls on older MongoDB deployments',
          'Review patch status for server and driver vulnerabilities affecting older release lines',
        ],
      });
    }
  } else if (/mysql/.test(vendorName)) {
    if (major !== null && major <= 5) {
      addNote(notes, 'DB_EOL', 'high', 'MySQL 5.x or older detected. Confirm end-of-life exposure and migration plan.', SOURCES.mysqlLifecycle, {
        rationale: 'MySQL 5.x families have materially higher lifecycle and patch risk than current major versions.',
        decisionFactors: [`Detected MySQL version: ${versionText || 'unknown'}`],
        vulnerabilities: [
          'Review auth, TLS, and privilege model hardening on legacy MySQL releases',
          'Validate remediation for historical MySQL remote code execution and privilege escalation advisories',
        ],
      });
    }
  } else if (/postgres/.test(vendorName)) {
    if (major !== null && major <= 12) {
      addNote(notes, 'DB_EOL', 'high', 'Older PostgreSQL major version detected. Validate community support status and patch strategy.', SOURCES.postgresVersioning, {
        rationale: 'PostgreSQL major versions age out on a fixed support schedule.',
        decisionFactors: [`Detected PostgreSQL version: ${versionText || 'unknown'}`],
      });
    }
  } else if (/cassandra/.test(vendorName)) {
    if (major !== null && major <= 3) {
      addNote(notes, 'DB_EOL', 'high', 'Apache Cassandra 3.x or older detected. Validate continued support and upgrade path.', SOURCES.cassandraProject, {
        rationale: 'Older Cassandra branches require explicit verification of maintenance and security patch coverage.',
        decisionFactors: [`Detected Cassandra version: ${versionText || 'unknown'}`],
        vulnerabilities: [
          'Review exposure to older Cassandra auth, JMX, and cluster hardening gaps',
          'Confirm patch coverage for node-to-node encryption and management interface vulnerabilities',
        ],
      });
    } else if (major === 4) {
      addNote(notes, 'DB_LIFECYCLE_WATCH', 'medium', 'Cassandra 4.x detected. Confirm current maintenance release and hardening baseline.', SOURCES.cassandraProject, {
        rationale: 'Cassandra 4.x is viable but still requires disciplined maintenance in multi-node production clusters.',
        decisionFactors: [`Detected Cassandra version: ${versionText || 'unknown'}`],
      });
    }
  } else if (/db2/.test(vendorName)) {
    addNote(notes, 'DB_LIFECYCLE_WATCH', 'medium', 'IBM Db2 subsystem detected. Validate exact edition, fix pack, and lifecycle coverage.', SOURCES.db2Lifecycle, {
      rationale: 'Db2 lifecycle risk depends on edition and fix pack, which are not fully captured in the source data.',
      decisionFactors: [`Detected Db2 version: ${versionText || 'unknown'}`],
    });
  }

  if (versionText && notes.some((note) => note.label === 'DB_EOL' || note.label === 'DB_LIFECYCLE_WATCH')) {
    addNote(notes, 'KNOWN_DB_VULNERABILITIES', 'high', 'Validate patch currency against known exploited or widely weaponized database vulnerabilities for this product family.', SOURCES.cisaKev, {
      rationale: 'Aging database major versions correlate with higher exposure to known exploited vulnerabilities and unpatched hardening gaps.',
      decisionFactors: [`Detected vendor: ${clean(database.normalizedVendor) || clean(database.vendor) || className || 'unknown'}`, `Detected version: ${versionText}`],
      vulnerabilities: [
        'Review current vendor critical patch advisories for the detected product family',
        'Confirm exposed admin, management, and replication endpoints are not internet reachable without strong controls',
        'Validate MFA, least privilege, and TLS/encryption hardening around database administration paths',
      ],
    });
  }

  if (/retire|end|obsolete|deprecated/.test(lifecycleStatus)) {
    addNote(notes, 'LIFECYCLE_STATUS', 'high', 'Source data already flags this database lifecycle as non-current. Review retirement or remediation priority.', null, {
      rationale: 'Lifecycle stage status in the source data indicates a degraded or non-current state.',
      decisionFactors: [`Source lifecycle stage status: ${clean(database.lifecycleStageStatus) || 'unknown'}`],
    });
  } else if (/in use|production/.test(lifecycleStatus) && !notes.length) {
    addNote(notes, 'PRODUCTION_DEPENDENCY', 'info', 'Production database instance detected with no immediate heuristic lifecycle flags. Continue normal patch and configuration reviews.', null, {
      rationale: 'Database appears to be in active use but did not match the current heuristic risk thresholds.',
      decisionFactors: [`Source lifecycle stage status: ${clean(database.lifecycleStageStatus) || 'unknown'}`],
    });
  }

  return notes;
}

async function enrich() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const databases = await DatabaseInstance.find({}).lean();
  console.log(`Loaded ${databases.length} database instances`);

  const operations = [];
  for (const database of databases) {
    const healthNotes = inferDatabaseNotes(database);
    operations.push({
      updateOne: {
        filter: { _id: database._id },
        update: { $set: { healthNotes } },
      },
    });
  }

  if (operations.length) {
    const result = await DatabaseInstance.bulkWrite(operations, { ordered: false });
    console.log('Updated notes:', result.modifiedCount);
  }

  const countWithNotes = await DatabaseInstance.countDocuments({ 'healthNotes.0': { $exists: true } });
  console.log(`Database instances with notes: ${countWithNotes}`);

  await mongoose.disconnect();
  console.log('Done.');
}

enrich().catch((err) => {
  console.error(err);
  process.exit(1);
});