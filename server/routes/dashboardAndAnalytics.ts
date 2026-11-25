import { Router } from 'express';
import { db } from '../db/database.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

function calculateStudyStreak(userId: number): number {
  const dayRows = db
    .prepare(
      `SELECT DISTINCT date(created_at) AS study_day
       FROM user_activity
       WHERE user_id = ?
       ORDER BY study_day DESC`
    )
    .all(userId) as Array<{ study_day: string }>;

  if (dayRows.length === 0) return 0;

  const daySet = new Set(dayRows.map((d) => d.study_day));
  const today = new Date();
  const formatDate = (d: Date) => d.toISOString().slice(0, 10);

  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!daySet.has(formatDate(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!daySet.has(formatDate(cursor))) {
      return 0;
    }
  }

  let streak = 0;
  while (daySet.has(formatDate(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

insightsRouter.get('/dashboard', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const docCount = (
    db.prepare('SELECT COUNT(*) AS c FROM documents WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const noteCount = (
    db.prepare('SELECT COUNT(*) AS c FROM notes WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const recordingCount = (
    db.prepare('SELECT COUNT(*) AS c FROM recordings WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const graphConceptCount = (
    db.prepare('SELECT COUNT(*) AS c FROM knowledge_nodes WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const flashcardCount = (
    db.prepare('SELECT COUNT(*) AS c FROM flashcards WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const needsRevisionCount = (
    db
      .prepare("SELECT COUNT(*) AS c FROM flashcards WHERE user_id = ? AND status = 'needs_revision'")
      .get(userId) as { c: number }
  ).c;

  const quizStats = db
    .prepare(
      `SELECT COUNT(*) AS completed, AVG(percentage) AS avg_score
       FROM quiz_attempts WHERE user_id = ?`
    )
    .get(userId) as { completed: number; avg_score: number | null };

  const streakDays = calculateStudyStreak(userId);

  const recentDocuments = db
    .prepare(
      `SELECT id, title, subject, page_count, chunk_count, processing_status, created_at
       FROM documents
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`
    )
    .all(userId) as Array<{
    id: number;
    title: string;
    subject: string;
    page_count: number;
    chunk_count: number;
    processing_status: string;
    created_at: string;
  }>;

  const recentActivity = db
    .prepare(
      `SELECT id, activity_type, title, subject, created_at
       FROM user_activity
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 8`
    )
    .all(userId) as Array<{
    id: number;
    activity_type: string;
    title: string;
    subject: string;
    created_at: string;
  }>;

  // Last 7 days activity counts from real database records
  const activityByDayRows = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS activities
       FROM user_activity
       WHERE user_id = ? AND date(created_at) >= date('now', '-6 days')
       GROUP BY date(created_at)`
    )
    .all(userId) as Array<{ day: string; activities: number }>;

  const quizByDayRows = db
    .prepare(
      `SELECT date(created_at) AS day, ROUND(AVG(percentage)) AS avg_score
       FROM quiz_attempts
       WHERE user_id = ? AND date(created_at) >= date('now', '-6 days')
       GROUP BY date(created_at)`
    )
    .all(userId) as Array<{ day: string; avg_score: number }>;

  const activityMap = new Map(activityByDayRows.map((r) => [r.day, r.activities]));
  const quizMap = new Map(quizByDayRows.map((r) => [r.day, r.avg_score]));

  const learningProgress: Array<{
    date: string;
    label: string;
    activities: number;
    quizScore: number | null;
  }> = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    learningProgress.push({
      date: iso,
      label,
      activities: activityMap.get(iso) ?? 0,
      quizScore: quizMap.has(iso) ? quizMap.get(iso)! : null,
    });
  }

  // Contextual recommendation based on real user data
  let recommendation = {
    title: 'Upload your first study document',
    description:
      'Upload a lecture PDF or notes file to index chunks for RAG question answering, summaries, and knowledge graphs.',
    actionLabel: 'Upload Document',
    route: '/documents',
  };

  if (docCount > 0 && graphConceptCount === 0) {
    recommendation = {
      title: 'Map concepts in your Knowledge Graph',
      description: `You have ${docCount} indexed document${docCount > 1 ? 's' : ''}. Extract connected concepts to visualize relationships across topics.`,
      actionLabel: 'Open Knowledge Graph',
      route: '/knowledge-graph',
    };
  } else if (needsRevisionCount > 0) {
    recommendation = {
      title: `Revise ${needsRevisionCount} flagged flashcard${needsRevisionCount > 1 ? 's' : ''}`,
      description: 'Review cards marked as Need Revision to strengthen active recall before your next quiz.',
      actionLabel: 'Review Flashcards',
      route: '/flashcards',
    };
  } else if (docCount > 0 && quizStats.completed === 0) {
    recommendation = {
      title: 'Test retention with an AI-generated quiz',
      description: 'Generate a multiple-choice quiz directly from your uploaded materials and track your score over time.',
      actionLabel: 'Create a Quiz',
      route: '/quizzes',
    };
  } else if (docCount > 0) {
    recommendation = {
      title: 'Synthesize a Visual Learning Guide',
      description: 'Turn your course material into step-by-step visual flows, relationship maps, and real-world examples.',
      actionLabel: 'Explore Visual Learning',
      route: '/visual-learning',
    };
  }

  res.json({
    stats: {
      totalResources: docCount + recordingCount,
      totalDocuments: docCount,
      totalNotes: noteCount,
      totalQuizzesCompleted: quizStats.completed,
      averageQuizScore: quizStats.avg_score !== null ? Math.round(quizStats.avg_score) : null,
      studyStreakDays: streakDays,
      totalGraphConcepts: graphConceptCount,
      totalFlashcards: flashcardCount,
    },
    recentDocuments: recentDocuments.map((d) => ({
      id: d.id,
      title: d.title,
      subject: d.subject,
      pageCount: d.page_count,
      chunkCount: d.chunk_count,
      processingStatus: d.processing_status,
      createdAt: d.created_at,
    })),
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      activityType: a.activity_type,
      title: a.title,
      subject: a.subject,
      createdAt: a.created_at,
    })),
    learningProgress,
    recommendation,
  });
});

insightsRouter.get('/analytics', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const docsCount = (
    db.prepare('SELECT COUNT(*) AS c FROM documents WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const recordingsCount = (
    db.prepare('SELECT COUNT(*) AS c FROM recordings WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const notesCount = (
    db.prepare('SELECT COUNT(*) AS c FROM notes WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const visualGuidesCount = (
    db.prepare('SELECT COUNT(*) AS c FROM visual_guides WHERE user_id = ?').get(userId) as { c: number }
  ).c;

  const quizAgg = db
    .prepare(
      `SELECT COUNT(*) AS attempted, AVG(percentage) AS avg_score, MAX(percentage) AS high_score
       FROM quiz_attempts WHERE user_id = ?`
    )
    .get(userId) as { attempted: number; avg_score: number | null; high_score: number | null };

  const quizHistory = db
    .prepare(
      `SELECT qa.id, qa.score, qa.total_questions, qa.percentage, qa.created_at, q.title, q.subject
       FROM quiz_attempts qa
       INNER JOIN quizzes q ON q.id = qa.quiz_id
       WHERE qa.user_id = ?
       ORDER BY qa.created_at ASC
       LIMIT 30`
    )
    .all(userId) as Array<{
    id: number;
    score: number;
    total_questions: number;
    percentage: number;
    created_at: string;
    title: string;
    subject: string;
  }>;

  const activityOverTimeRows = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count
       FROM user_activity
       WHERE user_id = ? AND date(created_at) >= date('now', '-13 days')
       GROUP BY date(created_at)
       ORDER BY day ASC`
    )
    .all(userId) as Array<{ day: string; count: number }>;

  const flashcardCounts = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM flashcards
       WHERE user_id = ?
       GROUP BY status`
    )
    .all(userId) as Array<{ status: string; count: number }>;

  const flashcardReviewTotal = (
    db.prepare('SELECT COUNT(*) AS c FROM flashcard_reviews WHERE user_id = ?').get(userId) as {
      c: number;
    }
  ).c;

  const subjectRows = db
    .prepare(
      `SELECT subject, COUNT(*) AS count
       FROM user_activity
       WHERE user_id = ? AND subject != '' AND subject != 'Onboarding'
       GROUP BY subject
       ORDER BY count DESC
       LIMIT 8`
    )
    .all(userId) as Array<{ subject: string; count: number }>;

  const activityHistory = db
    .prepare(
      `SELECT id, activity_type, title, subject, created_at
       FROM user_activity
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 25`
    )
    .all(userId) as Array<{
    id: number;
    activity_type: string;
    title: string;
    subject: string;
    created_at: string;
  }>;

  const fcMap = new Map(flashcardCounts.map((f) => [f.status, f.count]));

  res.json({
    summary: {
      totalResourcesUploaded: docsCount + recordingsCount,
      totalStudySessions: notesCount + recordingsCount + visualGuidesCount + quizAgg.attempted,
      totalQuizzesAttempted: quizAgg.attempted,
      averageQuizScore: quizAgg.avg_score !== null ? Math.round(quizAgg.avg_score) : null,
      highestQuizScore: quizAgg.high_score !== null ? Math.round(quizAgg.high_score) : null,
      totalFlashcardReviews: flashcardReviewTotal,
      studyStreakDays: calculateStudyStreak(userId),
    },
    quizPerformanceOverTime: quizHistory.map((q) => ({
      id: q.id,
      date: q.created_at.slice(0, 10),
      label: q.title.length > 22 ? `${q.title.slice(0, 20)}...` : q.title,
      title: q.title,
      subject: q.subject,
      score: q.score,
      totalQuestions: q.total_questions,
      percentage: Math.round(q.percentage),
    })),
    studyActivityOverTime: activityOverTimeRows.map((r) => ({
      date: r.day,
      label: new Date(`${r.day}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      count: r.count,
    })),
    flashcardProgress: {
      known: fcMap.get('known') ?? 0,
      needsRevision: fcMap.get('needs_revision') ?? 0,
      unreviewed: fcMap.get('new') ?? 0,
      total: (fcMap.get('known') ?? 0) + (fcMap.get('needs_revision') ?? 0) + (fcMap.get('new') ?? 0),
    },
    mostStudiedSubjects: subjectRows,
    activityHistory: activityHistory.map((a) => ({
      id: a.id,
      activityType: a.activity_type,
      title: a.title,
      subject: a.subject,
      createdAt: a.created_at,
    })),
  });
});

insightsRouter.get('/search', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) {
    res.json({ results: [] });
    return;
  }

  const pattern = `%${q}%`;

  const docs = db
    .prepare(
      `SELECT id, title, subject FROM documents
       WHERE user_id = ? AND (title LIKE ? OR subject LIKE ? OR extracted_text LIKE ?)
       LIMIT 4`
    )
    .all(userId, pattern, pattern, pattern) as Array<{ id: number; title: string; subject: string }>;

  const notes = db
    .prepare(
      `SELECT id, title, subject FROM notes
       WHERE user_id = ? AND (title LIKE ? OR structured_notes LIKE ?)
       LIMIT 4`
    )
    .all(userId, pattern, pattern) as Array<{ id: number; title: string; subject: string }>;

  const nodes = db
    .prepare(
      `SELECT id, label, subject FROM knowledge_nodes
       WHERE user_id = ? AND (label LIKE ? OR description LIKE ?)
       LIMIT 4`
    )
    .all(userId, pattern, pattern) as Array<{ id: number; label: string; subject: string }>;

  const quizzes = db
    .prepare(
      `SELECT id, title, subject FROM quizzes
       WHERE user_id = ? AND (title LIKE ? OR subject LIKE ?)
       LIMIT 3`
    )
    .all(userId, pattern, pattern) as Array<{ id: number; title: string; subject: string }>;

  const results = [
    ...docs.map((d) => ({ type: 'Document', title: d.title, subtitle: d.subject, route: '/documents' })),
    ...notes.map((n) => ({ type: 'AI Note', title: n.title, subtitle: n.subject, route: '/notes' })),
    ...nodes.map((n) => ({
      type: 'Concept',
      title: n.label,
      subtitle: n.subject,
      route: '/knowledge-graph',
    })),
    ...quizzes.map((qz) => ({ type: 'Quiz', title: qz.title, subtitle: qz.subject, route: '/quizzes' })),
  ];

  res.json({ results });
});

insightsRouter.get('/notifications', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const items: Array<{ id: string; title: string; detail: string; route: string; createdAt: string }> = [];

  const revCount = (
    db
      .prepare("SELECT COUNT(*) AS c FROM flashcards WHERE user_id = ? AND status = 'needs_revision'")
      .get(userId) as { c: number }
  ).c;

  if (revCount > 0) {
    items.push({
      id: 'flashcards-revise',
      title: `${revCount} flashcard${revCount > 1 ? 's' : ''} marked for revision`,
      detail: 'Open Flashcards to practice concepts that need another review.',
      route: '/flashcards',
      createdAt: new Date().toISOString(),
    });
  }

  const recent = db
    .prepare(
      `SELECT id, activity_type, title, subject, created_at
       FROM user_activity
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`
    )
    .all(userId) as Array<{
    id: number;
    activity_type: string;
    title: string;
    subject: string;
    created_at: string;
  }>;

  for (const r of recent) {
    let route = '/';
    if (r.activity_type.includes('document') || r.activity_type.includes('summary')) route = '/documents';
    else if (r.activity_type.includes('quiz')) route = '/quizzes';
    else if (r.activity_type.includes('graph')) route = '/knowledge-graph';
    else if (r.activity_type.includes('notes')) route = '/notes';
    else if (r.activity_type.includes('flashcard')) route = '/flashcards';
    else if (r.activity_type.includes('visual')) route = '/visual-learning';

    items.push({
      id: `act-${r.id}`,
      title: r.title,
      detail: r.subject,
      route,
      createdAt: r.created_at,
    });
  }

  res.json({ notifications: items });
});
