export interface DiagramMeta {
  _id: string;
  name: string;
  description: string;
  tags: string[];
  version: number;
  fileName: string | null;
  capabilities: CapabilityMatch[];
  createdAt: string;
  updatedAt: string;
}

export interface Diagram extends DiagramMeta {
  xml: string;
}

export interface DiagramCreatePayload {
  name: string;
  description?: string;
  xml: string;
  tags?: string[];
  capabilities?: CapabilityMatch[];
}

export interface DiagramUpdatePayload {
  name?: string;
  description?: string;
  xml?: string;
  tags?: string[];
  capabilities?: CapabilityMatch[];
  changeNote?: { userId: string; note: string };
}

export interface FileSaveResult {
  message: string;
  filename: string;
}

export interface CapabilityMatch {
  capabilityId: number;
  capabilityName: string;
  confidence: number;
  justification: string;
}

export interface CapabilityMatchResult {
  processSummary: string;
  extractedKeywords: {
    lanes: string[];
    tasks: string[];
    subProcesses: string[];
    titleAnnotation: string | null;
  };
  matches: CapabilityMatch[];
}

// ─── Task Factory ────────────────────────────────────────────
export interface TaskRecord {
  _id: string;
  name: string;
  businessFlow: string;
  product: string;
  domain?: string;
  subdomain?: string;
  channel?: string;
  persona?: string;
  applications: string[];
  sequence?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskCreatePayload {
  name: string;
  businessFlow: string;
  product: string;
  domain?: string;
  subdomain?: string;
  channel?: string;
  persona?: string;
  applications?: string[];
  sequence?: number;
}

export interface ReferenceData {
  businessFlows: { _id: string; name: string }[];
  products: { _id: string; name: string }[];
  applications: { _id: string; name: string }[];
  personas: { _id: string; name: string }[];
  channels: { _id: string; name: string }[];
  domains: { _id: string; name: string }[];
  subdomains: { _id: string; name: string }[];
}
