const mongoose = require('mongoose');

const Server = require('../models/Server');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

const SOURCES = {
  ubuntuLifecycle: 'https://ubuntu.com/about/release-cycle',
  rhelLifecycle: 'https://access.redhat.com/support/policy/updates/errata',
  noaaTornadoes: 'https://www.noaa.gov/education/resource-collections/weather-atmosphere/tornadoes',
};

const TORNADO_PRONE_STATES = new Set([
  'TX', 'OK', 'KS', 'NE', 'SD', 'ND', 'IA', 'MO', 'AR', 'LA', 'MS', 'AL', 'TN', 'KY', 'IL', 'IN', 'OH',
]);

const FLOOD_AND_HURRICANE_PRONE_STATES = new Set([
  'FL', 'TX', 'LA', 'MS', 'AL', 'GA', 'SC', 'NC', 'VA', 'MD', 'DE', 'NJ', 'NY', 'CT', 'RI', 'MA', 'ME',
]);

function clean(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function inferStateCode(locationText) {
  const upper = locationText.toUpperCase();
  const stateCodePattern = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/;
  const stateNameMap = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO', CONNECTICUT: 'CT',
    DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
    KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI',
    MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
    'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC',
    'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
    VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY',
  };

  const stateCodeMatch = upper.match(stateCodePattern);
  if (stateCodeMatch) return stateCodeMatch[1];

  for (const stateName of Object.keys(stateNameMap)) {
    if (upper.includes(stateName)) return stateNameMap[stateName];
  }

  return null;
}

function getOsText(server) {
  const os = clean(server.normalizedOs) || clean(server.os);
  const version = clean(server.normalizedOsVersion) || clean(server.osVersion);
  return `${os} ${version}`.trim().toLowerCase();
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

function getKnownVulnerabilitySignals(osText) {
  if (/windows\s+server\s+2008|windows\s+server\s+2012/.test(osText)) {
    return {
      vulnerabilities: [
        'CVE-2019-0708 (BlueKeep) exposure risk on unpatched RDP services',
        'SMBv1 exploit family (MS17-010 / EternalBlue-related) in legacy configurations',
        'CVE-2021-34527 (PrintNightmare) where spooler hardening and patches are incomplete',
      ],
      rationale: 'Legacy Windows Server generations are frequently represented in known exploited vulnerability guidance.',
    };
  }

  if (/windows\s+server\s+2016/.test(osText)) {
    return {
      vulnerabilities: [
        'CVE-2021-34527 (PrintNightmare) patch and hardening validation',
        'RDP/NLA and SMB hardening gaps that map to recurring KEV-style Windows findings',
      ],
      rationale: 'Supported but older Windows Server releases still require tight patch and hardening discipline due to frequent enterprise targeting.',
    };
  }

  if (/centos\s*7|rhel\s*7|red hat enterprise linux\s*7/.test(osText)) {
    return {
      vulnerabilities: [
        'OpenSSL/OpenSSH package CVEs in unmaintained repositories',
        'Kernel privilege-escalation CVEs that continue to be weaponized when patch latency is high',
      ],
      rationale: 'RHEL/CentOS 7-era systems in late lifecycle commonly accumulate exploitable package and kernel exposure if not on extended support.',
    };
  }

  if (/ubuntu\s*16\.04|ubuntu\s*18\.04|ubuntu\s*20\.04/.test(osText)) {
    return {
      vulnerabilities: [
        'Kernel and OpenSSL/OpenSSH CVEs with public exploit tooling when maintenance is not current',
        'High-profile Linux local privilege escalation CVEs (for example Dirty Pipe class issues) requiring kernel update verification',
      ],
      rationale: 'Older Ubuntu LTS generations need explicit verification of ESM/Pro or patch compliance to avoid drift into known exploitable states.',
    };
  }

  return null;
}

function inferHealthNotes(server) {
  const notes = [];
  const osText = getOsText(server);
  const locationText = clean(server.location);
  const supportGroup = clean(server.supportGroup);
  const managedByGroup = clean(server.managedByGroup);
  const lifecycleStatus = clean(server.lifecycleStatus).toLowerCase();
  const operationalStatus = clean(server.operationalStatus).toLowerCase();
  const internetFacing = clean(server.internetFacing).toLowerCase();

  // OS lifecycle and security posture heuristics
  if (/windows\s+server\s+2008|windows\s+server\s+2012/.test(osText)) {
    const osDetected = osText.includes('2008') ? 'Windows Server 2008' : 'Windows Server 2012';
    addNote(
      notes,
      'OS_EOL',
      'high',
      'Windows Server 2008/2012 appears end-of-support. Prioritize upgrade path and compensating controls.',
      'https://learn.microsoft.com/lifecycle/products/',
      {
        rationale: `${osDetected} detected from server OS metadata and matched to Microsoft lifecycle end-of-support status.`,
        decisionFactors: [
          `Detected OS string: ${osText || 'unknown'}`,
          'Vendor lifecycle announcement indicates end of mainstream security support',
          'Legacy major versions have increased probability of patch coverage gaps',
        ],
      }
    );
  } else if (/windows\s+server\s+2016/.test(osText)) {
    addNote(
      notes,
      'OS_LIFECYCLE_WATCH',
      'medium',
      'Windows Server 2016 is approaching end-of-support horizon. Confirm migration timeline and patch compliance.',
      'https://learn.microsoft.com/lifecycle/products/',
      {
        rationale: 'Windows Server 2016 detected and flagged as approaching lifecycle boundary relative to current planning horizon.',
        decisionFactors: [
          `Detected OS string: ${osText || 'unknown'}`,
          'Vendor lifecycle timeline should be validated against enterprise migration plan',
        ],
      }
    );
  }

  if (/centos\s*7/.test(osText) || /rhel\s*7|red hat enterprise linux\s*7/.test(osText)) {
    addNote(
      notes,
      'OS_EOL',
      'high',
      'RHEL/CentOS 7 line is in late lifecycle. Ensure paid extended support or accelerated modernization.',
      SOURCES.rhelLifecycle,
      {
        rationale: 'RHEL/CentOS 7 pattern matched and lifecycle policy indicates late-stage or extended support dependency.',
        decisionFactors: [
          `Detected OS string: ${osText || 'unknown'}`,
          'Red Hat lifecycle policy shows reduced support phases after mainstream maintenance',
        ],
      }
    );
  }

  if (/ubuntu\s*16\.04|ubuntu\s*18\.04/.test(osText)) {
    addNote(
      notes,
      'OS_EOL',
      'high',
      'Older Ubuntu LTS release detected (16.04/18.04). Standard security maintenance has ended.',
      SOURCES.ubuntuLifecycle,
      {
        rationale: 'Ubuntu 16.04/18.04 detected; these are multiple LTS generations behind current long-term release stream.',
        decisionFactors: [
          `Detected OS string: ${osText || 'unknown'}`,
          'Canonical lifecycle states standard security maintenance ended for these releases',
          'Version age signal: typically 2 to 4 LTS generations behind current baseline',
        ],
      }
    );
  } else if (/ubuntu\s*20\.04/.test(osText)) {
    addNote(
      notes,
      'OS_LIFECYCLE_WATCH',
      'medium',
      'Ubuntu 20.04 standard maintenance window has ended; validate Ubuntu Pro/ESM coverage.',
      SOURCES.ubuntuLifecycle,
      {
        rationale: 'Ubuntu 20.04 detected and flagged because standard maintenance is no longer sufficient without extended coverage.',
        decisionFactors: [
          `Detected OS string: ${osText || 'unknown'}`,
          'Canonical lifecycle recommends ESM/Pro after standard window closure',
        ],
      }
    );
  }

  const vulnerabilitySignals = getKnownVulnerabilitySignals(osText);
  if (vulnerabilitySignals) {
    addNote(
      notes,
      'KNOWN_OS_VULNERABILITIES',
      'high',
      'Known OS vulnerability exposure category: validate patch state and hardening against known exploited patterns for this OS family.',
      'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
      {
        rationale: vulnerabilitySignals.rationale,
        decisionFactors: [
          `Detected OS string: ${osText || 'unknown'}`,
          'Mapped OS family to common known-exploited vulnerability patterns',
        ],
        vulnerabilities: vulnerabilitySignals.vulnerabilities,
      }
    );
  }

  if (!osText) {
    addNote(
      notes,
      'INVENTORY_GAP',
      'medium',
      'OS/version is missing or unclear. Improve CMDB completeness to support vulnerability management.',
      null,
      {
        rationale: 'OS metadata is empty or unparseable, so lifecycle and vulnerability posture cannot be verified confidently.',
        decisionFactors: ['Missing normalized OS and OS version fields'],
      }
    );
  }

  // Exposure notes
  if (/^(y|yes|true|1)$/.test(internetFacing)) {
    addNote(
      notes,
      'EXPOSURE',
      'medium',
      'Internet-facing asset. Enforce hardening baseline, patch SLAs, and continuous external attack-surface monitoring.',
      'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
      {
        rationale: 'Internet-facing flag was detected, increasing potential exposure to active exploitation campaigns.',
        decisionFactors: ['internetFacing field indicates externally reachable service boundary'],
      }
    );
  }

  if (/^(y|yes|true|1)$/.test(internetFacing) && notes.some((n) => n.label === 'OS_EOL')) {
    addNote(
      notes,
      'EXPOSURE_CRITICAL',
      'critical',
      'Internet-facing plus likely end-of-support OS creates elevated compromise risk; prioritize remediation immediately.',
      'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
      {
        rationale: 'Compound risk rule triggered by both external exposure and end-of-support lifecycle condition.',
        decisionFactors: ['internetFacing indicates public attack surface', 'OS_EOL note already present for this server'],
      }
    );
  }

  // Ownership and operational hygiene
  if (!supportGroup && !managedByGroup) {
    addNote(
      notes,
      'OWNERSHIP_GAP',
      'high',
      'No support or management group recorded. Assign clear ownership for patching, backup, and incident response.',
      null,
      {
        rationale: 'No owning support group metadata detected.',
        decisionFactors: ['supportGroup is blank', 'managedByGroup is blank'],
      }
    );
  }

  if (lifecycleStatus.includes('retire') && operationalStatus.includes('operational')) {
    addNote(
      notes,
      'STATE_MISMATCH',
      'medium',
      'Lifecycle indicates retirement while operational status indicates active use. Validate decommission governance.',
      null,
      {
        rationale: 'Lifecycle and operational signals conflict.',
        decisionFactors: [`lifecycleStatus=${lifecycleStatus || 'unknown'}`, `operationalStatus=${operationalStatus || 'unknown'}`],
      }
    );
  }

  if ((server.ram || 0) > 0 && (server.ram || 0) < 4096) {
    addNote(
      notes,
      'CAPACITY_RISK',
      'low',
      'Low RAM footprint detected (<4 GB). Verify workload fit and monitor for performance/degradation risk.',
      null,
      {
        rationale: 'Low memory capacity threshold rule triggered.',
        decisionFactors: [`Detected RAM value: ${server.ram}`],
      }
    );
  }

  // Location hazard context
  if (locationText) {
    const stateCode = inferStateCode(locationText);
    if (stateCode && TORNADO_PRONE_STATES.has(stateCode)) {
      addNote(
        notes,
        'GEO_WEATHER_TORNADO',
        'low',
        `Location appears in a higher tornado-exposure region (${stateCode}). Verify resilience controls (power, replication, DR runbooks).`,
        SOURCES.noaaTornadoes,
        {
          rationale: 'State code from server location intersects tornado-prone state set.',
          decisionFactors: [`Parsed state from location: ${stateCode}`],
        }
      );
    }
    if (stateCode && FLOOD_AND_HURRICANE_PRONE_STATES.has(stateCode)) {
      addNote(
        notes,
        'GEO_WEATHER_FLOOD',
        'low',
        `Location appears in a state with notable flood/coastal storm exposure (${stateCode}). Validate flood-zone posture and recovery objectives.`,
        'https://www.fema.gov/flood-maps',
        {
          rationale: 'State code from server location intersects flood/coastal risk state set.',
          decisionFactors: [`Parsed state from location: ${stateCode}`],
        }
      );
    }
  } else {
    addNote(
      notes,
      'LOCATION_GAP',
      'low',
      'Server location is missing; hazard-aware resilience planning may be incomplete.',
      null,
      {
        rationale: 'No location text available for geographic risk inference.',
        decisionFactors: ['location field is blank'],
      }
    );
  }

  return notes;
}

async function enrichServerNotes() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const servers = await Server.find({}, {
    _id: 1,
    name: 1,
    os: 1,
    osVersion: 1,
    normalizedOs: 1,
    normalizedOsVersion: 1,
    location: 1,
    supportGroup: 1,
    managedByGroup: 1,
    lifecycleStatus: 1,
    operationalStatus: 1,
    internetFacing: 1,
    ram: 1,
  }).lean();

  const bulkOps = [];
  for (const server of servers) {
    const healthNotes = inferHealthNotes(server);
    bulkOps.push({
      updateOne: {
        filter: { _id: server._id },
        update: { $set: { healthNotes } },
      },
    });
  }

  if (bulkOps.length) {
    await Server.bulkWrite(bulkOps, { ordered: false });
  }

  const countWithNotes = await Server.countDocuments({ 'healthNotes.0': { $exists: true } });
  console.log(`Processed: ${servers.length} servers`);
  console.log(`Servers with notes: ${countWithNotes}`);

  await mongoose.disconnect();
  console.log('Done');
}

enrichServerNotes().catch((err) => {
  console.error(err);
  process.exit(1);
});
