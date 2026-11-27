import { expect, test } from '@playwright/test';
import { projectResponse } from '../src/server/contracts';
import { signIn } from './session';

test.use({timezoneId:'Europe/Berlin'});

test('Projekttermine sortieren vorhandene Treffer und behalten die Auswahl bei der Rückkehr',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.clock.setFixedTime(new Date('2028-05-17T11:00:00Z'));
  const id=(number:number)=>`71000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
  const [primary,secondary]=[1,2].map(id);
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:primary,name:'Kontor Muster',email:'',phone:'',notes:''},
    {id:secondary,name:'Kulturhaus am Park',email:'',phone:'',notes:''},
  ]}));
  const project=(number:number,name:string,day:string|null,contact_id=primary,stage='planning')=>({
    id:id(number),name,stage,contact_id,due:day&&`2028-${day}T00:00:00.000Z`,notes:'',
    offer_ref:'',invoice_ref:'',external_link:'',communication_note:'',haben_offer_id:null,
    haben_offer:null,cost_center:'',zammad_ticket_id:null,
  });
  const data=projectResponse.array().parse([
    project(3,'Montage Herbst','09-01'),project(4,'Montage offen',null),
    project(5,'Montage Lager','05-17'),project(6,'Montage Büro','05-17'),
    project(7,'Montage Bühne','05-17',secondary),project(8,'Montage Abschluss','05-17',primary,'complete'),
    project(9,'Brandschutz prüfen','05-17'),project(10,'Montage Archiv',null),
    project(11,'Montage Frühtermin','05-16'),
  ]);
  let loads=0;
  await page.route('**/api/v1/projects?*',route=>{
    loads++;
    return route.fulfill({json:data});
  });
  await signIn(page);
  await page.getByRole('button',{name:'Menü',exact:true}).click();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  const target=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Projekte',exact:true})});
  const sort=target.getByRole('combobox',{name:'Projekte sortieren',exact:true});
  const projects=target.getByRole('row').getByRole('button');
  const original=data.map(row=>row.name);
  const chronological=['Montage Frühtermin','Montage Lager','Montage Büro','Montage Bühne','Montage Abschluss',
    'Brandschutz prüfen','Montage Herbst','Montage offen','Montage Archiv'];
  await expect(sort).toHaveValue('standard');
  await expect(projects).toHaveText(original);
  const initialLoads=loads;
  await sort.press('End');
  await expect(sort).toHaveValue('due');
  await expect(projects).toHaveText(chronological);
  await target.getByRole('combobox',{name:'Kontakt',exact:true}).selectOption(primary);
  await target.getByRole('combobox',{name:'Status',exact:true}).selectOption('open');
  await target.getByRole('combobox',{name:'Fälligkeit',exact:true}).selectOption('today');
  const search=target.getByRole('searchbox',{name:'Projekte suchen'});
  await search.fill('Montage');
  await expect(projects).toHaveText(['Montage Lager','Montage Büro']);
  await projects.first().press('Enter');
  await expect(page.getByRole('heading',{name:'Montage Lager',exact:true})).toBeVisible();
  await page.locator('.breadcrumb').getByRole('button',{name:'Projekte',exact:true}).click();
  await expect(sort).toHaveValue('due');
  await expect(projects).toHaveText(['Montage Lager','Montage Büro']);
  const reset=target.getByRole('button',{name:'Filter zurücksetzen',exact:true});
  await reset.press('Enter');
  await expect(search).toBeFocused();
  await expect(sort).toHaveValue('due');
  await expect(projects).toHaveText(chronological);
  await expect(reset).toBeDisabled();
  await sort.press('Home');
  await expect(sort).toHaveValue('standard');
  await expect(projects).toHaveText(original);
  expect(loads).toBe(initialLoads);
});
