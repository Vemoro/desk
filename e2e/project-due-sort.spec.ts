import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

const panel=(page:Page,name:string)=>page.locator('.panel').filter({has:page.getByRole('heading',{name,exact:true})});

async function openTarget(page:Page){
  await page.clock.setFixedTime(new Date('2028-05-17T11:00:00Z'));
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:'a',name:'Kontor Muster'},{id:'b',name:'Kulturhaus am Park'},
  ]}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'late',name:'Montage Herbst',stage:'planning',contact_id:'a',due:'2028-09-01'},
    {id:'none',name:'Montage offen',stage:'planning',contact_id:'a',due:null},
    {id:'first',name:'Montage Büro',stage:'planning',contact_id:'a',due:'2028-05-17'},
    {id:'tie',name:'Montage Lager',stage:'planning',contact_id:'a',due:'2028-05-17'},
    {id:'other',name:'Montage Bühne',stage:'planning',contact_id:'b',due:'2028-05-16'},
    {id:'ended',name:'Montage Abschluss',stage:'complete',contact_id:'a',due:'2028-05-16'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  return panel(page,'Projekte');
}

test('Projekttermine sortieren vorhandene Treffer und behalten die Auswahl bei der Rückkehr',async({page})=>{
  const target=await openTarget(page);
  const sort=target.getByRole('combobox',{name:'Projekte sortieren'});
  const projects=target.locator('tbody tr td:first-child').getByRole('button');
  const original=['Montage Herbst','Montage offen','Montage Büro','Montage Lager','Montage Bühne','Montage Abschluss'];
  const chronological=['Montage Bühne','Montage Abschluss','Montage Büro','Montage Lager','Montage Herbst','Montage offen'];
  await expect(sort).toHaveValue('standard');
  await expect(projects).toHaveText(original);
  await sort.selectOption('due');
  await expect(projects).toHaveText(chronological);
  await target.getByRole('combobox',{name:'Kontakt',exact:true}).selectOption('a');
  await target.getByRole('combobox',{name:'Status',exact:true}).selectOption('open');
  await target.getByRole('combobox',{name:'Fälligkeit',exact:true}).selectOption('today');
  await target.getByRole('searchbox',{name:'Projekte suchen'}).fill('Montage');
  await expect(projects).toHaveText(['Montage Büro','Montage Lager']);
  await projects.first().click();
  await page.locator('.breadcrumb').getByRole('button',{name:'Projekte',exact:true}).click();
  await expect(sort).toHaveValue('due');
  await expect(projects).toHaveText(['Montage Büro','Montage Lager']);
  await target.getByRole('button',{name:'Filter zurücksetzen'}).click();
  await expect(sort).toHaveValue('due');
  await expect(projects).toHaveText(chronological);
  await expect(target.getByRole('button',{name:'Filter zurücksetzen'})).toBeDisabled();
  await sort.selectOption('standard');
  await expect(projects).toHaveText(original);
});
