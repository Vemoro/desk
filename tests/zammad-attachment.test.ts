import { expect, test } from 'bun:test';

const database=process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Tests benötigen eine isolierte DATABASE_URL mit Endung _test.');

const {db}=await import('../src/server/db');
const {createAccount,createToken}=await import('../src/server/auth');
const {handle}=await import('../src/server/api');
const {saveCore}=await import('../src/server/core');

test('Zammad-Anhänge bleiben an Anmeldung, aktuellem Ticket und konkreter Nachricht gebunden',async()=>{
  const suffix=crypto.randomUUID();
  const staff=await createAccount({email:`${suffix}@example.test`,name:'Musterperson',password:'muster-test-passwort',role:'admin'});
  const token=await createToken(staff!,{label:'Anhang lesen',scope:'read'});
  const contact=await saveCore('contacts',{name:`Musterkontakt ${suffix}`}) as {id:string};
  const project=await saveCore('projects',{name:'Büroinstallation',contact_id:contact.id}) as {id:string};
  const ticket=300_000_000+crypto.getRandomValues(new Uint32Array(1))[0]!%100_000_000;
  const other=ticket+1;
  const file={id:41,filename:'Materialliste Westflügel.pdf'};
  const article={id:12,ticket_id:ticket,body:'Synthetische Anfrage',type:'email',sender:'Customer',internal:false,
    attachments:[file,{id:42,filename:file.filename},{filename:'Alte Anlage.pdf',id:'ohne-Nummer'}]};
  const held=Promise.withResolvers<void>();
  const release=Promise.withResolvers<void>();
  let holdDownload=false;
  const payloads: Record<number,string>={41:'%PDF-1.4\nMuster A\n%%EOF',42:'%PDF-1.4\nMuster B\n%%EOF'};
  let downloads=0;
  const service=Bun.serve({port:0,hostname:'127.0.0.1',async fetch(request){
    const path=new URL(request.url).pathname;
    if(path===`/api/v1/tickets/${ticket}`) return Response.json({id:ticket,number:'1042',title:'Musteranfrage'});
    if(path===`/api/v1/ticket_articles/by_ticket/${ticket}`) return Response.json([article]);
    if(path==='/api/v1/ticket_articles/12') return Response.json(article);
    if(path==='/api/v1/ticket_articles/13') return Response.json({...article,id:13,ticket_id:other});
    const number=Number(path.split('/').at(-1));
    if(path===`/api/v1/ticket_attachment/${ticket}/12/${number}` && payloads[number]){
      downloads++;
      if(holdDownload){held.resolve();await release.promise;}
      return new Response(payloads[number],{headers:{'Content-Type':'text/html','Content-Disposition':'inline','X-Untrusted':'discard'}});
    }
    return new Response(null,{status:404});
  }});
  const previousUrl=process.env.ZAMMAD_URL;
  const previousToken=process.env.ZAMMAD_TOKEN;
  const call=(path:string,authenticated=true)=>handle(new Request(`http://desk.local/api/v1/projects/${project.id}/zammad${path}`,{
    headers:authenticated ? {Authorization:`Bearer ${token.token}`} : undefined,
  }));
  const select=(selected:number,articleId:number,attachmentId:number,authenticated=true)=>
    call(`/attachment?ticket=${selected}&article=${articleId}&attachment=${attachmentId}`,authenticated);
  try{
    process.env.ZAMMAD_URL=service.url.origin;
    process.env.ZAMMAD_TOKEN='muster-zammad-token';
    await db.unsafe('UPDATE projects SET zammad_ticket_id=$1 WHERE id=$2',[ticket,project.id]);
    expect((await select(ticket,12,41,false)).status).toBe(401);
    expect((await select(other,12,41)).status).toBe(404);
    expect((await select(ticket,13,41)).status).toBe(404);
    expect((await select(ticket,12,999)).status).toBe(404);
    expect(downloads).toBe(0);
    const history=await (await call('')).json() as {articles:{attachments:unknown[]}[]};
    expect(history.articles[0]?.attachments).toEqual([file,{id:42,filename:file.filename},{filename:'Alte Anlage.pdf'}]);
    for(const number of [41,42]){
      const download=await select(ticket,12,number);
      expect(download.status).toBe(200);
      expect(download.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(download.headers.get('Content-Disposition')).toContain("attachment; filename=\"Anhang\"; filename*=UTF-8''Materialliste%20Westfl%C3%BCgel.pdf");
      expect(download.headers.get('Cache-Control')).toBe('no-store');
      expect(download.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(download.headers.has('X-Untrusted')).toBe(false);
      expect(await download.text()).toBe(payloads[number]!);
    }
    holdDownload=true;
    const pending=select(ticket,12,41);
    try{
      await Promise.race([held.promise,pending.then(()=>{throw new Error('Binäranfrage nicht erreicht.');})]);
      await db.unsafe('UPDATE projects SET zammad_ticket_id=$1 WHERE id=$2',[other,project.id]);
    }finally{
      release.resolve();
    }
    expect((await pending).status).toBe(404);
  }finally{
    if(previousUrl===undefined) delete process.env.ZAMMAD_URL; else process.env.ZAMMAD_URL=previousUrl;
    if(previousToken===undefined) delete process.env.ZAMMAD_TOKEN; else process.env.ZAMMAD_TOKEN=previousToken;
    service.stop(true);
    await db.unsafe('DELETE FROM projects WHERE id=$1',[project.id]);
    await db.unsafe('DELETE FROM contacts WHERE id=$1',[contact.id]);
    await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
  }
});
