import { expect, test } from 'bun:test';

const database=process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Haben-Tests brauchen eine isolierte Testdatenbank.');
const { db,first }=await import('../src/server/db');
const { saveCore }=await import('../src/server/core');
const { pullContacts,syncContact }=await import('../src/server/haben');

async function withHaben(fetch:(request:Request)=>Response | Promise<Response>,run:()=>Promise<void>) {
  const service=Bun.serve({hostname:'127.0.0.1',port:0,fetch});
  const previousUrl=process.env.HABEN_URL;
  const previousToken=process.env.HABEN_TOKEN;
  try {
    process.env.HABEN_URL=`http://127.0.0.1:${service.port}`;
    process.env.HABEN_TOKEN='muster-kontakt-test';
    await run();
  } finally {
    if (previousUrl===undefined) delete process.env.HABEN_URL; else process.env.HABEN_URL=previousUrl;
    if (previousToken===undefined) delete process.env.HABEN_TOKEN; else process.env.HABEN_TOKEN=previousToken;
    service.stop(true);
  }
}

async function newContact(name:string) {
  return await saveCore('contacts',{name,email:`${crypto.randomUUID()}@example.test`});
}

const contactState=(id:string)=>first(db,'SELECT name,email,haben_id,haben_export_pending FROM contacts WHERE id=$1',[id]);

test('Desk sichert eine neue Haben-Anlage vor dem Senden und wiederholt eine unklare Anlage nicht',async()=>{
  const local=await newContact('Muster Export');
  const remoteId=crypto.randomUUID();
  const requestStarted=Promise.withResolvers<void>();
  const finish=Promise.withResolvers<void>();
  let sends=0;
  await withHaben(async request=>{
    if (request.method==='POST') {
      sends++;
      requestStarted.resolve();
      await finish.promise;
      return new Response(null,{status:502});
    }
    return Response.json({id:remoteId,name:local.name,email:local.email,telefon:'',archived:false});
  },async()=>{
    const exportRequest=syncContact(local.id,{});
    try {
      await requestStarted.promise;
      expect(await contactState(local.id)).toMatchObject({haben_export_pending:true,haben_id:null});
    } finally {
      finish.resolve();
      await exportRequest;
    }
    expect(await exportRequest).toMatchObject({action:'error'});
    await expect(syncContact(local.id,{})).rejects.toMatchObject({status:409});
    expect(sends).toBe(1);
    expect(await syncContact(local.id,{link_id:remoteId.toUpperCase()})).toMatchObject({action:'linked'});
    expect(await contactState(local.id)).toMatchObject({haben_export_pending:false,haben_id:remoteId});
  });
});

test('Ein bestätigter Validierungsfehler gibt einen neuen Haben-Export wieder frei',async()=>{
  const local=await newContact('Muster Validierung');
  const remoteId=crypto.randomUUID();
  let sends=0;
  await withHaben(()=>++sends===1 ? new Response(null,{status:422}) :
    Response.json({id:remoteId,name:local.name,email:local.email,telefon:'',archived:false},{status:201}),async()=>{
    expect(await syncContact(local.id,{})).toMatchObject({action:'error'});
    expect(await contactState(local.id)).toMatchObject({haben_export_pending:false,haben_id:null});
    expect(await syncContact(local.id,{})).toMatchObject({action:'exported'});
    expect(await contactState(local.id)).toMatchObject({haben_export_pending:false,haben_id:remoteId});
  });
});

test('Eine falsche Kontakt-ID in einer Haben-Änderungsantwort überschreibt die Zuordnung nicht',async()=>{
  const local=await newContact('Muster Zuordnung');
  const remoteId=crypto.randomUUID();
  const otherId=crypto.randomUUID();
  await withHaben(request=>Response.json({
    id:request.method==='PATCH'?otherId:remoteId,name:local.name,email:local.email,telefon:'',archived:false,
  }),async()=>{
    expect(await syncContact(local.id,{link_id:remoteId})).toMatchObject({action:'linked'});
    await saveCore('contacts',{name:'Muster Geändert'},local.id);
    await expect(syncContact(local.id,{})).rejects.toMatchObject({status:502});
    expect(await contactState(local.id)).toMatchObject({name:'Muster Geändert',haben_id:remoteId});
  });
});

test('Beim Verknüpfen kann nur der Inhaber der Haben-ID den Kontakt ändern',async()=>{
  const winner=await newContact('Muster Erste Zuordnung');
  const duplicate=await newContact('Muster Zweite Zuordnung');
  const remoteId=crypto.randomUUID();
  const started=Promise.withResolvers<void>();
  const proceed=Promise.withResolvers<void>();
  let patches=0;
  await withHaben(async request=>{
    if (request.method==='GET') {
      started.resolve();
      await proceed.promise;
      return Response.json({id:remoteId,name:'Muster Haben',email:'',telefon:'',archived:false});
    }
    patches++;
    return Response.json({id:remoteId,archived:false,...await request.json() as object});
  },async()=>{
    const primary=syncContact(winner.id,{link_id:remoteId,prefer:'desk'});
    try {
      await started.promise;
      const probe=await first<{acquired:boolean}>(db,
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1::uuid::text,61277)) AS acquired',[remoteId]);
      expect(probe?.acquired).toBe(false);
      const competing=syncContact(duplicate.id,{link_id:remoteId,prefer:'desk'}).catch(error=>error);
      proceed.resolve();
      expect(await competing).toMatchObject({status:409});
      expect(await primary).toMatchObject({action:'pushed'});
      expect(patches).toBe(1);
      expect(await contactState(winner.id)).toMatchObject({haben_id:remoteId});
      expect(await contactState(duplicate.id)).toMatchObject({haben_id:null});
    } finally {
      proceed.resolve();
      await primary;
    }
  });
});

test('Eine unvollständige Haben-Antwort leert gespeicherte Kontaktfelder nicht',async()=>{
  const local=await newContact('Muster Vollständig');
  const remoteId=crypto.randomUUID();
  const remote={id:remoteId,name:local.name,email:local.email,telefon:'123',archived:false};
  let complete=true;
  await withHaben(()=>Response.json(complete?remote:{id:remote.id,name:remote.name}),async()=>{
    expect(await syncContact(local.id,{link_id:remoteId,prefer:'haben'})).toMatchObject({action:'pulled'});
    complete=false;
    await expect(syncContact(local.id,{})).rejects.toMatchObject({status:502});
    expect(await first(db,'SELECT email,phone FROM contacts WHERE id=$1',[local.id])).toEqual({email:local.email,phone:'123'});
  });
});

test('Eine verlorene Antwort bei der Erstverknüpfung führt beim erneuten Abgleich zu keiner Anlage',async()=>{
  const local=await newContact('Muster Erster Abgleich');
  const remoteId=crypto.randomUUID();
  let remote={id:remoteId,name:'Muster Haben',email:'',telefon:'',archived:false};
  const calls:string[]=[];
  await withHaben(async request=>{
    calls.push(request.method);
    if (request.method==='PATCH') {
      remote={...remote,...await request.json() as Partial<typeof remote>};
      return new Response(null,{status:502});
    }
    return Response.json(remote);
  },async()=>{
    expect(await syncContact(local.id,{link_id:remoteId})).toMatchObject({action:'conflict'});
    await expect(syncContact(local.id,{link_id:remoteId,prefer:'desk'})).rejects.toMatchObject({status:502});
    expect(await contactState(local.id)).toMatchObject({haben_id:remoteId});
    expect(await syncContact(local.id,{})).toMatchObject({action:'linked'});
    expect(calls.filter(method=>method!=='GET')).toEqual(['PATCH']);
  });
});

test('Sammelimport überspringt archivierte und inkompatible Haben-Kontakte sowie mögliche Dubletten',async()=>{
  const local=await newContact('Muster Vorhanden');
  const rows=[
    {id:crypto.randomUUID(),name:'muster vorhanden',email:'',archived:false},
    {id:crypto.randomUUID(),name:'Muster Archiv',email:'',archived:true},
    {id:crypto.randomUUID(),name:'Muster Mehrere Empfänger',email:'eins@example.test,zwei@example.test',archived:false},
    {id:crypto.randomUUID(),name:'Muster Import',email:'',archived:false},
  ].map(row=>({...row,telefon:''}));
  await withHaben(request=>Response.json(new URL(request.url).pathname.endsWith(rows[2].id) ?
    rows[2] : {data:rows,total:rows.length}),async()=>{
    expect(await pullContacts()).toEqual({imported:1});
    expect(await pullContacts()).toEqual({imported:0});
    expect(await contactState(local.id)).toMatchObject({haben_id:null});
    await expect(syncContact(local.id,{link_id:rows[2].id,prefer:'desk'})).rejects.toMatchObject({status:409});
  });
});
