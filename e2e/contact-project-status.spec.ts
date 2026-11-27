import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Kontaktdetail trennt offene und beendete Aufträge und setzt den Filter beim Kontaktwechsel zurück',async({page})=>{
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:'first',name:'Mira Muster',email:'mira@example.test'}, {id:'second',name:'Nora Beispiel',email:'nora@example.test'},
  ]}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'open',contact_id:'first',name:'Musterinstallation',stage:'planning'},
    {id:'billed',contact_id:'first',name:'Musterinstallation',stage:'complete'},
    {id:'cancelled',contact_id:'first',name:'Musterabsage',stage:'cancelled'},
    {id:'next',contact_id:'second',name:'Musterwartung',stage:'running'},
  ]}));
  await signIn(page);
  const nav=page.getByRole('navigation',{name:'Hauptnavigation'});
  const contacts=nav.getByRole('button',{name:'Kontakte',exact:true});
  await contacts.click();
  const list=page.getByRole('region',{name:'Interessenten und Kontakte',exact:true});
  const detail=page.getByRole('region',{name:'Zugehörige Projekte',exact:true});
  const filter=detail.getByLabel('Projektstatus filtern');
  const rows=detail.locator('tbody tr');
  await list.getByRole('button',{name:'Mira Muster',exact:true}).click();
  await expect(filter).toHaveValue('all');
  await expect(rows).toHaveCount(3);
  await filter.selectOption({label:'Offen'});
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Planung');
  await filter.selectOption({label:'Beendet'});
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({has:page.getByText('Abgesagt',{exact:true})})).toContainText('Musterabsage');
  await expect(rows.filter({has:page.getByText('Planung',{exact:true})})).toHaveCount(0);
  await rows.filter({has:page.getByText('Abgerechnet',{exact:true})}).getByRole('button',{name:'Musterinstallation'}).click();
  await expect(page.getByRole('heading',{name:'Musterinstallation',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/#projects\/billed$/);

  await contacts.click();
  await list.getByRole('button',{name:'Mira Muster',exact:true}).click();
  await filter.selectOption({label:'Beendet'});
  await list.getByRole('searchbox',{name:'Kontakte suchen'}).fill('Nora');
  await expect(list.getByRole('button',{name:'Mira Muster',exact:true})).toHaveCount(0);
  await list.getByRole('button',{name:'Nora Beispiel',exact:true}).click();
  await expect(filter).toHaveValue('all');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Musterwartung');
  await filter.selectOption({label:'Beendet'});
  await expect(detail.getByText('Keine Projekte für diesen Filter.')).toBeVisible();
});
