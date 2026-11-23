import { createHash, randomBytes } from 'node:crypto';
import { APIError } from 'better-auth';
import { z } from 'zod';
import { db, first } from './db';
import { DeskError } from './errors';
import { loginInput, type Actor } from './accounts';
import { deskAuth } from './desk-auth';

export { accountInput, createAccount, loginInput, type Actor } from './accounts';

export const tokenInput = z.object({ label: z.string().trim().min(1).max(100), scope: z.enum(['read', 'write']) });
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const attempts = new Map<string, { count: number; expires: number }>();

export function requireAdmin(actor: Actor) {
  if (actor.role !== 'admin' || actor.scope) throw new DeskError(403, 'Eine Administratorsitzung ist erforderlich.');
}

export function protectOrigin(request: Request) {
  const loginRoute = ['/api/v1/login','/api/v1/logout'].includes(new URL(request.url).pathname);
  if (['GET', 'HEAD'].includes(request.method) || (!loginRoute && request.headers.get('authorization')?.startsWith('Bearer '))) return;
  const expected = new URL(process.env.DESK_ORIGIN ?? request.url).origin;
  if (request.headers.get('origin') !== expected) throw new DeskError(403, 'Die Herkunft der Anfrage stimmt nicht.');
}

export async function login(input: z.infer<typeof loginInput>, request: Request) {
  const now = Date.now();
  for (const [key, attempt] of attempts) if (attempt.expires <= now) attempts.delete(key);
  const key = `${new URL(request.url).hostname}:${input.email.toLowerCase()}`;
  const attempt = attempts.get(key) ?? { count: 0, expires: now + 600_000 };
  if (attempt.count >= 8) throw new DeskError(429, 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.');
  if (attempts.size < 10000 || attempts.has(key)) attempts.set(key, { ...attempt, count: attempt.count + 1 });
  try {
    const { headers } = await deskAuth().api.signInEmail({
      body: { email: input.email.toLowerCase(), password: input.password },
      headers: request.headers,
      returnHeaders: true,
    });
    attempts.delete(key);
    return headers;
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 401) {
      throw new DeskError(401, 'E-Mail oder Passwort stimmt nicht.');
    }
    throw error;
  }
}

export async function logout(request: Request) {
  const { headers } = await deskAuth().api.signOut({ headers: request.headers, returnHeaders: true });
  return headers;
}

export async function authenticate(request: Request): Promise<Actor> {
  const auth = request.headers.get('authorization');
  let actor: Actor | undefined;
  if (auth !== null) {
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (bearer && bearer.length <= 200) {
      actor = await first<Actor>(db, 'SELECT u.id,u.email,u.name,u.role,t.scope FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=$1', [hash(bearer)]);
    }
  } else if (request.headers.has('cookie')) {
    const session = await deskAuth().api.getSession({ headers: request.headers });
    if (session) {
      actor = await first<Actor>(db,'SELECT id,email,name,role FROM users WHERE id=$1',[session.user.id]);
    }
  }
  if (!actor) throw new DeskError(401, 'Anmeldung erforderlich.');
  if (actor.scope === 'read' && !['GET','HEAD'].includes(request.method)) throw new DeskError(403, 'Dieses Token erlaubt nur Lesezugriff.');
  return actor;
}

export async function createToken(actor: Actor, input: z.infer<typeof tokenInput>) {
  requireAdmin(actor);
  const token = `desk_${secret()}`;
  const record = await first<{ id:string; label:string; scope:string; created_at:Date }>(db, 'INSERT INTO api_tokens(hash,user_id,label,scope) VALUES ($1,$2,$3,$4) RETURNING id,label,scope,created_at',
    [hash(token), actor.id, input.label, input.scope]);
  return { ...record, token };
}
