import { SQL } from 'bun';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL fehlt.');
export const db = new SQL(process.env.DATABASE_URL);
export type Query = Pick<SQL, 'unsafe'>;

export async function rows<T>(query: Query, statement: string, parameters: unknown[] = []): Promise<T[]> {
  return await query.unsafe(statement, parameters);
}

export async function first<T>(query: Query, statement: string, parameters: unknown[] = []): Promise<T | undefined> {
  return (await rows<T>(query, statement, parameters))[0];
}
