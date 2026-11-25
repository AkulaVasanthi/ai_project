import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  apiRequest,
  formatDateShort,
  type DocumentItem,
  type VisualGuide,
} from '../services/api';

export function VisualLearningPage() {
  const { notify } = useToast();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [guides, setGuides] = useState<VisualGuide[]>([]);
  const [selectedGuide, setSelectedGuide] = useState<VisualGuide | null>(null);
  const [loading, setLoading] = useState(true);

  const [docId, setDocId] = useState('');
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('Computer Science');
  const [generating, setGenerating] = useState(false);

  const loadGuides = useCallback(async () => {
    try {
      const res = await apiRequest<{ guides: VisualGuide[] }>('/api/visual-learning');
      setGuides(res.guides);
      setSelectedGuide((prev) => prev || res.guides[0] || null);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load visual guides.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadGuides();
    apiRequest<{ documents: DocumentItem[] }>('/api/documents')
      .then((res) => setDocuments(res.documents))
      .catch(() => {});
  }, [loadGuides]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docId && !topic.trim()) {
      notify('Select a document or enter a topic to generate a visual learning guide.', 'error');
      return;
    }

    setGenerating(true);
    try {
      const res = await apiRequest<{ guide: VisualGuide }>('/api/visual-learning/generate', {
        method: 'POST',
        body: JSON.stringify({
          documentId: docId ? Number(docId) : null,
          topic: topic.trim() || undefined,
          subject: subject.trim() || 'Computer Science',
        }),
      });
      notify(`Visual learning guide created for "${res.guide.topic}".`);
      setSelectedGuide(res.guide);
      setTopic('');
      await loadGuides();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Visual learning generation failed.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/api/visual-learning/${id}`, { method: 'DELETE' });
      notify('Visual guide deleted.');
      if (selectedGuide?.id === id) setSelectedGuide(null);
      loadGuides();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Visual Learning</h2>
        <p className="mt-1 text-sm text-slate-600">
          Break down complex topics into structured concept maps, sequential step-by-step learning flows, relationship diagrams, real-world examples, and exam recaps.
        </p>
      </div>

      {/* Generator Form */}
      <form
        onSubmit={handleGenerate}
        className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
      >
        <div className="md:col-span-4">
          <label htmlFor="vl-doc" className="block text-xs font-semibold text-slate-600 mb-1">
            Source document (optional)
          </label>
          <select
            id="vl-doc"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          >
            <option value="">Custom topic only</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.subject})
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-4">
          <label htmlFor="vl-topic" className="block text-xs font-semibold text-slate-600 mb-1">
            Topic to visualize
          </label>
          <input
            id="vl-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Backpropagation in Neural Networks"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="vl-subj" className="block text-xs font-semibold text-slate-600 mb-1">
            Subject
          </label>
          <input
            id="vl-subj"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={generating}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? 'Building...' : 'Visualize'}
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Saved Guides List */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Saved Guides</h3>
            <span className="text-xs text-slate-400 tabular-nums">{guides.length}</span>
          </div>
          {loading ? (
            <div className="p-4 space-y-2 animate-pulse">
              <div className="h-12 bg-slate-100 rounded-lg" />
              <div className="h-12 bg-slate-100 rounded-lg" />
            </div>
          ) : guides.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">
              No visual guides yet. Generate your first visual breakdown above.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {guides.map((g) => (
                <div
                  key={g.id}
                  onClick={() => setSelectedGuide(g)}
                  className={`px-4 py-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    selectedGuide?.id === g.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{g.topic}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {g.subject} · {formatDateShort(g.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(g.id);
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                    aria-label="Delete guide"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Visual Guide Display */}
        <section className="lg:col-span-9 space-y-6">
          {!selectedGuide ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <BookOpen className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-900">
                Select or generate a Visual Learning Guide
              </h3>
              <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                Visualize how concepts connect, follow a step-by-step learning pipeline, and review real-world applications.
              </p>
            </div>
          ) : (
            <>
              {/* 1. Simple Explanation */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <p className="text-xs font-semibold text-blue-700">
                  {selectedGuide.subject} · Visual Learning Guide
                </p>
                <h3 className="mt-1 text-2xl font-bold text-slate-900">{selectedGuide.topic}</h3>
                <p className="mt-3 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {selectedGuide.explanation}
                </p>
              </div>

              {/* 2. Key Concepts Architecture */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h4 className="text-base font-semibold text-slate-900 mb-4">
                  Core Concept Pillars
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedGuide.keyConcepts.map((kc, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <p className="text-[11px] font-semibold text-purple-700">{kc.role}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{kc.title}</p>
                      <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{kc.summary}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Step-by-Step Learning Flow Diagram */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h4 className="text-base font-semibold text-slate-900 mb-4">
                  Step-by-Step Learning Flow
                </h4>
                <div className="space-y-3">
                  {selectedGuide.learningFlow.map((stage, i) => (
                    <div key={i} className="flex flex-col items-stretch">
                      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="h-9 w-9 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0 tabular-nums font-[var(--font-mono)]">
                          {String(stage.step || i + 1).padStart(2, '0')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{stage.title}</p>
                          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                            {stage.detail}
                          </p>
                        </div>
                        <div className="sm:w-52 shrink-0 sm:border-l sm:border-blue-200/80 sm:pl-4">
                          <p className="text-[11px] font-semibold text-teal-700">Outcome</p>
                          <p className="text-xs text-slate-700 mt-0.5">{stage.outcome}</p>
                        </div>
                      </div>
                      {i < selectedGuide.learningFlow.length - 1 && (
                        <div className="flex justify-center py-1 text-blue-400">
                          <ArrowDown className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Concept Relationship Diagram */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h4 className="text-base font-semibold text-slate-900 mb-4">
                  Concept Relationship Diagram
                </h4>
                <div className="space-y-3">
                  {selectedGuide.relationships.map((rel, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-200 p-4 flex flex-col md:flex-row md:items-center gap-3"
                    >
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="rounded-md bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-900">
                          {rel.from}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700">
                          <ArrowRight className="h-3.5 w-3.5" />
                          {rel.relation}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                        <span className="rounded-md bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-semibold text-teal-900">
                          {rel.to}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed md:ml-auto md:text-right">
                        {rel.note}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. Real-World Examples & Important Points */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h4 className="text-base font-semibold text-slate-900 mb-3">
                    Real-World Examples
                  </h4>
                  <div className="space-y-4">
                    {selectedGuide.realWorldExamples.map((ex, i) => (
                      <div key={i} className="pb-3 border-b border-slate-100 last:border-b-0 last:pb-0">
                        <p className="text-sm font-semibold text-slate-900">{ex.scenario}</p>
                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                          {ex.application}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-slate-900 mb-3">
                      Key Exam Takeaways
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-700">
                      {selectedGuide.importantPoints.map((pt, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                          <span className="leading-snug">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100">
                    <p className="text-xs font-semibold text-blue-700 mb-1">Revision Summary</p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {selectedGuide.revisionSummary}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
