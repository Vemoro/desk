import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

async function openTarget(page:Page){
  await page.clock.setFixedTime(new Date('2028-05-17T11:00:00Z'));
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:'kontor',name:'Kontor Muster',email:'kontor@example.test'},
    {id:'kulturhaus',name:'Kulturhaus am Park',email:'kulturhaus@example.test'},
  ]}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'first',name:'Büroinstallation',stage:'planning',due:'2028-05-17',contact_id:'kontor',cost_center:'K-AB-230'},
    {id:'second',name:'Veranstaltungsbetreuung',stage:'complete',due:'2028-05-17',contact_id:'kulturhaus',cost_center:'K-AB-231'},
    {id:'third',name:'Gebäudewartung',stage:'planning',due:'2028-05-18',contact_id:'kontor',cost_center:'K-XY-230'},
    {id:'fourth',name:'Werkstatttermin',stage:'planning',due:'2028-05-17',contact_id:'kontor',offer_ref:'ANG-2028-04'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  return page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Projekte',exact:true})});
}

test('Projektliste findet Kostenstellen gemeinsam mit den vorhandenen Filtern',async({page})=>{
  const panel=await openTarget(page);
  const search=panel.getByRole('searchbox',{name:'Projekte suchen'});
  const status=panel.getByRole('combobox',{name:'Status',exact:true});
  const rows=panel.locator('tbody tr');
  const names=rows.getByRole('button');
  await search.fill('  aB-23  ');
  await expect(names).toHaveText(['Büroinstallation','Veranstaltungsbetreuung']);
  await expect(search).toHaveAttribute('placeholder',/Kostenstelle/);
  await search.fill('k-AB-231');
  await expect(names).toHaveText(['Veranstaltungsbetreuung']);
  await search.fill('  aB-23  ');
  await panel.getByRole('combobox',{name:'Kontakt',exact:true}).selectOption('kontor');
  await status.selectOption('open');
  await panel.getByRole('combobox',{name:'Fälligkeit',exact:true}).selectOption('today');
  await expect(names).toHaveText(['Büroinstallation']);
  await status.selectOption('complete');
  await expect(panel.getByText('Keine Projekte entsprechen den Filtern.')).toBeVisible();
  await status.selectOption('open');
  await search.fill('  anG-2028-04 ');
  await expect(names).toHaveText(['Werkstatttermin']);
});
