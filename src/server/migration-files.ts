import { readdir } from 'node:fs/promises';

export const migrationsDirectory = new URL('../../migrations/', import.meta.url);

export async function migrationFiles() {
  return (await readdir(migrationsDirectory)).filter(name=>name.endsWith('.sql')).sort();
}
