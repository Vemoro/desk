import { SQL } from 'bun';
import { requireDatabaseUrl } from './database-url';
import { migrationFiles } from './migration-files';

declare const __DESK_MIGRATION_FILES__: readonly string[];

const databaseUrl = requireDatabaseUrl();
export const db = new SQL(databaseUrl);
export type Query = Pick<SQL, 'unsafe'>;

const readinessTimeoutMs = 2_000;
let readinessCheck: Promise<boolean> | undefined;
export function databaseReady() {
  // Überlappende HTTP-Aufrufe teilen sich eine Verbindung und dieselbe Frist.
  return readinessCheck ??= probeDatabase().finally(()=>{readinessCheck=undefined;});
}

async function probeDatabase() {
  const probe = new SQL({url:databaseUrl,max:1,connectionTimeout:readinessTimeoutMs/1000,
    connection:{statement_timeout:readinessTimeoutMs}});
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: SQL.Query<{name:string}[]> | undefined;
  let expired = false;
  try {
    const timeout = new Promise<boolean>(resolve=>{
      timer = setTimeout(()=>{
        expired = true;
        pending?.cancel();
        resolve(false);
      },readinessTimeoutMs);
    });
    const query = expectedMigrations().then(async expected=>{
      if (expired || expected.length===0) return false;
      pending = probe.unsafe<{name:string}[]>('SELECT name FROM desk_migrations');
      const entries = await pending;
      const applied = new Set(entries.map(row=>row.name));
      return expected.every(name=>applied.has(name));
    }).catch(()=>false);
    return await Promise.race([query,timeout]);
  } finally {
    clearTimeout(timer);
    await probe.close({timeout:0}).catch(()=>{});
  }
}

async function expectedMigrations() {
  return typeof __DESK_MIGRATION_FILES__ === 'undefined'
    ? await migrationFiles()
    : __DESK_MIGRATION_FILES__;
}

export async function rows<T>(query: Query, statement: string, parameters: unknown[] = []): Promise<T[]> {
  return await query.unsafe(statement, parameters);
}

export async function first<T>(query: Query, statement: string, parameters: unknown[] = []): Promise<T | undefined> {
  return (await rows<T>(query, statement, parameters))[0];
}
