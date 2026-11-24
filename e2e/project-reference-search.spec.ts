import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Projektsuche findet Angebots- und Rechnungsreferenzen zusammen mit den Filtern',async({page})=>{
  await page.clock.setFixedTime(new Date('2028-05-17T11:00:00Z'));
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:'musterkontakt',name:'Büro Musterkunde'},
  ]}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'installation',name:'Büroinstallation',stage:'planning',due:'2028-05-17',offer_ref:'ANG-2028-017',contact_id:'musterkontakt'},
    {id:'betreuung',name:'Veranstaltungsbetreuung',stage:'complete',due:'2028-05-17',invoice_ref:'RE-2028-036'},
    {id:'wartung',name:'Wartung',stage:'running',due:'2028-05-18',invoice_ref:null,offer_ref:''},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte'}).click();
  const search=page.getByRole('searchbox',{name:'Projekte suchen'});
  const installation=page.getByRole('button',{name:'Büroinstallation',exact:true});
  const event=page.getByRole('button',{name:'Veranstaltungsbetreuung',exact:true});
  await search.fill('  aNg-2028  ');
  await expect(installation).toBeVisible();
  await expect(event).toHaveCount(0);

  await search.fill(' re-2028 ');
  const status=page.getByRole('combobox',{name:'Status'});
  const due=page.getByRole('combobox',{name:'Fälligkeit'});
  await status.selectOption('complete');
  await due.selectOption('today');
  await expect(event).toBeVisible();
  await status.selectOption('open');
  await expect(page.getByText('Keine Projekte entsprechen den Filtern.')).toBeVisible();
  await status.selectOption('all');
  await due.selectOption('overdue');
  await expect(event).toHaveCount(0);
  await due.selectOption('all');

  await search.fill('kein-eintrag');
  await expect(page.getByText('Keine Projekte entsprechen den Filtern.')).toBeVisible();
  await search.fill('musterkunde');
  await expect(installation).toBeVisible();
  await installation.click();
  await expect(page.getByRole('heading',{name:'Büroinstallation',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/#projects\/installation$/);
});
