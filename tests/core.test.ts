import { beforeAll, describe, expect, test } from 'bun:test';

const database = process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Tests benötigen eine isolierte DATABASE_URL mit Endung _test.');

const { db, first } = await import('../src/server/db');
const { createAccount, createToken } = await import('../src/server/auth');
const { handle } = await import('../src/server/api');
const { changeStage, controlling, importCosts, saveCore } = await import('../src/server/core');
const { createReservation, setReservation, createMovement, listReservations, listStock } = await import('../src/server/stock');
const { addMinutes, fixture } = await import('./fixture');
let actor: NonNullable<Awaited<ReturnType<typeof createAccount>>>;
const getId = (value:unknown)=>(value as {id:string}).id;

beforeAll(async () => {
  const existing = await first<{ id:string; name:string; email:string; role:'admin' }>(db,'SELECT id,name,email,role FROM users WHERE email=$1',['admin@example.test']);
  actor=existing ?? (await createAccount({email:'admin@example.test',name:'Testperson',password:'muster-test-passwort',role:'admin'}))!;
});

describe('Fachlicher Projektablauf', () => {
  for (const [example, reserve] of [['Veranstaltungsbetreuung', true],['Büroinstallation',false]] as const) {
    test(`${example} ohne Integrationen bis zur Rechnungsreferenz`,async()=>{
      const data=await fixture(saveCore,example);
      const project=data.project;
      await saveCore('tasks',{project_id:project,name:'Auftrag vorbereiten',assignee_id:actor.id,status:'todo'});
      await changeStage(project,'planning');
      await expect(changeStage(project,'offered')).rejects.toThrow('Angebotsreferenz');
      await saveCore('projects',{offer_ref:'ANG-01'},project);
      await changeStage(project,'offered');
      await changeStage(project,'confirmed');
      await saveCore('lines',{project_id:project,kind:'buy',name:'Material',quantity:2,unit_cents:2000});
      await saveCore('lines',{project_id:project,kind:'sell',name:'Service',quantity:2,unit_cents:5000});
      const cost={name:'Verbrauchsmaterial',cents:3000,source:project,reference:'Beleg-42',cost_center:data.center};
      await importCosts([cost]); await importCosts([cost]);
      expect(await controlling(project)).toEqual({planned_buy:4000,planned_sell:10000,actual:3000,difference:-1000});
      if(reserve) {
        await createMovement({ action:'receive',item_id:data.material,location_id:data.location,quantity:10 },actor.id);
        const booking=getId(await createReservation({...data.booking,item_id:data.material,quantity:3}));
        await setReservation(booking,'firm');
        await createMovement({action:'consume',reservation_id:booking,quantity:2},actor.id);
        expect((await listStock()).find((entry)=>entry.item_id===data.material)).toMatchObject({physical:8,reserved:1,free:7});
      }
      await changeStage(project,'running');
      await expect(changeStage(project,'complete')).rejects.toThrow('Rechnungsreferenz');
      await saveCore('projects',{invoice_ref:'RE-401',communication_note:'Extern bestätigt.'},project);
      expect(await changeStage(project,'complete')).toMatchObject({stage:'complete'});
    });
  }

  test('Konkurrierende Reservierungen, Teilausgabe und Rückgabe nach Absage',async()=>{
    const data=await fixture(saveCore,'Doppelreservierung');
    await changeStage(data.project,'planning'); await saveCore('projects',{offer_ref:'ANG-02'},data.project);
    await changeStage(data.project,'offered'); await changeStage(data.project,'confirmed');
    await createMovement({action:'receive',item_id:data.equipment,location_id:data.location,quantity:4},actor.id);
    const reservationIds=await Promise.all([1,2].map(async()=>getId(await createReservation({...data.booking,item_id:data.equipment,quantity:3}))));
    const results=await Promise.allSettled(reservationIds.map((id)=>setReservation(id,'firm')));
    expect(results.filter((result)=>result.status==='fulfilled')).toHaveLength(1);
    const id=reservationIds[results.findIndex((result)=>result.status==='fulfilled')];
    await createMovement({action:'issue',reservation_id:id,quantity:2},actor.id);
    await createMovement({action:'return',reservation_id:id,quantity:1},actor.id);
    await changeStage(data.project,'cancelled');
    expect((await listReservations(200,0)).find((row:any)=>row.id===id)).toMatchObject({status:'released',checked_out:1});
    await createMovement({action:'return',reservation_id:id,quantity:1},actor.id);
    expect((await listStock()).find((entry)=>entry.item_id===data.equipment)).toMatchObject({physical:4,reserved:0,free:4});
    await expect(createMovement({action:'return',reservation_id:id,quantity:1},actor.id)).rejects.toThrow('Rückgabe');
  });

  test('Schichtgrenzen verhindern konkurrierende feste Personalbuchungen',async()=>{
    const data=await fixture(saveCore,'Schichten');
    await changeStage(data.project,'planning'); await saveCore('projects',{offer_ref:'ANG-03'},data.project);
    await changeStage(data.project,'offered'); await changeStage(data.project,'confirmed');
    const staff=(await createAccount({email:crypto.randomUUID()+'@example.test',name:'Planungstest',password:'muster-test-passwort',role:'member'}))!;
    const common={project_id:data.project,user_id:staff.id,quantity:1};
    const base=Date.now()+500_000_000;
    const first=getId(await createReservation({...common,starts_at:addMinutes(base,0),ends_at:addMinutes(base,60)}));
    const overlapping=getId(await createReservation({...common,starts_at:addMinutes(base,59),ends_at:addMinutes(base,65)}));
    const beside=getId(await createReservation({...common,starts_at:addMinutes(base,60),ends_at:addMinutes(base,80)}));
    await setReservation(first,'firm');
    await expect(setReservation(overlapping,'firm')).rejects.toThrow('bereits fest');
    expect(await setReservation(beside,'firm')).toMatchObject({status:'firm'});
  });
});

describe('API und Integrationen',()=>{
  test('Belegte Projekt-Kostenstellen beim Anlegen und Bearbeiten melden',async()=>{
    const data=await fixture(saveCore,'Musterauftrag Kostenstellen');
    const token=await createToken(actor,{label:'Kostenstellen-Test',scope:'write'});
    const headers={Authorization:`Bearer ${token.token}`,'Content-Type':'application/json'};
    const send=(method:string,path:string,body:unknown)=>handle(new Request(`http://desk.local/api/v1/${path}`,{
      method,headers,body:JSON.stringify(body),
    }));
    const project={name:'Musterinstallation ohne Kostenstelle',contact_id:data.contact};
    const message={error:'Diese Kostenstelle ist bereits einem Projekt zugeordnet.'};
    try {
      const duplicateCreate=await send('POST','projects',{...project,cost_center:data.center});
      expect(duplicateCreate.status).toBe(409);
      expect(await duplicateCreate.json()).toEqual(message);

      const blankProjects=await Promise.all([
        send('POST','projects',project),
        send('POST','projects',{...project,name:'Musterbetreuung ohne Kostenstelle',cost_center:''}),
      ]);
      for(const blank of blankProjects) expect(blank.status).toBe(201);
      const [firstBlank,secondBlank]=await Promise.all(blankProjects.map(response=>response.json()));
      expect(firstBlank).toMatchObject({cost_center:''});
      expect(secondBlank).toMatchObject({cost_center:''});

      const duplicateUpdate=await send('PATCH',`projects/${firstBlank.id}`,{cost_center:data.center});
      expect(duplicateUpdate.status).toBe(409);
      expect(await duplicateUpdate.json()).toEqual(message);

      const unchanged=await send('PATCH',`projects/${data.project}`,{cost_center:data.center});
      expect(unchanged.status).toBe(200);
      expect(await unchanged.json()).toMatchObject({cost_center:data.center});
    } finally {
      await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
    }
  });

  test('Doppelter Artikelcode behält die allgemeine Konfliktmeldung',async()=>{
    const token=await createToken(actor,{label:'Artikelcode-Test',scope:'write'});
    const headers={Authorization:`Bearer ${token.token}`,'Content-Type':'application/json'};
    const code=`TEST-${crypto.randomUUID()}`;
    try {
      await saveCore('items',{name:'Mustergerät',kind:'equipment',code});
      const duplicate=await handle(new Request('http://desk.local/api/v1/items',{
        method:'POST',headers,body:JSON.stringify({name:'Zweites Mustergerät',kind:'equipment',code}),
      }));
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toEqual({error:'Dieser Wert oder diese Zuordnung ist bereits vorhanden.'});
    } finally {
      await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
    }
  });



  test('OpenAPI und Berechtigungen eines widerrufbaren Tokens',async()=>{
    const anonymous=await handle(new Request('http://desk.local/api/v1/projects'));
    expect(anonymous.status).toBe(401);
    const schema=await handle(new Request('http://desk.local/api/v1/openapi.json'));
    expect(schema.status).toBe(200);
    expect(await schema.json()).toMatchObject({openapi:'3.1.0'});
    const token=await createToken(actor,{label:'Lesetest',scope:'read'});
    const headers={Authorization:`Bearer ${token.token}`,'Content-Type':'application/json'};
    expect((await handle(new Request('http://desk.local/api/v1/projects',{headers}))).status).toBe(200);
    expect((await handle(new Request('http://desk.local/api/v1/projects',{method:'POST',headers,body:'{}'}))).status).toBe(403);
    await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
    expect((await handle(new Request('http://desk.local/api/v1/projects',{headers}))).status).toBe(401);
  });

  test('Unklaren Zammad-Versand im Verlauf wiederfinden, ohne erneut zu senden',async()=>{
    const { send,reviewOutgoing }=await import('../src/server/zammad');
    const data=await fixture(saveCore,'Zammad-Verlauf');
    await db.unsafe('UPDATE projects SET zammad_ticket_id=$1 WHERE id=$2',[Math.floor(Math.random()*1_000_000)+100,data.project]);
    let article: {id:number;body:string}|undefined;
    let sends=0;
    let remoteMode:'unknown'|'reject'|'accept'='unknown';
    const service=Bun.serve({port:0,hostname:'127.0.0.1', async fetch(request){
      if(request.method==='POST') {
        sends++;
        const incoming=await request.json() as {body:string;attachments:unknown[]};
        expect(incoming.attachments).toHaveLength(1);
        if(remoteMode==='reject') return new Response('Rejected',{status:422});
        if(remoteMode==='accept') return Response.json({id:43},{status:201});
        article={id:42,body:incoming.body};
        return new Response('Gateway timeout',{status:504});
      }
      return Response.json(article?[article]:[]);
    }});
    const priorUrl=process.env.ZAMMAD_URL;
    const priorToken=process.env.ZAMMAD_TOKEN;
    try {
      process.env.ZAMMAD_URL=`http://127.0.0.1:${service.port}`;process.env.ZAMMAD_TOKEN='demo-token';
      const id=crypto.randomUUID();
      const message={id,recipient:'muster@example.test',subject:'Musterangebot',body:'Angebot anbei',
        attachment:{name:'angebot.pdf',data:Buffer.from('%PDF-1.7').toString('base64')}};
      expect(await send(data.project,message)).toMatchObject({status:'unknown'});
      expect(await reviewOutgoing(data.project,id,true)).toMatchObject({status:'sent'});
      expect(sends).toBe(1);
      remoteMode='reject';
      const rejected={...message,id:crypto.randomUUID()};
      expect(await send(data.project,rejected)).toMatchObject({status:'failed'});
      remoteMode='accept';
      expect(await reviewOutgoing(data.project,rejected.id,true)).toMatchObject({status:'sent'});
      expect(sends).toBe(3);
    } finally {
      if(priorUrl===undefined)delete process.env.ZAMMAD_URL; else process.env.ZAMMAD_URL=priorUrl;
      if(priorToken===undefined)delete process.env.ZAMMAD_TOKEN; else process.env.ZAMMAD_TOKEN=priorToken;
      service.stop(true);
    }
  });
});
