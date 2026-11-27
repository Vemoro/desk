import { expect, test } from '@playwright/test';
import { projectResponse } from '../src/server/contracts';
import { signIn } from './session';

test.use({timezoneId:'America/Los_Angeles'});

test('Überfällig zeigt offene Projekte mit Termin vor dem lokalen Kalendertag',async({page})=>{
  await page.clock.setFixedTime(new Date('2028-05-18T01:00:00Z'));
  const id=(number:number)=>`72000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
  const [kontor,kulturhaus]=[1,2].map(id);
  const entry=(number:number,name:string,stage:string,day:string|null,contact_id=kontor)=>({
    id:id(number),name,stage,contact_id,notes:'',due:day&&`2028-05-${day}T00:00:00.000Z`,
    offer_ref:'',invoice_ref:'',external_link:'',communication_note:'',haben_offer_id:null,
    haben_offer:null,cost_center:'',zammad_ticket_id:null,
  });
  const projects=projectResponse.array().parse([
    entry(3,'Montage Musterbüro','planning','16'),
    entry(4,'Veranstaltung am Park','running','15',kulturhaus),
    entry(5,'Montage abgerechnet','complete','16'),
    entry(6,'Montage abgesagt','cancelled','16'),
    entry(7,'Montage heute','confirmed','17'),
    entry(8,'Montage morgen','inquiry','18'),
    entry(9,'Montage ohne Termin','planning',null),
    entry(10,'Abrechnung heute','complete','17'),
  ]);
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:projects}));
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:kontor,name:'Musterbüro',email:'',phone:'',notes:''},
    {id:kulturhaus,name:'Kulturhaus am Park',email:'',phone:'',notes:''},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();

  const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Projekte',exact:true})});
  const rows=panel.getByRole('row').getByRole('button');
  const due=panel.getByRole('combobox',{name:'Fälligkeit',exact:true});
  const status=panel.getByRole('combobox',{name:'Status',exact:true});
  const contact=panel.getByRole('combobox',{name:'Kontakt',exact:true});
  const search=panel.getByRole('searchbox',{name:'Projekte suchen'});
  const empty=panel.getByText('Keine Projekte entsprechen den Filtern.');

  await due.selectOption('overdue');
  await expect(rows).toHaveText(['Montage Musterbüro','Veranstaltung am Park']);
  await contact.selectOption(kulturhaus);
  await search.fill('Montage');
  await expect(empty).toBeVisible();
  await contact.selectOption(kontor);
  await expect(rows).toHaveText(['Montage Musterbüro']);
  await search.clear();
  await contact.selectOption('');

  for(const [value,names] of [
    ['complete',['Montage abgerechnet','Abrechnung heute']],
    ['cancelled',['Montage abgesagt']],
  ] as const){
    await status.selectOption(value);
    await expect(empty).toBeVisible();
    await due.selectOption('all');
    await expect(rows).toHaveText([...names]);
    await due.selectOption('overdue');
  }

  await status.selectOption('all');
  await due.selectOption('today');
  await expect(rows).toHaveText(['Montage heute','Abrechnung heute']);
  await due.selectOption('missing');
  await expect(rows).toHaveText(['Montage ohne Termin']);
  await due.selectOption('all');
  await expect(rows).toHaveText(projects.map(project=>project.name));
});
