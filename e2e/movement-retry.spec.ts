import { expect,test } from '@playwright/test';
import { signIn } from './session';

test('Ein Verbrauch lässt sich nach gespeicherter Buchung und verlorener Antwort ohne Doppelbuchung wiederholen',async({page})=>{
  await signIn(page);
  const origin=new URL(page.url()).origin;
  async function request(path:string,data:object,method='POST'){
    const response=await page.request.fetch('/api/v1/'+path,{method,data,headers:{Origin:origin}});
    expect(response.ok(),await response.text()).toBeTruthy();
    return response.json();
  }
  const suffix=crypto.randomUUID().slice(0,8);
  const name=`Musterband ${suffix}`;
  const projectResponse=await page.request.get('/api/v1/projects');
  const projects=await projectResponse.json() as {id:string;name:string}[];
  const sample=projects.find(p=>p.name==='Büroinstallation Westflügel')!;
  const location=await request('locations',{name:`Lager ${suffix}`});
  const item=await request('items',{name,kind:'consumable',code:`V-${suffix}`});
  await request('movements',{action:'receive',item_id:item.id,location_id:location.id,quantity:10});
  const booking=await request('reservations',{project_id:sample.id,item_id:item.id,location_id:location.id,quantity:4,
    starts_at:new Date(Date.now()-60_000).toISOString(),ends_at:new Date(Date.now()+3_600_000).toISOString()});
  await request(`reservations/${booking.id}`,{status:'firm'},'PATCH');
  await page.reload();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager'}).click();
  await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
  await page.getByLabel('Bewegungsart').selectOption('consume');
  await page.getByLabel('Projektreservierung').selectOption(booking.id);
  const calls:{key:string|undefined;id:string}[]=[];
  await page.route('**/api/v1/movements',async route=>{
    const response=await route.fetch();
    expect(response.status()).toBe(201);
    const result=await response.json() as {id:string};
    calls.push({key:route.request().headers()['idempotency-key'],id:result.id});
    if(calls.length===1) await route.abort('failed');
    else await route.fulfill({response});
  });
  const book=page.getByRole('button',{name:'Bewegung buchen'});
  async function stock(){
    const response=await page.request.get('/api/v1/stock');
    expect(response.ok()).toBeTruthy();
    const rows=await response.json() as {item_id:string;physical:number;reserved:number}[];
    return rows.find(row=>row.item_id===item.id);
  }
  await book.click();
  await expect(page.getByText('Der letzte Vorgang kann bereits gespeichert sein.',{exact:false})).toBeVisible();
  expect(calls[0].key).toBeTruthy();
  expect(await stock()).toMatchObject({physical:9,reserved:3});
  await book.click();
  await expect(page.getByRole('status').getByText('Lagerbewegung gebucht.')).toBeVisible();
  expect(calls[1]).toEqual(calls[0]);
  expect(await stock()).toMatchObject({physical:9,reserved:3});

  await book.click();
  await expect.poll(()=>calls.length).toBe(3);
  expect(calls[2].key).toBeTruthy();
  expect(calls[2].key).not.toBe(calls[0].key);
  expect(calls[2].id).not.toBe(calls[0].id);
  expect(await stock()).toMatchObject({physical:8,reserved:2});
});
