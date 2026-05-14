/**
 * Generate Prompt 2 for manual testing — reads capabilities from MongoDB
 * and combines with the TechFast process summary.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const Capability = require('../models/Capability');

const processSummary = `The TechFast business flow delivers end-to-end service support and issue resolution for mass-market telecommunications customers accessing support through the Care channel. This process realises capabilities across multiple business domains: Customer Management (customer identification and account lookup), Service Problem Management (fault diagnosis and troubleshooting), Sales and Retention (probing customer needs and upselling during the service interaction), Workforce Management (scheduling appointments, dispatching field technicians, and managing job tooling and navigation), Resource Provisioning (device provisioning and activation on-premise), and Customer Experience Management (satisfaction survey capture). Four key stakeholder roles collaborate: the Customer initiates the service request; the Agent performs customer identification, diagnostics, and sales engagement; the Scheduler coordinates appointment booking and confirmation notifications; and the Technician executes field operations including device provisioning, job tooling authorisation, and on-site service restoration. The process delivers several business outcomes: rapid resolution of service issues under a product guarantee (TechFast), revenue protection through in-call sales opportunities, optimised field workforce utilisation through structured dispatch and tool management, and closed-loop customer feedback via post-service satisfaction surveys. In TMF terms, this process exercises Service Assurance, Customer Interaction Management, Workforce Management, and Resource Provisioning capabilities within a unified care journey.`;

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq');

  const caps = await Capability.find(
    {},
    { capabilityId: 1, name: 1, domainName: 1, aspect: 1, briefDescription: 1, _id: 0 }
  )
    .sort({ aspectOrder: 1, domainOrder: 1 })
    .lean();

  const capList = caps
    .map(
      (c) =>
        `[${c.capabilityId}] ${c.domainName} > ${c.aspect} > ${c.name}: ${(c.briefDescription || '').slice(0, 120)}`
    )
    .join('\n');

  const prompt2 = `You are an enterprise architecture analyst applying Kotusev's capability mapping principles from "The Practice of Enterprise Architecture":

MAPPING RULES:
- A business capability represents WHAT an organisation CAN DO -- a stable, noun-based functional ability (e.g. "Customer Management", "Service Fulfilment").
- A business process represents HOW work is done -- the sequence of activities that REALISE one or more capabilities.
- One process typically exercises multiple capabilities.
- Match by FUNCTIONAL INTENT: ask "what organisational ability must exist for this process to work?"
- Weight higher-level (domain/aspect) alignment over superficial keyword overlap.
- A capability that is NECESSARY for the process to function scores higher than one that is merely RELATED.

TASK:
Given the business process summary below and the list of TMF GB1029C business capabilities, select the TOP 5 capabilities that this process most directly realises or depends on. For each, provide:
- capabilityId (the numeric ID)
- capabilityName
- confidence (0-100 percentage)
- justification (1-2 sentences explaining the functional alignment)

--- PROCESS SUMMARY ---
${processSummary}
--- END ---

--- TMF GB1029C CAPABILITIES ---
${capList}
--- END ---

Respond ONLY with a JSON array of exactly 5 objects, ordered by confidence descending:
[{"capabilityId": number, "capabilityName": "string", "confidence": number, "justification": "string"}]`;

  fs.writeFileSync('../prompt2_techfast.txt', prompt2, 'utf8');
  console.log(`Written to prompt2_techfast.txt (${prompt2.length} chars)`);
  console.log('');
  console.log('--- First 200 lines of prompt ---');
  const lines = prompt2.split('\n');
  console.log(lines.slice(0, 30).join('\n'));
  console.log(`... (${lines.length} total lines, ${caps.length} capabilities listed) ...`);
  console.log(lines.slice(-5).join('\n'));

  await mongoose.disconnect();
}

main();
