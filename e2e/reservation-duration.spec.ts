import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const projectName='Musterinstallation';
async function openTarget(page:Page){
  const slot={project_id:'muster',location_id:'lager',quantity:1,status:'firm',checked_out:0};
  const entities={
    projects:[{id:'muster',name:projectName,stage:'running'}],
    items:[
      {id:'kit',name:'Montagekoffer',kind:'equipment'},
      {id:'long',name:'Transportwagen',kind:'equipment'},
      {id:'timer',name:'Messgerät',kind:'equipment'},
    ],
    locations:[{id:'lager',name:'Musterlager'}],
    reservations:[
      {...slot,id:'r1',item_id:'kit',checked_out:1,starts_at:'2027-03-27T08:00:00Z',ends_at:'2027-03-27T09:30:00Z',duration_minutes:90},
      {...slot,id:'r2',item_id:'long',status:'released',starts_at:'2027-04-01T08:00:00Z',ends_at:'2027-04-02T09:00:00Z',duration_minutes:1500},
      {...slot,id:'r3',user_id:'mira',starts_at:'2027-03-28T01:30:00+01:00',ends_at:'2027-03-28T03:30:00+02:00',duration_minutes:60},
      {...slot,id:'r4',item_id:'timer',starts_at:'2027-03-27T09:00:00Z',ends_at:'2027-03-27T10:00:45Z',duration_minutes:60},
      {...slot,id:'r5',user_id:'nora',starts_at:'2027-03-27T08:00:00Z',ends_at:'2027-03-27T08:45:00Z',duration_minutes:45},
    ],
  };
  for(const [resource,json] of Object.entries(entities)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/users',route=>route.fulfill({json:[{id:'mira',name:'Mira Muster'},{id:'nora',name:'Nora Beispiel'}]}));
  await signIn(page);
  await project(page,projectName);
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  return page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
}

const durations=[
  ['Montagekoffer','1 Stunde 30 Minuten'],
  ['Transportwagen','25 Stunden'],
  ['Mira Muster','1 Stunde'],
  ['Messgerät','1 Stunde'],
  ['Nora Beispiel','45 Minuten'],
] as const;
for(const timezoneId of ['Europe/Berlin','UTC']){
  test.describe(timezoneId,()=>{
    test.use({timezoneId});
    test('Reservierungen zeigen die verstrichene Dauer je Zeile',async({page})=>{
      const panel=await openTarget(page);
      const rows=panel.locator('tbody tr');
      for(const [name,value] of durations){
        await expect(rows.filter({hasText:name}).getByText(value,{exact:true})).toBeVisible();
      }
      if(timezoneId==='Europe/Berlin'){
        const type=panel.getByLabel('Ressourcentyp');
        const status=panel.getByLabel('Status filtern');
        const date=panel.getByLabel('Am Datum');
        await type.selectOption('user');
        await expect(rows).toHaveCount(2);
        await expect(rows.filter({hasText:'Mira Muster'}).getByText('1 Stunde',{exact:true})).toBeVisible();
        await type.selectOption('item');
        await status.selectOption('released');
        await expect(rows).toHaveCount(1);
        await expect(rows.first().getByText('25 Stunden',{exact:true})).toBeVisible();
        await status.selectOption('');
        await date.fill('2027-03-27');
        await expect(rows).toHaveCount(2);
        await panel.getByRole('checkbox',{name:'Nur offene Geräteausgaben'}).check();
        await expect(rows).toHaveCount(1);
        await expect(rows.first().getByText('1 Stunde 30 Minuten',{exact:true})).toBeVisible();
        await panel.getByRole('button',{name:'Filter zurücksetzen'}).click();
        await expect(rows).toHaveCount(5);
      }
    });
  });
}

test('Zeigt gespeicherte Dauer mit Mikrosekunden und über die Zeitumstellung',async({page})=>{
  await signIn(page);
  const name='Muster Dauer '+crypto.randomUUID().slice(0,8);
  const origin=new URL(page.url()).origin;
  async function post(path:string,data:object):Promise<{id:string}> {
    const response=await page.request.post('/api/v1/'+path,{headers:{Origin:origin},data});
    expect(response.ok(),'POST '+path+': '+await response.text()).toBeTruthy();
    return response.json();
  }
  const contact=await post('contacts',{name});
  const created=await post('projects',{name,contact_id:contact.id});
  const person=await (await page.request.get('/api/v1/me')).json();
  const resource={project_id:created.id,user_id:person.id,quantity:1};
  const short=await post('reservations',{...resource,starts_at:'2027-02-10T08:00:00.000500Z',ends_at:'2027-02-10T08:01:00.000000Z'});
  const daylight=await post('reservations',{...resource,starts_at:'2027-03-28T01:30:00+01:00',ends_at:'2027-03-28T03:30:00+02:00'});
  await page.reload();
  await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
  await project(page,name);
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
  await expect(panel.locator('tbody tr')).toHaveCount(2);
  await expect(panel.getByText('0 Minuten',{exact:true})).toBeVisible();
  await expect(panel.getByText('1 Stunde',{exact:true})).toBeVisible();
  const response=await page.request.get('/api/v1/reservations?limit=200');
  expect(response.ok()).toBeTruthy();
  const rows=await response.json();
  expect(rows.find((row:{id:string})=>row.id===short.id)?.duration_minutes).toBe(0);
  expect(rows.find((row:{id:string})=>row.id===daylight.id)?.duration_minutes).toBe(60);
});
