import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { db, logUserActivity, safeJsonParse } from '../db/database.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import {
  formatAiError,
  generateStructuredJson,
  transcribeAudioBuffer,
  Type,
} from '../services/aiProvider.ts';

export const recordingsRouter = Router();
recordingsRouter.use(requireAuth);

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const noteGenerateSchema = z.object({
  title: z.string().trim().min(2, 'Session title is required').max(140),
  subject: z.string().trim().max(80).optional(),
  sourceType: z.string().trim().max(40).optional(),
  transcriptText: z.string().trim().min(20, 'Please enter at least 20 characters of transcript or study content.'),
});

const noteUpdateSchema = z.object({
  title: z.string().trim().min(2).max(140).optional(),
  subject: z.string().trim().max(80).optional(),
  structuredNotes: z.string().optional(),
  summary: z.string().optional(),
  keyPoints: z.array(z.string()).optional(),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
  questions: z.array(z.string()).optional(),
  actionItems: z.array(z.string()).optional(),
});

function parseTimestampedSegments(rawText: string): Array<{ timestamp: string; text: string }> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const segments: Array<{ timestamp: string; text: string }> = [];
  let syntheticSec = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === 'WEBVTT' || /^\d+$/.test(line)) continue;

    const vttMatch = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*-->/);
    if (vttMatch) {
      const ts = vttMatch[1].replace(/[.,]\d+$/, '');
      const nextLine = lines[i + 1] || '';
      if (nextLine && !nextLine.includes('-->')) {
        segments.push({ timestamp: ts, text: nextLine });
        i++;
      }
      continue;
    }

    const bracketMatch = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-:]?\s*(.+)$/);
    if (bracketMatch) {
      segments.push({ timestamp: bracketMatch[1], text: bracketMatch[2] });
      continue;
    }

    const mm = String(Math.floor(syntheticSec / 60)).padStart(2, '0');
    const ss = String(syntheticSec % 60).padStart(2, '0');
    segments.push({ timestamp: `${mm}:${ss}`, text: line });
    syntheticSec += 15;
  }

  return segments.slice(0, 200);
}

async function analyzeMeetingTranscript(title: string, transcript: string, sourceLabel: string) {
  return generateStructuredJson<{
    summary: string;
    keyPoints: string[];
    actionItems: string[];
  }>(
    `Analyze this ${sourceLabel} transcript titled "${title}" and extract a clear academic/meeting summary, key discussion points, and concrete action items.

Transcript:
${transcript.slice(0, 24000)}`,
    {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: 'Clear 3-5 sentence summary of the session.' },
        keyPoints: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '5 to 8 important points or topics discussed.',
        },
        actionItems: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Action items, follow-ups, assignments, or tasks mentioned.',
        },
      },
      required: ['summary', 'keyPoints', 'actionItems'],
    },
    'You are a precise lecture and meeting analyst. Only extract points actually present in the transcript.'
  );
}

function formatRecordingRow(r: {
  id: number;
  source_type: string;
  title: string;
  subject: string;
  file_name: string;
  media_mime: string;
  duration_seconds: number;
  transcript_text: string;
  segments_json: string;
  summary: string;
  key_points_json: string;
  action_items_json: string;
  created_at: string;
}) {
  return {
    id: r.id,
    sourceType: r.source_type,
    title: r.title,
    subject: r.subject,
    fileName: r.file_name,
    mediaMime: r.media_mime,
    durationSeconds: r.duration_seconds,
    transcriptText: r.transcript_text,
    segments: safeJsonParse<Array<{ timestamp: string; text: string }>>(r.segments_json, []),
    summary: r.summary,
    keyPoints: safeJsonParse<string[]>(r.key_points_json, []),
    actionItems: safeJsonParse<string[]>(r.action_items_json, []),
    createdAt: r.created_at,
  };
}

recordingsRouter.get('/recordings', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const sourceType = typeof req.query.sourceType === 'string' ? req.query.sourceType : '';

  const rows = sourceType
    ? (db
        .prepare(
          `SELECT * FROM recordings WHERE user_id = ? AND source_type = ? ORDER BY created_at DESC`
        )
        .all(userId, sourceType) as Array<Parameters<typeof formatRecordingRow>[0]>)
    : (db
        .prepare(`SELECT * FROM recordings WHERE user_id = ? ORDER BY created_at DESC`)
        .all(userId) as Array<Parameters<typeof formatRecordingRow>[0]>);

  res.json({ recordings: rows.map(formatRecordingRow) });
});

recordingsRouter.post(
  '/recordings/transcribe-audio',
  mediaUpload.single('audio'),
  async (req: AuthenticatedRequest, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No audio recording was received.' });
      return;
    }

    try {
      const mimeType = file.mimetype && file.mimetype !== 'application/octet-stream'
        ? file.mimetype.split(';')[0]
        : 'audio/webm';
      const transcript = await transcribeAudioBuffer(file.buffer, mimeType);
      const segments = parseTimestampedSegments(transcript);
      res.json({ transcript, segments });
    } catch (err) {
      res.status(502).json({ error: formatAiError(err) });
    }
  }
);

recordingsRouter.post(
  '/recordings',
  mediaUpload.fields([
    { name: 'mediaFile', maxCount: 1 },
    { name: 'transcriptFile', maxCount: 1 },
  ]),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const mediaFile = files.mediaFile?.[0];
    const transcriptFile = files.transcriptFile?.[0];

    const sourceType =
      req.body.sourceType === 'zoom' || req.body.sourceType === 'google_meet'
        ? req.body.sourceType
        : 'live';
    const title =
      typeof req.body.title === 'string' && req.body.title.trim()
        ? req.body.title.trim().slice(0, 140)
        : mediaFile
          ? path.basename(mediaFile.originalname, path.extname(mediaFile.originalname))
          : `${sourceType === 'zoom' ? 'Zoom' : sourceType === 'google_meet' ? 'Google Meet' : 'Live'} Session`;
    const subject =
      typeof req.body.subject === 'string' && req.body.subject.trim()
        ? req.body.subject.trim().slice(0, 80)
        : 'General';
    const durationSeconds = Math.max(0, Number(req.body.durationSeconds) || 0);

    let transcriptText = typeof req.body.transcriptText === 'string' ? req.body.transcriptText.trim() : '';
    let segments = safeJsonParse<Array<{ timestamp: string; text: string }>>(
      typeof req.body.segmentsJson === 'string' ? req.body.segmentsJson : '',
      []
    );

    try {
      if (transcriptFile) {
        transcriptText = transcriptFile.buffer.toString('utf-8').trim();
        segments = parseTimestampedSegments(transcriptText);
      } else if (mediaFile) {
        const mimeType =
          mediaFile.mimetype && mediaFile.mimetype !== 'application/octet-stream'
            ? mediaFile.mimetype.split(';')[0]
            : mediaFile.originalname.toLowerCase().endsWith('.mp4')
              ? 'video/mp4'
              : 'audio/mpeg';
        const transcribed = await transcribeAudioBuffer(mediaFile.buffer, mimeType);
        transcriptText = transcribed || transcriptText;
        segments = parseTimestampedSegments(transcriptText);
      }

      if (!transcriptText) {
        res.status(400).json({
          error: 'Please upload an audio/video recording, upload a transcript file, or provide transcript text.',
        });
        return;
      }

      if (segments.length === 0) {
        segments = parseTimestampedSegments(transcriptText);
      }

      const sourceLabel =
        sourceType === 'zoom'
          ? 'Zoom meeting'
          : sourceType === 'google_meet'
            ? 'Google Meet session'
            : 'live lecture transcription';

      let analysis = { summary: '', keyPoints: [] as string[], actionItems: [] as string[] };
      const shouldAnalyze = req.body.generateSummary !== 'false';
      if (shouldAnalyze) {
        analysis = await analyzeMeetingTranscript(title, transcriptText, sourceLabel);
      }

      const insert = db
        .prepare(
          `INSERT INTO recordings
           (user_id, source_type, title, subject, file_name, media_mime, duration_seconds, transcript_text, segments_json, summary, key_points_json, action_items_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          userId,
          sourceType,
          title,
          subject,
          mediaFile?.originalname || transcriptFile?.originalname || 'live-capture',
          mediaFile?.mimetype || transcriptFile?.mimetype || 'text/plain',
          durationSeconds,
          transcriptText,
          JSON.stringify(segments),
          analysis.summary,
          JSON.stringify(analysis.keyPoints),
          JSON.stringify(analysis.actionItems)
        );

      const saved = db
        .prepare('SELECT * FROM recordings WHERE id = ? AND user_id = ?')
        .get(insert.lastInsertRowid, userId) as Parameters<typeof formatRecordingRow>[0];

      logUserActivity(
        userId,
        `${sourceType}_recording_saved`,
        `Processed ${sourceLabel}: ${title}`,
        subject,
        { recordingId: saved.id }
      );

      res.status(201).json({ recording: formatRecordingRow(saved) });
    } catch (err) {
      res.status(502).json({ error: formatAiError(err) });
    }
  }
);

recordingsRouter.post('/recordings/:id/summarize', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const recId = Number(req.params.id);
  if (!Number.isInteger(recId)) {
    res.status(400).json({ error: 'Invalid recording ID.' });
    return;
  }

  const row = db
    .prepare('SELECT * FROM recordings WHERE id = ? AND user_id = ?')
    .get(recId, userId) as Parameters<typeof formatRecordingRow>[0] | undefined;

  if (!row) {
    res.status(404).json({ error: 'Recording not found.' });
    return;
  }

  try {
    const analysis = await analyzeMeetingTranscript(row.title, row.transcript_text, row.source_type);
    db.prepare(
      `UPDATE recordings SET summary = ?, key_points_json = ?, action_items_json = ? WHERE id = ? AND user_id = ?`
    ).run(
      analysis.summary,
      JSON.stringify(analysis.keyPoints),
      JSON.stringify(analysis.actionItems),
      recId,
      userId
    );

    const updated = db
      .prepare('SELECT * FROM recordings WHERE id = ? AND user_id = ?')
      .get(recId, userId) as Parameters<typeof formatRecordingRow>[0];

    res.json({ recording: formatRecordingRow(updated) });
  } catch (err) {
    res.status(502).json({ error: formatAiError(err) });
  }
});

recordingsRouter.delete('/recordings/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const recId = Number(req.params.id);
  if (!Number.isInteger(recId)) {
    res.status(400).json({ error: 'Invalid recording ID.' });
    return;
  }

  const result = db
    .prepare('DELETE FROM recordings WHERE id = ? AND user_id = ?')
    .run(recId, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Recording not found.' });
    return;
  }

  res.json({ success: true });
});

/* ---------------- Module 8: Live AI Notes ---------------- */

function formatNoteRow(n: {
  id: number;
  title: string;
  subject: string;
  source_type: string;
  transcript_text: string;
  structured_notes: string;
  key_points_json: string;
  definitions_json: string;
  questions_json: string;
  action_items_json: string;
  summary: string;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: n.id,
    title: n.title,
    subject: n.subject,
    sourceType: n.source_type,
    transcriptText: n.transcript_text,
    structuredNotes: n.structured_notes,
    keyPoints: safeJsonParse<string[]>(n.key_points_json, []),
    definitions: safeJsonParse<Array<{ term: string; definition: string }>>(n.definitions_json, []),
    questions: safeJsonParse<string[]>(n.questions_json, []),
    actionItems: safeJsonParse<string[]>(n.action_items_json, []),
    summary: n.summary,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  };
}

recordingsRouter.get('/notes', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = db
    .prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as Array<Parameters<typeof formatNoteRow>[0]>;

  res.json({ notes: rows.map(formatNoteRow) });
});

recordingsRouter.post('/notes/generate', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const parsed = noteGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid note input.' });
    return;
  }

  const { title, subject = 'General', sourceType = 'study_session', transcriptText } = parsed.data;

  try {
    const generated = await generateStructuredJson<{
      summary: string;
      structuredNotes: string;
      keyPoints: string[];
      definitions: Array<{ term: string; definition: string }>;
      questions: string[];
      actionItems: string[];
    }>(
      `Transform the following study session or lecture transcript titled "${title}" (Subject: ${subject}) into well-organized academic notes.

Transcript / Source Text:
${transcriptText.slice(0, 24000)}`,
      {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'Short 2-4 sentence session summary.' },
          structuredNotes: {
            type: Type.STRING,
            description:
              'Cleanly formatted Markdown-style study notes with clear section headings (## Heading) and bullet points.',
          },
          keyPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '5 to 8 concise key points.',
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
          },
          questions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Open questions or study review questions raised by the session.',
          },
          actionItems: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Next steps, homework, or revision actions.',
          },
        },
        required: [
          'summary',
          'structuredNotes',
          'keyPoints',
          'definitions',
          'questions',
          'actionItems',
        ],
      },
      'You are an academic note-taking assistant. Organize content cleanly with headings, bullets, and accurate definitions.'
    );

    const insert = db
      .prepare(
        `INSERT INTO notes
         (user_id, title, subject, source_type, transcript_text, structured_notes, key_points_json, definitions_json, questions_json, action_items_json, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        title,
        subject,
        sourceType,
        transcriptText,
        generated.structuredNotes,
        JSON.stringify(generated.keyPoints || []),
        JSON.stringify(generated.definitions || []),
        JSON.stringify(generated.questions || []),
        JSON.stringify(generated.actionItems || []),
        generated.summary
      );

    const saved = db
      .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
      .get(insert.lastInsertRowid, userId) as Parameters<typeof formatNoteRow>[0];

    logUserActivity(userId, 'notes_created', `Created notes: ${title}`, subject, {
      noteId: saved.id,
    });

    res.status(201).json({ note: formatNoteRow(saved) });
  } catch (err) {
    res.status(502).json({ error: formatAiError(err) });
  }
});

recordingsRouter.put('/notes/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const noteId = Number(req.params.id);
  if (!Number.isInteger(noteId)) {
    res.status(400).json({ error: 'Invalid note ID.' });
    return;
  }

  const parsed = noteUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid note update.' });
    return;
  }

  const existing = db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .get(noteId, userId) as Parameters<typeof formatNoteRow>[0] | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Note session not found.' });
    return;
  }

  db.prepare(
    `UPDATE notes
     SET title = ?, subject = ?, structured_notes = ?, summary = ?,
         key_points_json = ?, definitions_json = ?, questions_json = ?, action_items_json = ?,
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    parsed.data.title ?? existing.title,
    parsed.data.subject ?? existing.subject,
    parsed.data.structuredNotes ?? existing.structured_notes,
    parsed.data.summary ?? existing.summary,
    parsed.data.keyPoints ? JSON.stringify(parsed.data.keyPoints) : existing.key_points_json,
    parsed.data.definitions ? JSON.stringify(parsed.data.definitions) : existing.definitions_json,
    parsed.data.questions ? JSON.stringify(parsed.data.questions) : existing.questions_json,
    parsed.data.actionItems ? JSON.stringify(parsed.data.actionItems) : existing.action_items_json,
    noteId,
    userId
  );

  const updated = db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .get(noteId, userId) as Parameters<typeof formatNoteRow>[0];

  res.json({ note: formatNoteRow(updated) });
});

recordingsRouter.delete('/notes/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const noteId = Number(req.params.id);
  if (!Number.isInteger(noteId)) {
    res.status(400).json({ error: 'Invalid note ID.' });
    return;
  }

  const result = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(noteId, userId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Note session not found.' });
    return;
  }

  res.json({ success: true });
});
