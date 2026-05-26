/**
 * bulk_match_capabilities.js
 *
 * Runs the two-prompt capability matching pipeline against every diagram in
 * the MongoDB `diagrams` collection and writes the top-3 matches back to
 * each diagram's `capabilities` array.
 *
 * Uses the AT&T AskATT LLM service (same endpoint as askAttWrapper).
 *
 * Required env var:
 *   ASKATT_BEARER_TOKEN  — your AskATT bearer token
 *
 * Optional env vars:
 *   ASKATT_URL     — override endpoint  (default: internal AskATT URL)
 *   ASKATT_MODEL   — model name         (default: gpt-5.2)
 *   FORCE          — set to "true" to re-process diagrams that already have capabilities
 *   DELAY_MS       — ms to wait between diagrams (default: 2000)
 *   START_FROM     — diagram name to start from (resume after a failure)
 *
 * Usage:
 *   cd c:\code\BPMN_IQ_2\server
 *   node bulk_match_capabilities.js
 */

const path = require('path');
const fs   = require('fs');

// Load .env — try server/.env first, then askAttWrapper_2/.env as fallback
require('dotenv').config();
const wrapper2Env = path.resolve(__dirname, '../../askAttWrapper_2/.env');
if (fs.existsSync(wrapper2Env)) require('dotenv').config({ path: wrapper2Env, override: false });

const mongoose = require('mongoose');
const axios    = require('axios');
const Capability = require('./models/Capability');
const Diagram    = require('./models/Diagram');
const { extractBpmnKeywords } = require('./services/capabilityMatcher');

// ── config ─────────────────────────────────────────────────────────────────
const ASKATT_URL   = process.env.ASKATT_URL ||
  'https://askatt-services.web.att.com/askatt-services/askatt-ui-backend/chat/question';
const ASKATT_MODEL = process.env.ASKATT_MODEL || 'gpt-5.2';
const FORCE        = (process.env.FORCE || '').toLowerCase() === 'true';
const DELAY_MS     = parseInt(process.env.DELAY_MS || '2000', 10);
const START_FROM   = process.env.START_FROM || '';

// Re-read token dynamically from file on each call so you can refresh mid-run
function getBearerToken() {
  // 1. Process env (set via shell or already loaded)
  if (process.env.ASKATT_BEARER_TOKEN) return process.env.ASKATT_BEARER_TOKEN;
  if (process.env.ASKATT_TOKEN) return process.env.ASKATT_TOKEN;
  // 2. Re-read from askAttWrapper_2/.env live
  if (fs.existsSync(wrapper2Env)) {
    const line = fs.readFileSync(wrapper2Env, 'utf8')
      .split('\n').find(l => l.startsWith('ASKATT_BEARER_TOKEN='));
    if (line) return line.slice('ASKATT_BEARER_TOKEN='.length).trim();
  }
  return '';
}

const initialToken = getBearerToken();
if (!initialToken) {
  console.error('ERROR: ASKATT_BEARER_TOKEN not found in server/.env or askAttWrapper_2/.env');
  console.error('  Paste your token into c:\\code\\askAttWrapper_2\\.env as ASKATT_BEARER_TOKEN=eyJ...');
  process.exit(1);
}
console.log('Token loaded. Expires:', (() => { try { const p=JSON.parse(Buffer.from(initialToken.split(".")[1],"base64url").toString()); return new Date(p.exp*1000).toLocaleTimeString(); } catch(e){return "unknown";} })());

// ── AskATT call ─────────────────────────────────────────────────────────────
async function askAtt(prompt) {
  const body = {
    chatID: '',
    question: { content: prompt, contentFormatted: '' },
    doPlagiarismCheck: false,
    chatSelectedContexts: { 'General Knowledge': [{}] },
    context: 'General Knowledge',
    modelName: ASKATT_MODEL,
    deepResearch: false,
  };

  const resp = await axios.post(ASKATT_URL, body, {
    headers: {
      Authorization: `Bearer ${getBearerToken()}`,
      'Content-Type': 'application/json',
    },
    timeout: 240_000,
  });

  // Extract text content from response
  const data = resp.data;
  const content =
    data?.response?.answer?.content ||
    data?.answer?.content ||
    data?.content ||
    data?.message ||
    '';

  if (!content) throw new Error('Empty content in AskATT response: ' + JSON.stringify(data).slice(0, 200));
  return content.trim();
}

// ── prompt builders (mirrors capabilityMatcher.js) ──────────────────────────
function buildSummaryPrompt(keywords) {
  const sections = [];
  if (keywords.titleAnnotation)   sections.push(`Diagram Title / Metadata: ${keywords.titleAnnotation}`);
  if (keywords.lanes.length)      sections.push(`Swim-lane Participants (roles): ${keywords.lanes.join(', ')}`);
  if (keywords.tasks.length)      sections.push(`Tasks / Activities: ${keywords.tasks.join(', ')}`);
  if (keywords.subProcesses.length) sections.push(`Sub-processes: ${keywords.subProcesses.join(', ')}`);

  return `You are an enterprise architecture analyst. Given the following structural elements extracted from a BPMN 2.0 business process diagram, produce a clear, concise English summary (150-250 words) that describes:

1. WHAT business function this process accomplishes (the functional intent — not the step-by-step HOW).
2. Which business domains it touches (e.g. customer management, service fulfilment, field operations, sales, billing, etc.).
3. The key stakeholder roles involved and their responsibilities at a high level.
4. The business outcomes or value delivered by this process.

Focus on the WHAT (capabilities exercised) rather than the HOW (workflow steps).
Use the TMF (TeleManagement Forum) terminology where applicable since this is a telecoms business process.

--- BPMN PROCESS DATA ---
${sections.join('\n')}
--- END ---

Respond with ONLY the English summary paragraph, no headings or bullet points.`;
}

function buildMatcherPrompt(processSummary, capabilityList) {
  return `You are an enterprise architecture analyst applying Kotusev's capability mapping principles from "The Practice of Enterprise Architecture":

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
${capabilityList}
--- END ---

Respond ONLY with a valid JSON array of exactly 5 objects, ordered by confidence descending.
Format: [{"capabilityId": number, "capabilityName": "string", "confidence": number, "justification": "string"}]
Do not include any explanation outside the JSON array.`;
}

// ── JSON extraction (LLM sometimes wraps in markdown) ───────────────────────
function extractJson(text) {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  // Find the JSON array
  const arrStart = raw.indexOf('[');
  const arrEnd   = raw.lastIndexOf(']');
  if (arrStart === -1 || arrEnd === -1) throw new Error('No JSON array found in: ' + raw.slice(0, 200));
  return JSON.parse(raw.slice(arrStart, arrEnd + 1));
}

// ── sleep helper ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq');
  console.log('Connected to MongoDB');

  // Load all capabilities once (condensed reference list for Prompt 2)
  const caps = await Capability.find({}, {
    capabilityId: 1, name: 1, domainName: 1, aspect: 1, briefDescription: 1, _id: 0,
  }).sort({ aspectOrder: 1, domainOrder: 1 }).lean();

  const capabilityList = caps
    .map((c) => `[${c.capabilityId}] ${c.domainName} > ${c.aspect} > ${c.name}: ${(c.briefDescription || '').slice(0, 120)}`)
    .join('\n');

  console.log(`Loaded ${caps.length} capabilities from MongoDB`);

  // Load all diagrams
  const diagrams = await Diagram.find({}, { name: 1, xml: 1, capabilities: 1 }).lean();
  console.log(`Found ${diagrams.length} diagrams to process`);

  let startReached = !START_FROM;
  let processed = 0, skipped = 0, failed = 0;

  for (const diagram of diagrams) {
    // Resume support
    if (!startReached) {
      if (diagram.name === START_FROM) startReached = true;
      else { console.log(`  SKIP (before START_FROM): ${diagram.name}`); skipped++; continue; }
    }

    // Skip if already has capabilities and not forcing
    if (!FORCE && diagram.capabilities && diagram.capabilities.length > 0) {
      console.log(`  SKIP (already has ${diagram.capabilities.length} capabilities): ${diagram.name}`);
      skipped++;
      continue;
    }

    if (!diagram.xml || diagram.xml.trim().length < 100) {
      console.log(`  SKIP (no XML): ${diagram.name}`);
      skipped++;
      continue;
    }

    console.log(`\n[${processed + 1}/${diagrams.length - skipped}] Processing: ${diagram.name}`);

    try {
      // Step 1 – extract BPMN keywords
      const keywords = extractBpmnKeywords(diagram.xml);
      if (!keywords.tasks.length && !keywords.lanes.length) {
        console.log(`  SKIP (no extractable tasks): ${diagram.name}`);
        skipped++;
        continue;
      }

      // Step 2 – Prompt 1: get process summary
      console.log('  → Prompt 1: summarising process...');
      const processSummary = await askAtt(buildSummaryPrompt(keywords));
      console.log(`  → Summary (${processSummary.length} chars): ${processSummary.slice(0, 80)}...`);

      await sleep(500);

      // Step 3 – Prompt 2: match capabilities
      console.log('  → Prompt 2: matching capabilities...');
      const rawMatches = await askAtt(buildMatcherPrompt(processSummary, capabilityList));
      const matches = extractJson(rawMatches)
        .slice(0, 5)
        .sort((a, b) => b.confidence - a.confidence);

      // Take top 3
      const top3 = matches.slice(0, 3).map((m) => ({
        capabilityId:   Number(m.capabilityId),
        capabilityName: String(m.capabilityName),
        confidence:     Number(m.confidence),
        justification:  String(m.justification),
      }));

      console.log('  → Top 3 matches:');
      top3.forEach((m) => console.log(`     [${m.capabilityId}] ${m.capabilityName} (${m.confidence}%)`));

      // Write to MongoDB
      await Diagram.updateOne(
        { _id: diagram._id },
        { $set: { capabilities: top3 } }
      );
      console.log('  ✓ Saved to diagram.capabilities');
      processed++;

    } catch (err) {
      console.error(`  ✗ FAILED: ${diagram.name} — ${err.message}`);
      failed++;
    }

    // Rate-limit pause between diagrams
    await sleep(DELAY_MS);
  }

  console.log('\n════════════════════════════════════');
  console.log(`Done.  Processed: ${processed}  Skipped: ${skipped}  Failed: ${failed}`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
