import { SQL } from 'bun';
import { expect, test } from 'bun:test';

const database = process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) {
  throw new Error('Tests benötigen eine isolierte DATABASE_URL mit Endung _test.');
}

async function runningDesk(databaseUrl:string, check:(url:string)=>Promise<void>) {
  const child=Bun.spawn([process.execPath,'-e',`
    import { handle } from './src/server/api';
    const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:handle});
    console.log(server.url.origin);
  `], {
    env:{...process.env,DATABASE_URL:databaseUrl,HABEN_URL:'https://haben.invalid',HABEN_TOKEN:'muster',
      ZAMMAD_URL:'https://zammad.invalid',ZAMMAD_TOKEN:'muster'},
    stdout:'pipe',stderr:'inherit',
  });
  const reader=child.stdout.pipeThrough(new TextDecoderStream()).getReader();
  try {
    const {value}=await reader.read();
    const url=value?.trim();
    if(!url?.startsWith('http://127.0.0.1:')) throw new Error('Desk-Testdienst meldet keine lokale Adresse.');
    await check(url+'/api/v1/ready');
  } finally {
    child.kill();
    await reader.cancel();
    await child.exited;
  }
}

function localDatabaseUrl(port:number) {
  return `postgres://probe:synthetisch@127.0.0.1:${port}/probe_test?sslmode=disable`;
}

test('Desk meldet die Bereitschaft bei erreichbarem PostgreSQL ohne Anmeldung',async()=>{
  await runningDesk(database,async url=>{
    const response=await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ready:true});
  });
});

test('Desk meldet erst nach der Migration eines erreichbaren Schemas Bereitschaft',async()=>{
  const schema='readiness_'+crypto.randomUUID().replaceAll('-','');
  const url=new URL(database);
  url.searchParams.set('options',`-c search_path=${schema}`);
  const control=new SQL(database);
  const isolated=new SQL(url.href);
  try {
    await control.unsafe(`CREATE SCHEMA "${schema}"`);
    await runningDesk(url.href,async endpoint=>{
      async function expectReady(ready:boolean) {
        const response=await fetch(endpoint);
        expect(response.status).toBe(ready?200:503);
        expect(await response.json()).toEqual({ready});
      }
      await expectReady(false);
      await isolated.unsafe('CREATE TABLE desk_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      await isolated.unsafe('INSERT INTO desk_migrations (name) VALUES ($1)',['synthetischer-altstand.sql']);
      await expectReady(false);
      const migrate=Bun.spawn([process.execPath,'scripts/migrate.ts'],{
        env:{...process.env,DATABASE_URL:url.href},
        stdout:'inherit',stderr:'inherit',
      });
      expect(await migrate.exited).toBe(0);
      await expectReady(true);
    });
  } finally {
    await isolated.close();
    await control.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await control.close();
  }
});

test('Desk meldet einen abgelehnten PostgreSQL-Verbindungsversuch als nicht bereit',async()=>{
  const socket=Bun.listen({hostname:'127.0.0.1',port:0,socket:{data(){}}});
  const url=localDatabaseUrl(socket.port);
  socket.stop(true);
  await runningDesk(url,async endpoint=>{
    const response=await fetch(endpoint);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ready:false});
  });
});

test('Eine blockierte Bereitschaftsabfrage endet auch auf dem Datenbankserver',async()=>{
  const control=new SQL(database);
  const locked=Promise.withResolvers<void>();
  const unlock=Promise.withResolvers<void>();
  const transaction=control.begin(async held=>{
    await held.unsafe('LOCK TABLE desk_migrations IN ACCESS EXCLUSIVE MODE');
    locked.resolve();
    await unlock.promise;
  });
  try {
    await Promise.race([locked.promise,transaction]);
    await runningDesk(database,async endpoint=>{
      const start=performance.now();
      const response=await fetch(endpoint);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ready:false});
      expect(performance.now()-start).toBeLessThan(3_000);
      const count=async()=>{
        const [row]=await control.unsafe<{total:number}[]>(`SELECT count(*)::int AS total
          FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND query=$1`,
        ['SELECT name FROM desk_migrations']);
        return row.total;
      };
      let waiting=await count();
      for(let attempt=0;waiting>0 && attempt<10;attempt++){
        await Bun.sleep(50);
        waiting=await count();
      }
      expect(waiting).toBe(0);
    });
  } finally {
    unlock.resolve();
    await transaction;
    await control.close();
  }
});

test('Desk begrenzt eine während des Verbindungsaufbaus verzögerte Prüfung',async()=>{
  let connections=0;
  const delayed=Bun.listen({hostname:'127.0.0.1',port:0,socket:{
    open(){connections++;},
    data(){},
  }});
  try {
    await runningDesk(localDatabaseUrl(delayed.port),async url=>{
      const start=performance.now();
      const responses=await Promise.all([fetch(url),fetch(url)]);
      expect(performance.now()-start).toBeLessThan(3_000);
      expect(connections).toBe(1);
      for(const response of responses) {
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ready:false});
      }
    });
  } finally { delayed.stop(true); }
});
