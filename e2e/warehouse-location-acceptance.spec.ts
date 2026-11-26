import { expect,test } from '@playwright/test';
import { signIn } from './session';

for(const viewport of [{width:1440,height:950},{width:375,height:812}]){
  test(`Geräteausgabe verändert nur den ausgewählten Lagerort bei ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport);
    await signIn(page);
    const origin=new URL(page.url()).origin;
    const suffix=crypto.randomUUID().slice(0,8);
    async function write(path:string,data:object,method='POST'){
      const response=await page.request.fetch('/api/v1/'+path,{method,data,headers:{Origin:origin}});
      expect(response.ok(),await response.text()).toBeTruthy();
      return response.json();
    }
    const contact=await write('contacts',{name:`Musterkontakt ${suffix}`});
    const project=await write('projects',{name:`Musterauftrag ${suffix}`,contact_id:contact.id,offer_ref:'ANG-MUSTER'});
    for(const stage of ['planning','offered','confirmed']){
      await write(`projects/${project.id}/stage`,{stage},'PATCH');
    }
    const item=await write('items',{name:`Musterkoffer ${suffix}`,code:`MK-${suffix}`,kind:'equipment'});
    const now=Date.now();
    async function reserve(name:string){
      const location=await write('locations',{name});
      await write('movements',{action:'receive',item_id:item.id,location_id:location.id,quantity:4});
      const booking=await write('reservations',{project_id:project.id,item_id:item.id,location_id:location.id,quantity:2,
        starts_at:new Date(now-60_000).toISOString(),ends_at:new Date(now+3_600_000).toISOString()});
      await write(`reservations/${booking.id}`,{status:'firm'},'PATCH');
      return {location,booking};
    }
    const east=await reserve(`Musterlager Ost ${suffix}`);
    const west=await reserve(`Musterlager West ${suffix}`);
    await page.goto('/#warehouse');
    await page.reload();
    const stock=page.locator('section').filter({has:page.getByRole('heading',{name:'Bestand je Lagerort',exact:true})});
    const history=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
    function physicalAt(location:string){
      return stock.getByRole('row').filter({hasText:item.name}).filter({hasText:location}).locator('[data-label="Physisch"]');
    }
    await expect(physicalAt(east.location.name)).toHaveText('4');
    await expect(physicalAt(west.location.name)).toHaveText('4');
    await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
    const choice=page.getByRole('combobox',{name:'Projektreservierung'});
    for(const entry of [east,west]){
      const option=choice.locator(`option[value="${entry.booking.id}"]`);
      await expect(option).toHaveText(new RegExp(`${project.name} · ${item.name} · ${entry.location.name} · .* bis .*`));
    }
    await page.getByRole('combobox',{name:'Bewegungsart',exact:true}).selectOption('issue');
    await choice.selectOption(west.booking.id);
    await expect(choice).toHaveAccessibleDescription(new RegExp(`${west.location.name} · .* bis .*`));
    const booked=page.waitForResponse(response=>response.request().method()==='POST' && new URL(response.url()).pathname==='/api/v1/movements');
    await page.getByRole('button',{name:'Bewegung buchen'}).click();
    const response=await booked;
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({location_id:west.location.id,reservation_id:west.booking.id,quantity:1});
    await expect(physicalAt(east.location.name)).toHaveText('4');
    await expect(physicalAt(west.location.name)).toHaveText('3');
    const issueCell=page.locator('[data-label="Bewegung"]').filter({hasText:/^Ausgabe$/});
    const movement=history.getByRole('row').filter({has:issueCell}).filter({hasText:item.name});
    await expect(movement).toHaveCount(1);
    const recordedLocation=movement.locator('[data-label="Lagerort"]');
    await expect(recordedLocation).toHaveText(west.location.name);
    if(viewport.width===375){
      expect(await recordedLocation.evaluate(cell=>getComputedStyle(cell,'::before').content)).toBe('"Lagerort"');
    }
  });
}
