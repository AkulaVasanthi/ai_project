import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.ts';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_COOKIE_NAME = 'almg_session';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function signAuthToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, fullName: user.fullName },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function setAuthCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  const maxAgeSec = 7 * 24 * 60 * 60;
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
  ];

  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];

  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function verifyMutationCsrf(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return true;
  }

  const origin = req.headers.origin;
  const expectedHost = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
  if (origin && expectedHost) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === expectedHost) return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  let usedCookie = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies && typeof req.cookies[AUTH_COOKIE_NAME] === 'string') {
    token = req.cookies[AUTH_COOKIE_NAME];
    usedCookie = true;
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  if (usedCookie && !verifyMutationCsrf(req)) {
    res.status(403).json({ error: 'Invalid request origin.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as {
      sub: number | string;
      email: string;
      fullName: string;
    };

    const userId = Number(decoded.sub);
    const userRow = db
      .prepare('SELECT id, email, full_name FROM users WHERE id = ?')
      .get(userId) as { id: number; email: string; full_name: string } | undefined;

    if (!userRow) {
      res.status(401).json({ error: 'Session is no longer valid. Please sign in again.' });
      return;
    }

    req.user = {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
}
