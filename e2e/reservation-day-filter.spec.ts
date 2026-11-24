import { expect, test, type Page } from '@playwright/test';
import { signIn, project } from './session';

const base={project_id:'muster',quantity:1,status:'firm',location_id:'lager',checked_out:0};
type Reservation=typeof base & {id:string;starts_at:string;ends_at:string;item_id?:string;user_id?:string};
async function planning(page:Page,reservations:Reservation[]){
  const resources={
    projects:[{id:'muster',name:'Musterinstallation',stage:'planning'}],
    reservations,
    items:[
      {id:'before',name:'Vorher beendet',kind:'equipment'},
      {id:'after',name:'Später begonnen',kind:'equipment'},
      {id:'overlap',name:'Mehrtägiger Einsatz',kind:'equipment'},
      {id:'released',name:'Freigegebenes Gerät',kind:'equipment'},
    ],
    locations:[{id:'lager',name:'Musterlager'}],
  };
  for(const [resource,json] of Object.entries(resources)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/users',route=>route.fulfill({json:[{id:'mira',name:'Mira Muster'}]}));
  await signIn(page);
  await project(page,'Musterinstallation');
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  return page.locator('section').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
}

test('Tagesfilter kombiniert sich mit Ressourcentyp und Status und behandelt beide Mitternachtsgrenzen korrekt',async({page})=>{
  const panel=await planning(page,[
    {...base,id:'before',item_id:'before',starts_at:'2027-02-09T21:00:00Z',ends_at:'2027-02-09T23:00:00Z'},
    {...base,id:'after',item_id:'after',starts_at:'2027-02-10T23:00:00Z',ends_at:'2027-02-11T01:00:00Z'},
    {...base,id:'long',item_id:'overlap',starts_at:'2027-02-09T22:00:00Z',ends_at:'2027-02-11T02:00:00Z'},
    {...base,id:'user',user_id:'mira',starts_at:'2027-02-10T07:00:00Z',ends_at:'2027-02-10T08:00:00Z'},
    {...base,id:'released',item_id:'released',status:'released',starts_at:'2027-02-10T10:00:00Z',ends_at:'2027-02-10T11:00:00Z'},
  ]);
  const day=panel.getByLabel('Am Datum');
  const status=panel.getByLabel('Status filtern');
  const resource=panel.getByLabel('Ressourcentyp');
  await expect(panel.getByText('5 Reservierungen',{exact:true})).toBeVisible();
  await expect(day).toHaveValue('');
  await day.fill('2027-02-10');
  const row=(name:string)=>panel.getByRole('row').filter({hasText:name});
  await expect(panel.getByText('3 Reservierungen',{exact:true})).toBeVisible();
  await expect(row('Mehrtägiger Einsatz')).toBeVisible();
  await expect(row('Vorher beendet')).toHaveCount(0);
  await expect(row('Später begonnen')).toHaveCount(0);
  await status.selectOption('firm');
  await resource.selectOption('item');
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  await expect(row('Mehrtägiger Einsatz')).toBeVisible();
  await expect(row('Mira Muster')).toHaveCount(0);
  await expect(row('Freigegebenes Gerät')).toHaveCount(0);
  await day.fill('2027-02-13');
  await expect(panel.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
  await panel.getByRole('button',{name:'Filter zurücksetzen'}).click();
  await expect(day).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(resource).toHaveValue('');
  await expect(panel.getByText('5 Reservierungen',{exact:true})).toBeVisible();
});

test('Der Sommerzeittag endet an lokaler Mitternacht nach 23 Stunden',async({page})=>{
  const panel=await planning(page,[
    {...base,id:'match',item_id:'overlap',starts_at:'2027-03-28T21:45:00Z',ends_at:'2027-03-28T21:59:00Z'},
    {...base,id:'next',item_id:'after',starts_at:'2027-03-28T22:01:00Z',ends_at:'2027-03-28T22:20:00Z'},
  ]);
  const day=panel.getByLabel('Am Datum');
  await day.fill('2027-03-28');
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  await expect(panel.getByRole('row').filter({hasText:'Mehrtägiger Einsatz'})).toBeVisible();
  await expect(panel.getByRole('row').filter({hasText:'Später begonnen'})).toHaveCount(0);
  await day.fill('2027-03-29');
  await expect(panel.getByRole('row').filter({hasText:'Später begonnen'})).toBeVisible();
});
