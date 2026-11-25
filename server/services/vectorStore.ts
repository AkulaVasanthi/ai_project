import { db, safeJsonParse } from '../db/database.ts';
import { embedTexts } from './aiProvider.ts';

export interface PageContent {
  pageNumber: number;
  text: string;
}

export interface ChunkRecord {
  chunkIndex: number;
  pageNumber: number;
  content: string;
}

export interface RetrievedChunk {
  chunkId: number;
  documentId: number;
  documentTitle: string;
  subject: string;
  pageNumber: number;
  content: string;
  score: number;
}

export function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chunkDocumentPages(
  pages: PageContent[],
  targetChunkChars = 900,
  overlapChars = 140
): ChunkRecord[] {
  const chunks: ChunkRecord[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const cleaned = cleanExtractedText(page.text);
    if (!cleaned) continue;

    if (cleaned.length <= targetChunkChars) {
      chunks.push({
        chunkIndex: chunkIndex++,
        pageNumber: page.pageNumber,
        content: cleaned,
      });
      continue;
    }

    const paragraphs = cleaned.split(/\n+/);
    let current = '';

    for (const paragraph of paragraphs) {
      if ((current + '\n' + paragraph).length <= targetChunkChars) {
        current = current ? `${current}\n${paragraph}` : paragraph;
      } else {
        if (current) {
          chunks.push({
            chunkIndex: chunkIndex++,
            pageNumber: page.pageNumber,
            content: current.trim(),
          });
        }
        if (paragraph.length > targetChunkChars) {
          let start = 0;
          while (start < paragraph.length) {
            const slice = paragraph.slice(start, start + targetChunkChars).trim();
            if (slice) {
              chunks.push({
                chunkIndex: chunkIndex++,
                pageNumber: page.pageNumber,
                content: slice,
              });
            }
            start += targetChunkChars - overlapChars;
          }
          current = '';
        } else {
          const tail = current.slice(-overlapChars).trim();
          current = tail ? `${tail}\n${paragraph}` : paragraph;
        }
      }
    }

    if (current.trim()) {
      chunks.push({
        chunkIndex: chunkIndex++,
        pageNumber: page.pageNumber,
        content: current.trim(),
      });
    }
  }

  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function keywordOverlapScore(query: string, text: string): number {
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'of', 'to', 'in',
    'for', 'with', 'about', 'what', 'how', 'why', 'explain', 'define', 'give', 'from',
  ]);
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  if (tokens.length === 0) return 0;
  const hay = text.toLowerCase();
  let matches = 0;
  for (const token of tokens) {
    if (hay.includes(token)) matches++;
  }
  return matches / tokens.length;
}

export async function indexDocumentChunks(
  userId: number,
  documentId: number,
  pages: PageContent[]
): Promise<{ chunkCount: number; embeddedCount: number }> {
  const chunks = chunkDocumentPages(pages);
  if (chunks.length === 0) {
    return { chunkCount: 0, embeddedCount: 0 };
  }

  // Cap at 60 chunks per document to keep embedding responsive while preserving full study coverage
  const boundedChunks = chunks.slice(0, 60);
  let vectors: number[][] = [];
  let embeddedCount = 0;

  try {
    vectors = await embedTexts(boundedChunks.map((c) => c.content));
    embeddedCount = vectors.filter((v) => v.length > 0).length;
  } catch (err) {
    console.warn('Embedding generation skipped or failed, storing lexical chunks:', err);
    vectors = boundedChunks.map(() => []);
  }

  const insertStmt = db.prepare(
    `INSERT INTO document_chunks (document_id, user_id, chunk_index, page_number, content, embedding_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((items: ChunkRecord[]) => {
    db.prepare('DELETE FROM document_chunks WHERE document_id = ? AND user_id = ?').run(
      documentId,
      userId
    );
    items.forEach((chunk, idx) => {
      insertStmt.run(
        documentId,
        userId,
        chunk.chunkIndex,
        chunk.pageNumber,
        chunk.content,
        JSON.stringify(vectors[idx] || [])
      );
    });
  });

  insertMany(boundedChunks);

  return { chunkCount: boundedChunks.length, embeddedCount };
}

export async function retrieveRelevantChunks(
  userId: number,
  query: string,
  options: { documentId?: number; topK?: number } = {}
): Promise<RetrievedChunk[]> {
  const topK = options.topK ?? 5;

  const rows = options.documentId
    ? (db
        .prepare(
          `SELECT c.id, c.document_id, c.page_number, c.content, c.embedding_json,
                  d.title AS document_title, d.subject
           FROM document_chunks c
           INNER JOIN documents d ON d.id = c.document_id
           WHERE c.user_id = ? AND c.document_id = ?`
        )
        .all(userId, options.documentId) as Array<{
        id: number;
        document_id: number;
        page_number: number;
        content: string;
        embedding_json: string;
        document_title: string;
        subject: string;
      }>)
    : (db
        .prepare(
          `SELECT c.id, c.document_id, c.page_number, c.content, c.embedding_json,
                  d.title AS document_title, d.subject
           FROM document_chunks c
           INNER JOIN documents d ON d.id = c.document_id
           WHERE c.user_id = ?`
        )
        .all(userId) as Array<{
        id: number;
        document_id: number;
        page_number: number;
        content: string;
        embedding_json: string;
        document_title: string;
        subject: string;
      }>);

  if (rows.length === 0) return [];

  let queryVector: number[] = [];
  try {
    const embedded = await embedTexts([query]);
    queryVector = embedded[0] || [];
  } catch {
    queryVector = [];
  }

  const scored: RetrievedChunk[] = rows.map((row) => {
    const chunkVector = safeJsonParse<number[]>(row.embedding_json, []);
    const semanticScore =
      queryVector.length > 0 && chunkVector.length === queryVector.length
        ? cosineSimilarity(queryVector, chunkVector)
        : 0;
    const lexicalScore = keywordOverlapScore(query, row.content);
    const combinedScore =
      queryVector.length > 0 && chunkVector.length > 0
        ? semanticScore * 0.8 + lexicalScore * 0.2
        : lexicalScore;

    return {
      chunkId: row.id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      subject: row.subject,
      pageNumber: row.page_number,
      content: row.content,
      score: Number(combinedScore.toFixed(4)),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
