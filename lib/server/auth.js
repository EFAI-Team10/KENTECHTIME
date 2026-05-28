import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export function signJwt(user) {
  return jwt.sign(
    { userId: user.id, role: user.role || 'student' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function requireAuth(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AuthError('인증이 필요합니다.', 401);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { userId: decoded.userId, role: decoded.role };
  } catch {
    throw new AuthError('유효하지 않은 토큰입니다.', 401);
  }
}

export function errorJson(message, status = 500) {
  return NextResponse.json({ error: message }, { status });
}
