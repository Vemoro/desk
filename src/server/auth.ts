import { createHash, randomBytes } from 'node:crypto';
import { password } from 'bun';
import { z } from 'zod';
import { db, first } from './db';
import { DeskError } from './errors';
import { configuredOrigin } from './origin';

export const loginInput = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
export const accountInput = loginInput.extend({ name: z.string().trim().min(1).max(160), password: z.string().min(12).max(200), role: z.enum(['admin', 'member']) });
export const tokenInput = z.object({ label: z.string().trim().min(1).max(100), scope: z.enum(['read', 'write']) });
export type Actor = { id: string; email: string; name: string; role: 'admin' | 'member'; scope?: 'read' | 'write' };
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const idleHash = password.hash('unused-comparison-password');
const attempts = new Map<string, { count: number; expires: number }>();

export function requireAdmin(actor: Actor) {
  if (actor.role !== 'admin' || actor.scope) throw new DeskError(403, 'Eine Administratorsitzung ist erforderlich.');
}

export async function createAccount(input: z.input<typeof accountInput>) {
  const account = accountInput.parse(input);
  return await first<Actor>(db, 'INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email,name,role',
    [account.email.toLowerCase(), account.name, await password.hash(account.password), account.role]);
}

function cookie(request: Request) {
  return /(?:^|;\s*)desk_session=([\w-]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
}

export function sessionCookie(request: Request, value: string, age: number) {
  const origin = configuredOrigin() ?? new URL(request.url).origin;
  return `desk_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${origin.startsWith('https:') ? '; Secure' : ''}`;
}

export function protectOrigin(request: Request) {
  if (['GET', 'HEAD'].includes(request.method) || request.headers.get('authorization')?.startsWith('Bearer ')) return;
  const expected = configuredOrigin() ?? new URL(request.url).origin;
  if (request.headers.get('origin') !== expected) throw new DeskError(403, 'Die Herkunft der Anfrage stimmt nicht.');
}

export async function login(input: z.infer<typeof loginInput>, client: string) {
  const now = Date.now();
  for (const [key, attempt] of attempts) if (attempt.expires <= now) attempts.delete(key);
  const key = `${client.toLowerCase()}:${input.email.toLowerCase()}`;
  const attempt = attempts.get(key) ?? { count: 0, expires: now + 600_000 };
  if (attempt.count >= 8) throw new DeskError(429, 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.');
  if (attempts.size < 10000 || attempts.has(key)) attempts.set(key, { ...attempt, count: attempt.count + 1 });
  const account = await first<Actor & { password_hash: string }>(db, 'SELECT id,email,name,role,password_hash FROM users WHERE email=$1', [input.email.toLowerCase()]);
  const valid = await password.verify(input.password, account?.password_hash ?? await idleHash);
  if (!account || !valid) throw new DeskError(401, 'E-Mail oder Passwort stimmt nicht.');
  attempts.delete(key);
  const value = secret();
  await db.unsafe("INSERT INTO sessions VALUES ($1,$2,now() + interval '12 hours')", [hash(value), account.id]);
  return value;
}

export async function logout(request: Request) {
  const value = cookie(request);
  if (value) await db.unsafe('DELETE FROM sessions WHERE hash=$1', [hash(value)]);
}

export async function authenticate(request: Request): Promise<Actor> {
  const auth = request.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  const value = auth ? bearer : cookie(request);
  if (!value || value.length > 200) throw new DeskError(401, 'Anmeldung erforderlich.');
  const actor = bearer
    ? await first<Actor>(db, 'SELECT u.id,u.email,u.name,u.role,t.scope FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=$1', [hash(value)])
    : await first<Actor>(db, 'SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>now()', [hash(value)]);
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
