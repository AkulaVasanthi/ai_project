import { Router } from 'express';
import { z } from 'zod';
import { db, logUserActivity, safeJsonParse } from '../db/database.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import {
  formatAiError,
  generateStructuredJson,
  Type,
} from '../services/aiProvider.ts';
import { retrieveRelevantChunks } from '../services/vectorStore.ts';

export const assistantVisualRouter = Router();
assistantVisualRouter.use(requireAuth);

const createConvSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

const renameConvSchema = z.object({
  title: z.string().trim().min(1, 'Conversation title cannot be empty.').max(120),
});

const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Please enter a message.').max(3000),
  documentId: z.number().int().positive().optional().nullable(),
});

const visualGuideSchema = z.object({
  documentId: z.number().int().positive().optional().nullable(),
  topic: z.string().trim().max(180).optional(),
  subject: z.string().trim().max(80).optional(),
});

/* ---------------- Module 10: AI Assistant ---------------- */

assistantVisualRouter.get('/conversations', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c
       WHERE c.user_id = ?
       ORDER BY c.updated_at DESC`
    )
    .all(userId) as Array<{
    id: number;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
  }>;

  res.json({
    conversations: rows.map((r) => ({
      id: r.id,
      title: r.title,
      messageCount: r.message_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

assistantVisualRouter.post('/conversations', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const parsed = createConvSchema.safeParse(req.body || {});
  const title = parsed.success && parsed.data.title ? parsed.data.title : 'New Study Chat';

  const info = db
    .prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)')
    .run(userId, title);

  const row = db
    .prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?')
    .get(info.lastInsertRowid) as {
    id: number;
    title: string;
    created_at: string;
    updated_at: string;
  };

  res.status(201).json({
    conversation: {
      id: row.id,
      title: row.title,
      messageCount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

assistantVisualRouter.patch('/conversations/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const convId = Number(req.params.id);
  if (!Number.isInteger(convId)) {
    res.status(400).json({ error: 'Invalid conversation ID.' });
    return;
  }

  const parsed = renameConvSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid title.' });
    return;
  }

  const result = db
    .prepare(
      `UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
    )
    .run(parsed.data.title, convId, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  res.json({ success: true, title: parsed.data.title });
});

assistantVisualRouter.delete('/conversations/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const convId = Number(req.params.id);
  if (!Number.isInteger(convId)) {
    res.status(400).json({ error: 'Invalid conversation ID.' });
    return;
  }

  const result = db
    .prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
    .run(convId, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  res.json({ success: true });
});

assistantVisualRouter.get('/conversations/:id/messages', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const convId = Number(req.params.id);
  if (!Number.isInteger(convId)) {
    res.status(400).json({ error: 'Invalid conversation ID.' });
    return;
  }

  const conv = db
    .prepare('SELECT id, title FROM conversations WHERE id = ? AND user_id = ?')
    .get(convId, userId);
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  const rows = db
    .prepare(
      `SELECT id, role, content, sources_json, grounding_mode, created_at
       FROM messages
       WHERE conversation_id = ? AND user_id = ?
       ORDER BY id ASC`
    )
    .all(convId, userId) as Array<{
    id: number;
    role: 'user' | 'assistant';
    content: string;
    sources_json: string;
    grounding_mode: string;
    created_at: string;
  }>;

  res.json({
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: safeJsonParse<
        Array<{ documentTitle: string; pageNumber: number; excerpt: string }>
      >(m.sources_json, []),
      groundingMode: m.grounding_mode,
      createdAt: m.created_at,
    })),
  });
});

assistantVisualRouter.post(
  '/conversations/:id/messages',
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const convId = Number(req.params.id);
    if (!Number.isInteger(convId)) {
      res.status(400).json({ error: 'Invalid conversation ID.' });
      return;
    }

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid message.' });
      return;
    }

    const conv = db
      .prepare('SELECT id, title FROM conversations WHERE id = ? AND user_id = ?')
      .get(convId, userId) as { id: number; title: string } | undefined;

    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    const { content, documentId } = parsed.data;

    try {
      // Save user message first
      const userMsgInsert = db
        .prepare(
          `INSERT INTO messages (conversation_id, user_id, role, content, sources_json, grounding_mode)
           VALUES (?, ?, 'user', ?, '[]', 'user')`
        )
        .run(convId, userId, content);

      // Retrieve recent conversation turns for continuity
      const historyRows = db
        .prepare(
          `SELECT role, content FROM messages
           WHERE conversation_id = ? AND user_id = ? AND id < ?
           ORDER BY id DESC LIMIT 6`
        )
        .all(convId, userId, userMsgInsert.lastInsertRowid) as Array<{
        role: string;
        content: string;
      }>;
      const historyText = historyRows
        .reverse()
        .map((h) => `${h.role === 'user' ? 'Student' : 'Tutor'}: ${h.content}`)
        .join('\n');

      // Retrieve RAG chunks from user's uploaded documents
      const chunks = await retrieveRelevantChunks(userId, content, {
        documentId: documentId || undefined,
        topK: 4,
      });
      const relevantChunks = chunks.filter((c) => c.score >= 0.15);

      // Retrieve matching Knowledge Graph concepts
      const graphNodes = db
        .prepare(
          `SELECT label, category, description, subject FROM knowledge_nodes WHERE user_id = ? LIMIT 40`
        )
        .all(userId) as Array<{
        label: string;
        category: string;
        description: string;
        subject: string;
      }>;
      const queryLower = content.toLowerCase();
      const matchedGraphNodes = graphNodes
        .filter(
          (n) =>
            queryLower.includes(n.label.toLowerCase()) ||
            n.label
              .toLowerCase()
              .split(/\s+/)
              .some((w) => w.length > 3 && queryLower.includes(w))
        )
        .slice(0, 5);

      const docContext =
        relevantChunks.length > 0
          ? relevantChunks
              .map(
                (c, i) =>
                  `[Doc ${i + 1}: "${c.documentTitle}", Page ${c.pageNumber}]\n${c.content}`
              )
              .join('\n\n')
          : 'No matching uploaded document excerpts were retrieved.';

      const graphContext =
        matchedGraphNodes.length > 0
          ? matchedGraphNodes
              .map((n) => `- ${n.label} (${n.category}, ${n.subject}): ${n.description}`)
              .join('\n')
          : 'No directly matching Knowledge Graph nodes found.';

      const aiResponse = await generateStructuredJson<{
        reply: string;
        groundingMode: 'documents' | 'hybrid' | 'general';
        usedDocumentIndices: number[];
      }>(
        `Conversation history:
${historyText || 'First turn in this conversation.'}

Retrieved study document excerpts:
${docContext}

Relevant Knowledge Graph concepts:
${graphContext}

Current student question:
${content}

Instructions:
- Provide a clear, well-structured educational answer using Markdown headings or bullet points when helpful.
- Clearly distinguish between information from the student's uploaded study documents and supplementary general academic knowledge.
- Set groundingMode to "documents" if answered strictly from uploaded excerpts, "hybrid" if combining uploaded documents with general AI explanation/examples, or "general" if no uploaded document covers the question.`,
        {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            groundingMode: {
              type: Type.STRING,
              description: 'One of: documents, hybrid, general',
            },
            usedDocumentIndices: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
          },
          required: ['reply', 'groundingMode', 'usedDocumentIndices'],
        },
        'You are the AI Learning Memory Graph study assistant. Help students deeply understand concepts, compare topics, prepare exam notes, and generate practice questions. Be transparent about what comes from their uploaded documents vs general knowledge.'
      );

      const usedSources = relevantChunks
        .filter((_, idx) => (aiResponse.usedDocumentIndices || []).includes(idx + 1) || aiResponse.groundingMode !== 'general')
        .map((c) => ({
          documentId: c.documentId,
          documentTitle: c.documentTitle,
          pageNumber: c.pageNumber,
          excerpt: c.content.slice(0, 180) + (c.content.length > 180 ? '...' : ''),
        }));

      const mode =
        aiResponse.groundingMode === 'documents' || aiResponse.groundingMode === 'hybrid'
          ? aiResponse.groundingMode
          : 'general';

      const assistantInsert = db
        .prepare(
          `INSERT INTO messages (conversation_id, user_id, role, content, sources_json, grounding_mode)
           VALUES (?, ?, 'assistant', ?, ?, ?)`
        )
        .run(convId, userId, aiResponse.reply, JSON.stringify(usedSources), mode);

      // Auto-title conversation on first user message if still default
      if (conv.title === 'New Study Chat' && historyRows.length === 0) {
        const autoTitle = content.length > 52 ? `${content.slice(0, 49)}...` : content;
        db.prepare(
          `UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(autoTitle, convId);
      } else {
        db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(
          convId
        );
      }

      logUserActivity(
        userId,
        'assistant_chat',
        `AI Assistant: ${content.slice(0, 64)}`,
        relevantChunks[0]?.subject || 'General',
        { conversationId: convId, groundingMode: mode }
      );

      res.json({
        userMessage: {
          id: Number(userMsgInsert.lastInsertRowid),
          role: 'user',
          content,
          sources: [],
          groundingMode: 'user',
          createdAt: new Date().toISOString(),
        },
        assistantMessage: {
          id: Number(assistantInsert.lastInsertRowid),
          role: 'assistant',
          content: aiResponse.reply,
          sources: usedSources,
          groundingMode: mode,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      res.status(502).json({ error: formatAiError(err) });
    }
  }
);

/* ---------------- Module 11: Visual Learning ---------------- */

function formatVisualGuideRow(row: {
  id: number;
  document_id: number | null;
  topic: string;
  subject: string;
  explanation: string;
  key_concepts_json: string;
  learning_flow_json: string;
  relationships_json: string;
  real_world_examples_json: string;
  important_points_json: string;
  revision_summary: string;
  created_at: string;
}) {
  return {
    id: row.id,
    documentId: row.document_id,
    topic: row.topic,
    subject: row.subject,
    explanation: row.explanation,
    keyConcepts: safeJsonParse<
      Array<{ title: string; role: string; summary: string }>
    >(row.key_concepts_json, []),
    learningFlow: safeJsonParse<
      Array<{ step: number; title: string; detail: string; outcome: string }>
    >(row.learning_flow_json, []),
    relationships: safeJsonParse<
      Array<{ from: string; relation: string; to: string; note: string }>
    >(row.relationships_json, []),
    realWorldExamples: safeJsonParse<
      Array<{ scenario: string; application: string }>
    >(row.real_world_examples_json, []),
    importantPoints: safeJsonParse<string[]>(row.important_points_json, []),
    revisionSummary: row.revision_summary,
    createdAt: row.created_at,
  };
}

assistantVisualRouter.get('/visual-learning', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = db
    .prepare('SELECT * FROM visual_guides WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as Array<Parameters<typeof formatVisualGuideRow>[0]>;

  res.json({ guides: rows.map(formatVisualGuideRow) });
});

assistantVisualRouter.post('/visual-learning/generate', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const parsed = visualGuideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid visual learning request.' });
    return;
  }

  let docContext = '';
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
    docContext = doc.extracted_text.slice(0, 22000);
  }

  if (!topic) {
    res.status(400).json({ error: 'Please select a document or enter a topic to visualize.' });
    return;
  }

  try {
    const generated = await generateStructuredJson<{
      explanation: string;
      keyConcepts: Array<{ title: string; role: string; summary: string }>;
      learningFlow: Array<{ step: number; title: string; detail: string; outcome: string }>;
      relationships: Array<{ from: string; relation: string; to: string; note: string }>;
      realWorldExamples: Array<{ scenario: string; application: string }>;
      importantPoints: string[];
      revisionSummary: string;
    }>(
      `Build a structured Visual Learning Guide for the topic "${topic}" (Subject: ${subject}).
${docContext ? `\nBase your visual breakdown on this uploaded study material:\n${docContext}` : ''}

Ensure every section connects logically so a student can grasp the topic visually through concept blocks, a sequential 4-5 step learning flow, explicit relationship pairs, and real-world applications.`,
      {
        type: Type.OBJECT,
        properties: {
          explanation: {
            type: Type.STRING,
            description: 'Clear, intuitive plain-language explanation of the topic (1-2 paragraphs).',
          },
          keyConcepts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                role: { type: Type.STRING, description: 'Core Pillar, Mechanism, Technique, or Outcome' },
                summary: { type: Type.STRING },
              },
              required: ['title', 'role', 'summary'],
            },
          },
          learningFlow: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                step: { type: Type.INTEGER },
                title: { type: Type.STRING },
                detail: { type: Type.STRING },
                outcome: { type: Type.STRING },
              },
              required: ['step', 'title', 'detail', 'outcome'],
            },
          },
          relationships: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                from: { type: Type.STRING },
                relation: { type: Type.STRING },
                to: { type: Type.STRING },
                note: { type: Type.STRING },
              },
              required: ['from', 'relation', 'to', 'note'],
            },
          },
          realWorldExamples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scenario: { type: Type.STRING },
                application: { type: Type.STRING },
              },
              required: ['scenario', 'application'],
            },
          },
          importantPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          revisionSummary: {
            type: Type.STRING,
            description: 'Crisp high-retention revision recap for quick review before exams.',
          },
        },
        required: [
          'explanation',
          'keyConcepts',
          'learningFlow',
          'relationships',
          'realWorldExamples',
          'importantPoints',
          'revisionSummary',
        ],
      },
      'You are an instructional designer specializing in visual learning diagrams and structured conceptual breakdowns.'
    );

    const insert = db
      .prepare(
        `INSERT INTO visual_guides
         (user_id, document_id, topic, subject, explanation, key_concepts_json, learning_flow_json, relationships_json, real_world_examples_json, important_points_json, revision_summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        resolvedDocId,
        topic,
        subject,
        generated.explanation,
        JSON.stringify(generated.keyConcepts || []),
        JSON.stringify(generated.learningFlow || []),
        JSON.stringify(generated.relationships || []),
        JSON.stringify(generated.realWorldExamples || []),
        JSON.stringify(generated.importantPoints || []),
        generated.revisionSummary
      );

    const saved = db
      .prepare('SELECT * FROM visual_guides WHERE id = ? AND user_id = ?')
      .get(insert.lastInsertRowid, userId) as Parameters<typeof formatVisualGuideRow>[0];

    logUserActivity(userId, 'visual_guide_created', `Visual guide: ${topic}`, subject, {
      visualGuideId: saved.id,
    });

    res.status(201).json({ guide: formatVisualGuideRow(saved) });
  } catch (err) {
    res.status(502).json({ error: formatAiError(err) });
  }
});

assistantVisualRouter.delete('/visual-learning/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const guideId = Number(req.params.id);
  if (!Number.isInteger(guideId)) {
    res.status(400).json({ error: 'Invalid guide ID.' });
    return;
  }

  const result = db
    .prepare('DELETE FROM visual_guides WHERE id = ? AND user_id = ?')
    .run(guideId, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Visual guide not found.' });
    return;
  }

  res.json({ success: true });
});
