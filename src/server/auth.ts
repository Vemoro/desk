import { createHash, randomBytes } from 'node:crypto';
import { password } from 'bun';
import { APIError } from 'better-auth';
import { z } from 'zod';
import { db, first, type Query } from './db';
import { DeskError } from './errors';
import { accountInput, loginInput, withAccountAccess, type Actor } from './accounts';
import { deskAuth } from './desk-auth';
import { configuredOrigin } from './origin';

export { accountInput, createAccount, loginInput, type Actor } from './accounts';

export const tokenInput = z.object({ label: z.string().trim().min(1).max(100), scope: z.enum(['read', 'write']) });
export const passwordChangeInput = z.strictObject({
  currentPassword: loginInput.shape.password,
  newPassword: accountInput.shape.password,
  revokeOtherSessions: z.boolean().default(false),
});
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const attempts = new Map<string, { count: number; expires: number }>();

export function requireAdmin(actor: Actor) {
  if (actor.role !== 'admin' || actor.scope) throw new DeskError(403, 'Eine Administratorsitzung ist erforderlich.');
}

export function protectOrigin(request: Request) {
  const loginRoute = ['/api/v1/login','/api/v1/logout'].includes(new URL(request.url).pathname);
  if (['GET', 'HEAD'].includes(request.method) || (!loginRoute && request.headers.get('authorization')?.startsWith('Bearer '))) return;
  const expected = configuredOrigin() ?? new URL(request.url).origin;
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
    const { headers } = await withAccountAccess('shared', () => deskAuth().api.signInEmail({
      body: { email: input.email.toLowerCase(), password: input.password },
      headers: request.headers,
      returnHeaders: true,
    }));
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
  const auth = deskAuth();
  const active = await auth.api.getSession({ headers: request.headers });
  // Better Auth still clears cookies if its own session deletion fails.
  if (active) {
    await db.unsafe('DELETE FROM auth_sessions WHERE id=$1 AND "userId"=$2',[active.session.id,active.user.id]);
  }
  const { headers } = await auth.api.signOut({ headers: request.headers, returnHeaders: true });
  return headers;
}

export async function authenticate(request: Request, query: Query) {
  const auth = request.headers.get('authorization');
  let actor: Actor | undefined;
  let sessionId: string | undefined;
  if (auth !== null) {
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (bearer && bearer.length <= 200) {
      actor = await first<Actor>(query, 'SELECT u.id,u.email,u.name,u.role,t.scope FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=$1 AND NOT u.blocked', [hash(bearer)]);
    }
  } else if (request.headers.has('cookie')) {
    const session = await deskAuth().api.getSession({ headers: request.headers });
    if (session) {
      actor = await first<Actor>(query,'SELECT id,email,name,role FROM users WHERE id=$1 AND NOT blocked',[session.user.id]);
      sessionId = session.session.id;
    }
  }
  if (!actor) throw new DeskError(401, 'Anmeldung erforderlich.');
  if (actor.scope === 'read' && !['GET','HEAD'].includes(request.method)) throw new DeskError(403, 'Dieses Token erlaubt nur Lesezugriff.');
  return { actor, sessionId };
}

export async function changePassword(query: Query, userId: string, sessionId: string, input: z.infer<typeof passwordChangeInput>) {
  const session = await first(query,`
    SELECT id FROM auth_sessions WHERE id=$1 AND "userId"=$2 AND "expiresAt">now() FOR UPDATE
  `,[sessionId,userId]);
  if (!session) throw new DeskError(401, 'Anmeldung erforderlich.');

  const credential = await first<{id:string; password:string | null}>(query,`
    SELECT id,password FROM auth_accounts WHERE "userId"=$1 AND "providerId"='credential'
  `,[userId]);
  if (!credential?.password || !await password.verify(input.currentPassword,credential.password)) {
    throw new DeskError(400, 'Das aktuelle Passwort stimmt nicht.');
  }
  // Compare the UTF-8 bytes that Bun hashes.
  if (Buffer.from(input.currentPassword).equals(Buffer.from(input.newPassword))) {
    throw new DeskError(400, 'Wähle ein anderes neues Passwort.');
  }

  const newHash = await password.hash(input.newPassword);
  await query.unsafe('UPDATE auth_accounts SET password=$2,"updatedAt"=now() WHERE id=$1',[credential.id,newHash]);
  // Keep the legacy credential current for application-only rollbacks.
  await query.unsafe('UPDATE users SET password_hash=$2 WHERE id=$1',[userId,newHash]);
  if (input.revokeOtherSessions) {
    await query.unsafe('DELETE FROM auth_sessions WHERE "userId"=$1 AND id<>$2',[userId,sessionId]);
  }
  return {ok:true};
}

export async function createToken(actor: Actor, input: z.infer<typeof tokenInput>, query: Query = db) {
  requireAdmin(actor);
  const token = `desk_${secret()}`;
  const record = await first<{ id:string; label:string; scope:string; created_at:Date }>(query,`
    INSERT INTO api_tokens(hash,user_id,label,scope)
    SELECT $1,id,$3,$4 FROM users WHERE id=$2 AND NOT blocked FOR SHARE
    RETURNING id,label,scope,created_at`,
    [hash(token), actor.id, input.label, input.scope]);
  if (!record) throw new DeskError(401, 'Anmeldung erforderlich.');
  return { ...record, token };
}
