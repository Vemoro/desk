import { expect, test } from 'bun:test';

const database=process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Tests benötigen eine isolierte DATABASE_URL mit Endung _test.');

const {db}=await import('../src/server/db');
const {createAccount,createToken}=await import('../src/server/auth');
const {handle}=await import('../src/server/api');
const {saveCore}=await import('../src/server/core');

test('Zammad ermittelt die Antwortadresse am ausgewählten Artikel und behält die Referenz beim Wiederholen',async()=>{
  const suffix=crypto.randomUUID();
  const staff=await createAccount({email:`${suffix}@example.test`,name:'Musterperson',password:'muster-test-passwort',role:'admin'});
  const token=await createToken(staff!,{label:'Artikelantwort prüfen',scope:'write'});
  const contact=await saveCore('contacts',{name:`Musterkontakt ${suffix}`}) as {id:string};
  const project=await saveCore('projects',{name:'Büroinstallation',contact_id:contact.id}) as {id:string};
  const ticketId=200_000_000+crypto.getRandomValues(new Uint32Array(1))[0]!%100_000_000;
  const otherTicket=ticketId+1;
  const incoming={id:12,ticket_id:ticketId,type:'email',sender:'Customer',internal:false,body:'Erste Anfrage',
    from:'Mara Muster <mara@example.test>',reply_to:'Antwort <antwort@example.test>',message_id:'<erste@example.test>',subject:'Erste Anfrage'};
  const articles=[
    incoming,
    {...incoming,id:13,subject:'Weitere Anfrage',reply_to:null,message_id:'<zweite@example.test>'},
    {...incoming,id:14,subject:'Mehrere Adressen',reply_to:'a@example.test, b@example.test'},
    {...incoming,id:15,subject:'Interne Notiz',type:'note',sender:'Agent',internal:true},
    {...incoming,id:16,subject:'Fremdes Ticket',ticket_id:otherTicket},
    {...incoming,id:17,subject:'Ausgehende Nachricht',sender:'Agent'},
    {...incoming,id:18,subject:'Ungültige Nachrichtenkennung',message_id:'<eins,zwei@example.test>'},
  ];
  const sent:Record<string,unknown>[]=[];
  const held=Promise.withResolvers<void>();
  const release=Promise.withResolvers<void>();
  let holdHistory=false;
  let canWriteNote=false;
  const service=Bun.serve({port:0,hostname:'127.0.0.1',async fetch(request){
    const path=new URL(request.url).pathname;
    if(path==='/api/v1/ticket_articles' && request.method==='POST') {
      sent.push(await request.json() as Record<string,unknown>);
      return sent.length===1 ? Response.json({error:'Fehlgeschlagen'},{status:422})
        : Response.json({id:71,internal:sent.at(-1)?.internal},{status:201});
    }
    if(path==='/api/v1/mentions') return canWriteNote ? Response.json({mentions:[]}) : new Response(null,{status:403});
    if(path===`/api/v1/tickets/${ticketId}` || path===`/api/v1/tickets/${otherTicket}`) {
      const id=Number(path.split('/').at(-1));
      return Response.json({id,number:String(id),title:'Musteranfrage'});
    }
    if(path===`/api/v1/ticket_articles/by_ticket/${ticketId}`) {
      if(holdHistory) {held.resolve();await release.promise;}
      return Response.json(articles.filter(article=>article.ticket_id===ticketId));
    }
    const article=articles.find(article=>path===`/api/v1/ticket_articles/${article.id}`);
    return article ? Response.json(article) : new Response(null,{status:404});
  }});
  const previousUrl=process.env.ZAMMAD_URL;
  const previousToken=process.env.ZAMMAD_TOKEN;
  const call=(action:string,body?:object)=>handle(new Request(`http://desk.local/api/v1/projects/${project.id}/zammad${action}`,{
    method:body ? 'POST' : 'GET',
    headers:{Authorization:`Bearer ${token.token}`,'Content-Type':'application/json'},
    body:body ? JSON.stringify(body) : undefined,
  }));
  try {
    process.env.ZAMMAD_URL=service.url.origin;
    process.env.ZAMMAD_TOKEN='muster-zammad-token';
    expect((await call('/link',{id:otherTicket})).status).toBe(201);
    const message={id:crypto.randomUUID(),recipient:'antwort@example.test',subject:'Erste Anfrage',body:'Musterantwort',replyArticleId:12};
    expect((await call('/messages',message)).status).toBe(409);
    expect((await call('/unlink',{id:otherTicket})).status).toBe(201);
    expect((await call('/link',{id:ticketId})).status).toBe(201);
    const history=await (await call('')).json() as {articles:{kind:string;reply?:{recipient:string;subject:string}}[]};
    expect(history.articles.map(article=>article.kind)).toEqual(['incoming-email','incoming-email','incoming-email','internal-note','outgoing-email','incoming-email']);
    expect(history.articles.map(article=>article.reply?.recipient)).toEqual(['antwort@example.test','mara@example.test',undefined,undefined,undefined,undefined]);
    expect((await call('/messages',{...message,replyArticleId:16})).status).toBe(409);
    expect((await call('/messages',{...message,replyArticleId:14})).status).toBe(409);
    const invalidReference=await call('/messages',{...message,replyArticleId:18});
    expect(invalidReference.status).toBe(409);
    expect(await invalidReference.json()).toMatchObject({code:'zammad_message_not_stored'});
    expect((await call('/messages',{...message,recipient:'mara@example.test'})).status).toBe(409);
    expect(sent).toHaveLength(0);
    expect(await (await call('/messages',message)).json()).toMatchObject({status:'failed'});
    holdHistory=true;
    const retry=call(`/outgoing/${message.id}`,{retry:true});
    await held.promise;
    try {
      expect((await call('/link',{id:otherTicket})).status).toBe(409);
    } finally {
      release.resolve();
      holdHistory=false;
    }
    expect(await (await retry).json()).toMatchObject({status:'sent'});
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]!);
    expect(sent[1]).toMatchObject({ticket_id:ticketId,to:'antwort@example.test',in_reply_to:'<erste@example.test>'});
    expect(await (await call('/messages',message)).json()).toMatchObject({status:'sent'});
    expect(sent).toHaveLength(2);
    const {replyArticleId,...freeMessage}=message;
    expect(await (await call('/messages',{...freeMessage,id:crypto.randomUUID()})).json()).toMatchObject({status:'sent'});
    expect(sent[2]).not.toHaveProperty('in_reply_to');
    const note={id:crypto.randomUUID(),ticketId,body:'Interner Montagetermin'};
    expect((await call('/notes',{...note,ticketId:otherTicket})).status).toBe(409);
    expect((await call('/notes',{...note,recipient:'extern@example.test'})).status).toBe(400);
    expect((await call('/notes',{...note,id:message.id})).status).toBe(409);
    expect((await call('/notes',note)).status).toBe(502);
    expect(sent).toHaveLength(3);
    canWriteNote=true;
    expect(await (await call('/notes',note)).json()).toMatchObject({status:'sent'});
    expect(await (await call('/notes',note)).json()).toMatchObject({status:'sent'});
    expect(sent).toHaveLength(4);
    expect(sent[3]).toMatchObject({ticket_id:ticketId,type:'note',internal:true,sender:'Agent'});
    expect(sent[3]).not.toHaveProperty('to');
    expect(await db.unsafe('SELECT id FROM outgoing WHERE id=$1',[note.id])).toEqual([]);
  } finally {
    if(previousUrl===undefined) delete process.env.ZAMMAD_URL; else process.env.ZAMMAD_URL=previousUrl;
    if(previousToken===undefined) delete process.env.ZAMMAD_TOKEN; else process.env.ZAMMAD_TOKEN=previousToken;
    service.stop(true);
    await db.unsafe('DELETE FROM zammad_note_attempts WHERE project_id=$1',[project.id]);
    await db.unsafe('DELETE FROM outgoing WHERE project_id=$1',[project.id]);
    await db.unsafe('DELETE FROM projects WHERE id=$1',[project.id]);
    await db.unsafe('DELETE FROM contacts WHERE id=$1',[contact.id]);
    await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
  }
});
