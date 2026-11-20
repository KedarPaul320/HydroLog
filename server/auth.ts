import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '../src/types.ts';
import { db, mapUserRow, type DbUserRow } from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'hydrolog-dev-jwt-secret-change-in-production';
const TOKEN_TTL = '7d';

export interface AuthTokenPayload {
  userId: number;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function signAuthToken(user: User): string {
  const payload: AuthTokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAuthToken(token);
    const row = db
      .prepare('SELECT id, name, email, password_hash, role, created_at FROM users WHERE id = ?')
      .get(payload.userId) as DbUserRow | undefined;

    if (!row) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }

    req.user = mapUserRow(row);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid token.' });
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required for this action.' });
    return;
  }
  next();
}
