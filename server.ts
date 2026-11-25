import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { initDatabase } from './server/db/database.ts';
import { assistantVisualRouter } from './server/routes/assistantAndVisual.ts';
import { authRouter } from './server/routes/auth.ts';
import { insightsRouter } from './server/routes/dashboardAndAnalytics.ts';
import { documentsRouter } from './server/routes/documents.ts';
import { knowledgeGraphRouter } from './server/routes/knowledgeGraph.ts';
import { practiceRouter } from './server/routes/quizzesAndFlashcards.ts';
import { recordingsRouter } from './server/routes/recordingsAndNotes.ts';

dotenv.config();

async function startServer() {
  initDatabase();

  const app = express();
  app.set('trust proxy', 1);

  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'AI Learning Memory Graph' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api', recordingsRouter);
  app.use('/api/knowledge-graph', knowledgeGraphRouter);
  app.use('/api', assistantVisualRouter);
  app.use('/api', practiceRouter);
  app.use('/api', insightsRouter);

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global API error handler (Multer file size/filter & unexpected errors)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Uploaded file exceeds the maximum allowed size limit.' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error.';
    res.status(500).json({ error: message });
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Learning Memory Graph server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AI Learning Memory Graph server:', err);
  process.exit(1);
});
