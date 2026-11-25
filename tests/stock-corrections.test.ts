import { expect, test } from 'bun:test';
import { handle } from '../src/server/api';
import { createAccount, createToken } from '../src/server/auth';
import { saveCore } from '../src/server/core';
import { db, first } from '../src/server/db';
import { required } from '../src/server/errors';

const database=process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Isolierte Testdatenbank erforderlich.');

test('Migration erhält vorhandene Buchungen und ihre Artikel-, Projekt- und Kontoverweise',async()=>{
  await db.begin(async transaction=>{
    const schema='stock_upgrade_'+crypto.randomUUID().replaceAll('-','');
    await transaction.unsafe(`CREATE SCHEMA ${schema}`);
    await transaction.unsafe("SELECT set_config('search_path',$1,true)",[schema]);
    await transaction.unsafe(await Bun.file(new URL('../migrations/001_core.sql',import.meta.url)).text()).simple();
    const actor=required(await first<{id:string}>(transaction,
      "INSERT INTO users(email,name,password_hash,role) VALUES ('lager@example.test','Muster Lager','hash','member') RETURNING id"));
    const article=required(await first<{id:string}>(transaction,
      "INSERT INTO items(name,code,kind) VALUES ('Kabelbinder','M-1','consumable') RETURNING id"));
    const site=required(await first<{id:string}>(transaction,"INSERT INTO locations(name) VALUES ('Werkstatt') RETURNING id"));
    const contact=required(await first<{id:string}>(transaction,"INSERT INTO contacts(name) VALUES ('Muster Auftragsservice') RETURNING id"));
    const project=required(await first<{id:string}>(transaction,
      "INSERT INTO projects(contact_id,name) VALUES ($1,'Büroinstallation') RETURNING id",[contact.id]));
    const original=required(await first<{id:string} & Record<string,unknown>>(transaction,`INSERT INTO movements
      (item_id,location_id,project_id,actor_id,action,quantity) VALUES ($1,$2,$3,$4,'receive',8) RETURNING *`,
      [article.id,site.id,project.id,actor.id]));
    await transaction.unsafe(await Bun.file(new URL('../migrations/006_stock_corrections.sql',import.meta.url)).text()).simple();
    expect(await first(transaction,'SELECT * FROM movements WHERE id=$1',[original.id])).toEqual({
      ...original,corrects_movement_id:null,correction_reason:null,
    });
    await transaction.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  });
});

async function warehouseExample(kind:'equipment'|'consumable'='consumable', tracked=false) {
  const marker=crypto.randomUUID();
  const actor=required(await createAccount({email:`${marker}@example.test`,name:'Muster Lager',password:'muster-test-passwort',role:'admin'}));
  const token=await createToken(actor,{label:'Muster Lagerprüfung',scope:'write'});
  const location=(await saveCore('locations',{name:'Werkstatt'})).id;
  const material=(await saveCore('items',{name:'Musterartikel',code:marker,kind,inventory_number:tracked?marker:null})).id;
  const contact=(await saveCore('contacts',{name:'Muster Auftragsservice'})).id;
  const project=(await saveCore('projects',{contact_id:contact,name:'Büroinstallation',stage:'confirmed'})).id;
  const request=(path:string,method='GET',input?:object,key?:string)=>handle(new Request(`http://desk.local/api/v1${path}`,{
    method,
    headers:{Authorization:`Bearer ${token.token}`,...(input && {'Content-Type':'application/json'}),...(key && {'Idempotency-Key':key})},
    body:input && JSON.stringify(input),
  }));
  const receive=(quantity:number)=>request('/movements','POST',{action:'receive',item_id:material,location_id:location,quantity});
  const correct=(id:string,quantity:number,reason:string,key?:string)=>request(`/movements/${id}/corrections`,'POST',{quantity,reason},key);
  const reserve=async (quantity:number,startsAt:string,endsAt:string)=>{
    const created=await request('/reservations','POST',{project_id:project,item_id:material,location_id:location,quantity,starts_at:startsAt,ends_at:endsAt});
    expect(created.status).toBe(201);
    const booking=await created.json();
    const firm=await request(`/reservations/${booking.id}`,'PATCH',{status:'firm'});
    expect(firm.status).toBe(200);
    return booking.id as string;
  };
  const balance=async ()=>{
    const entries=await (await request('/stock')).json() as {location_id:string;item_id:string}[];
    return entries.find(row=>row.location_id===location && row.item_id===material);
  };
  const cleanup=async ()=>{
    // Correction rows point to the original row. Remove both in the same statement.
    await db.unsafe('DELETE FROM movements WHERE location_id=$1',[location]);
    await db.unsafe('DELETE FROM reservations WHERE project_id=$1',[project]);
    await db.unsafe('DELETE FROM projects WHERE id=$1',[project]);
    await db.unsafe('DELETE FROM contacts WHERE id=$1',[contact]);
    await db.unsafe('DELETE FROM locations WHERE id=$1',[location]);
    await db.unsafe('DELETE FROM items WHERE id=$1',[material]);
    await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
    await db.unsafe('DELETE FROM users WHERE id=$1',[actor.id]);
  };
  return { request,receive,correct,cleanup,reserve,balance,location,material };
}

test('Eine Teilkorrektur erhält den Wareneingang und erscheint mit Begründung im Bewegungsprotokoll',async()=>{
  const {request,receive,correct,cleanup,location,material}=await warehouseExample();
  try {
    const receipt=await receive(8);
    expect(receipt.status).toBe(201);
    const original=await receipt.json();
    const key=crypto.randomUUID();
    const first=await correct(original.id,3,'Lieferschein mit fünf Stück',key);
    expect(first.status).toBe(201);
    const adjustment=await first.json();
    expect(adjustment).toMatchObject({action:'correct_receive',quantity:3,corrects_movement_id:original.id,correction_reason:'Lieferschein mit fünf Stück'});
    expect(await (await correct(original.id,3,'Lieferschein mit fünf Stück',key)).json()).toEqual(adjustment);
    expect((await correct(original.id,2,'Geänderte Eingabe',key)).status).toBe(409);
    expect((await correct(original.id,6,'Überkorrektur')).status).toBe(409);
    expect((await correct(original.id,1,'   ')).status).toBe(400);
    expect((await correct(adjustment.id,1,'Korrektur einer Korrektur')).status).toBe(409);
    const stock=await (await request('/stock')).json();
    expect(stock).toEqual(expect.arrayContaining([expect.objectContaining({item_id:material,location_id:location,physical:5})]));
    const movements=await (await request('/movements?limit=200')).json();
    expect(movements).toEqual(expect.arrayContaining([original,adjustment]));
  } finally {
    await cleanup();
  }
});

test('Eine Verbrauchskorrektur stellt Bestand und den noch verfügbaren Reservierungsrest wieder her',async()=>{
  const {request,receive,correct,cleanup,reserve,balance}=await warehouseExample();
  try {
    await receive(8);
    const reservation=await reserve(5,'2032-06-02T08:00:00Z','2032-06-02T10:00:00Z');
    const consume=(quantity:number)=>request('/movements','POST',{action:'consume',reservation_id:reservation,quantity});
    const used=await consume(4);
    expect(used.status).toBe(201);
    const movement=await used.json();
    expect(await balance()).toMatchObject({physical:4,reserved:1,free:3});
    const restored=await correct(movement.id,2,'Verbrauch um zwei zu hoch erfasst');
    expect(restored.status).toBe(201);
    expect(await restored.json()).toMatchObject({action:'correct_consume',reservation_id:reservation,project_id:movement.project_id});
    expect(await balance()).toMatchObject({physical:6,reserved:3,free:3});
    expect((await consume(4)).status).toBe(409);
    expect((await consume(3)).status).toBe(201);
    expect(await balance()).toMatchObject({physical:3,reserved:0,free:3});
  } finally {
    await cleanup();
  }
});

test('Ein korrigierter Wareneingang deckt weiterhin alle festen Reservierungen im Zeitfenster',async()=>{
  const {receive,correct,cleanup,reserve,balance}=await warehouseExample('equipment');
  try {
    const receipt=await (await receive(6)).json();
    await reserve(3,'2032-06-02T08:00:00Z','2032-06-02T10:00:00Z');
    await reserve(3,'2032-06-02T10:00:00Z','2032-06-02T14:00:00Z');
    await reserve(1,'2032-06-02T09:00:00Z','2032-06-02T11:00:00Z');
    expect((await correct(receipt.id,3,'Zu wenig für die Buchungsspitze')).status).toBe(409);
    expect((await correct(receipt.id,2,'Vier Geräte geprüft')).status).toBe(201);
    expect(await balance()).toMatchObject({physical:4});
  } finally {
    await cleanup();
  }
});

test('Ein ausgegebenes Einzelgerät bleibt gebucht und ist nach vollständiger Korrektur erneut erfassbar',async()=>{
  const {request,receive,correct,cleanup,reserve,balance}=await warehouseExample('equipment',true);
  try {
    const receipt=await (await receive(1)).json();
    const reservation=await reserve(1,new Date(Date.now()-3_600_000).toISOString(),new Date(Date.now()+3_600_000).toISOString());
    const issue=await request('/movements','POST',{action:'issue',reservation_id:reservation,quantity:1});
    expect(issue.status).toBe(201);
    expect((await correct(receipt.id,1,'Gerät ist noch ausgegeben')).status).toBe(409);
    expect((await correct((await issue.json()).id,1,'Ausgabe braucht Rückgabe')).status).toBe(409);
    expect((await request('/movements','POST',{action:'return',reservation_id:reservation,quantity:1})).status).toBe(201);
    expect((await correct(receipt.id,1,'Ersten Wareneingang zurückgenommen')).status).toBe(201);
    expect(await balance()).toMatchObject({physical:0});
    expect((await receive(1)).status).toBe(201);
    expect((await receive(1)).status).toBe(409);
    expect(await balance()).toMatchObject({physical:1});
  } finally {
    await cleanup();
  }
});

test('Konkurrierende Korrekturen können den ursprünglichen Zugang in Summe nicht überschreiten',async()=>{
  const {receive,correct,cleanup,balance}=await warehouseExample();
  try {
    const receipt=await (await receive(5)).json();
    expect((await receive(9)).status).toBe(201);
    const outcomes=await Promise.all([
      correct(receipt.id,3,'Erste Korrektur',crypto.randomUUID()),
      correct(receipt.id,3,'Zweite Korrektur',crypto.randomUUID()),
    ]);
    expect(outcomes.map(response=>response.status).sort()).toEqual([201,409]);
    expect(await balance()).toMatchObject({physical:11});
  } finally {
    await cleanup();
  }
});
