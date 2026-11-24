import { SQL } from 'bun';
import { migrationFiles } from './migration-files';

declare const __DESK_MIGRATION_FILES__: readonly string[];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL fehlt.');
export const db = new SQL(databaseUrl);
export type Query = Pick<SQL, 'unsafe'>;

let readinessCheck: Promise<boolean> | undefined;
export function databaseReady() {
  // Überlappende HTTP-Aufrufe teilen sich eine Verbindung und dieselbe Frist.
  return readinessCheck ??= probeDatabase().finally(()=>{readinessCheck=undefined;});
}

async function probeDatabase() {
  const probe = new SQL({url:databaseUrl,max:1,connectionTimeout:2});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),2_000);});
    const query = schemaReady(probe).catch(()=>false);
    return await Promise.race([query,timeout]);
  } finally {
    clearTimeout(timer);
    await probe.close({timeout:0}).catch(()=>{});
  }
}

async function schemaReady(probe: Query) {
  const expected = typeof __DESK_MIGRATION_FILES__ === 'undefined'
    ? await migrationFiles()
    : __DESK_MIGRATION_FILES__;
  const entries = await probe.unsafe<{name:string}[]>('SELECT name FROM desk_migrations');
  const applied = new Set(entries.map(row=>row.name));
  return expected.length > 0 && expected.every(name=>applied.has(name));
}

export async function rows<T>(query: Query, statement: string, parameters: unknown[] = []): Promise<T[]> {
  return await query.unsafe(statement, parameters);
}

export async function first<T>(query: Query, statement: string, parameters: unknown[] = []): Promise<T | undefined> {
  return (await rows<T>(query, statement, parameters))[0];
}
