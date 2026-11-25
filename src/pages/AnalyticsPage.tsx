import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { apiRequest, formatDateTime } from '../services/api';

interface AnalyticsData {
  summary: {
    totalResourcesUploaded: number;
    totalStudySessions: number;
    totalQuizzesAttempted: number;
    averageQuizScore: number | null;
    highestQuizScore: number | null;
    totalFlashcardReviews: number;
    studyStreakDays: number;
  };
  quizPerformanceOverTime: Array<{
    id: number;
    date: string;
    label: string;
    title: string;
    subject: string;
    score: number;
    totalQuestions: number;
    percentage: number;
  }>;
  studyActivityOverTime: Array<{
    date: string;
    label: string;
    count: number;
  }>;
  flashcardProgress: {
    known: number;
    needsRevision: number;
    unreviewed: number;
    total: number;
  };
  mostStudiedSubjects: Array<{ subject: string; count: number }>;
  activityHistory: Array<{
    id: number;
    activityType: string;
    title: string;
    subject: string;
    createdAt: string;
  }>;
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<AnalyticsData>('/api/analytics')
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analytics.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-56 bg-slate-200 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-white border border-slate-200 rounded-xl" />
          <div className="h-72 bg-white border border-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-sm text-red-700">
        {error || 'Unable to load analytics.'}
      </div>
    );
  }

  const fcChartData = [
    { name: 'Known', value: data.flashcardProgress.known, color: '#0D9488' },
    { name: 'Need Revision', value: data.flashcardProgress.needsRevision, color: '#D97706' },
    { name: 'Unreviewed', value: data.flashcardProgress.unreviewed, color: '#94A3B8' },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Learning Analytics</h2>
        <p className="mt-1 text-sm text-slate-600">
          Real-time performance metrics computed directly from your stored documents, quizzes, flashcard reviews, and study sessions.
        </p>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Resources Uploaded</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums font-[var(--font-mono)]">
            {data.summary.totalResourcesUploaded}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Study Sessions</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums font-[var(--font-mono)]">
            {data.summary.totalStudySessions}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Quizzes Attempted</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums font-[var(--font-mono)]">
            {data.summary.totalQuizzesAttempted}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Average Quiz Score</p>
          <p className="mt-2 text-2xl font-bold text-blue-700 tabular-nums font-[var(--font-mono)]">
            {data.summary.averageQuizScore !== null ? `${data.summary.averageQuizScore}%` : '—'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Highest Quiz Score</p>
          <p className="mt-2 text-2xl font-bold text-teal-700 tabular-nums font-[var(--font-mono)]">
            {data.summary.highestQuizScore !== null ? `${data.summary.highestQuizScore}%` : '—'}
          </p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-900">Quiz Performance Over Time</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-5">
            Percentage score across each completed quiz attempt
          </p>
          {data.quizPerformanceOverTime.length === 0 ? (
            <div className="h-60 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center text-center p-6">
              <BarChart3 className="h-7 w-7 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">No quiz attempts yet</p>
              <Link to="/quizzes" className="mt-2 text-xs font-semibold text-blue-600 hover:underline">
                Take your first quiz
              </Link>
            </div>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.quizPerformanceOverTime} margin={{ top: 8, right: 16, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(val) => [`${val}%`, 'Score']}
                    contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '12px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="percentage"
                    stroke="#2563EB"
                    strokeWidth={2.2}
                    dot={{ r: 4, fill: '#2563EB' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-900">Study Activity Over Time</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-5">
            Recorded learning interactions per active day (last 14 days)
          </p>
          {data.studyActivityOverTime.length === 0 ? (
            <div className="h-60 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center text-center p-6">
              <p className="text-sm font-medium text-slate-700">No study activity recorded yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Activity charts populate automatically as you upload materials and study.
              </p>
            </div>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.studyActivityOverTime} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '12px' }}
                  />
                  <Bar dataKey="count" name="Actions" fill="#7C3AED" radius={[6, 6, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-900">Flashcard Revision Progress</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-4 tabular-nums">
            {data.flashcardProgress.total} total cards · {data.summary.totalFlashcardReviews} total reviews
          </p>
          {data.flashcardProgress.total === 0 ? (
            <div className="h-56 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center text-center p-6">
              <p className="text-sm font-medium text-slate-700">No flashcards created yet</p>
              <Link to="/flashcards" className="mt-2 text-xs font-semibold text-blue-600 hover:underline">
                Generate flashcards
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4">
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={fcChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={3}
                    >
                      {fcChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 text-sm tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Known</span>
                  <span className="font-semibold text-teal-700 font-[var(--font-mono)]">
                    {data.flashcardProgress.known}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Need Revision</span>
                  <span className="font-semibold text-amber-700 font-[var(--font-mono)]">
                    {data.flashcardProgress.needsRevision}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Unreviewed</span>
                  <span className="font-semibold text-slate-700 font-[var(--font-mono)]">
                    {data.flashcardProgress.unreviewed}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-900">Most Studied Subjects</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Distribution of activity across your subjects
          </p>
          {data.mostStudiedSubjects.length === 0 ? (
            <div className="h-56 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 flex items-center justify-center text-sm text-slate-500">
              Study a subject to view subject breakdown.
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.mostStudiedSubjects}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="subject" width={115} tick={{ fill: '#334155', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '12px' }}
                  />
                  <Bar dataKey="count" name="Interactions" fill="#0D9488" radius={[0, 6, 6, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Activity History Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">Learning Activity History</h3>
        </div>
        {data.activityHistory.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No learning history recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-6">Activity</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-6 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {data.activityHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 text-slate-900 font-medium">{item.title}</td>
                    <td className="py-3 px-4 text-slate-600">{item.subject}</td>
                    <td className="py-3 px-6 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {formatDateTime(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
