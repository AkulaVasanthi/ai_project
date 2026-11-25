import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDateTime, type DocumentItem } from '../services/api';

interface QuizSummary {
  id: number;
  documentId: number | null;
  documentTitle: string | null;
  title: string;
  subject: string;
  difficulty: string;
  questionCount: number;
  attemptCount: number;
  bestScore: number | null;
  createdAt: string;
}

interface QuizAttemptRow {
  id: number;
  quizId: number;
  quizTitle: string;
  subject: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  createdAt: string;
}

interface ActiveQuiz {
  id: number;
  title: string;
  subject: string;
  difficulty: string;
  questions: Array<{
    id: number;
    order: number;
    questionText: string;
    options: string[];
  }>;
}

interface GradedResult {
  score: number;
  totalQuestions: number;
  percentage: number;
  review: Array<{
    questionId: number;
    questionText: string;
    options: string[];
    selectedIndex: number;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
  }>;
}

export function QuizzesPage() {
  const { notify } = useToast();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<QuizAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Generator state
  const [docId, setDocId] = useState('');
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('Computer Science');
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [generating, setGenerating] = useState(false);

  // Active quiz taking state
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradedResult | null>(null);

  const loadQuizzes = useCallback(async () => {
    try {
      const res = await apiRequest<{
        quizzes: QuizSummary[];
        recentAttempts: QuizAttemptRow[];
      }>('/api/quizzes');
      setQuizzes(res.quizzes);
      setRecentAttempts(res.recentAttempts);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load quizzes.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadQuizzes();
    apiRequest<{ documents: DocumentItem[] }>('/api/documents')
      .then((res) => setDocuments(res.documents))
      .catch(() => {});
  }, [loadQuizzes]);

  const openQuiz = async (quizId: number) => {
    try {
      const res = await apiRequest<{ quiz: ActiveQuiz }>(`/api/quizzes/${quizId}`);
      setActiveQuiz(res.quiz);
      setAnswers({});
      setResult(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not open quiz.', 'error');
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docId && !topic.trim()) {
      notify('Select an uploaded document or enter a topic.', 'error');
      return;
    }

    setGenerating(true);
    try {
      const res = await apiRequest<{ quizId: number }>('/api/quizzes/generate', {
        method: 'POST',
        body: JSON.stringify({
          documentId: docId ? Number(docId) : null,
          topic: topic.trim() || undefined,
          subject: subject.trim() || 'Computer Science',
          questionCount,
          difficulty,
        }),
      });
      notify('Quiz generated and saved.');
      setTopic('');
      await loadQuizzes();
      await openQuiz(res.quizId);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Quiz generation failed.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuiz) return;

    const unanswered = activeQuiz.questions.filter((q) => answers[q.id] === undefined);
    if (unanswered.length > 0) {
      notify(`Please answer all ${activeQuiz.questions.length} questions before submitting.`, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ attempt: GradedResult }>(
        `/api/quizzes/${activeQuiz.id}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({
            answers: activeQuiz.questions.map((q) => ({
              questionId: q.id,
              selectedIndex: answers[q.id],
            })),
          }),
        }
      );
      setResult(res.attempt);
      notify(`Quiz submitted — Score: ${res.attempt.score}/${res.attempt.totalQuestions} (${res.attempt.percentage}%)`);
      loadQuizzes();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Submission failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (quizId: number) => {
    try {
      await apiRequest(`/api/quizzes/${quizId}`, { method: 'DELETE' });
      notify('Quiz deleted.');
      if (activeQuiz?.id === quizId) {
        setActiveQuiz(null);
        setResult(null);
      }
      loadQuizzes();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete quiz.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">AI Quizzes</h2>
        <p className="mt-1 text-sm text-slate-600">
          Generate 4-option multiple-choice quizzes from your uploaded study materials, review detailed explanations, and track your scores over time.
        </p>
      </div>

      {/* Generator Bar */}
      <form
        onSubmit={handleGenerate}
        className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
      >
        <div className="md:col-span-3">
          <label htmlFor="qz-doc" className="block text-xs font-semibold text-slate-600 mb-1">
            Source document
          </label>
          <select
            id="qz-doc"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          >
            <option value="">Custom topic</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <label htmlFor="qz-topic" className="block text-xs font-semibold text-slate-600 mb-1">
            Topic (optional if document selected)
          </label>
          <input
            id="qz-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Operating Systems Scheduling"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="qz-diff" className="block text-xs font-semibold text-slate-600 mb-1">
            Difficulty
          </label>
          <select
            id="qz-diff"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as 'beginner' | 'intermediate' | 'advanced')}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="qz-count" className="block text-xs font-semibold text-slate-600 mb-1">
            Questions
          </label>
          <select
            id="qz-count"
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {[3, 5, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n} Questions
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={generating}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? 'Creating...' : 'Generate Quiz'}
          </button>
        </div>
      </form>

      {/* Active Quiz Runner OR Quiz Library */}
      {activeQuiz ? (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <p className="text-xs font-semibold text-blue-700 capitalize">
                {activeQuiz.subject} · {activeQuiz.difficulty} · {activeQuiz.questions.length} questions
              </p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{activeQuiz.title}</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveQuiz(null);
                setResult(null);
              }}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Back to Quiz Library
            </button>
          </div>

          {result ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-blue-700">Quiz Attempt Saved</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums font-[var(--font-mono)]">
                    {result.score} / {result.totalQuestions} ({result.percentage}%)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAnswers({});
                    setResult(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <RotateCcw className="h-4 w-4" />
                  Retake Quiz
                </button>
              </div>

              <div className="space-y-4">
                {result.review.map((item, idx) => (
                  <div
                    key={item.questionId}
                    className={`rounded-xl border p-5 space-y-3 ${
                      item.isCorrect ? 'border-teal-200 bg-teal-50/30' : 'border-red-200 bg-red-50/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {idx + 1}. {item.questionText}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
                          item.isCorrect ? 'text-teal-700' : 'text-red-700'
                        }`}
                      >
                        {item.isCorrect ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        {item.isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {item.options.map((opt, oIdx) => {
                        const isRight = oIdx === item.correctIndex;
                        const isChosen = oIdx === item.selectedIndex;
                        return (
                          <div
                            key={oIdx}
                            className={`rounded-lg border px-3 py-2 text-xs ${
                              isRight
                                ? 'border-teal-500 bg-teal-50 text-teal-950 font-semibold'
                                : isChosen
                                  ? 'border-red-400 bg-red-50 text-red-900'
                                  : 'border-slate-200 bg-white text-slate-600'
                            }`}
                          >
                            {String.fromCharCode(65 + oIdx)}. {opt}
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed pt-1">
                      <span className="font-semibold text-slate-900">Explanation: </span>
                      {item.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {activeQuiz.questions.map((q, idx) => (
                <div key={q.id} className="pb-5 border-b border-slate-100 last:border-b-0 space-y-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {idx + 1}. {q.questionText}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {q.options.map((opt, oIdx) => {
                      const selected = answers[q.id] === oIdx;
                      return (
                        <button
                          key={oIdx}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: oIdx }))}
                          className={`text-left rounded-lg border px-4 py-3 text-sm transition-colors ${
                            selected
                              ? 'border-blue-600 bg-blue-50 text-blue-950 font-medium'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-semibold mr-2 font-[var(--font-mono)]">
                            {String.fromCharCode(65 + oIdx)}.
                          </span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {submitting ? 'Grading...' : 'Submit Quiz'}
                </button>
              </div>
            </form>
          )}
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Quizzes List */}
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Your Quizzes</h3>
              <span className="text-xs text-slate-400 tabular-nums">{quizzes.length} quizzes</span>
            </div>
            {loading ? (
              <div className="p-5 space-y-2 animate-pulse">
                <div className="h-14 bg-slate-100 rounded-lg" />
                <div className="h-14 bg-slate-100 rounded-lg" />
              </div>
            ) : quizzes.length === 0 ? (
              <div className="p-10 text-center">
                <ClipboardCheck className="h-9 w-9 text-slate-300 mx-auto mb-2.5" />
                <p className="text-sm font-semibold text-slate-800">No quizzes created yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Select a document or topic above to generate your first practice quiz.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {quizzes.map((qz) => (
                  <div
                    key={qz.id}
                    className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/70"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{qz.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums capitalize">
                        {qz.subject} · {qz.difficulty} · {qz.questionCount} questions
                        {qz.bestScore !== null ? ` · Best: ${qz.bestScore}%` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openQuiz(qz.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Take Quiz
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(qz.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                        aria-label="Delete quiz"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Past Performance History */}
          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Recent Attempts</h3>
            </div>
            {recentAttempts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Complete a quiz to track your attempt scores here.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentAttempts.map((att) => (
                  <div key={att.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{att.quizTitle}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {att.subject} · {formatDateTime(att.createdAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 font-[var(--font-mono)] tabular-nums">
                      <p
                        className={`text-sm font-bold ${
                          att.percentage >= 70 ? 'text-teal-700' : 'text-amber-700'
                        }`}
                      >
                        {att.percentage}%
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {att.score}/{att.totalQuestions}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
