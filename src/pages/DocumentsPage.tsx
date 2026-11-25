import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Network,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  apiRequest,
  formatBytes,
  formatDateShort,
  type DocumentItem,
} from '../services/api';

type UploadStage = 'idle' | 'uploading' | 'extracting' | 'indexing' | 'completed';

const STAGE_LABELS: Record<UploadStage, string> = {
  idle: '',
  uploading: 'Uploading file to secure workspace...',
  extracting: 'Extracting & cleaning document text...',
  indexing: 'Chunking & generating semantic embeddings...',
  completed: 'Completed — ready for RAG, Summarization, and Knowledge Graph.',
};

export function DocumentsPage() {
  const { notify } = useToast();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Computer Science');
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadError, setUploadError] = useState('');

  // Preview state
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (selectedSubject !== 'All') params.set('subject', selectedSubject);
      const res = await apiRequest<{ documents: DocumentItem[]; subjects: string[] }>(
        `/api/documents?${params.toString()}`
      );
      setDocuments(res.documents);
      setSubjects(res.subjects);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load documents.', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, selectedSubject, notify]);

  useEffect(() => {
    const timer = window.setTimeout(loadDocuments, 150);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0] || null;
    setFile(chosen);
    setUploadError('');
    if (chosen && !title.trim()) {
      setTitle(chosen.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setUploadError('Please choose a PDF, TXT, or Markdown file.');
      return;
    }

    setUploadError('');
    setUploadStage('uploading');

    const t1 = window.setTimeout(() => setUploadStage('extracting'), 550);
    const t2 = window.setTimeout(() => setUploadStage('indexing'), 1300);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim() || file.name);
      formData.append('subject', subject.trim() || 'Computer Science');

      await apiRequest<{ document: DocumentItem }>('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      window.clearTimeout(t1);
      window.clearTimeout(t2);
      setUploadStage('completed');
      notify(`"${title.trim() || file.name}" extracted and indexed successfully.`);
      setFile(null);
      setTitle('');
      await loadDocuments();
      window.setTimeout(() => setUploadStage('idle'), 2400);
    } catch (err) {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      setUploadStage('idle');
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setUploadError(msg);
      notify(msg, 'error');
    }
  };

  const openPreview = async (docId: number) => {
    setPreviewLoading(true);
    try {
      const res = await apiRequest<{ document: DocumentItem }>(`/api/documents/${docId}`);
      setPreviewDoc(res.document);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load document preview.', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async (doc: DocumentItem) => {
    try {
      await apiRequest(`/api/documents/${doc.id}`, { method: 'DELETE' });
      notify(`Deleted "${doc.title}".`);
      if (previewDoc?.id === doc.id) setPreviewDoc(null);
      loadDocuments();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete document.', 'error');
    }
  };

  const isProcessing =
    uploadStage === 'uploading' || uploadStage === 'extracting' || uploadStage === 'indexing';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Document Upload & Management
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload study PDFs or text notes to extract content, create semantic vector chunks, and power RAG Q&A, summaries, and knowledge graphs.
        </p>
      </div>

      {/* Upload Form Card */}
      <form
        onSubmit={handleUpload}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="doc-file" className="block text-sm font-medium text-slate-700 mb-1.5">
              Study file (PDF, TXT, MD — max 20 MB)
            </label>
            <input
              id="doc-file"
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border file:border-slate-200 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 cursor-pointer"
            />
          </div>

          <div>
            <label htmlFor="doc-title" className="block text-sm font-medium text-slate-700 mb-1.5">
              Document title
            </label>
            <input
              id="doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isProcessing}
              placeholder="e.g., Operating Systems — Deadlocks"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="doc-subject" className="block text-sm font-medium text-slate-700 mb-1.5">
              Subject or category
            </label>
            <input
              id="doc-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isProcessing}
              placeholder="e.g., Machine Learning, DBMS, Algorithms"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Processing Pipeline Indicator */}
        {uploadStage !== 'idle' && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-blue-900">
              {uploadStage === 'completed' ? (
                <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
              ) : (
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin shrink-0" />
              )}
              <span className="font-medium">{STAGE_LABELS[uploadStage]}</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium">
              {(['uploading', 'extracting', 'indexing', 'completed'] as const).map((step, i) => {
                const stages: UploadStage[] = ['uploading', 'extracting', 'indexing', 'completed'];
                const currentIdx = stages.indexOf(uploadStage);
                const done = i <= currentIdx;
                return (
                  <span
                    key={step}
                    className={done ? 'text-blue-700 capitalize' : 'text-slate-400 capitalize'}
                  >
                    {i + 1}. {step}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {uploadError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
            {uploadError}
          </p>
        )}

        <div className="flex items-center justify-between gap-4 pt-1">
          <p className="text-xs text-slate-500">
            Pipeline: Validation → Text Extraction → Chunking → Gemini Embeddings → Vector Index
          </p>
          <button
            type="submit"
            disabled={isProcessing || !file}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Upload className="h-4 w-4" />
            {isProcessing ? 'Processing...' : 'Upload & Index'}
          </button>
        </div>
      </form>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full">
          {['All', ...subjects].map((subj) => (
            <button
              key={subj}
              type="button"
              onClick={() => setSelectedSubject(subj)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedSubject === subj
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {subj}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter documents..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-900">No documents found</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Upload your first lecture PDF or Markdown study notes above to index chunks for AI summarization, RAG Q&A, and concept mapping.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-5">Document</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4 text-right">Pages / Chunks</th>
                  <th className="py-3 px-4 text-right">Size</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-5 max-w-xs">
                      <p className="font-medium text-slate-900 truncate">{doc.title}</p>
                      <p className="text-xs text-slate-500 truncate">{doc.originalFilename}</p>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">{doc.subject}</td>
                    <td className="py-3.5 px-4 text-right text-slate-600 tabular-nums font-[var(--font-mono)] text-xs whitespace-nowrap">
                      {doc.pageCount}p · {doc.chunkCount} chunks
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-600 tabular-nums font-[var(--font-mono)] text-xs whitespace-nowrap">
                      {formatBytes(doc.fileSize)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {doc.processingStatus === 'completed' ? 'Completed' : doc.processingStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {formatDateShort(doc.createdAt)}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openPreview(doc.id)}
                          title="Preview extracted text"
                          className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/summarization?doc=${doc.id}`)}
                          title="Summarize & RAG Q&A"
                          className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/knowledge-graph?doc=${doc.id}`)}
                          title="Build Knowledge Graph"
                          className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                        >
                          <Network className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(doc)}
                          title="Delete document"
                          className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Extracted Text Preview Panel */}
      {(previewDoc || previewLoading) && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900 truncate">
                {previewLoading ? 'Loading preview...' : `Extracted Text — ${previewDoc?.title}`}
              </h3>
              {previewDoc && (
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  {previewDoc.subject} · {previewDoc.pageCount} pages · {previewDoc.chunkCount} indexed vector chunks
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPreviewDoc(null)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              aria-label="Close text preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6 max-h-96 overflow-y-auto bg-slate-50/50">
            {previewLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading extracted text...
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-[var(--font-sans)] text-sm text-slate-700 leading-relaxed">
                {previewDoc?.extractedText}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
