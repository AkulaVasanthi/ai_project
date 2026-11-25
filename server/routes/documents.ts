import crypto from 'crypto';
import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { extractText } from 'unpdf';
import { z } from 'zod';
import { db, logUserActivity, safeJsonParse, UPLOADS_DIR } from '../db/database.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { formatAiError, generateStructuredJson, Type } from '../services/aiProvider.ts';
import {
  cleanExtractedText,
  indexDocumentChunks,
  retrieveRelevantChunks,
  type PageContent,
} from '../services/vectorStore.ts';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const ALLOWED_EXTS = new Set(['.pdf', '.txt', '.md']);
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/octet-stream',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.has(ext) && !ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error('Only PDF, TXT, and Markdown files up to 20 MB are supported.'));
      return;
    }
    cb(null, true);
  },
});

const ragQaSchema = z.object({
  question: z.string().trim().min(2, 'Please enter a question.').max(1200),
  documentId: z.number().int().positive().optional().nullable(),
});

documentsRouter.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const subject = typeof req.query.subject === 'string' ? req.query.subject.trim() : '';

  const rows = db
    .prepare(
      `SELECT d.id, d.title, d.original_filename, d.mime_type, d.file_size, d.subject,
              d.page_count, d.processing_status, d.chunk_count, d.created_at,
              substr(d.extracted_text, 1, 320) AS text_preview,
              CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_summary
       FROM documents d
       LEFT JOIN document_summaries s ON s.document_id = d.id
       WHERE d.user_id = ?
       ORDER BY d.created_at DESC`
    )
    .all(userId) as Array<{
    id: number;
    title: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
    subject: string;
    page_count: number;
    processing_status: string;
    chunk_count: number;
    created_at: string;
    text_preview: string;
    has_summary: number;
  }>;

  const filtered = rows.filter((doc) => {
    if (subject && subject !== 'All' && doc.subject.toLowerCase() !== subject.toLowerCase()) {
      return false;
    }
    if (search) {
      return (
        doc.title.toLowerCase().includes(search) ||
        doc.subject.toLowerCase().includes(search) ||
        doc.original_filename.toLowerCase().includes(search) ||
        doc.text_preview.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const subjects = Array.from(new Set(rows.map((r) => r.subject))).sort();

  res.json({
    documents: filtered.map((d) => ({
      id: d.id,
      title: d.title,
      originalFilename: d.original_filename,
      mimeType: d.mime_type,
      fileSize: d.file_size,
      subject: d.subject,
      pageCount: d.page_count,
      processingStatus: d.processing_status,
      chunkCount: d.chunk_count,
      createdAt: d.created_at,
      textPreview: d.text_preview,
      hasSummary: Boolean(d.has_summary),
    })),
    subjects,
  });
});

documentsRouter.get('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const docId = Number(req.params.id);
  if (!Number.isInteger(docId)) {
    res.status(400).json({ error: 'Invalid document ID.' });
    return;
  }

  const doc = db
    .prepare(
      `SELECT id, title, original_filename, mime_type, file_size, subject,
              page_count, extracted_text, processing_status, chunk_count, created_at
       FROM documents
       WHERE id = ? AND user_id = ?`
    )
    .get(docId, userId) as
    | {
        id: number;
        title: string;
        original_filename: string;
        mime_type: string;
        file_size: number;
        subject: string;
        page_count: number;
        extracted_text: string;
        processing_status: string;
        chunk_count: number;
        created_at: string;
      }
    | undefined;

  if (!doc) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  const summaryRow = db
    .prepare(
      `SELECT short_summary, detailed_summary, topics_json, key_points_json,
              definitions_json, exam_notes_json, updated_at
       FROM document_summaries
       WHERE document_id = ? AND user_id = ?`
    )
    .get(docId, userId) as
    | {
        short_summary: string;
        detailed_summary: string;
        topics_json: string;
        key_points_json: string;
        definitions_json: string;
        exam_notes_json: string;
        updated_at: string;
      }
    | undefined;

  res.json({
    document: {
      id: doc.id,
      title: doc.title,
      originalFilename: doc.original_filename,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      subject: doc.subject,
      pageCount: doc.page_count,
      extractedText: doc.extracted_text,
      processingStatus: doc.processing_status,
      chunkCount: doc.chunk_count,
      createdAt: doc.created_at,
    },
    summary: summaryRow
      ? {
          shortSummary: summaryRow.short_summary,
          detailedSummary: summaryRow.detailed_summary,
          topics: safeJsonParse<string[]>(summaryRow.topics_json, []),
          keyPoints: safeJsonParse<string[]>(summaryRow.key_points_json, []),
          definitions: safeJsonParse<Array<{ term: string; definition: string }>>(
            summaryRow.definitions_json,
            []
          ),
          examNotes: safeJsonParse<Array<{ heading: string; points: string[] }>>(
            summaryRow.exam_notes_json,
            []
          ),
          updatedAt: summaryRow.updated_at,
        }
      : null,
  });
});

documentsRouter.post('/upload', upload.single('file'), async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'Please select a PDF, TXT, or Markdown file to upload.' });
    return;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const rawTitle =
    typeof req.body.title === 'string' && req.body.title.trim()
      ? req.body.title.trim()
      : path.basename(file.originalname, ext);
  const subject =
    typeof req.body.subject === 'string' && req.body.subject.trim()
      ? req.body.subject.trim().slice(0, 80)
      : 'Computer Science';

  const safeStoredName = `${crypto.randomUUID()}${ALLOWED_EXTS.has(ext) ? ext : '.pdf'}`;
  const destination = path.resolve(UPLOADS_DIR, safeStoredName);
  if (!destination.startsWith(UPLOADS_DIR + path.sep)) {
    res.status(400).json({ error: 'Invalid upload file path.' });
    return;
  }

  try {
    fs.writeFileSync(destination, file.buffer);

    let pages: PageContent[] = [];
    if (ext === '.pdf' || file.mimetype === 'application/pdf') {
      const pdfResult = await extractText(new Uint8Array(file.buffer), { mergePages: false });
      const rawPages = Array.isArray(pdfResult.text) ? pdfResult.text : [String(pdfResult.text || '')];
      pages = rawPages.map((pageText, index) => ({
        pageNumber: index + 1,
        text: cleanExtractedText(pageText),
      }));
    } else {
      const text = cleanExtractedText(file.buffer.toString('utf-8'));
      pages = [{ pageNumber: 1, text }];
    }

    const fullText = pages
      .map((p) => (pages.length > 1 ? `[Page ${p.pageNumber}]\n${p.text}` : p.text))
      .join('\n\n')
      .trim();

    if (!fullText || fullText.length < 20) {
      fs.unlinkSync(destination);
      res.status(422).json({
        error:
          'Could not extract readable text from this file. Scanned image-only PDFs require text layers or OCR before indexing.',
      });
      return;
    }

    const insertDoc = db
      .prepare(
        `INSERT INTO documents
         (user_id, title, original_filename, stored_filename, mime_type, file_size, subject, page_count, extracted_text, processing_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexing')`
      )
      .run(
        userId,
        rawTitle.slice(0, 140),
        file.originalname.slice(0, 180),
        safeStoredName,
        file.mimetype || 'application/pdf',
        file.size,
        subject,
        Math.max(1, pages.length),
        fullText
      );

    const documentId = Number(insertDoc.lastInsertRowid);
    const { chunkCount, embeddedCount } = await indexDocumentChunks(userId, documentId, pages);

    db.prepare(
      `UPDATE documents SET processing_status = 'completed', chunk_count = ? WHERE id = ? AND user_id = ?`
    ).run(chunkCount, documentId, userId);

    logUserActivity(userId, 'document_uploaded', `Uploaded ${rawTitle}`, subject, {
      documentId,
      pageCount: pages.length,
      chunkCount,
    });

    res.status(201).json({
      document: {
        id: documentId,
        title: rawTitle.slice(0, 140),
        originalFilename: file.originalname,
        mimeType: file.mimetype || 'application/pdf',
        fileSize: file.size,
        subject,
        pageCount: Math.max(1, pages.length),
        processingStatus: 'completed',
        chunkCount,
        embeddedCount,
        textPreview: fullText.slice(0, 320),
        hasSummary: false,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (fs.existsSync(destination)) {
      try {
        fs.unlinkSync(destination);
      } catch {
        // ignore cleanup error
      }
    }
    res.status(500).json({
      error: `Document processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  }
});

documentsRouter.delete('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const docId = Number(req.params.id);
  if (!Number.isInteger(docId)) {
    res.status(400).json({ error: 'Invalid document ID.' });
    return;
  }

  const row = db
    .prepare('SELECT stored_filename, title FROM documents WHERE id = ? AND user_id = ?')
    .get(docId, userId) as { stored_filename: string; title: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  const resolvedFile = path.resolve(UPLOADS_DIR, path.basename(row.stored_filename));
  if (resolvedFile.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(resolvedFile)) {
    try {
      fs.unlinkSync(resolvedFile);
    } catch {
      // continue DB deletion
    }
  }

  db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(docId, userId);
  res.json({ success: true, message: `Deleted "${row.title}".` });
});

documentsRouter.post('/:id/summarize', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const docId = Number(req.params.id);
  if (!Number.isInteger(docId)) {
    res.status(400).json({ error: 'Invalid document ID.' });
    return;
  }

  const doc = db
    .prepare('SELECT id, title, subject, extracted_text FROM documents WHERE id = ? AND user_id = ?')
    .get(docId, userId) as
    | { id: number; title: string; subject: string; extracted_text: string }
    | undefined;

  if (!doc) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  try {
    const contextText = doc.extracted_text.slice(0, 28000);
    const result = await generateStructuredJson<{
      shortSummary: string;
      detailedSummary: string;
      topics: string[];
      keyPoints: string[];
      definitions: Array<{ term: string; definition: string }>;
      examNotes: Array<{ heading: string; points: string[] }>;
    }>(
      `Analyze the following study document titled "${doc.title}" (Subject: ${doc.subject}) and generate structured academic study aids strictly grounded in the text.

Document content:
${contextText}`,
      {
        type: Type.OBJECT,
        properties: {
          shortSummary: {
            type: Type.STRING,
            description: 'Concise 2-4 sentence executive overview of the document.',
          },
          detailedSummary: {
            type: Type.STRING,
            description: 'Comprehensive multi-paragraph summary explaining core arguments, mechanisms, and conclusions.',
          },
          topics: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '5 to 10 important topics covered in the material.',
          },
          keyPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '6 to 10 high-value bullet takeaways.',
          },
          definitions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                definition: { type: Type.STRING },
              },
              required: ['term', 'definition'],
            },
            description: 'Important terms and clear definitions found in the document.',
          },
          examNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                points: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['heading', 'points'],
            },
            description: '3 to 5 exam-oriented study sections with focused revision bullets.',
          },
        },
        required: [
          'shortSummary',
          'detailedSummary',
          'topics',
          'keyPoints',
          'definitions',
          'examNotes',
        ],
      },
      'You are an academic study assistant. Ground every point in the provided document text. Do not invent facts outside the material.'
    );

    db.prepare(
      `INSERT INTO document_summaries
       (document_id, user_id, short_summary, detailed_summary, topics_json, key_points_json, definitions_json, exam_notes_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(document_id) DO UPDATE SET
         short_summary = excluded.short_summary,
         detailed_summary = excluded.detailed_summary,
         topics_json = excluded.topics_json,
         key_points_json = excluded.key_points_json,
         definitions_json = excluded.definitions_json,
         exam_notes_json = excluded.exam_notes_json,
         updated_at = datetime('now')`
    ).run(
      docId,
      userId,
      result.shortSummary || '',
      result.detailedSummary || '',
      JSON.stringify(result.topics || []),
      JSON.stringify(result.keyPoints || []),
      JSON.stringify(result.definitions || []),
      JSON.stringify(result.examNotes || [])
    );

    logUserActivity(userId, 'summary_generated', `Summarized ${doc.title}`, doc.subject, {
      documentId: docId,
    });

    res.json({
      summary: {
        ...result,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(502).json({ error: formatAiError(err) });
  }
});

documentsRouter.post('/rag-qa', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const parsed = ragQaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid question.' });
    return;
  }

  const { question, documentId } = parsed.data;

  try {
    const chunks = await retrieveRelevantChunks(userId, question, {
      documentId: documentId || undefined,
      topK: 5,
    });

    if (chunks.length === 0) {
      res.json({
        answer:
          'No uploaded study documents were found in the selected scope. Upload a PDF or text document first so I can retrieve grounded excerpts to answer your question.',
        groundedInDocuments: false,
        disclaimer: 'AI-generated responses should be verified against your course materials.',
        sources: [],
      });
      return;
    }

    const contextBlock = chunks
      .map(
        (c, i) =>
          `[Source ${i + 1} | Document: "${c.documentTitle}" | Page ${c.pageNumber} | Relevance: ${(
            c.score * 100
          ).toFixed(0)}%]\n${c.content}`
      )
      .join('\n\n---\n\n');

    const qaResult = await generateStructuredJson<{
      answer: string;
      groundedInDocuments: boolean;
      citedSourceIndices: number[];
      missingContextNote: string;
    }>(
      `Student Question: ${question}

Retrieved Document Excerpts:
${contextBlock}

Instructions:
1. Answer using ONLY the retrieved document excerpts whenever they contain the information.
2. Cite sources inline as [Source 1], [Source 2], etc.
3. If the uploaded documents do NOT contain enough information to answer the question, set groundedInDocuments to false, explicitly state that the uploaded material does not contain the answer, and optionally mention what related content was found.`,
      {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING },
          groundedInDocuments: { type: Type.BOOLEAN },
          citedSourceIndices: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
          },
          missingContextNote: { type: Type.STRING },
        },
        required: ['answer', 'groundedInDocuments', 'citedSourceIndices', 'missingContextNote'],
      },
      'You are a rigorous Retrieval-Augmented Generation (RAG) study tutor. Never fabricate citations or pretend an answer comes from the document when it does not.'
    );

    const sources = chunks.map((c, idx) => ({
      sourceNumber: idx + 1,
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      pageNumber: c.pageNumber,
      score: c.score,
      excerpt: c.content.slice(0, 260) + (c.content.length > 260 ? '...' : ''),
      cited: (qaResult.citedSourceIndices || []).includes(idx + 1),
    }));

    logUserActivity(
      userId,
      'rag_question',
      `Asked: ${question.slice(0, 70)}`,
      chunks[0]?.subject || 'General',
      { documentId: documentId || null, grounded: qaResult.groundedInDocuments }
    );

    res.json({
      answer: qaResult.answer,
      groundedInDocuments: qaResult.groundedInDocuments,
      missingContextNote: qaResult.missingContextNote,
      disclaimer:
        'AI-generated answers are grounded in retrieved excerpts where available, but are not guaranteed to be 100% error-free. Verify critical definitions against your primary source.',
      sources,
    });
  } catch (err) {
    res.status(502).json({ error: formatAiError(err) });
  }
});
