/**
 * capabilityMatcher.js
 *
 * Two-prompt LLM chain that maps a BPMN process to TMF GB1029C capabilities.
 *
 * Prompt 1  – "Process Summarizer": extracts structural keywords from BPMN XML
 *             and asks GPT-4o to produce a concise English description of WHAT
 *             the business process accomplishes (not HOW).
 *
 * Prompt 2  – "Capability Matcher": feeds that summary plus a condensed list of
 *             GB1029C capabilities and asks GPT-4o to return the top-5 matches
 *             with confidence scores and justifications.
 *
 * Mapping rules follow Kotusev's principles:
 *   • A capability describes WHAT the organisation can do, not HOW (process).
 *   • Capabilities are stable, noun-based functional abilities.
 *   • One process may realise multiple capabilities.
 *   • Match by functional intent, not by name similarity alone.
 */

const OpenAI = require('openai');
const Capability = require('../models/Capability');

// ── helpers ──────────────────────────────────────────────────

/**
 * Lightweight parse of BPMN XML to extract structural elements.
 * We purposely avoid a full DOM parse to stay fast and dependency-free.
 */
function extractBpmnKeywords(xml) {
  const get = (tag) => {
    const re = new RegExp(`<bpmn:${tag}[^>]*name="([^"]+)"`, 'g');
    const names = [];
    let m;
    while ((m = re.exec(xml))) names.push(m[1]);
    return names;
  };

  // Also grab text annotations (they often hold context)
  const annotations = [];
  const annoRe = /<bpmn:text>([\s\S]*?)<\/bpmn:text>/g;
  let m;
  while ((m = annoRe.exec(xml))) {
    const t = m[1].trim();
    if (t) annotations.push(t);
  }

  // Grab the diagram title annotation (first long one that starts with "Line of Business")
  const titleAnnotation = annotations.find((a) => a.startsWith('Line of Business'));

  return {
    processNames: get('process'),
    lanes: get('lane'),
    tasks: get('task'),
    subProcesses: get('subProcess'),
    gateways: [...get('exclusiveGateway'), ...get('parallelGateway'), ...get('inclusiveGateway')],
    events: [...get('startEvent'), ...get('endEvent'), ...get('intermediateThrowEvent'), ...get('intermediateCatchEvent')],
    titleAnnotation: titleAnnotation || null,
    annotations: annotations.filter((a) => a !== titleAnnotation && !a.startsWith('Last Updated')),
  };
}

// ── prompt builders ──────────────────────────────────────────

function buildSummaryPrompt(keywords) {
  const sections = [];

  if (keywords.titleAnnotation) {
    sections.push(`Diagram Title / Metadata: ${keywords.titleAnnotation}`);
  }
  if (keywords.processNames.length) {
    sections.push(`Process Name(s): ${keywords.processNames.join(', ')}`);
  }
  if (keywords.lanes.length) {
    sections.push(`Swim-lane Participants (roles): ${keywords.lanes.join(', ')}`);
  }
  if (keywords.tasks.length) {
    sections.push(`Tasks / Activities: ${keywords.tasks.join(', ')}`);
  }
  if (keywords.subProcesses.length) {
    sections.push(`Sub-processes: ${keywords.subProcesses.join(', ')}`);
  }

  const processData = sections.join('\n');

  return `You are an enterprise architecture analyst. Given the following structural elements extracted from a BPMN 2.0 business process diagram, produce a clear, concise English summary (150-250 words) that describes:

1. WHAT business function this process accomplishes (the functional intent — not the step-by-step HOW).
2. Which business domains it touches (e.g. customer management, service fulfilment, field operations, sales, billing, etc.).
3. The key stakeholder roles involved and their responsibilities at a high level.
4. The business outcomes or value delivered by this process.

Focus on the WHAT (capabilities exercised) rather than the HOW (workflow steps).
Use the TMF (TeleManagement Forum) terminology where applicable since this is a telecoms business process.

--- BPMN PROCESS DATA ---
${processData}
--- END ---

Respond with ONLY the English summary paragraph, no headings or bullet points.`;
}

function buildMatcherPrompt(processSummary, capabilityList) {
  return `You are an enterprise architecture analyst applying Kotusev's capability mapping principles from "The Practice of Enterprise Architecture":

MAPPING RULES:
• A business capability represents WHAT an organisation CAN DO — a stable, noun-based functional ability (e.g. "Customer Management", "Service Fulfilment").
• A business process represents HOW work is done — the sequence of activities that REALISE one or more capabilities.
• One process typically exercises multiple capabilities.
• Match by FUNCTIONAL INTENT: ask "what organisational ability must exist for this process to work?"
• Weight higher-level (domain/aspect) alignment over superficial keyword overlap.
• A capability that is NECESSARY for the process to function scores higher than one that is merely RELATED.

TASK:
Given the business process summary below and the list of TMF GB1029C business capabilities, select the TOP 5 capabilities that this process most directly realises or depends on. For each, provide:
- capabilityId (the numeric ID)
- capabilityName
- confidence (0-100 percentage — how strongly this process realises/depends on this capability)
- justification (1-2 sentences explaining the functional alignment)

--- PROCESS SUMMARY ---
${processSummary}
--- END ---

--- TMF GB1029C CAPABILITIES ---
${capabilityList}
--- END ---

Respond ONLY with a JSON array of exactly 5 objects, ordered by confidence descending:
[{"capabilityId": number, "capabilityName": "string", "confidence": number, "justification": "string"}]`;
}

// ── main matcher function ────────────────────────────────────

async function matchCapabilities(bpmnXml) {
  const openai = new OpenAI();

  // Step 0: Extract structural keywords from the BPMN XML
  const keywords = extractBpmnKeywords(bpmnXml);

  // Step 1: Build a condensed capability reference list from MongoDB
  const capabilities = await Capability.find(
    {},
    { capabilityId: 1, name: 1, domainName: 1, aspect: 1, briefDescription: 1, _id: 0 }
  ).sort({ aspectOrder: 1, domainOrder: 1 }).lean();

  const capabilityList = capabilities
    .map((c) => `[${c.capabilityId}] ${c.domainName} > ${c.aspect} > ${c.name}: ${c.briefDescription.slice(0, 120)}`)
    .join('\n');

  // Step 2: Prompt 1 — Summarise the business process
  const summaryResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    max_tokens: 400,
    messages: [{ role: 'user', content: buildSummaryPrompt(keywords) }],
  });
  const processSummary = summaryResponse.choices[0].message.content.trim();

  // Step 3: Prompt 2 — Match capabilities
  const matchResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are an expert enterprise architect. Always respond with valid JSON.',
      },
      { role: 'user', content: buildMatcherPrompt(processSummary, capabilityList) },
    ],
  });

  let matches;
  try {
    const raw = JSON.parse(matchResponse.choices[0].message.content);
    // The model may wrap in { "capabilities": [...] } or return array directly
    matches = Array.isArray(raw) ? raw : raw.capabilities || raw.matches || raw.results || [];
  } catch {
    throw new Error('Failed to parse LLM capability match response as JSON.');
  }

  // Ensure we have at most 5 and they're sorted by confidence
  matches = matches.slice(0, 5).sort((a, b) => b.confidence - a.confidence);

  return {
    processSummary,
    extractedKeywords: {
      lanes: keywords.lanes,
      tasks: keywords.tasks,
      subProcesses: keywords.subProcesses,
      titleAnnotation: keywords.titleAnnotation,
    },
    matches,
  };
}

module.exports = { matchCapabilities, extractBpmnKeywords };
