import { expect, test } from '@playwright/test';
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
