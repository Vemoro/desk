import { expect, test, type Page } from '@playwright/test';
import { holdRoute, settleResponse, signIn } from './session';

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
  for(const [reservation_id,quantity] of [[mainCheckout,2],[mainCheckout,1],[differentLocation,1],[differentProject,1],[returned,1]] as const){
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
  const initialCount=await checkoutTable.locator('tbody tr').count();
  await expect(open.getByText(`${initialCount} offene Ausgaben`,{exact:true})).toBeVisible();
  const stockBefore=await stock.getByRole('table').textContent();
  const projectFilter=open.getByRole('combobox',{name:'Projekt filtern'});
  const locationFilter=open.getByRole('combobox',{name:'Lagerort filtern'});
  await projectFilter.selectOption(first.id);
  await locationFilter.selectOption(main.id);
  const rows=open.getByRole('row').filter({has:page.getByText(first.name,{exact:true})});
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole('cell').last()).toHaveText('2');
  await expect(open.getByText('1 offene Ausgabe',{exact:true})).toBeVisible();
  await expect(checkoutTable.getByText(second.name,{exact:true})).toHaveCount(0);
  expect(await stock.getByRole('table').textContent()).toBe(stockBefore);
  await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
  async function returnOne(){
    await page.getByRole('combobox',{name:'Bewegungsart',exact:true}).selectOption('return');
    await page.getByRole('combobox',{name:'Projektreservierung',exact:true}).selectOption(mainCheckout);
    await page.getByRole('spinbutton',{name:'Menge',exact:true}).fill('1');
    await page.getByRole('button',{name:'Bewegung buchen',exact:true}).click();
  }
  await returnOne();
  await expect(rows.first().getByRole('cell').last()).toHaveText('1');
  await expect(open.getByText('1 offene Ausgabe',{exact:true})).toBeVisible();
  await returnOne();
  await expect(open.getByText('0 offene Ausgaben',{exact:true})).toBeVisible();
  await locationFilter.selectOption(third.id);
  await expect(open.getByText('Keine offenen Ausgaben für diese Filter.')).toBeVisible();
  await open.getByRole('button',{name:'Filter zurücksetzen'}).press('Enter');
  await expect(projectFilter).toHaveValue('');
  await expect(locationFilter).toHaveValue('');
  await expect(checkoutTable.getByText(first.name,{exact:true})).toHaveCount(1);
  await expect(checkoutTable.getByText(second.name,{exact:true})).toHaveCount(1);
  await expect(open.getByText(`${initialCount-1} offene Ausgaben`,{exact:true})).toBeVisible();
  await page.route('**/api/v1/reservations?*',route=>route.fulfill({json:[]}));
  await page.reload();
  await expect(open.getByText('Es gibt keine offenen Ausgaben.')).toBeVisible();
  await expect(open.getByText('0 offene Ausgaben',{exact:true})).toBeVisible();
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

test('Lagerbewegungen filtern, ohne Korrekturmengen oder andere Lagerfilter zu ändern',async({page})=>{
  const checkout={item_id:'kit',location_id:'ost',status:'firm',checked_out:1};
  const movement={item_id:'kit',location_id:'ost',actor_id:'mira',created_at:'2028-05-17T09:00:00Z',quantity:1};
  const fixtures={
    projects:[
      {id:'office',name:'Musterinstallation',stage:'running'},
      {id:'events',name:'Musterbetreuung',stage:'running'},
    ],
    items:[{id:'kit',name:'Montagekoffer',code:'MK-01',kind:'equipment'}],
    locations:[{id:'ost',name:'Musterlager Ost'}],
    reservations:[
      {...checkout,id:'booking-a',project_id:'office'},
      {...checkout,id:'booking-b',project_id:'events'},
    ],
    stock:[{item_id:'kit',location_id:'ost',physical:4,reserved:2,free:2}],
    movements:[
      {...movement,id:'receipt',action:'receive',quantity:5,project_id:null},
      {...movement,id:'receipt-correction',action:'correct_receive',quantity:5,corrects_movement_id:'receipt',correction_reason:'Musterlieferung korrigiert'},
      {...movement,id:'consumption',action:'consume',quantity:3,project_id:'office'},
      {...movement,id:'consumption-correction',action:'correct_consume',corrects_movement_id:'consumption',project_id:'office'},
      {...movement,id:'office-return',action:'return',project_id:'office'},
      {...movement,id:'event-return',action:'return',project_id:'events'},
      {...movement,id:'historical-receipt',action:'receive',project_id:'missing-project'},
    ],
  };
  for(const [resource,json] of Object.entries(fixtures)){
    const url='**/api/v1/'+resource+(resource==='stock'?'':'?*');
    await page.route(url,route=>route.fulfill({json}));
  }
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const panel=(name:string)=>page.locator('.panel').filter({has:page.getByRole('heading',{name,exact:true})});
  const stock=panel('Bestand je Lagerort').getByLabel('Bestand suchen');
  const checkoutProject=panel('Offene Ausgaben').getByLabel('Projekt filtern');
  const ledger=panel('Lagerbewegungen');
  const kind=ledger.getByLabel('Bewegungsart filtern');
  const project=ledger.getByLabel('Projekt filtern');
  const reset=ledger.getByRole('button',{name:'Filter zurücksetzen',exact:true});
  const rows=ledger.locator('tbody tr:visible');
  const rowById=(id:string)=>rows.filter({has:page.locator(`#bewegung-${id}`)});
  await expect(rows).toHaveCount(7);
  await expect(ledger.getByText('7 von 7 Bewegungen',{exact:true})).toBeVisible();
  await expect(kind).toHaveValue('');
  await expect(project).toHaveValue('');
  await expect(reset).toBeDisabled();
  await rowById('receipt-correction').getByRole('link',{name:/Original vom/}).click();
  await expect(page.locator('#bewegung-receipt')).toBeFocused();

  await stock.fill('MK-01');
  await checkoutProject.selectOption('events');
  await kind.selectOption('return');
  await project.selectOption('office');
  await expect(rows).toHaveCount(1);
  await expect(rowById('office-return')).toBeVisible();
  await expect(rowById('event-return')).toHaveCount(0);
  await expect(ledger.getByText('1 von 7 Bewegungen',{exact:true})).toBeVisible();

  await kind.selectOption('receive');
  await expect(ledger.getByText('Keine Lagerbewegungen für diese Filter.',{exact:true})).toBeVisible();
  await expect(ledger.getByText('0 von 7 Bewegungen',{exact:true})).toBeVisible();
  await project.selectOption('without-project');
  await expect(rows).toHaveCount(1);
  await expect(rowById('historical-receipt')).toHaveCount(0);
  await expect(rowById('receipt').getByText('Vollständig korrigiert',{exact:true})).toBeVisible();
  await expect(rowById('receipt').getByRole('button',{name:'Korrigieren',exact:true})).toHaveCount(0);

  await kind.selectOption('correct_receive');
  await expect(rows).toHaveCount(1);
  await expect(rowById('receipt-correction').getByText(/Original vom/)).toBeVisible();
  await expect(rowById('receipt-correction').getByRole('link',{name:/Original vom/})).toHaveCount(0);
  await kind.selectOption('correct_consume');
  await project.selectOption('office');
  await expect(rows).toHaveCount(1);
  await expect(rowById('consumption-correction')).toBeVisible();
  await kind.selectOption('consume');
  await rowById('consumption').getByRole('button',{name:'Korrigieren',exact:true}).click();
  const correctionQuantity=rowById('consumption').getByLabel('Korrekturmenge');
  const correctionReason=rowById('consumption').getByLabel('Begründung');
  await expect(correctionQuantity).toHaveAttribute('max','2');
  await correctionQuantity.fill('2');
  await correctionReason.fill('Beim Rückbau nachgezählt');
  await kind.selectOption('return');
  await expect(rowById('consumption')).toHaveCount(0);

  await reset.click();
  await expect(rows).toHaveCount(7);
  await expect(correctionQuantity).toHaveValue('2');
  await expect(correctionReason).toHaveValue('Beim Rückbau nachgezählt');
  await expect(rowById('historical-receipt')).toBeVisible();
  await expect(rowById('receipt-correction').getByRole('link',{name:/Original vom/})).toBeVisible();
  await expect(stock).toHaveValue('MK-01');
  await expect(checkoutProject).toHaveValue('events');
  await expect(reset).toBeDisabled();

  let releaseResponse!:()=>void;
  let writes=0;
  const responseHeld=new Promise<void>(resolve=>{releaseResponse=resolve;});
  await page.route('**/api/v1/movements/consumption/corrections',async route=>{
    writes++;
    await responseHeld;
    await route.abort();
  });
  try {
    await rowById('consumption').getByRole('button',{name:'Korrektur buchen',exact:true}).click();
    await expect.poll(()=>writes).toBe(1);
    await kind.selectOption('receive');
    await project.selectOption('office');
    await expect(rows).toHaveCount(0);
    await reset.click();
    await expect(correctionQuantity).toBeDisabled();
    await expect(rowById('consumption').getByRole('button',{name:'Wird gespeichert …',exact:true})).toBeDisabled();
    await expect(rowById('consumption').getByRole('button',{name:'Neuen Vorgang beginnen',exact:true})).toHaveCount(0);
  } finally {
    releaseResponse();
  }
  await expect(rowById('consumption').getByRole('button',{name:'Letzten Vorgang erneut senden',exact:true})).toBeVisible();
  expect(writes).toBe(1);
});

test('Offene Ausgaben nach Artikel filtern, ohne Bestand und Lagerbewegungen mitzufiltern',async({page})=>{
  const checkout={project_id:'office',location_id:'ost',status:'firm',checked_out:1};
  const movement={action:'issue',created_at:'2028-05-17T09:00:00Z',actor_id:'mira',quantity:1};
  const fixtures={
    projects:[
      {id:'office',name:'Musterinstallation',stage:'running'},
      {id:'events',name:'Musterbetreuung',stage:'running'},
    ],
    items:[
      {id:'kit-a',name:'Montagekoffer',code:'MK-01',kind:'equipment'},
      {id:'kit-b',name:'Montagekoffer',code:'MK-02',inventory_number:'INV-02',kind:'equipment'},
      {id:'other',name:'Messgerät',kind:'equipment'},
    ],
    locations:[{id:'ost',name:'Musterlager Ost'},{id:'west',name:'Musterlager West'}],
    reservations:[
      {...checkout,id:'r1',item_id:'kit-a'},
      {...checkout,id:'r2',item_id:'kit-b',project_id:'events',location_id:'west'},
      {...checkout,id:'r3',item_id:'kit-a',project_id:'events',location_id:'west'},
      {...checkout,id:'r4',item_id:'historical',checked_out:3},
      {...checkout,id:'r5',item_id:null,checked_out:7},
    ],
    stock:[
      {item_id:'kit-a',location_id:'ost',physical:5,reserved:1,free:4},
      {item_id:'kit-b',location_id:'west',physical:5,reserved:2,free:3},
    ],
    movements:[
      {...movement,id:'m1',item_id:'kit-a',project_id:'office',location_id:'ost'},
      {...movement,id:'m2',item_id:'kit-b',project_id:'events',location_id:'west'},
    ],
  };
  for(const [resource,json] of Object.entries(fixtures)){
    const url='**/api/v1/'+resource+(resource==='stock'?'':'?*');
    await page.route(url,route=>route.fulfill({json}));
  }
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const panel=(name:string)=>page.locator('.panel').filter({has:page.getByRole('heading',{name,exact:true})});
  const target=panel('Offene Ausgaben');
  const articles=target.getByLabel('Artikel filtern');
  const project=target.getByLabel('Projekt filtern');
  const location=target.getByLabel('Lagerort filtern');
  const rows=target.locator('tbody tr');
  const stock=panel('Bestand je Lagerort');
  const stockRows=stock.locator('tbody tr');
  const moveRows=panel('Lagerbewegungen').locator('tbody tr');
  const reset=target.getByRole('button',{name:'Filter zurücksetzen'});
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({has:page.getByRole('cell',{name:'3',exact:true})}).getByRole('cell').nth(1)).toHaveText('–');
  await expect(rows.getByRole('cell',{name:'7',exact:true})).toHaveCount(0);
  await expect(articles.locator('option')).toHaveText(['Alle Artikel','Montagekoffer · MK-01','Montagekoffer (INV-02) · MK-02','Messgerät']);
  await stock.getByLabel('Bestand suchen').fill('MK-01');
  await expect(stockRows).toHaveCount(1);
  await expect(stockRows).toContainText('Musterlager Ost');
  await expect(rows).toHaveCount(4);
  await expect(reset).toBeDisabled();

  await articles.selectOption('kit-a');
  await expect(rows).toHaveCount(2);
  await expect(target.getByText('2 offene Ausgaben',{exact:true})).toBeVisible();
  await articles.selectOption('kit-b');
  await expect(rows).toHaveCount(1);
  await expect(target.getByText('1 offene Ausgabe',{exact:true})).toBeVisible();
  await expect(rows).toContainText('Musterbetreuung');
  await project.selectOption('office');
  await expect(target.getByText('Keine offenen Ausgaben für diese Filter.')).toBeVisible();
  await expect(target.getByText('0 offene Ausgaben',{exact:true})).toBeVisible();
  await project.selectOption('events');
  await location.selectOption('ost');
  await expect(target.getByText('Keine offenen Ausgaben für diese Filter.')).toBeVisible();
  await location.selectOption('west');
  await expect(rows).toHaveCount(1);
  await reset.click();
  await expect(articles).toHaveValue('');
  await expect(project).toHaveValue('');
  await expect(location).toHaveValue('');
  await expect(rows).toHaveCount(4);
  await expect(target.getByText('4 offene Ausgaben',{exact:true})).toBeVisible();
  await expect(reset).toBeDisabled();
  await expect(stock.getByLabel('Bestand suchen')).toHaveValue('MK-01');
  await expect(stockRows).toHaveCount(1);

  await articles.selectOption('kit-b');
  await expect(stockRows).toContainText('Musterlager Ost');
  await expect(moveRows).toHaveCount(2);
  await expect(moveRows.first()).toContainText('Musterinstallation');
  await target.getByRole('link',{name:'Musterbetreuung',exact:true}).click();
  await expect(page).toHaveURL(/#projects\/events$/);
  await expect(page.getByRole('heading',{name:'Musterbetreuung',exact:true})).toBeVisible();
});

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
  const {item,receipt,original,corrections}=await warehouseReceipt(page,8);
  const correctionPath=`**/api/v1/movements/${receipt.id}/corrections`;
  const delayed=holdRoute();
  await page.route(correctionPath,route=>delayed.resolve(route),{times:1});
  await original.getByRole('button',{name:'Korrigieren',exact:true}).click();
  await original.getByLabel('Korrekturmenge').fill('3');
  const reason='Lieferschein bestätigt fünf Stück';
  await original.getByLabel('Begründung').fill(reason);
  await original.getByRole('button',{name:'Korrektur buchen',exact:true}).click();
  const progress='Korrektur wird gebucht …';
  const correction=original.getByRole('button',{name:'Korrigieren',exact:true});
  await expect(original.getByRole('status')).toHaveText(progress);
  await expect(correction).toBeDisabled();
  await expect(correction).toHaveAccessibleDescription(progress);
  await settleResponse(page,await delayed.request,{error:'Korrektur vorübergehend abgelehnt.'},422);
  await expect(page.getByRole('alert')).toContainText('Korrektur vorübergehend abgelehnt.');
  await expect(correction).toBeEnabled();
  await expect(original.getByText(progress,{exact:true})).toHaveCount(0);
  await expect(original.getByLabel('Korrekturmenge')).toHaveValue('3');
  await expect(original.getByLabel('Begründung')).toHaveValue(reason);
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
