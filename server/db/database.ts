import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'memory_graph.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT 'Computer Science & Engineering',
      study_goal TEXT NOT NULL DEFAULT 'Master core subjects with connected concepts',
      preferences_json TEXT NOT NULL DEFAULT '{"defaultSummaryMode":"detailed","quizQuestionCount":5,"flashcardTarget":10}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      subject TEXT NOT NULL DEFAULT 'General',
      page_count INTEGER NOT NULL DEFAULT 1,
      extracted_text TEXT NOT NULL DEFAULT '',
      processing_status TEXT NOT NULL DEFAULT 'completed',
      chunk_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      page_number INTEGER NOT NULL DEFAULT 1,
      content TEXT NOT NULL,
      embedding_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS document_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      short_summary TEXT NOT NULL DEFAULT '',
      detailed_summary TEXT NOT NULL DEFAULT '',
      topics_json TEXT NOT NULL DEFAULT '[]',
      key_points_json TEXT NOT NULL DEFAULT '[]',
      definitions_json TEXT NOT NULL DEFAULT '[]',
      exam_notes_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('live', 'zoom', 'google_meet')),
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'General',
      file_name TEXT NOT NULL DEFAULT '',
      media_mime TEXT NOT NULL DEFAULT '',
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      transcript_text TEXT NOT NULL DEFAULT '',
      segments_json TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '',
      key_points_json TEXT NOT NULL DEFAULT '[]',
      action_items_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'General',
      source_type TEXT NOT NULL DEFAULT 'manual',
      transcript_text TEXT NOT NULL DEFAULT '',
      structured_notes TEXT NOT NULL DEFAULT '',
      key_points_json TEXT NOT NULL DEFAULT '[]',
      definitions_json TEXT NOT NULL DEFAULT '[]',
      questions_json TEXT NOT NULL DEFAULT '[]',
      action_items_json TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS knowledge_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      document_id INTEGER,
      subject TEXT NOT NULL DEFAULT 'General',
      label TEXT NOT NULL,
      normalized_label TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'core',
      description TEXT NOT NULL DEFAULT '',
      pos_x REAL NOT NULL DEFAULT 0,
      pos_y REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      document_id INTEGER,
      source_node_id INTEGER NOT NULL,
      target_node_id INTEGER NOT NULL,
      relationship_label TEXT NOT NULL DEFAULT 'relates to',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
      FOREIGN KEY (source_node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (target_node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      sources_json TEXT NOT NULL DEFAULT '[]',
      grounding_mode TEXT NOT NULL DEFAULT 'general',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS visual_guides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      document_id INTEGER,
      topic TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'General',
      explanation TEXT NOT NULL DEFAULT '',
      key_concepts_json TEXT NOT NULL DEFAULT '[]',
      learning_flow_json TEXT NOT NULL DEFAULT '[]',
      relationships_json TEXT NOT NULL DEFAULT '[]',
      real_world_examples_json TEXT NOT NULL DEFAULT '[]',
      important_points_json TEXT NOT NULL DEFAULT '[]',
      revision_summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      document_id INTEGER,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'General',
      difficulty TEXT NOT NULL DEFAULT 'intermediate',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      question_order INTEGER NOT NULL DEFAULT 0,
      question_text TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '[]',
      correct_index INTEGER NOT NULL DEFAULT 0,
      explanation TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      percentage REAL NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      document_id INTEGER,
      subject TEXT NOT NULL DEFAULT 'General',
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'known', 'needs_revision')),
      review_count INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS flashcard_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flashcard_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('known', 'needs_revision')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (flashcard_id) REFERENCES flashcards(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'General',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_user_doc ON document_chunks(user_id, document_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_user ON knowledge_nodes(user_id);
    CREATE INDEX IF NOT EXISTS idx_edges_user ON knowledge_edges(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_recordings_user_type ON recordings(user_id, source_type);
    CREATE INDEX IF NOT EXISTS idx_activity_user_created ON user_activity(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON quiz_attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id);
  `);
}

export function logUserActivity(
  userId: number,
  activityType: string,
  title: string,
  subject = 'General',
  metadata: Record<string, unknown> = {}
): void {
  db.prepare(
    `INSERT INTO user_activity (user_id, activity_type, title, subject, metadata_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, activityType, title, subject || 'General', JSON.stringify(metadata));
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
