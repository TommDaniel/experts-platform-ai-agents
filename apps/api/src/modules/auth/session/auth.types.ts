import type { Request } from "express";

export interface SessionUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  emailVerifiedAt: Date | null;
}

export interface ValidatedSession {
  id: number;
  userId: number;
  tokenHash: string;
  revokedAt: Date | null;
  createdAt: Date;
  user: SessionUser;
}

export interface AuthenticatedRequest extends Request {
  session?: ValidatedSession;
  token?: string;
}
