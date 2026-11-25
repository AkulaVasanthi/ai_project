import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  apiRequest,
  type DocumentItem,
  type DocumentSummary,
} from '../services/api';

interface RagResponse {
  answer: string;
  groundedInDocuments: boolean;
  missingContextNote?: string;
  disclaimer: string;
  sources: Array<{
    sourceNumber: number;
    documentId: number;
    documentTitle: string;
    pageNumber: number;
    score: number;
    excerpt: string;
    cited: boolean;
  }>;
}

type SummaryTab = 'short' | 'detailed' | 'topics' | 'definitions' | 'exam';

export function SummarizationPage() {
  const { notify } = useToast();
  const [searchParams] = useSearchParams();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | ''>('');
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [activeTab, setActiveTab] = useState<SummaryTab>('short');
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // RAG Q&A state
  const [ragScope, setRagScope] = useState<'selected' | 'all'>('selected');
  const [question, setQuestion] = useState('');
  const [askingRag, setAskingRag] = useState(false);
  const [ragResult, setRagResult] = useState<RagResponse | null>(null);
  const [ragError, setRagError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest<{ documents: DocumentItem[] }>('/api/documents');
        setDocuments(res.documents);
        const queryDoc = Number(searchParams.get('doc'));
        if (queryDoc && res.documents.some((d) => d.id === queryDoc)) {
          setSelectedDocId(queryDoc);
        } else if (res.documents.length > 0) {
          setSelectedDocId(res.documents[0].id);
        }
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Failed to load documents.', 'error');
      } finally {
        setLoadingDocs(false);
      }
    })();
  }, [searchParams, notify]);

  useEffect(() => {
    if (!selectedDocId) {
      setSummary(null);
      return;
    }
    (async () => {
      try {
        const res = await apiRequest<{ document: DocumentItem; summary: DocumentSummary | null }>(
          `/api/documents/${selectedDocId}`
        );
        setSummary(res.summary);
      } catch {
        setSummary(null);
      }
    })();
  }, [selectedDocId]);

  const handleGenerateSummary = async () => {
    if (!selectedDocId) return;
    setGeneratingSummary(true);
    try {
      const res = await apiRequest<{ summary: DocumentSummary }>(
        `/api/documents/${selectedDocId}/summarize`,
        { method: 'POST' }
      );
      setSummary(res.summary);
      notify('AI summary and exam notes generated.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Summary generation failed.', 'error');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleAskRag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAskingRag(true);
    setRagError('');
    try {
      const res = await apiRequest<RagResponse>('/api/documents/rag-qa', {
        method: 'POST',
        body: JSON.stringify({
          question: question.trim(),
          documentId: ragScope === 'selected' && selectedDocId ? selectedDocId : null,
        }),
      });
      setRagResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'RAG question answering failed.';
      setRagError(msg);
      notify(msg, 'error');
    } finally {
      setAskingRag(false);
    }
  };

  if (loadingDocs) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-slate-200 rounded-lg" />
        <div className="h-72 bg-white border border-slate-200 rounded-xl" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900">Upload a document to get started</h2>
        <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
          AI Summarization and Retrieval-Augmented Generation (RAG) require at least one indexed PDF or study notes document.
        </p>
        <Link
          to="/documents"
          className="inline-flex items-center gap-2 mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to Documents
        </Link>
      </div>
    );
  }

  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  return (
    <div className="space-y-6">
      {/* Header & Document Selector */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            AI Summarization & RAG Q&A
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Generate structured summaries, definitions, and exam notes, or query your indexed document chunks with grounded page references.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <select
            aria-label="Select uploaded document"
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none min-w-[240px]"
          >
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title} ({doc.subject})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleGenerateSummary}
            disabled={generatingSummary || !selectedDocId}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {generatingSummary ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generatingSummary
              ? 'Generating...'
              : summary
                ? 'Regenerate Summary'
                : 'Generate Summary'}
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: AI Summary Tabs */}
        <section className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {selectedDoc?.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {selectedDoc?.subject} · {selectedDoc?.pageCount} pages · {selectedDoc?.chunkCount} indexed chunks
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {(
                [
                  { id: 'short', label: 'Short' },
                  { id: 'detailed', label: 'Detailed' },
                  { id: 'topics', label: 'Topics & Points' },
                  { id: 'definitions', label: 'Definitions' },
                  { id: 'exam', label: 'Exam Notes' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {generatingSummary ? (
              <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
                <p className="text-sm font-medium text-slate-700">
                  Analyzing document and synthesizing structured study notes...
                </p>
              </div>
            ) : !summary ? (
              <div className="py-12 text-center">
                <BookOpen className="h-9 w-9 text-slate-300 mx-auto mb-2.5" />
                <p className="text-sm font-semibold text-slate-800">No summary generated yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Click "Generate Summary" above to produce short and detailed summaries, key points, definitions, and exam-oriented notes.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {activeTab === 'short' && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">Executive Summary</h4>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                      {summary.shortSummary}
                    </p>
                  </div>
                )}

                {activeTab === 'detailed' && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">Detailed Analysis</h4>
                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line space-y-3">
                      {summary.detailedSummary}
                    </div>
                  </div>
                )}

                {activeTab === 'topics' && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-2.5">Important Topics</h4>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-blue-700 font-medium">
                        {summary.topics.map((topic, i) => (
                          <span key={i}>
                            {i + 1}. {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="pt-5 border-t border-slate-100">
                      <h4 className="text-sm font-semibold text-slate-900 mb-2.5">Key Points</h4>
                      <ul className="space-y-2.5">
                        {summary.keyPoints.map((pt, i) => (
                          <li key={i} className="text-sm text-slate-700 leading-relaxed flex gap-2.5">
                            <span className="text-blue-600 font-semibold tabular-nums shrink-0">
                              {String(i + 1).padStart(2, '0')}.
                            </span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === 'definitions' && (
                  <div className="divide-y divide-slate-100">
                    {summary.definitions.length === 0 ? (
                      <p className="text-sm text-slate-500">No explicit definitions extracted.</p>
                    ) : (
                      summary.definitions.map((item, i) => (
                        <div key={i} className="py-3.5 first:pt-0 last:pb-0">
                          <p className="text-sm font-semibold text-slate-900">{item.term}</p>
                          <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                            {item.definition}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'exam' && (
                  <div className="space-y-5">
                    {summary.examNotes.map((section, i) => (
                      <div key={i} className="pb-4 border-b border-slate-100 last:border-b-0 last:pb-0">
                        <h4 className="text-sm font-semibold text-purple-800">{section.heading}</h4>
                        <ul className="mt-2 space-y-1.5 list-disc pl-5 text-sm text-slate-700">
                          {section.points.map((pt, j) => (
                            <li key={j} className="leading-relaxed">
                              {pt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right 5 cols: RAG Question Answering */}
        <section className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Ask Your Documents (RAG)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Retrieves relevant vector chunks before generating an answer with page references.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setRagScope('selected')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                ragScope === 'selected'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Selected Document
            </button>
            <button
              type="button"
              onClick={() => setRagScope('all')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                ragScope === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All My Documents
            </button>
          </div>

          <form onSubmit={handleAskRag} className="space-y-3">
            <textarea
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about your uploaded material (e.g., What are the four necessary conditions for deadlock?)"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none resize-none"
            />
            <button
              type="submit"
              disabled={askingRag || !question.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {askingRag ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {askingRag ? 'Retrieving & Answering...' : 'Ask Grounded Question'}
            </button>
          </form>

          {ragError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {ragError}
            </div>
          )}

          {ragResult && (
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {ragResult.groundedInDocuments ? (
                  <span className="inline-flex items-center gap-1.5 text-teal-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Grounded in your uploaded material
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-700">
                    <AlertCircle className="h-4 w-4" />
                    Not fully covered in your uploaded material
                  </span>
                )}
              </div>

              <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                {ragResult.answer}
              </div>

              {ragResult.sources.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2.5">
                  <p className="text-xs font-semibold text-slate-600">
                    Retrieved Document References
                  </p>
                  {ragResult.sources.map((src) => (
                    <div
                      key={src.sourceNumber}
                      className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 font-medium text-slate-800">
                        <span className="truncate">
                          [Source {src.sourceNumber}] {src.documentTitle}
                        </span>
                        <span className="text-slate-500 tabular-nums shrink-0">
                          Page {src.pageNumber} · {Math.round(src.score * 100)}%
                        </span>
                      </div>
                      <p className="text-slate-600 leading-relaxed">{src.excerpt}</p>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-slate-500 leading-relaxed">
                {ragResult.disclaimer}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
