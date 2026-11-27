import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Buchungsoptionen unterscheiden Lagerort und Zeitraum und behalten ihre Zuordnung',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const reservations=[
    {id:'11111111-1111-4111-8111-111111111111',location_id:'ost',starts_at:'2028-04-15T06:00:00Z',ends_at:'2028-04-15T08:00:00Z',status:'firm',checked_out:0},
    {id:'22222222-2222-4222-8222-222222222222',location_id:'west',starts_at:'2028-04-15T06:00:00Z',ends_at:'2028-04-15T08:00:00Z',status:'released',checked_out:1},
    {id:'33333333-3333-4333-8333-333333333333',location_id:'ost',starts_at:'2028-04-15T10:00:00Z',ends_at:'2028-04-15T12:00:00Z',status:'firm',checked_out:0},
    {id:'44444444-4444-4444-8444-444444444444',location_id:'ost',starts_at:'2028-04-16T06:00:00Z',ends_at:'2028-04-16T08:00:00Z',status:'released',checked_out:0},
  ];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[{id:'projekt',name:'Musterauftrag'}]}));
  await page.route('**/api/v1/items?*',route=>route.fulfill({json:[{id:'koffer',name:'Musterkoffer'}]}));
  await page.route('**/api/v1/locations?*',route=>route.fulfill({json:[
    {id:'ost',name:'Lager Ost'}, {id:'west',name:'Lager West'},
  ]}));
  await page.route('**/api/v1/reservations?*',route=>route.fulfill({json:reservations.map(row=>({...row,project_id:'projekt',item_id:'koffer'}))}));
  await page.route('**/api/v1/movements',route=>route.fulfill({status:201,json:{id:'movement'}}));
  await signIn(page);
  await page.getByRole('button',{name:'Menü',exact:true}).click();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
  const choice=page.locator('select[name="reservation_id"]');
  await expect(choice.locator('option')).toHaveText([
    'Auswählen',
    'Musterauftrag · Musterkoffer · Lager Ost · 15.04.2028, 08:00 bis 15.04.2028, 10:00',
    'Musterauftrag · Musterkoffer · Lager West · 15.04.2028, 08:00 bis 15.04.2028, 10:00',
    'Musterauftrag · Musterkoffer · Lager Ost · 15.04.2028, 12:00 bis 15.04.2028, 14:00',
  ]);
  await page.locator('select[name="action"]').selectOption('return');
  await choice.selectOption({label:'Musterauftrag · Musterkoffer · Lager West · 15.04.2028, 08:00 bis 15.04.2028, 10:00'});
  await expect(choice).toHaveAccessibleDescription(/Lager West · 15\.04\.2028, 08:00 bis 15\.04\.2028, 10:00/);
  await expect(page.locator('#warehouse-booking-details')).toBeVisible();
  const request=page.waitForRequest(req=>req.method()==='POST' && new URL(req.url()).pathname==='/api/v1/movements');
  await page.getByRole('button',{name:'Bewegung buchen',exact:true}).click();
  expect((await request).postDataJSON()).toMatchObject({reservation_id:reservations[1].id,action:'return'});
  await expect(page.getByRole('status').getByText('Lagerbewegung gebucht.')).toBeVisible();
});

test('Gleichnamige Einzelgeräte bleiben anhand der Inventarnummer in Planung und Projektlager unterscheidbar',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const suffix=crypto.randomUUID().slice(0,8);
  const deviceName=`Musterkoffer ${suffix}`;
  const itemName=`Musterband ${suffix}`;
  const firstNumber=`INV-${suffix}-12345678901`;
  const secondNumber=`INV-${suffix}-12345678902`;
  expect(firstNumber).toHaveLength(24);
  expect(secondNumber).toHaveLength(24);
  const firstLabel=`${deviceName} (${firstNumber})`;
  const secondLabel=`${deviceName} (${secondNumber})`;

  async function write(path:string,data:object,method='POST'){
    const response=await page.request.fetch('/api/v1/'+path,{method,headers:{Origin:origin},data});
    expect(response.ok(),await response.text()).toBeTruthy();
    return response.json();
  }

  const projects=await (await page.request.get('/api/v1/projects?limit=200')).json() as {id:string;name:string}[];
  const project=projects.find(row=>row.name==='Büroinstallation Westflügel');
  if(!project) throw new Error('Musterauftrag fehlt.');
  const location=await write('locations',{name:`Musterlager ${suffix}`});
  const first=await write('items',{name:deviceName,kind:'equipment',code:`A-${suffix}`,inventory_number:firstNumber});
  const second=await write('items',{name:deviceName,kind:'equipment',code:`B-${suffix}`,inventory_number:secondNumber});
  const consumable=await write('items',{name:itemName,kind:'consumable',code:`C-${suffix}`});
  const starts_at=new Date(Date.now()-60_000).toISOString();
  const ends_at=new Date(Date.now()+3_600_000).toISOString();
  async function book(itemId:string) {
    await write('movements',{action:'receive',item_id:itemId,location_id:location.id,quantity:1});
    const reservation=await write('reservations',{
      project_id:project!.id,item_id:itemId,location_id:location.id,quantity:1,starts_at,ends_at,
    });
    await write(`reservations/${reservation.id}`,{status:'firm'},'PATCH');
    return reservation.id as string;
  }
  const firstBooking=await book(first.id);
  const secondBooking=await book(second.id);
  await book(consumable.id);
  await write('movements',{action:'issue',reservation_id:firstBooking,quantity:1});

  await page.goto('/#warehouse');
  await page.reload();
  const panel=(title:string)=>page.locator('section.panel').filter({has:page.getByRole('heading',{name:title,exact:true})});
  const stock=panel('Bestand je Lagerort').getByRole('table');
  await expect(stock.getByText(firstLabel,{exact:true})).toBeVisible();
  await expect(stock.getByText(secondLabel,{exact:true})).toBeVisible();
  await expect(stock.getByText(itemName,{exact:true})).toBeVisible();
  await expect(panel('Offene Ausgaben').getByText(firstLabel,{exact:true})).toBeVisible();
  await expect(panel('Lagerbewegungen').getByText(secondLabel,{exact:true})).toBeVisible();

  await page.locator('summary').filter({hasText:/^Wareneingang$/}).click();
  const receiveChoices=page.locator('details[open] select[name="item_id"] option');
  await expect(receiveChoices.filter({hasText:firstNumber})).toHaveAttribute('value',first.id);
  await expect(receiveChoices.filter({hasText:secondNumber})).toHaveAttribute('value',second.id);
  await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
  const booking=page.locator('select[name="reservation_id"]');
  await expect(booking.locator('option').filter({hasText:firstLabel})).toHaveAttribute('value',firstBooking);
  await expect(booking.locator('option').filter({hasText:secondLabel})).toHaveAttribute('value',secondBooking);
  const selectedLabel=await booking.locator('option').filter({hasText:secondLabel}).textContent();
  if(!selectedLabel) throw new Error('Beschriftung der Gerätebuchung fehlt.');
  await booking.selectOption({label:selectedLabel});
  await expect(booking).toHaveAccessibleDescription(new RegExp(secondNumber));
  const description=page.locator('#warehouse-booking-details');
  await expect(description).toBeVisible();
  await expect(description).toContainText(secondLabel);
  expect(await description.evaluate(element=>element.scrollWidth)).toBeLessThanOrEqual(
    await description.evaluate(element=>element.clientWidth));
  await page.locator('select[name="action"]').selectOption('issue');
  const sent=page.waitForRequest(req=>req.method()==='POST' && new URL(req.url()).pathname==='/api/v1/movements');
  await page.getByRole('button',{name:'Bewegung buchen',exact:true}).click();
  expect((await sent).postDataJSON()).toMatchObject({reservation_id:secondBooking,action:'issue'});
  await expect(panel('Offene Ausgaben').getByText(secondLabel,{exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Menü',exact:true}).click();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  await page.getByRole('button',{name:project.name,exact:true}).click();
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  await page.locator('summary').filter({hasText:/^Inventar vormerken$/}).click();
  const planning=panel('Ressourcenplanung');
  const candidates=planning.locator('select[name="item_id"] option');
  await expect(candidates.filter({hasText:firstNumber})).toHaveText(firstLabel);
  await expect(candidates.filter({hasText:secondNumber})).toHaveText(secondLabel);
  await expect(candidates.filter({hasText:itemName})).toHaveText(itemName);
  await expect(planning.getByRole('table').getByText(secondLabel,{exact:true})).toBeVisible();
});
