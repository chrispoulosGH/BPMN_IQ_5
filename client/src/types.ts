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
