import { test, expect } from '@playwright/test';
import { signIn } from './session';

for(const topic of ['Veranstaltungsbetreuung','Büroinstallation']) {
  test(`${topic} vom Kontakt bis zum Projektabschluss`,async({page})=>{
    await signIn(page);
    const suffix=Date.now().toString().slice(-7);
    const project=`${topic} ${suffix}`;
    await page.getByRole('button',{name:'Kontakte',exact:true}).click();
    await page.getByText('Kontakt anlegen',{exact:true}).click();
    await page.getByLabel('Name',{exact:true}).fill(`Musterkunde ${suffix}`);
    await page.getByRole('button',{name:'Kontakt speichern'}).click();
    await expect(page.getByRole('status').getByText('Kontakt angelegt.')).toBeVisible();
    await page.getByRole('button',{name:'Projekte',exact:true}).first().click();
    await page.getByText('Projekt anlegen',{exact:true}).click();
    await page.getByLabel('Projektname').fill(project);
    await page.getByLabel('Interessent').selectOption({label:`Musterkunde ${suffix}`});
    await page.getByRole('button',{name:'Projekt speichern'}).click();
    await expect(page.getByRole('heading',{name:project})).toBeVisible();
    await page.waitForURL(/#projects\/[a-f0-9-]+$/);
    const projectId=page.url().split('/').at(-1)!;
    const origin=new URL(page.url()).origin;
    async function post(path:string,input:unknown) {
      const response=await page.request.post('/api/v1/'+path,{
        data:input,headers:{Origin:origin},
      });
      expect(response.ok(),await response.text()).toBeTruthy();
      return response.json();
    }
    await page.getByRole('button',{name:'Planung',exact:true}).click();
    await expect(page.getByRole('status').getByText('Projektstatus: Planung.')).toBeVisible();
    await page.getByRole('link',{name:'Kanban',exact:true}).click();
    await page.getByText('Aufgabe anlegen',{exact:true}).click();
    await page.getByLabel('Aufgabe',{exact:true}).fill('Material disponieren');
    await page.getByRole('combobox',{name:'Verantwortlich',exact:true}).selectOption({label:'Mira Muster'});
    await page.getByRole('button',{name:'Aufgabe speichern'}).click();
    await page.getByRole('combobox',{name:'Status für Material disponieren'}).selectOption('done');
    await expect(page.getByRole('combobox',{name:'Status für Material disponieren'})).toHaveValue('done');
    await page.getByRole('link',{name:'Überblick',exact:true}).click();
    await page.getByLabel('Angebotsreferenz').fill(`A-${suffix}`);
    await page.getByLabel('Rechnungsreferenz').fill(`RE-${suffix}`);
    await page.getByRole('button',{name:'Referenzen speichern'}).click();
    await expect(page.getByRole('status').getByText('Referenzen gespeichert.')).toBeVisible();
    for(const stage of ['Angebot','Bestätigt','In Durchführung']) {
      await page.getByRole('button',{name:stage,exact:true}).click();
      await expect(page.getByRole('status').getByText(`Projektstatus: ${stage}.`)).toBeVisible();
    }
    const location = await post('locations',{name:'Musterlager '+suffix});
    const tool = await post('items',{name:'Musterkoffer '+suffix,kind:'equipment',code:'MK-'+suffix,inventory_number:'INV-'+suffix});
    const supply = await post('items',{name:'Musterband '+suffix,kind:'consumable',code:'MB-'+suffix});
    const ends = new Date(Date.now()+3600000).toISOString();
    const starts = new Date(Date.now()-600000).toISOString();
    for(const [item,count,action] of [[tool,1,'issue'],[supply,4,'consume']] as const) {
      await post('movements',{action:'receive',item_id:item.id,location_id:location.id,quantity:count});
      const booking=await post('reservations',{project_id:projectId,item_id:item.id,location_id:location.id,
        quantity:count,starts_at:starts,ends_at:ends});
      const updated=await page.request.patch('/api/v1/reservations/'+booking.id,{data:{status:'firm'},headers:{Origin:origin}});
      expect(updated.ok(),await updated.text()).toBeTruthy();
      await post('movements',{action,reservation_id:booking.id,quantity:1});
      if(action==='issue')await post('movements',{action:'return',reservation_id:booking.id,quantity:1});
    }
    await post('lines',{project_id:projectId,kind:'buy',name:'Geplantes Material',quantity:2,unit_cents:500});
    await post('costs',{entries:[{project_id:projectId,source:'E2E',reference:'BEL-'+suffix,name:'Musterbeleg',cents:800}]});
    await page.reload();
    await expect(page.getByRole('heading',{name:project})).toBeVisible();
    await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
    const planRow=page.getByRole('row').filter({hasText:'Geplantes Material'});
    await planRow.getByText('Position bearbeiten',{exact:true}).click();
    await planRow.getByRole('spinbutton',{name:'Menge',exact:true}).fill('3');
    await planRow.getByRole('button',{name:'Position aktualisieren'}).click();
    await expect(page.getByRole('status').getByText('Position aktualisiert.')).toBeVisible();
    await expect(planRow.getByText('15,00')).toBeVisible();
    await page.getByRole('link',{name:'Controlling',exact:true}).click();
    await expect(page.getByText('Musterbeleg',{exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Überblick',exact:true}).click();
    await page.getByRole('button',{name:'Abgerechnet',exact:true}).click();
    await expect(page.getByRole('status').getByText('Projektstatus: Abgerechnet.')).toBeVisible();
    await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Externer Vorgang'})).toBeVisible();
  });
}
