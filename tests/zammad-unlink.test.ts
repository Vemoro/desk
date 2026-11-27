import { expect, test } from 'bun:test';

const database=process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Tests benötigen eine isolierte DATABASE_URL mit Endung _test.');

const {db, first}=await import('../src/server/db');
const {createAccount,createToken}=await import('../src/server/auth');
const {handle}=await import('../src/server/api');
const {saveCore}=await import('../src/server/core');

test('Zammad serialisiert das Lösen mit dem ersten Sendeversuch und schützt bestehende Versuche',async()=>{
  const suffix=crypto.randomUUID();
  const staff=await createAccount({email:`${suffix}@example.test`,name:'Musterperson',password:'muster-test-passwort',role:'admin'});
  const token=await createToken(staff!,{label:'Ticketverknüpfung prüfen',scope:'write'});
  const contact=await saveCore('contacts',{name:`Musterkontakt ${suffix}`}) as {id:string};
  const ticketBase=100_000_000+Math.floor(Math.random()*100_000_000);
  const sentTickets:number[]=[];
  const service=Bun.serve({port:0,hostname:'127.0.0.1',async fetch(request){
    const path=new URL(request.url).pathname;
    if(request.method==='POST' && path==='/api/v1/ticket_articles') {
      const body=await request.json() as {ticket_id:number};
      sentTickets.push(body.ticket_id);
      return Response.json({id:71},{status:201});
    }
    const ticket=path.match(/^\/api\/v1\/tickets\/(\d+)$/);
    if(request.method==='GET' && ticket) {
      return Response.json({id:Number(ticket[1]),number:'TEST',title:'Synthetisches Ticket'});
    }
    return new Response(null,{status:404});
  }});
  const previousUrl=process.env.ZAMMAD_URL;
  const previousToken=process.env.ZAMMAD_TOKEN;
  const note='Anfrage telefonisch aufgenommen';
  const externalLink='https://example.test/vorgang';
  const call=(project:string,action:string,body:object)=>handle(new Request(`http://desk.local/api/v1/projects/${project}/zammad/${action}`,{
    method:'POST',headers:{Authorization:`Bearer ${token.token}`,'Content-Type':'application/json'},body:JSON.stringify(body),
  }));
  const projectRow=(project:string)=>first<{zammad_ticket_id:number|null;external_link:string;communication_note:string}>(db,
    'SELECT zammad_ticket_id,external_link,communication_note FROM projects WHERE id=$1',[project]);
  const outgoingCount=async (project:string)=>(await first<{count:number}>(db,
    'SELECT count(*)::int AS count FROM outgoing WHERE project_id=$1',[project]))?.count;
  async function prepareProject(ticketId:number) {
    const project=await saveCore('projects',{name:'Musterauftrag',contact_id:contact.id,
      external_link:externalLink,communication_note:note}) as {id:string};
    expect((await call(project.id,'link',{id:ticketId})).status).toBe(201);
    return project.id;
  }
  const send=(project:string)=>call(project,'messages',{id:crypto.randomUUID(),recipient:'muster@example.test',subject:'Angebot',body:'Musterantwort'});

  async function waitForBlockedRequests(expected:number) {
    for(let attempt=0;attempt<120;attempt++) {
      const blocked=await first<{count:number}>(db,`SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%FROM projects%FOR UPDATE%'`);
      if(blocked?.count===expected) return;
      await Bun.sleep(15);
    }
    throw new Error(`${expected} wartende Zammad-Vorgänge wurden nicht erreicht.`);
  }

  async function race(project:string, firstRequest:()=>Promise<Response>, secondRequest:()=>Promise<Response>) {
    const locked=Promise.withResolvers<void>();
    const release=Promise.withResolvers<void>();
    const blocker=db.begin(async(transaction)=>{
      await transaction.unsafe('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[project]);
      locked.resolve();
      await release.promise;
    });
    const requests:Promise<Response>[]=[];
    try {
      await Promise.race([locked.promise,blocker]);
      requests.push(firstRequest());
      await waitForBlockedRequests(1);
      requests.push(secondRequest());
      await waitForBlockedRequests(2);
      release.resolve();
      return await Promise.all(requests);
    } finally {
      release.resolve();
      await blocker;
      await Promise.allSettled(requests);
    }
  }

  try {
    process.env.ZAMMAD_URL=service.url.origin;
    process.env.ZAMMAD_TOKEN='muster-zammad-token';
    const firstProject=await prepareProject(ticketBase);
    expect((await call(firstProject,'unlink',{id:ticketBase+1})).status).toBe(409);
    expect((await projectRow(firstProject))?.zammad_ticket_id).toBe(ticketBase);
    const firstRace=await race(firstProject,()=>call(firstProject,'unlink',{id:ticketBase}),()=>send(firstProject));
    expect(firstRace.map(response=>response.status)).toEqual([201,409]);
    expect(await projectRow(firstProject)).toEqual({zammad_ticket_id:null,external_link:externalLink,communication_note:note});
    expect(await outgoingCount(firstProject)).toBe(0);
    expect(sentTickets).toEqual([]);

    expect((await call(firstProject,'link',{id:ticketBase+1})).status).toBe(201);
    expect((await projectRow(firstProject))?.zammad_ticket_id).toBe(ticketBase+1);
    const secondRace=await race(firstProject,()=>send(firstProject),()=>call(firstProject,'unlink',{id:ticketBase+1}));
    expect(secondRace.map(response=>response.status)).toEqual([201,409]);
    expect((await projectRow(firstProject))?.zammad_ticket_id).toBe(ticketBase+1);
    expect(await outgoingCount(firstProject)).toBe(1);
    expect(sentTickets).toEqual([ticketBase+1]);

    for(const status of ['pending','unknown','failed','sent']) {
      await db.unsafe('UPDATE outgoing SET status=$1 WHERE project_id=$2',[status,firstProject]);
      expect((await call(firstProject,'unlink',{id:ticketBase+1})).status).toBe(409);
    }
    expect((await projectRow(firstProject))?.zammad_ticket_id).toBe(ticketBase+1);
    expect(sentTickets).toEqual([ticketBase+1]);
  } finally {
    if(previousUrl===undefined)delete process.env.ZAMMAD_URL; else process.env.ZAMMAD_URL=previousUrl;
    if(previousToken===undefined)delete process.env.ZAMMAD_TOKEN; else process.env.ZAMMAD_TOKEN=previousToken;
    service.stop(true);
    await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
  }
},12_000);
