import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { db, logUserActivity, safeJsonParse } from '../db/database.ts';
import {
  clearAuthCookie,
  requireAuth,
  setAuthCookie,
  signAuthToken,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { getProviderConfigStatus } from '../services/aiProvider.ts';

export const authRouter = Router();

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(80),
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128),
  department: z.string().trim().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  department: z.string().trim().min(2).max(100).optional(),
  studyGoal: z.string().trim().max(240).optional(),
  preferences: z
    .object({
      defaultSummaryMode: z.enum(['short', 'detailed']).optional(),
      quizQuestionCount: z.number().int().min(3).max(15).optional(),
      flashcardTarget: z.number().int().min(4).max(25).optional(),
    })
    .optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long').max(128),
});

function formatUserRow(row: {
  id: number;
  full_name: string;
  email: string;
  department: string;
  study_goal: string;
  preferences_json: string;
  created_at: string;
}) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    department: row.department,
    studyGoal: row.study_goal,
    preferences: safeJsonParse(row.preferences_json, {
      defaultSummaryMode: 'detailed',
      quizQuestionCount: 5,
      flashcardTarget: 10,
    }),
    createdAt: row.created_at,
  };
}

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid signup input.' });
    return;
  }

  const { fullName, email, password, department } = parsed.data;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const info = db
    .prepare(
      `INSERT INTO users (full_name, email, password_hash, department)
       VALUES (?, ?, ?, ?)`
    )
    .run(fullName, email, passwordHash, department || 'Computer Science & Engineering');

  const userRow = db
    .prepare(
      'SELECT id, full_name, email, department, study_goal, preferences_json, created_at FROM users WHERE id = ?'
    )
    .get(info.lastInsertRowid) as {
    id: number;
    full_name: string;
    email: string;
    department: string;
    study_goal: string;
    preferences_json: string;
    created_at: string;
  };

  logUserActivity(userRow.id, 'account_created', 'Joined AI Learning Memory Graph', 'Onboarding');

  const token = signAuthToken({
    id: userRow.id,
    email: userRow.email,
    fullName: userRow.full_name,
  });
  setAuthCookie(req, res, token);

  res.status(201).json({
    token,
    user: formatUserRow(userRow),
    providerStatus: getProviderConfigStatus(),
  });
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid credentials.' });
    return;
  }

  const { email, password } = parsed.data;
  const userRow = db
    .prepare(
      'SELECT id, full_name, email, password_hash, department, study_goal, preferences_json, created_at FROM users WHERE email = ?'
    )
    .get(email) as
    | {
        id: number;
        full_name: string;
        email: string;
        password_hash: string;
        department: string;
        study_goal: string;
        preferences_json: string;
        created_at: string;
      }
    | undefined;

  if (!userRow) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const valid = await bcrypt.compare(password, userRow.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = signAuthToken({
    id: userRow.id,
    email: userRow.email,
    fullName: userRow.full_name,
  });
  setAuthCookie(req, res, token);

  res.json({
    token,
    user: formatUserRow(userRow),
    providerStatus: getProviderConfigStatus(),
  });
});

authRouter.post('/logout', (req, res) => {
  clearAuthCookie(req, res);
  res.json({ success: true });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const userRow = db
    .prepare(
      'SELECT id, full_name, email, department, study_goal, preferences_json, created_at FROM users WHERE id = ?'
    )
    .get(req.user!.id) as
    | {
        id: number;
        full_name: string;
        email: string;
        department: string;
        study_goal: string;
        preferences_json: string;
        created_at: string;
      }
    | undefined;

  if (!userRow) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const token = signAuthToken({
    id: userRow.id,
    email: userRow.email,
    fullName: userRow.full_name,
  });

  res.json({
    token,
    user: formatUserRow(userRow),
    providerStatus: getProviderConfigStatus(),
  });
});

authRouter.patch('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile data.' });
    return;
  }

  const current = db
    .prepare(
      'SELECT full_name, department, study_goal, preferences_json FROM users WHERE id = ?'
    )
    .get(req.user!.id) as {
    full_name: string;
    department: string;
    study_goal: string;
    preferences_json: string;
  };

  const currentPrefs = safeJsonParse<Record<string, unknown>>(current.preferences_json, {});
  const nextPrefs = parsed.data.preferences
    ? { ...currentPrefs, ...parsed.data.preferences }
    : currentPrefs;

  db.prepare(
    `UPDATE users
     SET full_name = ?, department = ?, study_goal = ?, preferences_json = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    parsed.data.fullName ?? current.full_name,
    parsed.data.department ?? current.department,
    parsed.data.studyGoal ?? current.study_goal,
    JSON.stringify(nextPrefs),
    req.user!.id
  );

  const updated = db
    .prepare(
      'SELECT id, full_name, email, department, study_goal, preferences_json, created_at FROM users WHERE id = ?'
    )
    .get(req.user!.id) as {
    id: number;
    full_name: string;
    email: string;
    department: string;
    study_goal: string;
    preferences_json: string;
    created_at: string;
  };

  res.json({ user: formatUserRow(updated) });
});

authRouter.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password input.' });
    return;
  }

  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(req.user!.id) as { password_hash: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  const matches = await bcrypt.compare(parsed.data.currentPassword, row.password_hash);
  if (!matches) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    newHash,
    req.user!.id
  );

  res.json({ success: true, message: 'Password updated successfully.' });
});

authRouter.delete('/data', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const clearTx = db.transaction(() => {
    db.prepare('DELETE FROM documents WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM recordings WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM notes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM knowledge_nodes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM visual_guides WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM quizzes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM flashcards WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_activity WHERE user_id = ?').run(userId);
  });
  clearTx();
  res.json({ success: true, message: 'All study data cleared for your account.' });
});
