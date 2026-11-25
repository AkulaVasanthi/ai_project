import { Router } from 'express';
import { z } from 'zod';
import { db, logUserActivity, safeJsonParse } from '../db/database.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { formatAiError, generateStructuredJson, Type } from '../services/aiProvider.ts';

export const practiceRouter = Router();
practiceRouter.use(requireAuth);

const generateQuizSchema = z.object({
  documentId: z.number().int().positive().optional().nullable(),
  topic: z.string().trim().max(160).optional(),
  subject: z.string().trim().max(80).optional(),
  questionCount: z.number().int().min(3).max(12).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

const submitQuizSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.number().int().positive(),
      selectedIndex: z.number().int().min(0).max(3),
    })
  ),
});

const generateFlashcardsSchema = z.object({
  documentId: z.number().int().positive().optional().nullable(),
  topic: z.string().trim().max(160).optional(),
  subject: z.string().trim().max(80).optional(),
  count: z.number().int().min(4).max(20).optional(),
});

const manualFlashcardSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  front: z.string().trim().min(2).max(400),
  back: z.string().trim().min(2).max(1000),
  documentId: z.number().int().positive().optional().nullable(),
});

const reviewFlashcardSchema = z.object({
  result: z.enum(['known', 'needs_revision']),
});

/* ---------------- Module 12A: Quizzes ---------------- */

practiceRouter.get('/quizzes', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const quizzes = db
    .prepare(
      `SELECT q.id, q.document_id, q.title, q.subject, q.difficulty, q.created_at,
              d.title AS document_title,
              (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
              (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.user_id = q.user_id) AS attempt_count,
              (SELECT MAX(qa.percentage) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.user_id = q.user_id) AS best_score
       FROM quizzes q
       LEFT JOIN documents d ON d.id = q.document_id
       WHERE q.user_id = ?
       ORDER BY q.created_at DESC`
    )
    .all(userId) as Array<{
    id: number;
    document_id: number | null;
    title: string;
    subject: string;
    difficulty: string;
    created_at: string;
    document_title: string | null;
    question_count: number;
    attempt_count: number;
    best_score: number | null;
  }>;

  const recentAttempts = db
    .prepare(
      `SELECT qa.id, qa.quiz_id, qa.score, qa.total_questions, qa.percentage, qa.created_at,
              q.title AS quiz_title, q.subject
       FROM quiz_attempts qa
       INNER JOIN quizzes q ON q.id = qa.quiz_id
       WHERE qa.user_id = ?
       ORDER BY qa.created_at DESC
       LIMIT 15`
    )
    .all(userId) as Array<{
    id: number;
    quiz_id: number;
    score: number;
    total_questions: number;
    percentage: number;
    created_at: string;
    quiz_title: string;
    subject: string;
  }>;

  res.json({
    quizzes: quizzes.map((q) => ({
      id: q.id,
      documentId: q.document_id,
      documentTitle: q.document_title,
      title: q.title,
      subject: q.subject,
      difficulty: q.difficulty,
      questionCount: q.question_count,
      attemptCount: q.attempt_count,
      bestScore: q.best_score !== null ? Math.round(q.best_score) : null,
      createdAt: q.created_at,
    })),
    recentAttempts: recentAttempts.map((a) => ({
      id: a.id,
      quizId: a.quiz_id,
      quizTitle: a.quiz_title,
      subject: a.subject,
      score: a.score,
      totalQuestions: a.total_questions,
      percentage: Math.round(a.percentage),
      createdAt: a.created_at,
    })),
  });
});

practiceRouter.get('/quizzes/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const quizId = Number(req.params.id);
  if (!Number.isInteger(quizId)) {
    res.status(400).json({ error: 'Invalid quiz ID.' });
    return;
  }

  const quiz = db
    .prepare(
      `SELECT q.id, q.document_id, q.title, q.subject, q.difficulty, q.created_at,
              d.title AS document_title
       FROM quizzes q
       LEFT JOIN documents d ON d.id = q.document_id
       WHERE q.id = ? AND q.user_id = ?`
    )
    .get(quizId, userId) as
    | {
        id: number;
        document_id: number | null;
        title: string;
        subject: string;
        difficulty: string;
        created_at: string;
        document_title: string | null;
      }
    | undefined;

  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  const questions = db
    .prepare(
      `SELECT id, question_order, question_text, options_json, correct_index, explanation
       FROM quiz_questions
       WHERE quiz_id = ?
       ORDER BY question_order ASC`
    )
    .all(quizId) as Array<{
    id: number;
    question_order: number;
    question_text: string;
    options_json: string;
    correct_index: number;
    explanation: string;
  }>;

  const attempts = db
    .prepare(
      `SELECT id, score, total_questions, percentage, created_at
       FROM quiz_attempts
       WHERE quiz_id = ? AND user_id = ?
       ORDER BY created_at DESC`
    )
    .all(quizId, userId) as Array<{
    id: number;
    score: number;
    total_questions: number;
    percentage: number;
    created_at: string;
  }>;

  res.json({
    quiz: {
      id: quiz.id,
      documentId: quiz.document_id,
      documentTitle: quiz.document_title,
      title: quiz.title,
      subject: quiz.subject,
      difficulty: quiz.difficulty,
      createdAt: quiz.created_at,
      questions: questions.map((q) => ({
        id: q.id,
        order: q.question_order,
        questionText: q.question_text,
        options: safeJsonParse<string[]>(q.options_json, []),
      })),
    },
    attempts: attempts.map((a) => ({
      id: a.id,
      score: a.score,
      totalQuestions: a.total_questions,
      percentage: Math.round(a.percentage),
      createdAt: a.created_at,
    })),
  });
});

practiceRouter.post('/quizzes/generate', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const parsed = generateQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid quiz request.' });
    return;
  }

  const count = parsed.data.questionCount ?? 5;
  const difficulty = parsed.data.difficulty ?? 'intermediate';
  let sourceText = '';
  let title = parsed.data.topic?.trim() || '';
  let subject = parsed.data.subject?.trim() || 'Computer Science';
  let resolvedDocId: number | null = null;

  if (parsed.data.documentId) {
    const doc = db
      .prepare('SELECT id, title, subject, extracted_text FROM documents WHERE id = ? AND user_id = ?')
      .get(parsed.data.documentId, userId) as
      | { id: number; title: string; subject: string; extracted_text: string }
      | undefined;

    if (!doc) {
      res.status(404).json({ error: 'Selected document not found.' });
      return;
    }

    resolvedDocId = doc.id;
    title = title || `${doc.title} — Practice Quiz`;
    subject = doc.subject;
    sourceText = doc.extracted_text.slice(0, 24000);
  }

  if (!title) {
    res.status(400).json({ error: 'Select a document or specify a topic to generate a quiz.' });
    return;
  }

  try {
    const generated = await generateStructuredJson<{
      quizTitle: string;
      questions: Array<{
        questionText: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }>;
    }>(
      `Generate exactly ${count} multiple-choice questions at "${difficulty}" difficulty for "${title}" (Subject: ${subject}).
Each question MUST have exactly 4 distinct answer options, 1 single correctIndex (0, 1, 2, or 3), and a concise explanation stating why the answer is correct.
${sourceText ? `\nGround all questions in this uploaded study material:\n${sourceText}` : ''}`,
      {
        type: Type.OBJECT,
        properties: {
          quizTitle: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionText: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Exactly 4 answer choices.',
                },
                correctIndex: {
                  type: Type.INTEGER,
                  description: 'Zero-based index (0 to 3) of the single correct option.',
                },
                explanation: { type: Type.STRING },
              },
              required: ['questionText', 'options', 'correctIndex', 'explanation'],
            },
          },
        },
        required: ['quizTitle', 'questions'],
      },
      'You are an academic exam designer. Produce unambiguous, factually accurate 4-option multiple-choice questions.'
    );

    const validQuestions = (generated.questions || [])
      .filter((q) => Array.isArray(q.options) && q.options.length === 4)
      .slice(0, count);

    if (validQuestions.length === 0) {
      res.status(502).json({ error: 'Could not generate valid multiple-choice questions. Please retry.' });
      return;
    }

    const createTx = db.transaction(() => {
      const quizInsert = db
        .prepare(
          `INSERT INTO quizzes (user_id, document_id, title, subject, difficulty)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(userId, resolvedDocId, generated.quizTitle || title, subject, difficulty);

      const quizId = Number(quizInsert.lastInsertRowid);
      const insertQuestion = db.prepare(
        `INSERT INTO quiz_questions
         (quiz_id, question_order, question_text, options_json, correct_index, explanation)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      validQuestions.forEach((q, idx) => {
        const safeCorrect = Math.max(0, Math.min(3, Number(q.correctIndex) || 0));
        insertQuestion.run(
          quizId,
          idx + 1,
          q.questionText.trim(),
          JSON.stringify(q.options.map((o) => String(o).trim())),
          safeCorrect,
          q.explanation.trim()
        );
      });

      return quizId;
    });

    const quizId = createTx();

    logUserActivity(userId, 'quiz_created', `Generated quiz: ${generated.quizTitle || title}`, subject, {
      quizId,
      questionCount: validQuestions.length,
    });

    res.status(201).json({ quizId });
  } catch (err) {
    res.status(502).json({ error: formatAiError(err) });
  }
});

practiceRouter.post('/quizzes/:id/submit', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const quizId = Number(req.params.id);
  if (!Number.isInteger(quizId)) {
    res.status(400).json({ error: 'Invalid quiz ID.' });
    return;
  }

  const parsed = submitQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid quiz submission payload.' });
    return;
  }

  const quiz = db
    .prepare('SELECT id, title, subject FROM quizzes WHERE id = ? AND user_id = ?')
    .get(quizId, userId) as { id: number; title: string; subject: string } | undefined;

  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  const questions = db
    .prepare(
      `SELECT id, question_text, options_json, correct_index, explanation
       FROM quiz_questions WHERE quiz_id = ? ORDER BY question_order ASC`
    )
    .all(quizId) as Array<{
    id: number;
    question_text: string;
    options_json: string;
    correct_index: number;
    explanation: string;
  }>;

  const answerMap = new Map<number, number>();
  for (const ans of parsed.data.answers) {
    answerMap.set(ans.questionId, ans.selectedIndex);
  }

  let score = 0;
  const review = questions.map((q) => {
    const selectedIndex = answerMap.has(q.id) ? answerMap.get(q.id)! : -1;
    const isCorrect = selectedIndex === q.correct_index;
    if (isCorrect) score++;
    return {
      questionId: q.id,
      questionText: q.question_text,
      options: safeJsonParse<string[]>(q.options_json, []),
      selectedIndex,
      correctIndex: q.correct_index,
      isCorrect,
      explanation: q.explanation,
    };
  });

  const totalQuestions = questions.length;
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  const attemptInsert = db
    .prepare(
      `INSERT INTO quiz_attempts (quiz_id, user_id, score, total_questions, percentage, answers_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(quizId, userId, score, totalQuestions, percentage, JSON.stringify(review));

  logUserActivity(
    userId,
    'quiz_completed',
    `Completed ${quiz.title} (${score}/${totalQuestions}, ${percentage}%)`,
    quiz.subject,
    { quizId, score, totalQuestions, percentage }
  );

  res.status(201).json({
    attempt: {
      id: Number(attemptInsert.lastInsertRowid),
      quizId,
      score,
      totalQuestions,
      percentage,
      review,
      createdAt: new Date().toISOString(),
    },
  });
});

practiceRouter.delete('/quizzes/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const quizId = Number(req.params.id);
  if (!Number.isInteger(quizId)) {
    res.status(400).json({ error: 'Invalid quiz ID.' });
    return;
  }

  const result = db.prepare('DELETE FROM quizzes WHERE id = ? AND user_id = ?').run(quizId, userId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  res.json({ success: true });
});

/* ---------------- Module 12B: Flashcards ---------------- */

practiceRouter.get('/flashcards', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const subject = typeof req.query.subject === 'string' ? req.query.subject : '';

  const rows = db
    .prepare(
      `SELECT f.id, f.document_id, f.subject, f.front, f.back, f.status,
              f.review_count, f.last_reviewed_at, f.created_at, d.title AS document_title
       FROM flashcards f
       LEFT JOIN documents d ON d.id = f.document_id
       WHERE f.user_id = ?
       ORDER BY CASE f.status WHEN 'needs_revision' THEN 0 WHEN 'new' THEN 1 ELSE 2 END, f.created_at DESC`
    )
    .all(userId) as Array<{
    id: number;
    document_id: number | null;
    subject: string;
    front: string;
    back: string;
    status: 'new' | 'known' | 'needs_revision';
    review_count: number;
    last_reviewed_at: string | null;
    created_at: string;
    document_title: string | null;
  }>;

  const filtered = rows.filter((c) => {
    if (status && status !== 'all' && c.status !== status) return false;
    if (subject && subject !== 'All' && c.subject.toLowerCase() !== subject.toLowerCase()) return false;
    return true;
  });

  const stats = {
    total: rows.length,
    known: rows.filter((r) => r.status === 'known').length,
    needsRevision: rows.filter((r) => r.status === 'needs_revision').length,
    unreviewed: rows.filter((r) => r.status === 'new').length,
  };

  const subjects = Array.from(new Set(rows.map((r) => r.subject))).sort();

  res.json({
    flashcards: filtered.map((c) => ({
      id: c.id,
      documentId: c.document_id,
      documentTitle: c.document_title,
      subject: c.subject,
      front: c.front,
      back: c.back,
      status: c.status,
      reviewCount: c.review_count,
      lastReviewedAt: c.last_reviewed_at,
      createdAt: c.created_at,
    })),
    stats,
    subjects,
  });
});

practiceRouter.post('/flashcards/generate', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const parsed = generateFlashcardsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid flashcard request.' });
    return;
  }

  const count = parsed.data.count ?? 8;
  let sourceText = '';
  let topic = parsed.data.topic?.trim() || '';
  let subject = parsed.data.subject?.trim() || 'Computer Science';
  let resolvedDocId: number | null = null;

  if (parsed.data.documentId) {
    const doc = db
      .prepare('SELECT id, title, subject, extracted_text FROM documents WHERE id = ? AND user_id = ?')
      .get(parsed.data.documentId, userId) as
      | { id: number; title: string; subject: string; extracted_text: string }
      | undefined;

    if (!doc) {
      res.status(404).json({ error: 'Selected document not found.' });
      return;
    }

    resolvedDocId = doc.id;
    topic = topic || doc.title;
    subject = doc.subject;
    sourceText = doc.extracted_text.slice(0, 24000);
  }

  if (!topic) {
    res.status(400).json({ error: 'Select a document or enter a topic to generate flashcards.' });
    return;
  }

  try {
    const generated = await generateStructuredJson<{
      cards: Array<{ front: string; back: string }>;
    }>(
      `Generate ${count} high-retention study flashcards for "${topic}" (Subject: ${subject}).
Each flashcard must have a crisp question or key term on the front, and a clear, accurate answer or definition on the back.
${sourceText ? `\nGround the flashcards in this uploaded study material:\n${sourceText}` : ''}`,
      {
        type: Type.OBJECT,
        properties: {
          cards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING, description: 'Question or term.' },
                back: { type: Type.STRING, description: 'Concise answer or definition.' },
              },
              required: ['front', 'back'],
            },
          },
        },
        required: ['cards'],
      },
      'You are an educational spaced-repetition coach. Create atomic, memorable flashcards.'
    );

    const insertStmt = db.prepare(
      `INSERT INTO flashcards (user_id, document_id, subject, front, back, status)
       VALUES (?, ?, ?, ?, ?, 'new')`
    );

    const cardsToSave = (generated.cards || []).slice(0, count);
    const insertTx = db.transaction(() => {
      for (const card of cardsToSave) {
        if (!card.front?.trim() || !card.back?.trim()) continue;
        insertStmt.run(
          userId,
          resolvedDocId,
          subject,
          card.front.trim().slice(0, 400),
          card.back.trim().slice(0, 1000)
        );
      }
    });
    insertTx();

    logUserActivity(
      userId,
      'flashcards_generated',
      `Generated ${cardsToSave.length} flashcards for ${topic}`,
      subject,
      { count: cardsToSave.length, documentId: resolvedDocId }
    );

    res.status(201).json({ success: true, createdCount: cardsToSave.length });
  } catch (err) {
    res.status(502).json({ error: formatAiError(err) });
  }
});

practiceRouter.post('/flashcards', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const parsed = manualFlashcardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid flashcard fields.' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO flashcards (user_id, document_id, subject, front, back, status)
       VALUES (?, ?, ?, ?, ?, 'new')`
    )
    .run(
      userId,
      parsed.data.documentId || null,
      parsed.data.subject,
      parsed.data.front,
      parsed.data.back
    );

  logUserActivity(userId, 'flashcard_created', `Added flashcard in ${parsed.data.subject}`, parsed.data.subject);

  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

practiceRouter.post('/flashcards/:id/review', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const cardId = Number(req.params.id);
  if (!Number.isInteger(cardId)) {
    res.status(400).json({ error: 'Invalid flashcard ID.' });
    return;
  }

  const parsed = reviewFlashcardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid review status.' });
    return;
  }

  const card = db
    .prepare('SELECT id, subject, front FROM flashcards WHERE id = ? AND user_id = ?')
    .get(cardId, userId) as { id: number; subject: string; front: string } | undefined;

  if (!card) {
    res.status(404).json({ error: 'Flashcard not found.' });
    return;
  }

  db.prepare(
    `UPDATE flashcards
     SET status = ?, review_count = review_count + 1, last_reviewed_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(parsed.data.result, cardId, userId);

  db.prepare(
    `INSERT INTO flashcard_reviews (flashcard_id, user_id, result) VALUES (?, ?, ?)`
  ).run(cardId, userId, parsed.data.result);

  logUserActivity(
    userId,
    'flashcard_reviewed',
    `Marked flashcard as ${parsed.data.result === 'known' ? 'Known' : 'Needs Revision'}`,
    card.subject,
    { flashcardId: cardId, result: parsed.data.result }
  );

  res.json({ success: true, status: parsed.data.result });
});

practiceRouter.delete('/flashcards/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const cardId = Number(req.params.id);
  if (!Number.isInteger(cardId)) {
    res.status(400).json({ error: 'Invalid flashcard ID.' });
    return;
  }

  const result = db
    .prepare('DELETE FROM flashcards WHERE id = ? AND user_id = ?')
    .run(cardId, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Flashcard not found.' });
    return;
  }

  res.json({ success: true });
});
