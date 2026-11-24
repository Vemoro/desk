import { expect,test } from 'bun:test';

const selected = process.env.DATABASE_URL;
if (!selected || !new URL(selected).pathname.endsWith('_test')) throw new Error('Haben-Tests brauchen eine isolierte Testdatenbank.');
const { db }=await import('../src/server/db');
const { saveCore,changeStage }=await import('../src/server/core');
const { syncContact,syncOffer }=await import('../src/server/haben');

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
    expect(await syncOffer(project.id,offerId)).toMatchObject({stage:'confirmed',offer_ref:'ANG-12'});
  } finally {
    if(previousUrl===undefined) delete process.env.HABEN_URL; else process.env.HABEN_URL=previousUrl;
    if(previousToken===undefined) delete process.env.HABEN_TOKEN; else process.env.HABEN_TOKEN=previousToken;
    service.stop(true);
  }
});
