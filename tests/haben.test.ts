import { expect,test } from 'bun:test';

const selected = process.env.DATABASE_URL;
if (!selected || !new URL(selected).pathname.endsWith('_test')) throw new Error('Haben-Tests brauchen eine isolierte Testdatenbank.');
const { db }=await import('../src/server/db');
const { saveCore,changeStage }=await import('../src/server/core');
const { syncContact }=await import('../src/server/haben');
const { createAccount,createToken }=await import('../src/server/auth');
const { handle }=await import('../src/server/api');

test('Haben-Antwort bestätigt den Auftrag. Kontaktänderungen fließen in beide Richtungen',async()=>{
  const contactId=crypto.randomUUID();
  const offerId=crypto.randomUUID();
  let remote={id:contactId,name:'Musterkontakt',email:'erste@example.test',telefon:'123',archived:false};
  const service=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
    const path=new URL(request.url).pathname;
    if(path===`/api/v1/angebote/${offerId}`) return Response.json({id:offerId,listStatus:'angenommen',number:'ANG-12',contactId});
    if(path===`/api/v1/kontakte/${contactId}`) {
      if(request.method==='PATCH') remote={...remote,...await request.json() as Partial<typeof remote>};
      return Response.json(remote);
    }
    return new Response('unknown',{status:404});
  }});
  const previousUrl=process.env.HABEN_URL;
  const previousToken=process.env.HABEN_TOKEN;
  try {
    process.env.HABEN_URL=`http://127.0.0.1:${service.port}`;
    process.env.HABEN_TOKEN='muster';
    const contact=await saveCore('contacts',{name:remote.name,email:remote.email,phone:remote.telefon}) as {id:string};
    expect(await syncContact(contact.id,{link_id:contactId})).toMatchObject({action:'linked'});
    await saveCore('contacts',{phone:'567'},contact.id);
    expect(await syncContact(contact.id,{})).toMatchObject({action:'pushed'});
    expect(remote.telefon).toBe('567');
    remote={...remote,email:'zweite@example.test'};
    expect(await syncContact(contact.id,{})).toMatchObject({action:'pulled'});
    await saveCore('contacts',{phone:'890'},contact.id);
    remote={...remote,email:'dritte@example.test'};
    expect(await syncContact(contact.id,{})).toMatchObject({action:'conflict'});
    const project=await saveCore('projects',{name:'Haben Abnahme',contact_id:contact.id}) as {id:string};
    await changeStage(project.id,'planning');
    const actor=(await createAccount({email:`${crypto.randomUUID()}@example.test`,name:'Muster Haben-Abgleich',
      password:'muster-test-passwort',role:'admin'}))!;
    const token=await createToken(actor,{label:'Haben-Abgleich',scope:'write'});
    const headers={Authorization:`Bearer ${token.token}`,'Content-Type':'application/json'};
    const base=`http://desk.local/api/v1/projects/${project.id}`;
    for (const body of [{id:offerId},{}]) {
      const synced=await handle(new Request(base+'/haben-offer',{method:'POST',headers,body:JSON.stringify(body)}));
      expect(synced.status).toBe(201);
      expect(await synced.json()).toMatchObject({stage:'confirmed',offer_ref:'ANG-12'});
    }
    const history=await handle(new Request(base+'/history',{headers}));
    expect(await history.json()).toMatchObject([
      {kind:'stage',previous_status:'planning',status:'confirmed',source:'haben',actor_id:actor.id},
      {kind:'stage',previous_status:'inquiry',status:'planning',source:'desk',actor_id:null},
    ]);
  } finally {
    if(previousUrl===undefined) delete process.env.HABEN_URL; else process.env.HABEN_URL=previousUrl;
    if(previousToken===undefined) delete process.env.HABEN_TOKEN; else process.env.HABEN_TOKEN=previousToken;
    service.stop(true);
  }
});

test('Eine verspätete Haben-Antwort überschreibt die neue Angebotsverknüpfung und den Verlauf nicht',async()=>{
  const oldId=crypto.randomUUID();
  const currentId=crypto.randomUUID();
  const started=Promise.withResolvers<void>();
  const release=Promise.withResolvers<void>();
  let paused=false;
  const service=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
    const path=new URL(request.url).pathname;
    if (path===`/api/v1/angebote/${oldId}`) {
      if (!paused) return Response.json({id:oldId,listStatus:'entwurf'});
      started.resolve();
      await release.promise;
      return Response.json({id:oldId,listStatus:'angenommen'});
    }
    if (path===`/api/v1/angebote/${currentId}`) return Response.json({id:currentId,listStatus:'entwurf'});
    return new Response(null,{status:404});
  }});
  const previousUrl=process.env.HABEN_URL;
  const previousToken=process.env.HABEN_TOKEN;
  try {
    process.env.HABEN_URL=`http://127.0.0.1:${service.port}`;
    process.env.HABEN_TOKEN='muster';
    const actor=(await createAccount({email:`${crypto.randomUUID()}@example.test`,name:'Muster Angebotswechsel',
      password:'muster-test-passwort',role:'admin'}))!;
    const token=await createToken(actor,{label:'Haben-Abgleich',scope:'write'});
    const headers={Authorization:`Bearer ${token.token}`,'Content-Type':'application/json'};
    const contact=await saveCore('contacts',{name:'Muster Angebot'}) as {id:string};
    const project=await saveCore('projects',{name:'Muster Angebotswechsel',contact_id:contact.id}) as {id:string};
    const base=`http://desk.local/api/v1/projects/${project.id}`;
    const sync=(id:string)=>handle(new Request(base+'/haben-offer',{method:'POST',headers,body:JSON.stringify({id})}));
    await changeStage(project.id,'planning',actor.id);
    expect((await sync(oldId)).status).toBe(201);
    paused=true;
    const stale=sync(oldId);
    await started.promise;
    expect((await sync(currentId)).status).toBe(201);
    release.resolve();
    expect((await stale).status).toBe(409);
    const current=await handle(new Request(base,{headers}));
    expect(await current.json()).toMatchObject({haben_offer_id:currentId,stage:'planning'});
    const history=await handle(new Request(base+'/history',{headers}));
    expect(await history.json()).toEqual([expect.objectContaining({status:'planning',source:'desk'})]);
  } finally {
    release.resolve();
    if (previousUrl===undefined) delete process.env.HABEN_URL; else process.env.HABEN_URL=previousUrl;
    if (previousToken===undefined) delete process.env.HABEN_TOKEN; else process.env.HABEN_TOKEN=previousToken;
    service.stop(true);
  }
});
