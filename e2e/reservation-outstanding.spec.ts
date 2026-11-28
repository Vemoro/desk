import { test, expect, type Page } from '@playwright/test';
import { project, signIn } from './session';

async function setupReservations(page:Page) {
  await signIn(page);
  const suffix=crypto.randomUUID().slice(0,8);
  const name='Muster Rückholung '+suffix;
  const origin=new URL(page.url()).origin;
  async function write(path:string,data:object,method='POST'):Promise<{id:string}> {
    const response=await page.request.fetch('/api/v1/'+path,{method,headers:{Origin:origin},data});
    expect(response.ok(),method+' '+path+': '+await response.text()).toBeTruthy();
    return response.json();
  }
  const contact=await write('contacts',{name:'Muster Rückholung'});
  const created=await write('projects',{name,contact_id:contact.id,offer_ref:'ANG-'+suffix});
  for(const stage of ['planning','offered','confirmed']){
    await write('projects/'+created.id+'/stage',{stage},'PATCH');
  }
  const location=await write('locations',{name:'Musterlager '+suffix});
  const device=await write('items',{name:'Musterkoffer '+suffix,kind:'equipment',code:'MK-'+suffix});
  const spare=await write('items',{name:'Musterprüfgerät '+suffix,kind:'equipment',code:'MP-'+suffix,inventory_number:'INV-'+suffix});
  const supply=await write('items',{name:'Musterband '+suffix,kind:'consumable',code:'MB-'+suffix});
  const person=await (await page.request.get('/api/v1/me')).json();
  await write('movements',{action:'receive',item_id:device.id,location_id:location.id,quantity:5});
  const core={project_id:created.id,starts_at:new Date(Date.now()-600_000).toISOString(),ends_at:new Date(Date.now()+3_600_000).toISOString()};
  const current=await write('reservations',{...core,item_id:device.id,location_id:location.id,quantity:5});
  await write('reservations',{...core,item_id:spare.id,location_id:location.id,quantity:1});
  await write('reservations',{...core,item_id:supply.id,location_id:location.id,quantity:2});
  await write('reservations',{...core,user_id:person.id,quantity:1});
  await write('reservations/'+current.id,{status:'firm'},'PATCH');
  await write('movements',{action:'issue',reservation_id:current.id,quantity:3});
  await page.reload();
  await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
  return {name,suffix,reservationId:current.id};
}

test('Ressourcenplanung zeigt die Ausgabemenge bei Freigabe und Rückgabe',async({page})=>{
  const example=await setupReservations(page);
  const openPlan=async()=>{
    await project(page,example.name);
    await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  };
  await openPlan();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
  const row=(resource:string)=>panel.getByRole('row').filter({hasText:resource});
  const quantity=(resource:string)=>row(resource).locator('td[data-label="Noch ausgegeben"]');
  const device='Musterkoffer '+example.suffix;
  const spare='Musterprüfgerät '+example.suffix;
  await expect(panel.getByRole('columnheader',{name:'Noch ausgegeben',exact:true})).toHaveAttribute('data-numeric','true');
  await expect(quantity(device)).toHaveText('3');
  await expect(row(device)).toContainText('Fest reserviert');
  await expect(quantity(spare)).toHaveText('0');
  await expect(row(spare)).toContainText('INV-'+example.suffix);
  await expect(quantity('Musterband '+example.suffix)).toHaveText('–');
  await expect(quantity('Mira Muster')).toHaveText('–');

  await row(device).getByRole('button',{name:'Freigeben',exact:true}).click();
  await page.getByRole('dialog',{name:'Reservierung freigeben'}).getByRole('button',{name:'Reservierung freigeben'}).click();
  await expect(row(device)).toContainText('Freigegeben');
  await expect(quantity(device)).toHaveText('3');

  const verifyAfterReturn=async(returned:number,outstanding:string)=>{
    const nav=page.getByRole('navigation',{name:'Hauptnavigation'});
    await nav.getByRole('button',{name:'Projektlager',exact:true}).click();
    await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
    const booking=page.locator('form').filter({has:page.getByRole('button',{name:'Bewegung buchen',exact:true})});
    await booking.getByLabel('Bewegungsart').selectOption('return');
    await booking.getByLabel('Projektreservierung').selectOption(example.reservationId);
    await booking.getByLabel('Menge',{exact:true}).fill(String(returned));
    await booking.getByRole('button',{name:'Bewegung buchen',exact:true}).click();
    await expect(page.getByText('Lagerbewegung gebucht.',{exact:true})).toBeVisible();
    await openPlan();
    await panel.getByLabel('Ressourcentyp').selectOption('item');
    await panel.getByLabel('Status filtern').selectOption('released');
    await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
    await expect(quantity(device)).toHaveText(outstanding);
  };
  await verifyAfterReturn(1,'2');
  await verifyAfterReturn(2,'0');
});
