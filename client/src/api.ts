import axios from 'axios';
import type { Diagram, DiagramMeta, DiagramCreatePayload, DiagramUpdatePayload, FileSaveResult, CapabilityMatchResult, TaskRecord, TaskCreatePayload, ReferenceData, RefItem, CapabilityItem, ActorItem } from './types';
export type { RefItem, CapabilityItem, ActorItem };

const api = axios.create({ baseURL: '/api', withCredentials: true });

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
  success: { _id: string; name: string; fileName: string }[];
  failed: { fileName: string; error: string }[];
}

export const batchImportDiagrams = (files: { xml: string; fileName: string }[], createdBy?: string): Promise<BatchImportResult> =>
  api.post('/diagrams/batch', { files, createdBy }).then((r) => r.data);

export const searchDiagrams = (q: string): Promise<DiagramMeta[]> =>
  api.get('/diagrams/search', { params: { q } }).then((r) => r.data);

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

export const validateTasks = (taskNames: string[]): Promise<{ valid: string[]; invalid: string[] }> =>
  api.post('/tasks/validate', { taskNames }).then((r) => r.data);

export const getTaskNames = (): Promise<string[]> =>
  api.get('/tasks/names').then((r) => r.data);

export const getBusinessFlowMap = (): Promise<Record<string, string>> =>
  api.get('/diagrams/business-flow-map').then((r) => r.data);

// ── Reference Data CRUD (for ReferenceFactory) ──────────────
export const getRefItems = (collection: string): Promise<RefItem[]> =>
  api.get(`/tasks/reference/${collection}`).then((r) => r.data);

export const createRefItem = (collection: string, name: string, owner?: string): Promise<RefItem> =>
  api.post(`/tasks/reference/${collection}`, { name, owner }).then((r) => r.data);

export const updateRefItem = (collection: string, id: string, name: string, owner?: string): Promise<RefItem> =>
  api.put(`/tasks/reference/${collection}/${id}`, { name, owner }).then((r) => r.data);

export const deleteRefItem = (collection: string, id: string): Promise<{ success: boolean }> =>
  api.delete(`/tasks/reference/${collection}/${id}`).then((r) => r.data);

// ── Capabilities CRUD (for CapabilitiesFactory) ─────────────
export const getCapabilities = (): Promise<CapabilityItem[]> =>
  api.get('/capabilities').then((r) => r.data.capabilities || r.data);

export const createCapability = (data: Partial<CapabilityItem>): Promise<CapabilityItem> =>
  api.post('/capabilities', data).then((r) => r.data);

export const updateCapability = (id: string, data: Partial<CapabilityItem>): Promise<CapabilityItem> =>
  api.put(`/capabilities/${id}`, data).then((r) => r.data);

export const deleteCapability = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/capabilities/${id}`).then((r) => r.data);

// ── Actors CRUD (for ActorFactory) ──────────────────────────────
export const getActors = (): Promise<ActorItem[]> =>
  api.get('/actors').then((r) => r.data);

export const createActor = (data: Partial<ActorItem>): Promise<ActorItem> =>
  api.post('/actors', data).then((r) => r.data);

export const updateActor = (id: string, data: Partial<ActorItem>): Promise<ActorItem> =>
  api.put(`/actors/${id}`, data).then((r) => r.data);

export const deleteActor = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/actors/${id}`).then((r) => r.data);

export default api;
