import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Layers,
  MessageSquareText,
  Mic,
  Network,
  NotebookPen,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatDateShort, formatDateTime } from '../services/api';

interface DashboardData {
  stats: {
    totalResources: number;
    totalDocuments: number;
    totalNotes: number;
    totalQuizzesCompleted: number;
    averageQuizScore: number | null;
    studyStreakDays: number;
    totalGraphConcepts: number;
    totalFlashcards: number;
  };
  recentDocuments: Array<{
    id: number;
    title: string;
    subject: string;
    pageCount: number;
    chunkCount: number;
    processingStatus: string;
    createdAt: string;
  }>;
  recentActivity: Array<{
    id: number;
    activityType: string;
    title: string;
    subject: string;
    createdAt: string;
  }>;
  learningProgress: Array<{
    date: string;
    label: string;
    activities: number;
    quizScore: number | null;
  }>;
  recommendation: {
    title: string;
    description: string;
    actionLabel: string;
    route: string;
  };
}

const QUICK_MODULES = [
  { label: 'Upload PDF', desc: 'Index study materials', to: '/documents', icon: Upload, tone: 'text-blue-600 bg-blue-50' },
  { label: 'Summarize & RAG', desc: 'Notes & cited Q&A', to: '/summarization', icon: FileText, tone: 'text-purple-600 bg-purple-50' },
  { label: 'Knowledge Graph', desc: 'Map concept links', to: '/knowledge-graph', icon: Network, tone: 'text-teal-600 bg-teal-50' },
  { label: 'Live Transcription', desc: 'Record & transcribe', to: '/transcription', icon: Mic, tone: 'text-blue-600 bg-blue-50' },
  { label: 'Live AI Notes', desc: 'Structured sessions', to: '/notes', icon: NotebookPen, tone: 'text-purple-600 bg-purple-50' },
  { label: 'AI Assistant', desc: 'Grounded study chat', to: '/assistant', icon: MessageSquareText, tone: 'text-teal-600 bg-teal-50' },
  { label: 'Visual Learning', desc: 'Flows & diagrams', to: '/visual-learning', icon: BookOpen, tone: 'text-blue-600 bg-blue-50' },
  { label: 'Quizzes & Cards', desc: 'Test active recall', to: '/quizzes', icon: ClipboardCheck, tone: 'text-purple-600 bg-purple-50' },
];

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiRequest<DashboardData>('/api/dashboard');
        if (active) setData(res);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-72 bg-slate-200 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 bg-white border border-slate-200 rounded-xl" />
          <div className="h-80 bg-white border border-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6">
        <p className="text-sm font-medium text-red-700">{error || 'Unable to load dashboard.'}</p>
      </div>
    );
  }

  const firstName = user?.fullName?.split(' ')[0] || 'Student';
  const hasActivity = data.learningProgress.some((d) => d.activities > 0);

  return (
    <div className="space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back, {firstName}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {user?.department} · {user?.studyGoal}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/documents"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Upload className="h-4 w-4" />
            Upload Material
          </Link>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Uploaded Resources</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums font-[var(--font-mono)]">
            {data.stats.totalResources}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data.stats.totalDocuments} PDFs & docs indexed
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Notes Created</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums font-[var(--font-mono)]">
            {data.stats.totalNotes}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data.stats.totalGraphConcepts} graph concepts
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Quizzes Completed</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums font-[var(--font-mono)]">
            {data.stats.totalQuizzesCompleted}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data.stats.totalFlashcards} flashcards saved
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Average Quiz Score</p>
          <p className="mt-2 text-2xl font-bold text-blue-700 tabular-nums font-[var(--font-mono)]">
            {data.stats.averageQuizScore !== null ? `${data.stats.averageQuizScore}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data.stats.averageQuizScore !== null ? 'Across all attempts' : 'No attempts yet'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Current Study Streak</p>
          <p className="mt-2 text-2xl font-bold text-teal-700 tabular-nums font-[var(--font-mono)]">
            {data.stats.studyStreakDays}{' '}
            <span className="text-sm font-medium text-slate-500 font-[var(--font-sans)]">
              {data.stats.studyStreakDays === 1 ? 'day' : 'days'}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Consecutive active days</p>
        </div>
      </div>

      {/* Main Middle Row: Learning Progress Chart + Recommended Next Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">7-Day Learning Activity</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Daily study actions recorded across documents, notes, graphs, and quizzes
              </p>
            </div>
            <Link
              to="/analytics"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              Full analytics
            </Link>
          </div>

          {hasActivity ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.learningProgress} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashBlueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="activities"
                    name="Study actions"
                    stroke="#2563EB"
                    strokeWidth={2}
                    fill="url(#dashBlueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center px-4 bg-slate-50/70 rounded-lg border border-dashed border-slate-200">
              <p className="text-sm font-medium text-slate-700">No study activity logged yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Upload a PDF, generate AI notes, or complete a quiz to see your real daily progress chart here.
              </p>
            </div>
          )}
        </section>

        {/* Recommended Next Step */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-purple-700">Recommended Next Step</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900 leading-snug">
              {data.recommendation.title}
            </h3>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              {data.recommendation.description}
            </p>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100 space-y-3">
            <Link
              to={data.recommendation.route}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <span>{data.recommendation.actionLabel}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/flashcards"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Layers className="h-4 w-4 text-teal-600" />
              Open Flashcard Deck
            </Link>
          </div>
        </section>
      </div>

      {/* Quick Access Modules */}
      <section>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Quick Access</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {QUICK_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.to}
                to={mod.to}
                className="group bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors flex items-start gap-3"
              >
                <div className={`p-2 rounded-lg shrink-0 ${mod.tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 truncate">
                    {mod.label}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{mod.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Bottom Row: Recent Documents + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Recent Documents</h3>
            <Link to="/documents" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          {data.recentDocuments.length === 0 ? (
            <div className="p-8 text-center">
              <FolderOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">No documents uploaded yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload your lecture PDFs to start indexing and building summaries.
              </p>
              <Link
                to="/documents"
                className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Go to Documents <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentDocuments.map((doc) => (
                <div key={doc.id} className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{doc.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {doc.subject} · {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'} · {doc.chunkCount} chunks · {formatDateShort(doc.createdAt)}
                    </p>
                  </div>
                  <Link
                    to={`/summarization?doc=${doc.id}`}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap shrink-0"
                  >
                    Study
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Recent Activity</h3>
            <Link to="/analytics" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              History
            </Link>
          </div>
          {data.recentActivity.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">No recorded activity yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Your uploads, notes, concept extractions, and quiz results will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentActivity.map((item) => (
                <div key={item.id} className="px-6 py-3.5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 leading-snug">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.subject} · {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
