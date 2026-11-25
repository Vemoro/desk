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

  test('Haben und Zammad melden eine fehlerhafte Basisadresse vor dem ersten Netzwerkaufruf',async()=>{
    const origin=process.env.DESK_ORIGIN ?? 'http://127.0.0.1';
    const login=await handle(new Request(origin+'/api/v1/login',{method:'POST',
      headers:{Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({email:actor.email,password:'muster-test-passwort'})}));
    expect(login.status).toBe(200);
    const cookie=login.headers.get('Set-Cookie')!.split(';')[0];
    const post=(path:string,body:unknown)=>handle(new Request(origin+'/api/v1'+path,{
      method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body),
    }));
    const cases=[
      {service:'HABEN',path:'/haben/contacts/import',body:{},token:'muster-haben-token',
        authorization:'Bearer muster-haben-token',paths:['/api/v1/kontakte']},
      {service:'ZAMMAD',path:'/integrations/zammad/check',body:{id:42},token:'muster-zammad-token',
        authorization:'Token token=muster-zammad-token',paths:['/api/v1/tickets/42','/api/v1/ticket_articles/by_ticket/42']},
    ] as const;
    for(const entry of cases){
      const urlKey=entry.service+'_URL';
      const tokenKey=entry.service+'_TOKEN';
      const previousUrl=process.env[urlKey];
      const previousToken=process.env[tokenKey];
      const originalFetch=globalThis.fetch;
      let fetches=0;
      const calls:string[]=[];
      const local=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
        const path=new URL(request.url).pathname;
        calls.push(path);
        if(request.method!=='GET' || request.headers.get('Authorization')!==entry.authorization) {
          return new Response(null,{status:401});
        }
        if(path==='/api/v1/kontakte') return Response.json({data:[],total:0});
        if(path==='/api/v1/tickets/42') return Response.json({id:42,number:'42',title:'Testticket'});
        if(path==='/api/v1/ticket_articles/by_ticket/42') return Response.json([]);
        return new Response(null,{status:404});
      }});
      try {
        process.env[tokenKey]=entry.token;
        globalThis.fetch=Object.assign(async ()=>{
          fetches++;
          throw new Error('Unerwarteter Netzwerkaufruf');
        },originalFetch);
        for(const base of ['https://[muster','http://muster.example.test','https://user:pass@muster.example.test','https://muster.example.test/api']){
          process.env[urlKey]=base;
          const response=await post(entry.path,entry.body);
          expect(response.status).toBe(503);
          expect(await response.json()).toEqual({error:entry.service+'_URL muss eine HTTPS-Basisadresse sein.'});
        }
        expect(fetches).toBe(0);
        globalThis.fetch=originalFetch;
        process.env[urlKey]=local.url.origin;
        expect((await post(entry.path,entry.body)).status).toBe(201);
        expect(calls).toEqual([...entry.paths]);
      } finally {
        globalThis.fetch=originalFetch;
        local.stop(true);
        if(previousUrl===undefined) delete process.env[urlKey]; else process.env[urlKey]=previousUrl;
        if(previousToken===undefined) delete process.env[tokenKey]; else process.env[tokenKey]=previousToken;
      }
    }
  });
});

describe('API und Integrationen',()=>{
  test('Vormerkungen verwenden pro Konto und Endpunkt denselben Vorgangsschlüssel nur einmal',async()=>{
    const data=await fixture(saveCore,'Wiederholte Vormerkungen');
    const owner=await createToken(actor,{label:'Muster-Planung',scope:'write'});
    const other=(await createAccount({email:crypto.randomUUID()+'@example.test',name:'Zweite Testperson',
      password:'muster-test-passwort',role:'admin'}))!;
    const otherToken=await createToken(other,{label:'Zweite Muster-Planung',scope:'write'});
    const key=crypto.randomUUID();
    async function call(input:object,requestKey?:string,token=owner.token,path='reservations'){
      const headers:Record<string,string>={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
      if(requestKey) headers['Idempotency-Key']=requestKey;
      return handle(new Request(`http://desk.local/api/v1/${path}`,{method:'POST',headers,body:JSON.stringify(input)}));
    }
    async function create(input:object,requestKey?:string,token=owner.token){
      const response=await call(input,requestKey,token);
      expect(response.status).toBe(201);
      return await response.json() as {id:string;status:string};
    }
    async function count(){
      return (await first<{count:number}>(db,'SELECT count(*)::int AS count FROM reservations WHERE project_id=$1',[data.project]))?.count;
    }
    const {location_id:_,...period}=data.booking;
    const personnel={...period,user_id:actor.id,quantity:1};
    const [left,right]=await Promise.all([create(personnel,key),create(personnel,key)]);
    expect(left).toEqual(right);
    expect(await count()).toBe(1);
    const equipment={...data.booking,item_id:data.equipment,quantity:2,
      starts_at:'2028-05-25T11:00:00.123456+02:00',ends_at:'2028-05-25T17:00:00+02:00'};
    expect((await call(equipment,key)).status).toBe(409);
    expect(await count()).toBe(1);
    expect((await create(personnel,key,otherToken.token)).id).not.toBe(left.id);
    expect((await create(personnel,crypto.randomUUID())).id).not.toBe(left.id);
    expect(await count()).toBe(3);
    const equipmentKey=crypto.randomUUID();
    const utcEquipment={...equipment,starts_at:'2028-05-25T09:00:00.123456Z',ends_at:'2028-05-25T15:00:00Z'};
    const [itemReservation,parallelItem]=await Promise.all([
      create(equipment,equipmentKey),create(utcEquipment,equipmentKey),
    ]);
    expect(parallelItem).toEqual(itemReservation);
    expect(await count()).toBe(4);
    expect((await call({...equipment,quantity:3},equipmentKey)).status).toBe(409);
    expect((await call({...utcEquipment,starts_at:'2028-05-25T09:00:00.123457Z'},equipmentKey)).status).toBe(409);
    await setReservation(itemReservation.id,'released');
    expect(await create(utcEquipment,equipmentKey)).toEqual(itemReservation);
    expect(await count()).toBe(4);
    expect((await call({action:'receive',item_id:data.material,location_id:data.location,quantity:1},key,owner.token,'movements')).status).toBe(201);
    await create(equipment);
    await create(equipment);
    expect(await count()).toBe(6);
  });

  test('Lagerbewegungen mit demselben Vorgangsschlüssel werden genau einmal gebucht',async()=>{
    const data=await fixture(saveCore,'Wiederholte Lagerbewegungen');
    await changeStage(data.project,'planning');
    await saveCore('projects',{offer_ref:'ANG-WIEDERHOLUNG'},data.project);
    await changeStage(data.project,'offered');
    await changeStage(data.project,'confirmed');
    const token=await createToken(actor,{label:'Lagerwiederholung',scope:'write'});
    async function call(input:object,key?:string){
      const headers:Record<string,string>={Authorization:`Bearer ${token.token}`,'Content-Type':'application/json'};
      if(key!==undefined) headers['Idempotency-Key']=key;
      return handle(new Request('http://desk.local/api/v1/movements',{
        method:'POST',headers,body:JSON.stringify(input),
      }));
    }
    async function ok(input:object,key?:string){
      const response=await call(input,key);
      expect(response.status).toBe(201);
      return await response.json() as {id:string};
    }
    const receipt={action:'receive',item_id:data.material,location_id:data.location,quantity:10};
    const receiptKey=crypto.randomUUID();
    const receipts=await Promise.all([ok(receipt,receiptKey),ok(receipt,receiptKey)]);
    expect(receipts[0]).toEqual(receipts[1]);
    expect((await call({...receipt,quantity:11},receiptKey)).status).toBe(409);
    expect((await call(receipt,'ungültiger Schlüssel')).status).toBe(400);
    expect((await listStock()).find(row=>row.item_id===data.material)?.physical).toBe(10);

    const material=getId(await createReservation({...data.booking,item_id:data.material,quantity:4}));
    await setReservation(material,'firm');
    const consume={action:'consume',reservation_id:material,quantity:1};
    const consumeKey=crypto.randomUUID();
    const consumed=await ok(consume,consumeKey);
    expect(await ok(consume,consumeKey)).toEqual(consumed);
    expect((await listStock()).find(row=>row.item_id===data.material)).toMatchObject({physical:9,reserved:3});
    expect((await ok(consume,crypto.randomUUID())).id).not.toBe(consumed.id);
    expect((await listStock()).find(row=>row.item_id===data.material)).toMatchObject({physical:8,reserved:2});

    await ok({action:'receive',item_id:data.equipment,location_id:data.location,quantity:4});
    const equipment=getId(await createReservation({...data.booking,item_id:data.equipment,quantity:4,
      starts_at:addMinutes(Date.now(),-5),ends_at:addMinutes(Date.now(),60)}));
    const issue={action:'issue',reservation_id:equipment,quantity:2};
    const issueKey=crypto.randomUUID();
    expect((await call(issue,issueKey)).status).toBe(409);
    await setReservation(equipment,'firm');
    const issued=await ok(issue,issueKey);
    expect(await ok(issue,issueKey)).toEqual(issued);
    const giveBack={action:'return',reservation_id:equipment,quantity:1};
    const returnKey=crypto.randomUUID();
    const returned=await ok(giveBack,returnKey);
    expect(await ok(giveBack,returnKey)).toEqual(returned);
    await setReservation(equipment,'released');
    expect(await ok(issue,issueKey)).toEqual(issued);
    expect((await listStock()).find(row=>row.item_id===data.equipment)?.physical).toBe(3);
    expect(await first(db,'SELECT count(*)::integer AS count FROM movements WHERE reservation_id=$1',[equipment]))
      .toEqual({count:2});
    await expect(ok(receipt)).resolves.toHaveProperty('id');
    await expect(ok(receipt)).resolves.toHaveProperty('id');
    expect((await listStock()).find(row=>row.item_id===data.material)?.physical).toBe(28);
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

  test('Projektliste liefert die Standardseite, weitere Einträge und eine leere Seite',async()=>{
    const contact=getId(await saveCore('contacts',{name:'Muster Auftragsservice'}));
    const token=await createToken(actor,{label:'Seitennavigation',scope:'read'});
    const list=(query='')=>handle(new Request('http://desk.local/api/v1/projects'+query,{
      headers:{Authorization:`Bearer ${token.token}`},
    }));
    async function projectIds(query=''){
      const response=await list(query);
      expect(response.status).toBe(200);
      const projects=await response.json() as {id:string}[];
      return projects.map(project=>project.id);
    }
    try {
      await db.unsafe(`INSERT INTO projects (contact_id,name)
        SELECT $1::uuid,'Musterauftrag ' || lpad(n::text,3,'0') FROM generate_series(1,105) AS n`,[contact]);
      const all=await db.unsafe<{id:string}[]>('SELECT id FROM projects ORDER BY name,id');
      const firstPage=await projectIds();
      const secondPage=await projectIds('?limit=100&offset=100');
      expect(firstPage).toHaveLength(100);
      expect(secondPage.length).toBeGreaterThan(0);
      const projectIdsOnPages=[...firstPage,...secondPage];
      expect(new Set(projectIdsOnPages).size).toBe(projectIdsOnPages.length);
      expect(projectIdsOnPages).toEqual(all.slice(0,200).map(project=>project.id));
      expect(await projectIds('?limit=200&offset=1000000')).toEqual([]);
      for(const query of ['?limit=0','?limit=201','?limit=1.5','?offset=-1','?offset=1000001']){
        expect((await list(query)).status).toBe(400);
      }
    } finally {
      await db.unsafe('DELETE FROM projects WHERE contact_id=$1',[contact]);
      await db.unsafe('DELETE FROM contacts WHERE id=$1',[contact]);
      await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
    }
  });

  test('Sitzungen und Token entsprechen den dokumentierten API-Berechtigungen',async()=>{
    const origin=process.env.DESK_ORIGIN ?? 'http://127.0.0.1';
    const password='muster-test-passwort';
    const staffEmail=crypto.randomUUID()+'@example.test';
    await createAccount({email:staffEmail,name:'Musterperson',password,role:'member'});
    const request=(path:string,options?:RequestInit)=>handle(new Request(origin+'/api/v1'+path,options));
    const jsonHeaders={Origin:origin,'Content-Type':'application/json'};
    async function loginCookie(email:string){
      const response=await request('/login',{method:'POST',headers:jsonHeaders,body:JSON.stringify({email,password})});
      expect(response.status).toBe(200);
      const cookie=response.headers.getSetCookie().find(value=>/^(?:__Secure-)?desk-auth\.session_token=/.test(value));
      expect(cookie).toBeDefined();
      return cookie!.split(';')[0];
    }
    const member={Cookie:await loginCookie(staffEmail)};
    const admin={Cookie:await loginCookie(actor.email)};
    const read=await createToken(actor,{label:'API-Lesetest',scope:'read'});
    const write=await createToken(actor,{label:'API-Schreibtest',scope:'write'});
    const readToken={Authorization:`Bearer ${read.token}`};
    const writeToken={Authorization:`Bearer ${write.token}`};
    try {
      for(const headers of [member,readToken,writeToken]){
        expect((await request('/contacts',{headers})).status).toBe(200);
      }
      const addContact=(headers:Record<string,string>)=>request('/contacts',{
        method:'POST',headers:{...jsonHeaders,...headers},body:'{"name":"Muster API-Zugriff"}',
      });
      expect((await addContact(member)).status).toBe(201);
      expect((await addContact(readToken)).status).toBe(403);
      expect((await addContact(writeToken)).status).toBe(201);
      expect((await request('/tokens',{headers:admin})).status).toBe(200);
      for(const headers of [member,readToken,writeToken]){
        expect((await request('/tokens',{headers})).status).toBe(403);
      }
    } finally {
      await db.unsafe('DELETE FROM api_tokens WHERE id IN ($1,$2)',[read.id,write.id]);
    }
  });

  test('Anmeldung akzeptiert die normalisierte HTTPS-Origin und setzt ein Secure-Cookie',async()=>{
    const child=Bun.spawn([process.execPath,'-e',`
      import assert from 'node:assert/strict';
      import { handle } from './src/server/api';
      const login=(origin)=>handle(new Request('http://127.0.0.1/api/v1/login',{
        method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
        body:JSON.stringify({email:process.env.DESK_FIXTURE_EMAIL,password:'muster-test-passwort'}),
      }));
      const allowed=await login('https://desk.example.test');
      assert.equal(allowed.status,200);
      const cookie=allowed.headers.getSetCookie().find(entry=>entry.startsWith('__Secure-desk-auth.session_token='));
      assert.match(cookie ?? '',/; Secure/);
      assert.equal((await login('https://fremd.example.test')).status,403);
      process.exit(0);
    `],{env:{...process.env,DESK_ORIGIN:'https://desk.example.test/',DESK_FIXTURE_EMAIL:actor.email},
      stdout:'inherit',stderr:'inherit'});
    expect(await child.exited).toBe(0);
  });

  test('Zammad verknüpft ausschließlich das angefragte vorhandene Ticket',async()=>{
    const contact=getId(await saveCore('contacts',{name:'Musterkontakt für Ticket-IDs'}));
    const project=getId(await saveCore('projects',{name:'Musterprojekt mit bestehendem Ticket',contact_id:contact}));
    const newProject=getId(await saveCore('projects',{name:'Musterprojekt mit neuem Ticket',contact_id:contact}));
    const token=await createToken(actor,{label:'Ticket-ID prüfen',scope:'write'});
    const matchingId=1_000_000+Math.floor(Math.random()*10_000_000)*3;
    const wrongId=matchingId+1;
    const newId=matchingId+2;
    const service=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){
      const path=new URL(request.url).pathname;
      if(request.method==='POST' && path==='/api/v1/tickets') {
        return Response.json({id:newId,number:'TEST-NEU',title:'Neues Ticket'},{status:201});
      }
      if(request.method==='GET' && path===`/api/v1/tickets/${matchingId}`) {
        return Response.json({id:matchingId,number:'TEST-PASSEND',title:'Angefragtes Ticket'});
      }
      if(request.method==='GET' && path===`/api/v1/tickets/${wrongId}`) {
        return Response.json({id:newId,number:'TEST-ABWEICHEND',title:'Abweichendes Ticket'});
      }
      return new Response(null,{status:404});
    }});
    const previousUrl=process.env.ZAMMAD_URL;
    const previousToken=process.env.ZAMMAD_TOKEN;
    const call=(id:string,path:string,body:object)=>handle(new Request(`http://desk.local/api/v1/projects/${id}/zammad/${path}`,{
      method:'POST',headers:{Authorization:`Bearer ${token.token}`,'Content-Type':'application/json'},body:JSON.stringify(body),
    }));
    const linkedTicket=async (id:string)=>(await first<{zammad_ticket_id:number|null}>(db,
      'SELECT zammad_ticket_id FROM projects WHERE id=$1',[id]))?.zammad_ticket_id;
    try {
      process.env.ZAMMAD_URL=service.url.origin;
      process.env.ZAMMAD_TOKEN='muster-zammad-token';
      const rejected=await call(project,'link',{id:wrongId});
      expect(rejected.status).toBe(502);
      expect(await rejected.json()).toEqual({error:'Zammad hat eine abweichende Ticket-ID geliefert.'});
      expect(await linkedTicket(project)).toBeNull();

      const accepted=await call(project,'link',{id:matchingId});
      expect(accepted.status).toBe(201);
      expect(await linkedTicket(project)).toBe(matchingId);
      expect((await call(project,'link',{id:wrongId})).status).toBe(502);
      expect(await linkedTicket(project)).toBe(matchingId);

      const created=await call(newProject,'tickets',{title:'Musteranfrage',customer:'muster@example.test',note:'Testnotiz'});
      expect(created.status).toBe(201);
      expect(await linkedTicket(newProject)).toBe(newId);
    } finally {
      if(previousUrl===undefined)delete process.env.ZAMMAD_URL; else process.env.ZAMMAD_URL=previousUrl;
      if(previousToken===undefined)delete process.env.ZAMMAD_TOKEN; else process.env.ZAMMAD_TOKEN=previousToken;
      service.stop(true);
      await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
    }
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

  test('Zammad-Verbindung wird nur mit Administratorsitzung und per Lesezugriff geprüft',async()=>{
    const origin=process.env.DESK_ORIGIN ?? 'http://127.0.0.1';
    const password='muster-test-passwort';
    const staffEmail=crypto.randomUUID()+'@example.test';
    await createAccount({email:staffEmail,name:'Musterperson',password,role:'member'});
    const token=await createToken(actor,{label:'Verbindungsprüfung',scope:'write'});
    async function loginCookie(email:string){
      const response=await handle(new Request(origin+'/api/v1/login',{method:'POST',
        headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password})}));
      expect(response.status).toBe(200);
      return response.headers.get('Set-Cookie')!.split(';')[0];
    }
    const adminCookie=await loginCookie(actor.email);
    const staffCookie=await loginCookie(staffEmail);
    const check=(auth:Record<string,string>)=>handle(new Request(origin+'/api/v1/integrations/zammad/check',
      {method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...auth},body:'{"id":42}'}));
    const calls: string[]=[];
    const ticketPath='/api/v1/tickets/42';
    const articlePath='/api/v1/ticket_articles/by_ticket/42';
    let allowed=true;
    const service=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
      const path=new URL(request.url).pathname;
      calls.push(`${request.method} ${path}`);
      if(request.method!=='GET' || request.headers.get('authorization')!=='Token token=muster-zammad-token'){
        return new Response('Unerwarteter Aufruf',{status:400});
      }
      if(path===ticketPath) return Response.json({id:42,number:'42',title:'Synthetisches Testticket'});
      if(path===articlePath) return allowed ? Response.json([{id:17,body:'Synthetischer Artikel'}])
        : new Response('Interne Antwort mit muster-zammad-token',{status:403});
      return new Response('Unbekannter Pfad',{status:404});
    }});
    const previousUrl=process.env.ZAMMAD_URL;
    const previousToken=process.env.ZAMMAD_TOKEN;
    try {
      process.env.ZAMMAD_URL=service.url.origin;
      process.env.ZAMMAD_TOKEN='muster-zammad-token';
      expect((await check({Cookie:staffCookie})).status).toBe(403);
      expect((await check({Authorization:`Bearer ${token.token}`})).status).toBe(403);
      expect(calls).toEqual([]);
      const success=await check({Cookie:adminCookie});
      expect(success.status).toBe(201);
      expect(await success.json()).toEqual({ok:true});
      expect(calls.splice(0)).toEqual([`GET ${ticketPath}`,`GET ${articlePath}`]);

      allowed=false;
      const denied=await check({Cookie:adminCookie});
      expect(denied.status).toBe(502);
      expect(await denied.json()).toEqual({error:'Zammad verweigert den Zugriff auf das Ticket oder den Verlauf.'});
      expect(calls.splice(0)).toEqual([`GET ${ticketPath}`,`GET ${articlePath}`]);

      delete process.env.ZAMMAD_TOKEN;
      const unconfigured=await check({Cookie:adminCookie});
      expect(unconfigured.status).toBe(503);
      expect(await unconfigured.json()).toEqual({error:'ZAMMAD ist nicht eingerichtet.'});
      expect(calls).toEqual([]);
    } finally {
      if(previousUrl===undefined) delete process.env.ZAMMAD_URL; else process.env.ZAMMAD_URL=previousUrl;
      if(previousToken===undefined) delete process.env.ZAMMAD_TOKEN; else process.env.ZAMMAD_TOKEN=previousToken;
      service.stop(true);
      await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
    }
  });
});
