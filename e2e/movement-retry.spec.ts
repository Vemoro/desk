import { expect,test,type Page } from '@playwright/test';
import { signIn } from './session';

async function warehouseBooking(page:Page,kind:'consumable'|'equipment'){
  await signIn(page);
  const origin=new URL(page.url()).origin;
  async function request(path:string,data:object,method='POST'){
    const response=await page.request.fetch('/api/v1/'+path,{method,data,headers:{Origin:origin}});
    expect(response.ok(),await response.text()).toBeTruthy();
    return response.json();
  }
  const suffix=crypto.randomUUID().slice(0,8);
  const name=`Musterartikel ${suffix}`;
  const projectResponse=await page.request.get('/api/v1/projects');
  const projects=await projectResponse.json() as {id:string;name:string}[];
  const sample=projects.find(p=>p.name==='Büroinstallation Westflügel')!;
  const location=await request('locations',{name:`Lager ${suffix}`});
  const item=await request('items',{name,kind,code:`V-${suffix}`});
  await request('movements',{action:'receive',item_id:item.id,location_id:location.id,quantity:10});
  const booking=await request('reservations',{project_id:sample.id,item_id:item.id,location_id:location.id,quantity:4,
    starts_at:new Date(Date.now()-60_000).toISOString(),ends_at:new Date(Date.now()+3_600_000).toISOString()});
  await request(`reservations/${booking.id}`,{status:'firm'},'PATCH');
  return {item,booking,request};
}

async function openMovement(page:Page,action:'consume'|'return',bookingId:string){
  await page.reload();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager'}).click();
  await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
  await page.getByLabel('Bewegungsart').selectOption(action);
  await page.getByLabel('Projektreservierung').selectOption(bookingId);
}

async function loseFirstResponse(page:Page){
  const calls:{key:string|undefined;id:string}[]=[];
  await page.route('**/api/v1/movements',async route=>{
    const response=await route.fetch();
    expect(response.status()).toBe(201);
    const result=await response.json() as {id:string};
    calls.push({key:route.request().headers()['idempotency-key'],id:result.id});
    if(calls.length===1) await route.abort('failed');
    else await route.fulfill({response});
  });
  return calls;
}

async function stock(page:Page,itemId:string){
  const response=await page.request.get('/api/v1/stock');
  expect(response.ok()).toBeTruthy();
  const rows=await response.json() as {item_id:string;physical:number;reserved:number}[];
  return rows.find(row=>row.item_id===itemId);
}

test('Ein Verbrauch lässt sich nach Neuladen und verlorener Antwort ohne Doppelbuchung wiederholen',async({page})=>{
  const {item,booking}=await warehouseBooking(page,'consumable');
  await openMovement(page,'consume',booking.id);
  const calls=await loseFirstResponse(page);
  const book=page.getByRole('button',{name:'Bewegung buchen'});
  await book.click();
  await expect(page.getByText('Der letzte Vorgang kann bereits gespeichert sein.',{exact:false})).toBeVisible();
  expect(calls[0].key).toBeTruthy();
  expect(await stock(page,item.id)).toMatchObject({physical:9,reserved:3});

  const navigation=page.getByRole('navigation',{name:'Hauptnavigation'});
  await navigation.getByRole('button',{name:'Übersicht'}).click();
  await navigation.getByRole('button',{name:'Projektlager'}).click();
  await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
  await expect(page.getByRole('button',{name:'Letzten Vorgang erneut senden'})).toBeVisible();
  await page.reload();
  await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
  await expect(page.getByLabel('Projektreservierung')).toHaveValue(booking.id);
  await page.getByRole('button',{name:'Letzten Vorgang erneut senden'}).click();
  await expect(page.getByRole('status').getByText('Lagerbewegung gebucht.')).toBeVisible();
  expect(calls[1]).toEqual(calls[0]);
  expect(await stock(page,item.id)).toMatchObject({physical:9,reserved:3});

  await book.click();
  await expect.poll(()=>calls.length).toBe(3);
  expect(calls[2].key).toBeTruthy();
  expect(calls[2].key).not.toBe(calls[0].key);
  expect(calls[2].id).not.toBe(calls[0].id);
  expect(await stock(page,item.id)).toMatchObject({physical:8,reserved:2});
});

test('Die letzte Rückgabe bleibt prüfbar, wenn ihre Reservierung keine offene Ausgabe mehr hat',async({page})=>{
  const {item,booking,request}=await warehouseBooking(page,'equipment');
  await request('movements',{action:'issue',reservation_id:booking.id,quantity:1});
  await request(`reservations/${booking.id}`,{status:'released'},'PATCH');
  await openMovement(page,'return',booking.id);
  const calls=await loseFirstResponse(page);
  await page.getByRole('button',{name:'Bewegung buchen'}).click();
  await expect(page.getByText('Der letzte Vorgang kann bereits gespeichert sein.',{exact:false})).toBeVisible();
  expect(await stock(page,item.id)).toMatchObject({physical:10,reserved:0});

  await page.reload();
  await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
  await expect(page.getByLabel('Projektreservierung')).toHaveValue('');
  await page.getByRole('button',{name:'Letzten Vorgang erneut senden'}).click();
  await expect(page.getByRole('status').getByText('Lagerbewegung gebucht.')).toBeVisible();
  expect(calls[0].key).toBeTruthy();
  expect(calls[1]).toEqual(calls[0]);
  expect(await stock(page,item.id)).toMatchObject({physical:10,reserved:0});
});
