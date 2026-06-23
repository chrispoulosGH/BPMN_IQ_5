import axios from 'axios';
import type { Diagram, DiagramMeta, DiagramCreatePayload, DiagramUpdatePayload, DiagramValidationRequest, DiagramValidationReport, FileSaveResult, CapabilityMatchResult, TaskRecord, TaskCreatePayload, ReferenceData, RefItem, CapabilityItem, ActorItem, ServerItem, DatabaseItem, FactoryNeighborhoodSummary, CustomFactory, CustomFactoryRow, ModelCatalog } from './types';
export type { RefItem, CapabilityItem, ActorItem, ServerItem, DatabaseItem, FactoryNeighborhoodSummary, CustomFactory, CustomFactoryRow, ModelCatalog };

const api = axios.create({ baseURL: '/api', withCredentials: true });

export { api };

const scopedRequestConfig = (neighborhoodName?: string) => {
  const trimmed = String(neighborhoodName || '').trim();
  if (!trimmed) return undefined;
  return { headers: { 'x-neighborhood-name': trimmed } };
};

export const setApiNeighborhoodScope = (neighborhoodName?: string | null) => {
  if (neighborhoodName && neighborhoodName.trim()) {
    api.defaults.headers.common['x-neighborhood-name'] = neighborhoodName.trim();
    return;
  }
  delete api.defaults.headers.common['x-neighborhood-name'];
};

// Notify listeners when session expires (401)
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (handler: () => void) => { onSessionExpired = handler; };

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && onSessionExpired) {
      onSessionExpired();
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────
export const checkSession = (): Promise<{ authenticated: boolean; user?: { _id: string; userId: string; displayName: string; role?: string | null; capabilities?: { function: string; permission: string }[] } }> =>
  api.get('/auth/session').then((r) => r.data);

export const logout = (): Promise<void> =>
  api.post('/auth/logout').then(() => {});

// ── Diagrams (MongoDB) ──────────────────────────────────────
export const getDiagrams = (): Promise<DiagramMeta[]> =>
  api.get('/diagrams').then((r) => r.data);

export const getDiagram = (id: string): Promise<Diagram> =>
  api.get(`/diagrams/${id}`).then((r) => r.data);

export const createDiagram = (data: DiagramCreatePayload): Promise<Diagram> =>
  api.post('/diagrams', data).then((r) => r.data);

export const updateDiagram = (id: string, data: DiagramUpdatePayload): Promise<Diagram> =>
  api.put(`/diagrams/${id}`, data).then((r) => r.data);

export const deleteDiagram = (id: string): Promise<{ message: string }> =>
  api.delete(`/diagrams/${id}`).then((r) => r.data);

export interface BatchImportResult {
  success: { _id: string; name: string; fileName: string; status: string }[];
  failed: { fileName: string; error: string }[];
}

export const batchImportDiagrams = (files: { xml: string; fileName: string }[], createdBy?: string): Promise<BatchImportResult> =>
  api.post('/diagrams/batch', { files, createdBy }).then((r) => r.data);

export const searchDiagrams = (q: string): Promise<DiagramMeta[]> =>
  api.get('/diagrams/search', { params: { q } }).then((r) => r.data);

export const validateDiagramReport = (data: DiagramValidationRequest): Promise<DiagramValidationReport> =>
  api.post('/diagrams/validate', data).then((r) => r.data);

// ── Files (Local FS) ────────────────────────────────────────
export const getFiles = (): Promise<string[]> =>
  api.get('/files').then((r) => r.data);

export const getFileXml = (filename: string): Promise<string> =>
  api.get(`/files/${encodeURIComponent(filename)}`).then((r) => r.data);

export const saveFile = (filename: string, xml: string): Promise<FileSaveResult> =>
  api.post('/files', { filename, xml }).then((r) => r.data);

export const deleteFile = (filename: string): Promise<{ message: string }> =>
  api.delete(`/files/${encodeURIComponent(filename)}`).then((r) => r.data);

// ── Capabilities (LLM matching) ─────────────────────────────
export const matchCapabilities = (xml: string): Promise<CapabilityMatchResult> =>
  api.post('/capabilities/match', { xml }).then((r) => r.data);

// ── Tasks (Task Factory) ────────────────────────────────────
export const getTaskReference = (): Promise<ReferenceData> =>
  api.get('/tasks/reference').then((r) => r.data);

export const getTaskReferenceForNeighborhood = (neighborhoodName?: string): Promise<ReferenceData> =>
  api.get('/tasks/reference', scopedRequestConfig(neighborhoodName)).then((r) => r.data);

export const getTasks = (params?: Record<string, string>): Promise<TaskRecord[]> =>
  api.get('/tasks', { params }).then((r) => r.data);

export const getTask = (id: string): Promise<TaskRecord> =>
  api.get(`/tasks/${id}`).then((r) => r.data);

export const createTask = (data: TaskCreatePayload): Promise<TaskRecord> =>
  api.post('/tasks', data).then((r) => r.data);

export const updateTask = (id: string, data: Partial<TaskCreatePayload>): Promise<TaskRecord> =>
  api.put(`/tasks/${id}`, data).then((r) => r.data);

export const deleteTask = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/tasks/${id}`).then((r) => r.data);

export const validateTasks = (taskNames: string[], businessFlow?: string): Promise<{ valid: string[]; invalid: string[] }> =>
  api.post('/tasks/validate', { taskNames, ...(businessFlow ? { businessFlow } : {}) }).then((r) => r.data);

export const getTaskNames = (businessFlow?: string): Promise<string[]> =>
  api.get('/tasks/names', { params: businessFlow ? { businessFlow } : undefined }).then((r) => r.data);

export const getTaskNamesForNeighborhood = (businessFlow?: string, neighborhoodName?: string): Promise<string[]> => {
  const config = scopedRequestConfig(neighborhoodName) || {};
  return api.get('/tasks/names', {
    ...config,
    params: businessFlow ? { businessFlow } : undefined,
  }).then((r) => r.data);
};

export const getBusinessFlowMap = (): Promise<Record<string, string>> =>
  api.get('/diagrams/business-flow-map').then((r) => r.data);

export interface FlowBreadcrumb { name: string; lineOfBusiness: string | null; channel: string | null; product: string | null; domain: string | null; subdomain: string | null; }
export const getFlowBreadcrumbs = (names: string[]): Promise<FlowBreadcrumb[]> =>
  api.get('/diagrams/flow-breadcrumbs', { params: { names: names.join(',') } }).then((r) => r.data);

// ── Reference Data CRUD (for ReferenceFactory) ──────────────
export const getRefItems = (collection: string): Promise<RefItem[]> =>
  api.get(`/tasks/reference/${collection}`).then((r) => r.data);

export const createRefItem = (collection: string, name: string, owner?: string, state?: string): Promise<RefItem> =>
  api.post(`/tasks/reference/${collection}`, { name, owner, state }).then((r) => r.data);

export const createApplication = (data: Partial<import('./types').ApplicationItem> & { name: string }): Promise<import('./types').ApplicationItem> =>
  api.post(`/tasks/reference/applications`, data).then((r) => r.data);

export const getApplicationByCorrelationId = (correlationId: string): Promise<import('./types').ApplicationItem> =>
  api.get(`/tasks/reference/applications/by-correlation/${encodeURIComponent(correlationId)}`).then((r) => r.data);

export const updateRefItem = (collection: string, id: string, name: string, owner?: string): Promise<RefItem> =>
  api.put(`/tasks/reference/${collection}/${id}`, { name, owner }).then((r) => r.data);

export const updateApplication = (id: string, data: Partial<import('./types').ApplicationItem>): Promise<import('./types').ApplicationItem> =>
  api.put(`/tasks/reference/applications/${id}`, data).then((r) => r.data);

export const deleteRefItem = (collection: string, id: string): Promise<{ success: boolean }> =>
  api.delete(`/tasks/reference/${collection}/${id}`).then((r) => r.data);

// ── Servers (Server Factory) ────────────────────────────────
export const getServers = (params?: { search?: string; applicationCorrelationId?: string; applicationName?: string }): Promise<ServerItem[]> =>
  api.get('/servers', { params }).then((r) => r.data);

export const getApplicationServers = (correlationId: string): Promise<ServerItem[]> =>
  api.get(`/servers/by-application/${encodeURIComponent(correlationId)}`).then((r) => r.data);

export const getServer = (id: string): Promise<ServerItem> =>
  api.get(`/servers/${encodeURIComponent(id)}`).then((r) => r.data);

export const deleteServer = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/servers/${encodeURIComponent(id)}`).then((r) => r.data);

// ── Databases (DB Factory) ─────────────────────────────────
export const getDatabases = (params?: { search?: string; applicationCorrelationId?: string; applicationName?: string }): Promise<DatabaseItem[]> =>
  api.get('/databases', { params }).then((r) => r.data);

export const getApplicationDatabases = (correlationId: string): Promise<DatabaseItem[]> =>
  api.get(`/databases/by-application/${encodeURIComponent(correlationId)}`).then((r) => r.data);

export const getDatabase = (id: string): Promise<DatabaseItem> =>
  api.get(`/databases/${encodeURIComponent(id)}`).then((r) => r.data);

export const deleteDatabase = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/databases/${encodeURIComponent(id)}`).then((r) => r.data);

// ── Custom Factories / Neighborhoods ──────────────────────
export const getFactoryNeighborhoods = (): Promise<FactoryNeighborhoodSummary[]> =>
  api.get('/custom-factories/neighborhoods').then((r) => r.data);

export const createFactoryNeighborhood = (params: { name: string; file: File }): Promise<FactoryNeighborhoodSummary> => {
  const body = new FormData();
  body.append('name', params.name);
  body.append('neighborhoodName', params.name);
  body.append('file', params.file);
  return api.post('/custom-factories/neighborhoods', body).then((r) => r.data);
};

export const deleteFactoryNeighborhood = (name: string): Promise<{ success: boolean; name: string; deletedFactoryCount: number }> =>
  api.delete(`/custom-factories/neighborhoods/${encodeURIComponent(name)}`).then((r) => r.data);

export const getModelCatalog = (name: string): Promise<ModelCatalog> =>
  api.get(`/custom-factories/neighborhoods/${encodeURIComponent(name)}/catalog`).then((r) => r.data);

export const getCustomFactories = (neighborhoodName?: string): Promise<CustomFactory[]> =>
  api.get('/custom-factories', { params: neighborhoodName ? { neighborhoodName } : undefined }).then((r) => r.data);

export const getComponentHierarchies = (neighborhoodName?: string, componentName: string = 'Application'): Promise<import('./types').HierarchiesResponse> =>
  api.get('/custom-factories/hierarchies/tree', { params: { neighborhoodName, componentName } }).then((r) => r.data);

export const getCustomFactory = (id: string): Promise<CustomFactory> =>
  api.get(`/custom-factories/${encodeURIComponent(id)}`).then((r) => r.data);

export const uploadCustomFactory = (params: { neighborhoodName: string; file: File }): Promise<{ factories: CustomFactory[] }> => {
  const body = new FormData();
  body.append('neighborhoodName', params.neighborhoodName);
  body.append('file', params.file);
  return api.post('/custom-factories/upload', body).then((r) => r.data);
};

export const updateCustomFactoryRow = (factoryId: string, rowId: string, payload: { values: Record<string, unknown>; owner?: string; state?: string }): Promise<CustomFactory> =>
  api.put(`/custom-factories/${encodeURIComponent(factoryId)}/rows/${encodeURIComponent(rowId)}`, payload).then((r) => r.data);

export const deleteCustomFactoryRow = (factoryId: string, rowId: string): Promise<CustomFactory> =>
  api.delete(`/custom-factories/${encodeURIComponent(factoryId)}/rows/${encodeURIComponent(rowId)}`).then((r) => r.data);

export const deleteCustomFactory = (factoryId: string): Promise<{ success: boolean; factoryId: string; neighborhoodName: string; name: string }> =>
  api.delete(`/custom-factories/${encodeURIComponent(factoryId)}`).then((r) => r.data);

// ── Capabilities CRUD (for CapabilitiesFactory) ─────────────
export const getCapabilities = (): Promise<CapabilityItem[]> =>
  api.get('/capabilities', { params: { limit: 5000, skip: 0 } }).then((r) => r.data.capabilities || r.data);

export const createCapability = (data: Partial<CapabilityItem>): Promise<CapabilityItem> =>
  api.post('/capabilities', data).then((r) => r.data);

export const updateCapability = (id: string, data: Partial<CapabilityItem>): Promise<CapabilityItem> =>
  api.put(`/capabilities/${id}`, data).then((r) => r.data);

export const deleteCapability = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/capabilities/${id}`).then((r) => r.data);

// ── Actors CRUD (for ActorFactory) ──────────────────────────────
export const getActors = (): Promise<ActorItem[]> =>
  api.get('/actors').then((r) => r.data);

export const getActorsForNeighborhood = (neighborhoodName?: string): Promise<ActorItem[]> =>
  api.get('/actors', scopedRequestConfig(neighborhoodName)).then((r) => r.data);

export const createActor = (data: Partial<ActorItem>): Promise<ActorItem> =>
  api.post('/actors', data).then((r) => r.data);

export const updateActor = (id: string, data: Partial<ActorItem>): Promise<ActorItem> =>
  api.put(`/actors/${id}`, data).then((r) => r.data);

export const deleteActor = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/actors/${id}`).then((r) => r.data);

// ── State Transitions ───────────────────────────────────────
export const transitionState = (collection: string, id: string, action: string, role: string): Promise<{ previousState: string; newState: string; record: any }> =>
  api.post('/states/transition', { collection, id, action, role }).then((r) => r.data);

// ── Dashboard ───────────────────────────────────────────────
export const getDashboardTaskRisk = (): Promise<any[]> =>
  api.get('/dashboard/task-risk').then((r) => r.data);

export const getDashboardFlowRisk = (): Promise<any[]> =>
  api.get('/dashboard/flow-risk').then((r) => r.data);

export const getDashboardCapabilityFlowRelationships = (): Promise<{
  totalDiagrams: number;
  diagramsWithCapabilities: number;
  capabilityCount: number;
  businessFlowCount: number;
  linkCount: number;
  capabilities: Array<{ name: string; count: number }>;
  businessFlows: Array<{ name: string; count: number }>;
  links: Array<{ capability: string; businessFlow: string; count: number }>;
}> => api.get('/dashboard/capability-flow-relationships').then((r) => r.data);

export const getDashboardLobDrilldownTree = (): Promise<{
  levels: string[];
  totalDiagrams: number;
  rootCount: number;
  tree: Array<{
    id: string;
    name: string;
    level: string;
    count: number;
    metadata?: { correlationId?: string };
    children: any[];
  }>;
}> => api.get('/dashboard/lob-drilldown-tree').then((r) => r.data);

export const getDashboardFlow3D = (): Promise<{ businessFlows: string[]; points: Array<{ appName: string; businessCriticality: string; lifecycleStatus: string; task: string; businessFlow: string; taskOrder: number }>; taskOrders: Record<string, string[]> }> =>
  api.get('/dashboard/flow-3d').then((r) => r.data);

export const getDashboardFlowCost3D = (): Promise<{ businessFlows: string[]; points: Array<{ businessFlow: string; task: string; taskOrder: number; year: number; totalCost: number; opCost: number; devCost: number }>; taskOrders: Record<string, string[]> }> =>
  api.get('/dashboard/flow-cost-3d').then((r) => r.data);

export interface CostByYearItem { name: string; opCost: number; devCost: number; totalCost: number; }
export interface TaskCostByYearItem extends CostByYearItem { businessFlow: string; }
export const getDashboardCostByYear = (year: number): Promise<{ flows: CostByYearItem[]; tasks: TaskCostByYearItem[]; year: number }> =>
  api.get(`/dashboard/cost-by-year?year=${year}`).then((r) => r.data);

export interface CapabilityCostByYearItem extends CostByYearItem { flowCount: number; }
export const getDashboardCapabilityCostByYear = (year: number): Promise<{ capabilities: CapabilityCostByYearItem[]; year: number }> =>
  api.get(`/dashboard/capability-cost-by-year?year=${year}`).then((r) => r.data);

export const getDashboardServerLocationPoints = (): Promise<{
  totalServers: number;
  points: Array<{
    _id: string;
    name: string;
    hostName?: string | null;
    ipAddress?: string | null;
    location?: string | null;
    environment?: string | null;
    operationalStatus?: string | null;
    internetFacing?: string | null;
    healthNotes?: Array<{ label: string }>;
    linkedApplications?: Array<{
      correlationId?: string | null;
      name?: string | null;
      acronym?: string | null;
    }>;
  }>;
}> => api.get('/dashboard/server-location-points').then((r) => r.data);

export default api;
