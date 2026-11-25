import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

test('Offene Ausgaben nach Projekt und Lagerort zeigen auch Teilrückgaben und abgesagte Projekte',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const suffix=crypto.randomUUID().slice(0,8);
  async function write(path:string,data:unknown,method='POST'){
    const response=await page.request.fetch('/api/v1/'+path,{method,headers:{Origin:origin},data});
    expect(response.ok(),await response.text()).toBeTruthy();
    return response.json();
  }
  const contact=await write('contacts',{name:'Muster Auftragsservice '+suffix});
  const first=await write('projects',{name:'Muster Montage '+suffix,contact_id:contact.id,offer_ref:'ANG-01'});
  const second=await write('projects',{name:'Muster Veranstaltung '+suffix,contact_id:contact.id,offer_ref:'ANG-02'});
  for(const project of [first,second]){
    for(const stage of ['planning','offered','confirmed']) await write('projects/'+project.id+'/stage',{stage},'PATCH');
  }
  const main=await write('locations',{name:'Muster Hauptlager '+suffix});
  const side=await write('locations',{name:'Muster Werkstatt '+suffix});
  const third=await write('locations',{name:'Muster frei '+suffix});
  const item=await write('items',{name:'Muster Montagekoffer '+suffix,kind:'equipment',code:'MK-'+suffix});
  const consumed=await write('items',{name:'Muster Klebeband '+suffix,kind:'consumable',code:'KB-'+suffix});
  for(const location of [main,side]) await write('movements',{action:'receive',item_id:item.id,location_id:location.id,quantity:12});
  await write('movements',{action:'receive',item_id:consumed.id,location_id:main.id,quantity:2});
  const starts_at=new Date(Date.now()-60_000).toISOString();
  const ends_at=new Date(Date.now()+3_600_000).toISOString();
  async function reserve(project:{id:string},location:{id:string},article:{id:string},quantity:number){
    const booking=await write('reservations',{project_id:project.id,location_id:location.id,item_id:article.id,starts_at,ends_at,quantity});
    await write('reservations/'+booking.id,{status:'firm'},'PATCH');
    return booking.id as string;
  }
  const mainCheckout=await reserve(first,main,item,3);
  const differentLocation=await reserve(first,side,item,1);
  const differentProject=await reserve(second,main,item,1);
  const returned=await reserve(first,main,item,1);
  const consumable=await reserve(first,main,consumed,1);
  for(const [reservation_id,quantity] of [[mainCheckout,3],[differentLocation,1],[differentProject,1],[returned,1]] as const){
    await write('movements',{action:'issue',reservation_id,quantity});
  }
  await write('movements',{action:'return',reservation_id:mainCheckout,quantity:1});
  await write('movements',{action:'return',reservation_id:returned,quantity:1});
  await write('movements',{action:'consume',reservation_id:consumable,quantity:1});
  await write('projects/'+first.id+'/stage',{stage:'cancelled'},'PATCH');

  await page.goto('/#warehouse');
  await page.reload();
  const open=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Offene Ausgaben'})});
  const checkoutTable=open.getByRole('table');
  const stock=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Bestand je Lagerort'})});
  await expect(checkoutTable.getByText(first.name,{exact:true})).toHaveCount(2);
  await expect(checkoutTable.getByText(second.name,{exact:true})).toHaveCount(1);
  const stockBefore=await stock.getByRole('table').textContent();
  const projectFilter=open.getByRole('combobox',{name:'Projekt filtern'});
  const locationFilter=open.getByRole('combobox',{name:'Lagerort filtern'});
  await projectFilter.selectOption(first.id);
  await locationFilter.selectOption(main.id);
  const rows=open.getByRole('row').filter({has:page.getByText(first.name,{exact:true})});
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole('cell').last()).toHaveText('2');
  await expect(checkoutTable.getByText(second.name,{exact:true})).toHaveCount(0);
  expect(await stock.getByRole('table').textContent()).toBe(stockBefore);
  await locationFilter.selectOption(third.id);
  await expect(open.getByText('Keine offenen Ausgaben für diese Filter.')).toBeVisible();
  await open.getByRole('button',{name:'Filter zurücksetzen'}).press('Enter');
  await expect(projectFilter).toHaveValue('');
  await expect(locationFilter).toHaveValue('');
  await expect(checkoutTable.getByText(first.name,{exact:true})).toHaveCount(2);
  await expect(checkoutTable.getByText(second.name,{exact:true})).toHaveCount(1);
  await page.route('**/api/v1/reservations?*',route=>route.fulfill({json:[]}));
  await page.reload();
  await expect(open.getByText('Es gibt keine offenen Ausgaben.')).toBeVisible();
});

async function warehouseReceipt(page:Page,quantity:number){
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const suffix=crypto.randomUUID().slice(0,8);
  async function create(path:string,data:object){
    const response=await page.request.post('/api/v1/'+path,{headers:{Origin:origin},data});
    expect(response.status()).toBe(201);
    return response.json();
  }
  const location=await create('locations',{name:'Muster Korrekturlager '+suffix});
  const item=await create('items',{name:'Muster Klebeband '+suffix,kind:'consumable',code:'KT-'+suffix});
  const receipt=await create('movements',{action:'receive',item_id:item.id,location_id:location.id,quantity});

  await page.goto('/#warehouse');
  await page.reload();
  const ledger=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  const movements=ledger.getByRole('row').filter({has:page.getByText(item.name,{exact:true})});
  const original=movements.filter({has:page.getByText('Wareneingang',{exact:true})});
  const corrections=movements.filter({has:page.getByText('Korrektur Wareneingang',{exact:true})});
  return {receipt,item,original,corrections};
}

test('Offene Ausgaben öffnen das Projekt der gewählten Lagerzeile',async({page})=>{
  const projectName='Montage im Musterbüro';
  const projects=[
    {id:'muster-a',name:projectName,stage:'running',notes:'Ausgabe für die Büroinstallation'},
    {id:'muster-b',name:projectName,stage:'confirmed',notes:'Ausgabe für die Veranstaltungsbetreuung'},
  ];
  const resources={
    projects,
    items:[{id:'kit',name:'Montagekoffer',kind:'equipment'}],
    locations:[{id:'ost',name:'Musterlager Ost'},{id:'west',name:'Musterlager West'}],
    reservations:[
      {id:'first',project_id:'muster-a',item_id:'kit',location_id:'ost',status:'firm',checked_out:1},
      {id:'second',project_id:'muster-b',item_id:'kit',location_id:'west',status:'firm',checked_out:2},
      {id:'missing',project_id:'missing-project',item_id:'kit',location_id:'ost',status:'firm',checked_out:1},
    ],
  };
  for(const [resource,json] of Object.entries(resources)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const panel=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Offene Ausgaben',exact:true})});
  const projectFilter=panel.getByLabel('Projekt filtern');
  const locationFilter=panel.getByLabel('Lagerort filtern');
  const reset=panel.getByRole('button',{name:'Filter zurücksetzen'});
  const rows=panel.locator('tbody tr');
  const openProject=panel.getByRole('link',{name:projectName,exact:true});
  await expect(rows).toHaveCount(3);
  await expect(openProject).toHaveCount(2);
  const missing=rows.filter({hasText:'Projekt nicht verfügbar'});
  await expect(missing).toHaveCount(1);
  await expect(missing.getByRole('link')).toHaveCount(0);
  await expect(missing.getByRole('button')).toHaveCount(0);

  await projectFilter.selectOption('muster-b');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Musterlager West');
  await locationFilter.selectOption('ost');
  await expect(panel.getByText('Keine offenen Ausgaben für diese Filter.')).toBeVisible();
  await reset.click();
  await expect(rows).toHaveCount(3);
  await expect(projectFilter).toHaveValue('');
  await expect(locationFilter).toHaveValue('');

  await locationFilter.selectOption('ost');
  await expect(rows).toHaveCount(2);
  await expect(openProject).toHaveAttribute('href','#projects/muster-a');
  await reset.focus();
  await page.keyboard.press('Tab');
  await expect(openProject).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Projektnotiz')).toHaveValue(projects[0].notes);
  await page.goBack();
  await expect(panel).toBeVisible();
  await locationFilter.selectOption('west');
  await expect(rows).toHaveCount(1);
  await openProject.click();
  await expect(page.getByLabel('Projektnotiz')).toHaveValue(projects[1].notes);
});

test('Lagerkorrektur zeigt Begründung und Original und ändert den physischen Bestand',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const {item,original,corrections}=await warehouseReceipt(page,8);
  await original.getByRole('button',{name:'Korrigieren',exact:true}).click();
  await original.getByLabel('Korrekturmenge').fill('3');
  const reason='Lieferschein bestätigt fünf Stück';
  await original.getByLabel('Begründung').fill(reason);
  await original.getByRole('button',{name:'Korrektur buchen',exact:true}).click();
  await expect(corrections.getByText(reason,{exact:true})).toBeVisible();
  await expect(original.getByText('8',{exact:true})).toBeVisible();
  await corrections.getByRole('link',{name:/Original vom/}).click();
  await expect(original.locator('span[id]')).toBeFocused();
  const stock=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Bestand je Lagerort',exact:true})});
  const stockRow=stock.getByRole('row').filter({has:page.getByText(item.name,{exact:true})});
  await expect(stockRow.getByRole('cell').nth(2)).toHaveText('5');
  await expect(stockRow.getByRole('cell').nth(4)).toHaveText('5');
});

test('Eine unklare Vollkorrektur lässt sich nach Neuladen mit demselben Schlüssel prüfen',async({page})=>{
  const {receipt,original,corrections}=await warehouseReceipt(page,1);
  const calls:{key:string;id:string}[]=[];
  await page.route(`**/api/v1/movements/${receipt.id}/corrections`,async route=>{
    const response=await route.fetch();
    expect(response.status()).toBe(201);
    const correction=await response.json() as {id:string};
    calls.push({key:route.request().headers()['idempotency-key'],id:correction.id});
    if(calls.length===1) await route.abort('failed');
    else await route.fulfill({response});
  });
  await original.getByRole('button',{name:'Korrigieren',exact:true}).click();
  await original.getByLabel('Begründung').fill('Der Zugang gehört zu einem anderen Artikel');
  await original.getByRole('button',{name:'Korrektur buchen',exact:true}).click();
  await expect(original.getByRole('button',{name:'Letzten Vorgang erneut senden'})).toBeVisible();
  await page.reload();
  await original.getByRole('button',{name:'Korrektur prüfen',exact:true}).click();
  await original.getByRole('button',{name:'Letzten Vorgang erneut senden'}).click();
  await expect(original.getByText('Vollständig korrigiert',{exact:true})).toBeVisible();
  await expect(corrections).toHaveCount(1);
  expect(calls).toHaveLength(2);
  expect(calls[0].key).toBeTruthy();
  expect(calls[1]).toEqual(calls[0]);
});
