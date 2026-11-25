import { password } from 'bun';
import { z } from 'zod';
import { db, first, type Query } from './db';
import { DeskError, required } from './errors';

export const loginInput = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
export const accountInput = loginInput.extend({ name: z.string().trim().min(1).max(160), password: z.string().min(12).max(200), role: z.enum(['admin', 'member']) });
export const accountAccessInput = z.strictObject({ blocked: z.boolean() });
export type Actor = { id: string; email: string; name: string; role: 'admin' | 'member'; scope?: 'read' | 'write' };
type TeamAccount = Pick<Actor, 'id' | 'name' | 'role'> & { blocked: boolean };

export function withAccountAccess<T>(mode: 'shared' | 'exclusive', action: (query: Query) => Promise<T>) {
  return db.begin(async transaction => {
    // Better Auth uses a separate pool. Hold the lock until it has saved the session.
    await transaction.unsafe(mode === 'shared'
      ? 'SELECT pg_advisory_xact_lock_shared(61275)'
      : 'SELECT pg_advisory_xact_lock(61275)');
    return action(transaction);
  });
}

export async function changeAccountAccess(query: Query, id: string, blocked: boolean) {
  const account = required(await first<TeamAccount>(query,
    'SELECT id,name,role,blocked FROM users WHERE id=$1', [id]), 'Teamkonto nicht gefunden.');
  if (blocked === account.blocked) return account;
  if (blocked && account.role === 'admin' && !await first(query,
    "SELECT id FROM users WHERE role='admin' AND NOT blocked AND id<>$1 LIMIT 1", [id])) {
    throw new DeskError(409, 'Mindestens ein Administrationskonto muss aktiv bleiben.');
  }
  await query.unsafe('UPDATE users SET blocked=$2 WHERE id=$1', [id, blocked]);
  if (blocked) {
    await query.unsafe('DELETE FROM auth_sessions WHERE "userId"=$1', [id]);
    await query.unsafe('DELETE FROM api_tokens WHERE user_id=$1', [id]);
  }
  return { ...account, blocked };
}

export async function requireAvailableAssignee(query: Query, id: string) {
  const account = await first<{ blocked: boolean }>(query, 'SELECT blocked FROM users WHERE id=$1 FOR SHARE', [id]);
  if (!account || account.blocked) throw new DeskError(409, 'Diese Person ist für neue Zuordnungen gesperrt oder nicht vorhanden.');
}

export async function createAccount(input: z.input<typeof accountInput>) {
  const account = accountInput.parse(input);
  return await first<Actor>(db, 'INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email,name,role',
    [account.email.toLowerCase(), account.name, await password.hash(account.password), account.role]);
}
