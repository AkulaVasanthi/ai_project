import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { apiRequest, type DocumentItem, type FlashcardItem } from '../services/api';

export function FlashcardsPage() {
  const { notify } = useToast();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [stats, setStats] = useState({ total: 0, known: 0, needsRevision: 0, unreviewed: 0 });
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_revision' | 'new' | 'known'>('all');
  const [subjectFilter, setSubjectFilter] = useState('All');

  // Study deck state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Generator state
  const [docId, setDocId] = useState('');
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('Computer Science');
  const [count, setCount] = useState(8);
  const [generating, setGenerating] = useState(false);

  // Manual create modal/inline toggle
  const [showManual, setShowManual] = useState(false);
  const [manualFront, setManualFront] = useState('');
  const [manualBack, setManualBack] = useState('');

  const loadCards = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (subjectFilter !== 'All') params.set('subject', subjectFilter);
      const res = await apiRequest<{
        flashcards: FlashcardItem[];
        stats: { total: number; known: number; needsRevision: number; unreviewed: number };
        subjects: string[];
      }>(`/api/flashcards?${params.toString()}`);

      setCards(res.flashcards);
      setStats(res.stats);
      setSubjects(res.subjects);
      setCurrentIndex((prev) => (prev >= res.flashcards.length ? 0 : prev));
      setFlipped(false);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load flashcards.', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, subjectFilter, notify]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  useEffect(() => {
    apiRequest<{ documents: DocumentItem[] }>('/api/documents')
      .then((res) => setDocuments(res.documents))
      .catch(() => {});
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docId && !topic.trim()) {
      notify('Select a document or enter a topic to generate flashcards.', 'error');
      return;
    }

    setGenerating(true);
    try {
      const res = await apiRequest<{ createdCount: number }>('/api/flashcards/generate', {
        method: 'POST',
        body: JSON.stringify({
          documentId: docId ? Number(docId) : null,
          topic: topic.trim() || undefined,
          subject: subject.trim() || 'Computer Science',
          count,
        }),
      });
      notify(`Created ${res.createdCount} new flashcards.`);
      setTopic('');
      setStatusFilter('all');
      await loadCards();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Flashcard generation failed.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFront.trim() || !manualBack.trim()) return;
    try {
      await apiRequest('/api/flashcards', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim() || 'General',
          front: manualFront.trim(),
          back: manualBack.trim(),
        }),
      });
      notify('Flashcard added.');
      setManualFront('');
      setManualBack('');
      setShowManual(false);
      await loadCards();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not add flashcard.', 'error');
    }
  };

  const handleReview = async (card: FlashcardItem, result: 'known' | 'needs_revision') => {
    try {
      await apiRequest(`/api/flashcards/${card.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ result }),
      });
      notify(
        result === 'known' ? 'Marked as Known.' : 'Flagged for Revision.',
        result === 'known' ? 'success' : 'info'
      );
      setFlipped(false);
      await loadCards();
      if (cards.length > 1) {
        setCurrentIndex((prev) => (prev + 1) % cards.length);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Review update failed.', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/api/flashcards/${id}`, { method: 'DELETE' });
      notify('Flashcard deleted.');
      await loadCards();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const activeCard = cards[currentIndex] || null;
  const masteryPct = stats.total > 0 ? Math.round((stats.known / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Flashcards</h2>
          <p className="mt-1 text-sm text-slate-600">
            Generate active-recall flashcards from uploaded documents, flip to test memory, and track Known vs. Need Revision mastery.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Custom Card
        </button>
      </div>

      {/* Mastery Progress Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-slate-900">Revision Mastery</span>
          <div className="flex items-center gap-4 text-xs text-slate-600 tabular-nums font-[var(--font-mono)]">
            <span className="text-teal-700 font-semibold">{stats.known} Known</span>
            <span className="text-amber-700 font-semibold">{stats.needsRevision} Need Revision</span>
            <span>{stats.unreviewed} New</span>
            <span className="font-semibold text-slate-900">{masteryPct}% Mastered</span>
          </div>
        </div>
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-600 transition-all duration-300"
            style={{ width: `${masteryPct}%` }}
          />
        </div>
      </div>

      {/* AI Generator Form */}
      <form
        onSubmit={handleGenerate}
        className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
      >
        <div className="md:col-span-3">
          <label htmlFor="fc-doc" className="block text-xs font-semibold text-slate-600 mb-1">
            Source document
          </label>
          <select
            id="fc-doc"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Custom topic</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-4">
          <label htmlFor="fc-topic" className="block text-xs font-semibold text-slate-600 mb-1">
            Topic
          </label>
          <input
            id="fc-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Computer Networks — TCP Congestion Control"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="fc-count" className="block text-xs font-semibold text-slate-600 mb-1">
            Card count
          </label>
          <select
            id="fc-count"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {[5, 8, 12, 15].map((n) => (
              <option key={n} value={n}>
                {n} Cards
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <button
            type="submit"
            disabled={generating}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? 'Generating...' : 'Generate Flashcards'}
          </button>
        </div>
      </form>

      {/* Manual Card Creator */}
      {showManual && (
        <form
          onSubmit={handleCreateManual}
          className="bg-white border border-blue-200 rounded-xl p-5 space-y-3"
        >
          <h3 className="text-sm font-semibold text-slate-900">Create Custom Flashcard</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              required
              value={manualFront}
              onChange={(e) => setManualFront(e.target.value)}
              placeholder="Front: Question or term"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              required
              value={manualBack}
              onChange={(e) => setManualBack(e.target.value)}
              placeholder="Back: Answer or definition"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowManual(false)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Save Card
            </button>
          </div>
        </form>
      )}

      {/* Filter Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'all', label: 'All Cards' },
              { id: 'needs_revision', label: 'Need Revision' },
              { id: 'new', label: 'Unreviewed' },
              { id: 'known', label: 'Known' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Filter flashcards by subject"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          <option value="All">All Subjects</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Interactive 3D Flip Deck */}
      {loading ? (
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : !activeCard ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Layers className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">No flashcards in this filter</h3>
          <p className="mt-1 text-sm text-slate-500">
            Generate flashcards from your uploaded documents above or switch the status filter.
          </p>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
            <span>
              Card {currentIndex + 1} of {cards.length} · {activeCard.subject}
            </span>
            <span
              className={`font-semibold ${
                activeCard.status === 'known'
                  ? 'text-teal-700'
                  : activeCard.status === 'needs_revision'
                    ? 'text-amber-700'
                    : 'text-slate-500'
              }`}
            >
              {activeCard.status === 'known'
                ? 'Known'
                : activeCard.status === 'needs_revision'
                  ? 'Needs Revision'
                  : 'Not yet reviewed'}
            </span>
          </div>

          <div
            className="perspective-1000 cursor-pointer select-none"
            onClick={() => setFlipped((f) => !f)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setFlipped((f) => !f);
              }
            }}
            aria-label="Flip flashcard"
          >
            <div
              className={`relative w-full min-h-[260px] transition-transform duration-500 transform-style-3d ${
                flipped ? 'rotate-y-180' : ''
              }`}
            >
              {/* Front */}
              <div className="absolute inset-0 backface-hidden rounded-2xl border border-slate-200 bg-white p-8 flex flex-col justify-between shadow-xs">
                <p className="text-xs font-semibold text-blue-700">Question / Term</p>
                <p className="text-xl font-semibold text-slate-900 text-center leading-snug">
                  {activeCard.front}
                </p>
                <p className="text-xs text-slate-400 text-center inline-flex items-center justify-center gap-1.5">
                  <RotateCw className="h-3.5 w-3.5" />
                  Click card to reveal answer
                </p>
              </div>

              {/* Back */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-purple-200 bg-purple-50/40 p-8 flex flex-col justify-between shadow-xs">
                <p className="text-xs font-semibold text-purple-700">Answer / Definition</p>
                <p className="text-base text-slate-800 text-center leading-relaxed">
                  {activeCard.back}
                </p>
                <p className="text-xs text-slate-400 text-center">Click card to view prompt</p>
              </div>
            </div>
          </div>

          {/* Deck Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setFlipped(false);
                setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleReview(activeCard, 'needs_revision')}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
              >
                Need Revision
              </button>
              <button
                type="button"
                onClick={() => handleReview(activeCard, 'known')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark as Known
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setFlipped(false);
                setCurrentIndex((prev) => (prev + 1) % cards.length);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* All Cards Overview Table */}
      {cards.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">Saved Flashcards</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {cards.map((card, idx) => (
              <div
                key={card.id}
                onClick={() => {
                  setCurrentIndex(idx);
                  setFlipped(false);
                }}
                className="px-5 py-3.5 flex items-start justify-between gap-4 hover:bg-slate-50 cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{card.front}</p>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{card.back}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-slate-500 tabular-nums">
                    {card.status === 'known'
                      ? 'Known'
                      : card.status === 'needs_revision'
                        ? 'Needs Revision'
                        : 'New'}{' '}
                    · {card.reviewCount} reviews
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(card.id);
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                    aria-label="Delete flashcard"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
