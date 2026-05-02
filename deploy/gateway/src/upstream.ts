import type { Request } from 'express';

export function readUpstream(req: Request): { auth: string; baseUrl: string } | null {
  const rawAuth = req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(rawAuth);
  const token = m?.[1]?.trim();
  let baseUrl = req.header('x-upstream-base-url')?.trim() || '';
  if (!token || !baseUrl) return null;
  baseUrl = baseUrl.replace(/\/+$/, '');
  return { auth: token, baseUrl };
}
