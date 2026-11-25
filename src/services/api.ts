let memoryToken: string | null = null;

export function setMemoryToken(token: string | null): void {
  memoryToken = token;
}

export function getMemoryToken(): string | null {
  return memoryToken;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (memoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed with status ${response.status}`;
    throw new ApiError(errMsg, response.status);
  }

  return data as T;
}

export interface UserProfile {
  id: number;
  fullName: string;
  email: string;
  department: string;
  studyGoal: string;
  preferences: {
    defaultSummaryMode: 'short' | 'detailed';
    quizQuestionCount: number;
    flashcardTarget: number;
  };
  createdAt: string;
}

export interface ProviderStatus {
  activeProvider: string;
  providerId: string;
  configured: boolean;
  textModel: string;
  embeddingModel: string;
  transcriptionModel: string;
  vectorBackend: string;
  zoomOAuthConfigured: boolean;
  googleWorkspaceConfigured: boolean;
}

export interface DocumentItem {
  id: number;
  title: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  subject: string;
  pageCount: number;
  processingStatus: string;
  chunkCount: number;
  createdAt: string;
  textPreview?: string;
  extractedText?: string;
  hasSummary?: boolean;
}

export interface DocumentSummary {
  shortSummary: string;
  detailedSummary: string;
  topics: string[];
  keyPoints: string[];
  definitions: Array<{ term: string; definition: string }>;
  examNotes: Array<{ heading: string; points: string[] }>;
  updatedAt: string;
}

export interface RecordingItem {
  id: number;
  sourceType: 'live' | 'zoom' | 'google_meet';
  title: string;
  subject: string;
  fileName: string;
  mediaMime: string;
  durationSeconds: number;
  transcriptText: string;
  segments: Array<{ timestamp: string; text: string }>;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  createdAt: string;
}

export interface NoteSession {
  id: number;
  title: string;
  subject: string;
  sourceType: string;
  transcriptText: string;
  structuredNotes: string;
  keyPoints: string[];
  definitions: Array<{ term: string; definition: string }>;
  questions: string[];
  actionItems: string[];
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface GraphNodeItem {
  id: string;
  dbId: number;
  documentId: number | null;
  documentTitle: string;
  subject: string;
  label: string;
  category: string;
  description: string;
  position: { x: number; y: number };
  createdAt: string;
}

export interface GraphEdgeItem {
  id: string;
  dbId: number;
  documentId: number | null;
  source: string;
  target: string;
  label: string;
}

export interface VisualGuide {
  id: number;
  documentId: number | null;
  topic: string;
  subject: string;
  explanation: string;
  keyConcepts: Array<{ title: string; role: string; summary: string }>;
  learningFlow: Array<{ step: number; title: string; detail: string; outcome: string }>;
  relationships: Array<{ from: string; relation: string; to: string; note: string }>;
  realWorldExamples: Array<{ scenario: string; application: string }>;
  importantPoints: string[];
  revisionSummary: string;
  createdAt: string;
}

export interface FlashcardItem {
  id: number;
  documentId: number | null;
  documentTitle: string | null;
  subject: string;
  front: string;
  back: string;
  status: 'new' | 'known' | 'needs_revision';
  reviewCount: number;
  lastReviewedAt: string | null;
  createdAt: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '—';
  const normalized = dateStr.includes('T') ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '—';
  const normalized = dateStr.includes('T') ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
