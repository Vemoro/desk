import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Projektliste findet Kostenstellen gemeinsam mit den vorhandenen Filtern',async({page})=>{
  await page.clock.setFixedTime(new Date('2028-05-17T11:00:00Z'));
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:'kontor',name:'Kontor Muster',email:'kontor@example.test'},
    {id:'kulturhaus',name:'Kulturhaus am Park',email:'kulturhaus@example.test'},
  ]}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'first',name:'Büroinstallation',stage:'planning',due:'2028-05-17',contact_id:'kontor',cost_center:'K-AB-230'},
    {id:'second',name:'Veranstaltungsbetreuung',stage:'planning',due:'2028-05-17',contact_id:'kulturhaus',cost_center:'K-AB-231'},
    {id:'later',name:'Regalaufbau',stage:'planning',due:'2028-05-18',contact_id:'kontor',cost_center:'K-AB-232'},
    {id:'closed',name:'Büroumzug',stage:'complete',due:'2028-05-17',contact_id:'kontor',cost_center:'K-AB-233'},
    {id:'similar',name:'Gebäudewartung',stage:'planning',due:'2028-05-17',contact_id:'kontor',cost_center:'K-XY-230'},
    {id:'without',name:'Werkstatttermin',stage:'planning',due:'2028-05-17',contact_id:'kontor',cost_center:'',offer_ref:'ANG-2028-04'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();

  const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Projekte',exact:true})});
  const search=panel.getByRole('searchbox',{name:'Projekte suchen'});
  const names=panel.locator('tbody').getByRole('button');
  await search.fill('  aB-23  ');
  await expect(names).toHaveText(['Büroinstallation','Veranstaltungsbetreuung','Regalaufbau','Büroumzug']);
  await expect(search).toHaveAccessibleDescription('Name, Kontakt, Referenz oder Kostenstelle');

  await panel.getByRole('combobox',{name:'Kontakt',exact:true}).selectOption('kontor');
  await expect(names).toHaveText(['Büroinstallation','Regalaufbau','Büroumzug']);
  await panel.getByRole('combobox',{name:'Status',exact:true}).selectOption('open');
  await expect(names).toHaveText(['Büroinstallation','Regalaufbau']);
  await panel.getByRole('combobox',{name:'Fälligkeit',exact:true}).selectOption('today');
  await expect(names).toHaveText(['Büroinstallation']);

  await search.fill('  anG-2028-04 ');
  await expect(names).toHaveText(['Werkstatttermin']);
});
