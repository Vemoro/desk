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
  const incoming={id:12,ticket_id:42,type:'email',sender:'Customer',internal:false,body:'Erste Anfrage',
    from:'Mara Muster <mara@example.test>',reply_to:'Antwort <antwort@example.test>',message_id:'<erste@example.test>',subject:'Erste Anfrage'};
  const articles=[
    incoming,
    {...incoming,id:13,subject:'Weitere Anfrage',reply_to:null,message_id:'<zweite@example.test>'},
    {...incoming,id:14,subject:'Mehrere Adressen',reply_to:'a@example.test, b@example.test'},
    {...incoming,id:15,subject:'Interne Notiz',type:'note',sender:'Agent',internal:true},
    {...incoming,id:16,subject:'Fremdes Ticket',ticket_id:43},
    {...incoming,id:17,subject:'Ausgehende Nachricht',sender:'Agent'},
  ];
  const sent:Record<string,unknown>[]=[];
  const service=Bun.serve({port:0,hostname:'127.0.0.1',async fetch(request){
    const path=new URL(request.url).pathname;
    if(path==='/api/v1/ticket_articles' && request.method==='POST') {
      sent.push(await request.json() as Record<string,unknown>);
      return sent.length===1 ? Response.json({error:'Fehlgeschlagen'},{status:422}) : Response.json({id:71},{status:201});
    }
    if(path==='/api/v1/tickets/42' || path==='/api/v1/tickets/43') {
      const id=Number(path.split('/').at(-1));
      return Response.json({id,number:String(id),title:'Musteranfrage'});
    }
    if(path==='/api/v1/ticket_articles/by_ticket/42') return Response.json(articles.filter(article=>article.ticket_id===42));
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
    expect((await call('/link',{id:43})).status).toBe(201);
    const message={id:crypto.randomUUID(),recipient:'antwort@example.test',subject:'Erste Anfrage',body:'Musterantwort',replyArticleId:12};
    expect((await call('/messages',message)).status).toBe(409);
    expect((await call('/unlink',{id:43})).status).toBe(201);
    expect((await call('/link',{id:42})).status).toBe(201);
    const history=await (await call('')).json() as {articles:{kind:string;reply?:{recipient:string;subject:string}}[]};
    expect(history.articles.map(article=>article.kind)).toEqual(['incoming-email','incoming-email','incoming-email','internal-note','outgoing-email']);
    expect(history.articles.map(article=>article.reply?.recipient)).toEqual(['antwort@example.test','mara@example.test',undefined,undefined,undefined]);
    expect((await call('/messages',{...message,replyArticleId:16})).status).toBe(409);
    expect((await call('/messages',{...message,replyArticleId:14})).status).toBe(409);
    expect((await call('/messages',{...message,recipient:'mara@example.test'})).status).toBe(409);
    expect(sent).toHaveLength(0);
    expect(await (await call('/messages',message)).json()).toMatchObject({status:'failed'});
    expect(await (await call(`/outgoing/${message.id}`,{retry:true})).json()).toMatchObject({status:'sent'});
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]!);
    expect(sent[1]).toMatchObject({ticket_id:42,to:'antwort@example.test',in_reply_to:'<erste@example.test>'});
    expect(await (await call('/messages',message)).json()).toMatchObject({status:'sent'});
    expect(sent).toHaveLength(2);
    const {replyArticleId,...freeMessage}=message;
    expect(await (await call('/messages',{...freeMessage,id:crypto.randomUUID()})).json()).toMatchObject({status:'sent'});
    expect(sent[2]).not.toHaveProperty('in_reply_to');
  } finally {
    if(previousUrl===undefined) delete process.env.ZAMMAD_URL; else process.env.ZAMMAD_URL=previousUrl;
    if(previousToken===undefined) delete process.env.ZAMMAD_TOKEN; else process.env.ZAMMAD_TOKEN=previousToken;
    service.stop(true);
    await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
  }
});
