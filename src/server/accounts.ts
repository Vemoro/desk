import { password } from 'bun';
import { z } from 'zod';
import { db, first } from './db';

export const loginInput = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
export const accountInput = loginInput.extend({ name: z.string().trim().min(1).max(160), password: z.string().min(12).max(200), role: z.enum(['admin', 'member']) });
export type Actor = { id: string; email: string; name: string; role: 'admin' | 'member'; scope?: 'read' | 'write' };

export async function createAccount(input: z.input<typeof accountInput>) {
  const account = accountInput.parse(input);
  return await first<Actor>(db, 'INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email,name,role',
    [account.email.toLowerCase(), account.name, await password.hash(account.password), account.role]);
}
