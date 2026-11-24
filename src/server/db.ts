import { SQL } from 'bun';

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
    const query = probe.unsafe('SELECT 1').then(()=>true,()=>false);
    return await Promise.race([query,timeout]);
  } finally {
    clearTimeout(timer);
    await probe.close({timeout:0}).catch(()=>{});
  }
}

export async function rows<T>(query: Query, statement: string, parameters: unknown[] = []): Promise<T[]> {
  return await query.unsafe(statement, parameters);
}

export async function first<T>(query: Query, statement: string, parameters: unknown[] = []): Promise<T | undefined> {
  return (await rows<T>(query, statement, parameters))[0];
}
