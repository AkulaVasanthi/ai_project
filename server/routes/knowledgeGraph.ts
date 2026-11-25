import { Router } from 'express';
import { z } from 'zod';
import { db, logUserActivity } from '../db/database.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { formatAiError, generateStructuredJson, Type } from '../services/aiProvider.ts';

export const knowledgeGraphRouter = Router();
knowledgeGraphRouter.use(requireAuth);

const generateGraphSchema = z.object({
  documentId: z.number().int().positive().optional().nullable(),
  customTopic: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(80).optional(),
  replaceDocumentGraph: z.boolean().optional(),
});

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

knowledgeGraphRouter.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const documentId = req.query.documentId ? Number(req.query.documentId) : null;
  const subject = typeof req.query.subject === 'string' ? req.query.subject.trim() : '';

  const nodeRows = db
    .prepare(
      `SELECT n.id, n.document_id, n.subject, n.label, n.category, n.description,
              n.pos_x, n.pos_y, n.created_at, d.title AS document_title
       FROM knowledge_nodes n
       LEFT JOIN documents d ON d.id = n.document_id
       WHERE n.user_id = ?
       ORDER BY n.id ASC`
    )
    .all(userId) as Array<{
    id: number;
    document_id: number | null;
    subject: string;
    label: string;
    category: string;
    description: string;
    pos_x: number;
    pos_y: number;
    created_at: string;
    document_title: string | null;
  }>;

  const filteredNodes = nodeRows.filter((n) => {
    if (documentId && Number.isInteger(documentId) && n.document_id !== documentId) {
      return false;
    }
    if (subject && subject !== 'All' && n.subject.toLowerCase() !== subject.toLowerCase()) {
      return false;
    }
    return true;
  });

  const visibleIds = new Set(filteredNodes.map((n) => n.id));

  const edgeRows = db
    .prepare(
      `SELECT id, document_id, source_node_id, target_node_id, relationship_label
       FROM knowledge_edges
       WHERE user_id = ?`
    )
    .all(userId) as Array<{
    id: number;
    document_id: number | null;
    source_node_id: number;
    target_node_id: number;
    relationship_label: string;
  }>;

  const filteredEdges = edgeRows.filter(
    (e) => visibleIds.has(e.source_node_id) && visibleIds.has(e.target_node_id)
  );

  const subjects = Array.from(new Set(nodeRows.map((n) => n.subject))).sort();

  res.json({
    nodes: filteredNodes.map((n) => ({
      id: String(n.id),
      dbId: n.id,
      documentId: n.document_id,
      documentTitle: n.document_title || 'Custom Topic',
      subject: n.subject,
      label: n.label,
      category: n.category,
      description: n.description,
      position: { x: n.pos_x, y: n.pos_y },
      createdAt: n.created_at,
    })),
    edges: filteredEdges.map((e) => ({
      id: `edge-${e.id}`,
      dbId: e.id,
      documentId: e.document_id,
      source: String(e.source_node_id),
      target: String(e.target_node_id),
      label: e.relationship_label,
    })),
    subjects,
    totalNodes: nodeRows.length,
    totalEdges: edgeRows.length,
  });
});

knowledgeGraphRouter.post('/generate', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const parsed = generateGraphSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid graph request.' });
    return;
  }

  const { documentId, customTopic, replaceDocumentGraph } = parsed.data;
  let sourceText = '';
  let sourceTitle = customTopic || '';
  let subject = parsed.data.subject || 'General';
  let resolvedDocId: number | null = null;

  if (documentId) {
    const doc = db
      .prepare('SELECT id, title, subject, extracted_text FROM documents WHERE id = ? AND user_id = ?')
      .get(documentId, userId) as
      | { id: number; title: string; subject: string; extracted_text: string }
      | undefined;

    if (!doc) {
      res.status(404).json({ error: 'Selected document not found.' });
      return;
    }

    resolvedDocId = doc.id;
    sourceTitle = doc.title;
    subject = doc.subject;
    sourceText = doc.extracted_text.slice(0, 24000);
  } else if (!customTopic || customTopic.trim().length < 2) {
    res.status(400).json({
      error: 'Please select an uploaded document or enter a topic to generate a knowledge graph.',
    });
    return;
  }

  try {
    const prompt = resolvedDocId
      ? `Extract an educational concept knowledge graph from the document "${sourceTitle}" (Subject: ${subject}).
Produce 8 to 14 distinct, non-duplicate concepts and meaningful directed parent-to-child or conceptual relationships.
Use clear hierarchy levels: level 0 for the root topic, level 1 for primary branches, level 2 for sub-concepts/methods, level 3 for concrete techniques/applications.

Document text:
${sourceText}`
      : `Create an educational concept knowledge graph for the topic "${sourceTitle}" (Subject: ${subject}).
Produce 8 to 14 distinct, non-duplicate concepts and meaningful directed parent-to-child or conceptual relationships.
Use clear hierarchy levels: level 0 for the root topic, level 1 for primary branches, level 2 for sub-concepts/methods, level 3 for concrete techniques/applications.`;

    const extracted = await generateStructuredJson<{
      concepts: Array<{
        label: string;
        category: 'core' | 'subtopic' | 'method' | 'application' | 'theory';
        description: string;
        level: number;
      }>;
      relationships: Array<{
        sourceLabel: string;
        targetLabel: string;
        relationshipLabel: string;
      }>;
    }>(
      prompt,
      {
        type: Type.OBJECT,
        properties: {
          concepts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: 'Concise concept title (2-4 words).' },
                category: {
                  type: Type.STRING,
                  description: 'One of: core, subtopic, method, application, theory',
                },
                description: {
                  type: Type.STRING,
                  description: 'Clear 2-3 sentence academic explanation of the concept.',
                },
                level: {
                  type: Type.INTEGER,
                  description: 'Hierarchy depth from 0 (root) to 3 (leaf).',
                },
              },
              required: ['label', 'category', 'description', 'level'],
            },
          },
          relationships: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sourceLabel: { type: Type.STRING },
                targetLabel: { type: Type.STRING },
                relationshipLabel: {
                  type: Type.STRING,
                  description: 'Short verb phrase such as includes, enables, applies, requires, contrasts with.',
                },
              },
              required: ['sourceLabel', 'targetLabel', 'relationshipLabel'],
            },
          },
        },
        required: ['concepts', 'relationships'],
      },
      'You are a knowledge graph architect for Computer Science and academic learning. Avoid duplicate nodes and ensure every relationship connects two concepts present in the concepts list.'
    );

    const validCategories = new Set(['core', 'subtopic', 'method', 'application', 'theory']);

    const saveGraphTx = db.transaction(() => {
      if (replaceDocumentGraph && resolvedDocId) {
        db.prepare('DELETE FROM knowledge_nodes WHERE user_id = ? AND document_id = ?').run(
          userId,
          resolvedDocId
        );
      }

      const existingNodes = db
        .prepare('SELECT id, normalized_label, pos_x, pos_y FROM knowledge_nodes WHERE user_id = ?')
        .all(userId) as Array<{ id: number; normalized_label: string; pos_x: number; pos_y: number }>;

      const labelToId = new Map<string, number>();
      let maxExistingY = 0;
      for (const existing of existingNodes) {
        labelToId.set(existing.normalized_label, existing.id);
        if (existing.pos_y > maxExistingY) maxExistingY = existing.pos_y;
      }

      const yOffset = existingNodes.length > 0 && !replaceDocumentGraph ? maxExistingY + 220 : 40;

      // Group new concepts by hierarchy level for clean horizontal spacing
      const levelBuckets = new Map<number, typeof extracted.concepts>();
      for (const concept of extracted.concepts || []) {
        const lvl = Math.max(0, Math.min(3, Number(concept.level) || 0));
        const bucket = levelBuckets.get(lvl) || [];
        bucket.push(concept);
        levelBuckets.set(lvl, bucket);
      }

      const insertNode = db.prepare(
        `INSERT INTO knowledge_nodes
         (user_id, document_id, subject, label, normalized_label, category, description, pos_x, pos_y)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      let createdNodes = 0;
      for (const [level, conceptsAtLevel] of Array.from(levelBuckets.entries()).sort((a, b) => a[0] - b[0])) {
        const spacingX = 270;
        const totalWidth = (conceptsAtLevel.length - 1) * spacingX;
        const startX = 480 - totalWidth / 2;

        conceptsAtLevel.forEach((concept, idx) => {
          const norm = normalizeLabel(concept.label);
          if (!norm) return;
          if (labelToId.has(norm)) return;

          const category = validCategories.has(concept.category) ? concept.category : 'subtopic';
          const posX = Math.round(startX + idx * spacingX);
          const posY = Math.round(yOffset + level * 165);

          const info = insertNode.run(
            userId,
            resolvedDocId,
            subject,
            concept.label.trim().slice(0, 80),
            norm,
            category,
            concept.description.trim().slice(0, 500),
            posX,
            posY
          );
          labelToId.set(norm, Number(info.lastInsertRowid));
          createdNodes++;
        });
      }

      const insertEdge = db.prepare(
        `INSERT INTO knowledge_edges (user_id, document_id, source_node_id, target_node_id, relationship_label)
         VALUES (?, ?, ?, ?, ?)`
      );
      const checkEdge = db.prepare(
        `SELECT id FROM knowledge_edges WHERE user_id = ? AND source_node_id = ? AND target_node_id = ?`
      );

      let createdEdges = 0;
      for (const rel of extracted.relationships || []) {
        const srcId = labelToId.get(normalizeLabel(rel.sourceLabel));
        const tgtId = labelToId.get(normalizeLabel(rel.targetLabel));
        if (!srcId || !tgtId || srcId === tgtId) continue;

        const dup = checkEdge.get(userId, srcId, tgtId);
        if (dup) continue;

        insertEdge.run(
          userId,
          resolvedDocId,
          srcId,
          tgtId,
          (rel.relationshipLabel || 'relates to').trim().slice(0, 48)
        );
        createdEdges++;
      }

      return { createdNodes, createdEdges };
    });

    const stats = saveGraphTx();

    logUserActivity(
      userId,
      'knowledge_graph_generated',
      `Built concept graph for ${sourceTitle}`,
      subject,
      { documentId: resolvedDocId, ...stats }
    );

    res.status(201).json({
      success: true,
      ...stats,
      message: `Added ${stats.createdNodes} concepts and ${stats.createdEdges} relationships.`,
    });
  } catch (err) {
    res.status(502).json({ error: formatAiError(err) });
  }
});

knowledgeGraphRouter.patch('/nodes/:id/position', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const nodeId = Number(req.params.id);
  if (!Number.isInteger(nodeId)) {
    res.status(400).json({ error: 'Invalid node ID.' });
    return;
  }

  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid node coordinates.' });
    return;
  }

  const result = db
    .prepare('UPDATE knowledge_nodes SET pos_x = ?, pos_y = ? WHERE id = ? AND user_id = ?')
    .run(parsed.data.x, parsed.data.y, nodeId, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Node not found.' });
    return;
  }

  res.json({ success: true });
});

knowledgeGraphRouter.delete('/nodes/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const nodeId = Number(req.params.id);
  if (!Number.isInteger(nodeId)) {
    res.status(400).json({ error: 'Invalid node ID.' });
    return;
  }

  const result = db
    .prepare('DELETE FROM knowledge_nodes WHERE id = ? AND user_id = ?')
    .run(nodeId, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Node not found.' });
    return;
  }

  res.json({ success: true });
});
