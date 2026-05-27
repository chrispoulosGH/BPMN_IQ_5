export interface DiagramMeta {
  _id: string;
  name: string;
  description: string;
  tags: string[];
  version: number;
  fileName: string | null;
  capabilities: CapabilityMatch[];
  tasks: DiagramTask[];
  lineOfBusiness?: string | null;
  channel?: string | null;
  domain?: string | null;
  subdomain?: string | null;
  product?: string | null;
  businessFlow?: string | null;
  status?: string | null;
  sourcedFrom?: string | null;
  owner?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramTaskApplication {
  name: string;
}

export interface DiagramTask {
  name: string;
  source: string | null;
  target: string | null;
  applications: DiagramTaskApplication[];
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
  status?: string;
  sourcedFrom?: string;
  createdBy?: string;
}

export interface DiagramUpdatePayload {
  name?: string;
  description?: string;
  xml?: string;
  tags?: string[];
  capabilities?: CapabilityMatch[];
  changeNote?: { userId: string; note: string };
  status?: string;
  sourcedFrom?: string;
  updatedBy?: string;
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

/** Data bundle passed when navigating to "Add to Task Factory" from the diagram */
export interface TaskAddData {
  name: string;
  applications?: string[];
  actor?: string;
  businessFlow?: string;
  product?: string;
  channel?: string;
  domain?: string;
  subdomain?: string;
}

/** Metadata parsed from the BPMNDiagram name attribute */
export interface DiagramMetadata {
  lineOfBusiness?: string;
  channel?: string;
  domain?: string;
  subdomain?: string;
  product?: string;
  businessFlow?: string;
}

export interface TaskRecord {
  _id: string;
  name: string;
  businessFlow: string;
  product: string;
  domain?: string;
  subdomain?: string;
  channel?: string;
  actor?: string;
  applications: string[];
  sequence?: number;
  owner?: string;
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
  actor?: string;
  applications?: string[];
  sequence?: number;
  owner?: string;
}

export interface ReferenceData {
  businessFlows: { _id: string; name: string }[];
  products: { _id: string; name: string }[];
  applications: { _id: string; name: string }[];
  actors: { _id: string; name: string }[];
  channels: { _id: string; name: string }[];
  domains: { _id: string; name: string }[];
  subdomains: { _id: string; name: string }[];
}

// ─── Reference Factory ───────────────────────────────────────
export interface RefItem {
  _id: string;
  name: string;
  owner?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApplicationItem extends RefItem {
  correlationId?: string;
  shortDescription?: string;
  applicationType?: string;
  businessCriticality?: string;
  discoverySource?: string;
  installType?: string;
  cpniIndicator?: string;
  customerFacing?: string;
  handleSpi?: string;
  internetFacing?: string;
  pciData?: string;
  soxFsa?: string;
  storeSpi?: string;
  acronym?: string;
  applPurpose?: string;
  lifecycle?: string;
  lifecycleStatus?: string;
  businessPurpose?: string;
  pciDataStored?: string;
  userInterface?: string;
}

export interface ServerLinkedApplication {
  correlationId?: string | null;
  name?: string | null;
  acronym?: string | null;
  apmNumber?: string | null;
  relationType?: string | null;
  relationSystemId?: string | null;
}

export interface ServerItem {
  _id: string;
  sourceKey: string;
  name: string;
  serverSystemId?: string | null;
  objectId?: string | null;
  assetId?: string | null;
  assetTag?: string | null;
  hostName?: string | null;
  fqdn?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  environment?: string | null;
  installStatus?: string | null;
  operationalStatus?: string | null;
  lifecycleStage?: string | null;
  lifecycleStatus?: string | null;
  usedFor?: string | null;
  os?: string | null;
  osVersion?: string | null;
  osDomain?: string | null;
  osServicePack?: string | null;
  normalizedOs?: string | null;
  normalizedOsVersion?: string | null;
  normalizedOsServicePack?: string | null;
  vendorName?: string | null;
  manufacturer?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  cpuCount?: number | null;
  cpuName?: string | null;
  cpuSpeed?: string | null;
  ram?: number | null;
  location?: string | null;
  supportGroup?: string | null;
  supportedBy?: string | null;
  managedByGroup?: string | null;
  cloudAccountId?: string | null;
  internetFacing?: string | null;
  virtualized?: boolean | null;
  className?: string | null;
  relationTypes?: string[];
  relationPorts?: string[];
  linkedApplications?: ServerLinkedApplication[];
  createdAt?: string;
  updatedAt?: string;
}

// ─── Capabilities Factory ────────────────────────────────────
export interface CapabilityItem {
  _id: string;
  capabilityId?: number;
  name: string;
  domainName?: string;
  aspect?: string;
  briefDescription?: string;
  tmfVersion?: string;
  owner?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActorItem {
  _id: string;
  name: string;
  role?: string;
  description?: string;
  owner?: string;
  createdAt?: string;
  updatedAt?: string;
}
