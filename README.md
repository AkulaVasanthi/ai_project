# AI Learning Memory Graph

An end-to-end AI-powered learning workspace connecting document ingestion, Retrieval-Augmented Generation (RAG), live lecture transcription, Zoom & Google Meet recording workflows, structured Live AI Notes, interactive Knowledge Graphs, Visual Learning guides, Quizzes, Flashcards, and Learning Analytics.

## Architecture

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4 (light theme), React Router, React Flow (`@xyflow/react`), Recharts, Lucide Icons.
- **Backend**: Express.js + TypeScript modular REST API (`server.ts`, `server/routes/*`, `server/services/*`, `server/db/*`, `server/middleware/*`).
- **Database**: Persistent SQLite (`data/memory_graph.db`) via `better-sqlite3` with foreign keys, indexes, and strict per-user data isolation.
- **Vector Store & RAG**: PDF/text page-by-page extraction (`unpdf`), semantic chunking, Gemini embeddings (`gemini-embedding-2`), and hybrid cosine-similarity + lexical retrieval (configurable for external ChromaDB via `CHROMA_URL`).
- **AI Provider**: Server-side `@google/genai` (`gemini-4-hydrogen`, `gemini-3.5-transcribe`, `gemini-embedding-2`) with optional local Ollama switching via `AI_PROVIDER=ollama`.
- **Authentication & Security**: `bcryptjs` password hashing, JWT signing, `HttpOnly` session cookies with CSRF verification, strict file size/type validation, and parameterized SQL queries.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables based on `.env.example` (`GEMINI_API_KEY` is injected automatically in AI Studio via Settings > Secrets).
3. Start development server (port 3000):
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```

## REST API Endpoints

- **Auth & Profile**: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/profile`, `POST /api/auth/change-password`, `DELETE /api/auth/data`
- **Documents & RAG**: `GET /api/documents`, `GET /api/documents/:id`, `POST /api/documents/upload`, `DELETE /api/documents/:id`, `POST /api/documents/:id/summarize`, `POST /api/documents/rag-qa`
- **Recordings & Live Notes**: `GET /api/recordings`, `POST /api/recordings/transcribe-audio`, `POST /api/recordings`, `POST /api/recordings/:id/summarize`, `DELETE /api/recordings/:id`, `GET /api/notes`, `POST /api/notes/generate`, `PUT /api/notes/:id`, `DELETE /api/notes/:id`
- **Knowledge Graph**: `GET /api/knowledge-graph`, `POST /api/knowledge-graph/generate`, `PATCH /api/knowledge-graph/nodes/:id/position`, `DELETE /api/knowledge-graph/nodes/:id`
- **AI Assistant & Visual Learning**: `GET/POST /api/conversations`, `PATCH/DELETE /api/conversations/:id`, `GET/POST /api/conversations/:id/messages`, `GET /api/visual-learning`, `POST /api/visual-learning/generate`, `DELETE /api/visual-learning/:id`
- **Quizzes & Flashcards**: `GET /api/quizzes`, `GET /api/quizzes/:id`, `POST /api/quizzes/generate`, `POST /api/quizzes/:id/submit`, `DELETE /api/quizzes/:id`, `GET/POST /api/flashcards`, `POST /api/flashcards/generate`, `POST /api/flashcards/:id/review`, `DELETE /api/flashcards/:id`
- **Dashboard & Analytics**: `GET /api/dashboard`, `GET /api/analytics`, `GET /api/search`, `GET /api/notifications`

## External Integration Notes

- **Zoom & Google Meet Cloud Sync**: Automatic cloud recording sync requires registering OAuth credentials (`ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET` or `GOOGLE_WORKSPACE_CLIENT_ID`/`GOOGLE_WORKSPACE_CLIENT_SECRET`). Out of the box, both modules provide full local recording (`.mp3`, `.m4a`, `.wav`, `.mp4`, `.webm`) and transcript (`.vtt`, `.srt`, `.txt`) upload, transcription, summarization, and action-item extraction.
