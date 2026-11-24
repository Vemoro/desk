import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

const contactName='Mira Muster';
const nextName='Nora Beispiel';
async function openTarget(page:Page){
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:'first',name:contactName,email:'mira@example.test'},
    {id:'other',name:nextName,email:'nora@example.test'},
    {id:'empty',name:'Kulturhaus am Park',email:'kulturhaus@example.test'},
  ]}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'open',contact_id:'first',name:'Musterinstallation Büro',stage:'planning'},
    {id:'closed',contact_id:'first',name:'Musterinstallation Bühne',stage:'complete'},
    {id:'cancelled',contact_id:'first',name:'Musterabsage',stage:'cancelled'},
    {id:'no-contact',name:'Musterinstallation Lager',stage:'planning'},
    {id:'other-project',contact_id:'other',name:'Musterwartung',stage:'running'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
  const list=page.getByRole('region',{name:'Interessenten und Kontakte',exact:true});
  await list.getByRole('button',{name:contactName,exact:true}).click();
  return page.getByRole('region',{name:'Zugehörige Projekte',exact:true});
}

test('Kontaktdetail sucht die eigenen Projekte zusammen mit dem Statusfilter',async({page})=>{
  const panel=await openTarget(page);
  const search=panel.getByRole('searchbox',{name:'Projektnamen suchen'});
  const status=panel.getByLabel('Projektstatus filtern');
  const rows=panel.locator('tbody tr');
  await expect(search).toBeVisible();
  await expect(rows).toHaveCount(3);
  await search.fill('  INSTALLATION  ');
  await expect(rows).toHaveCount(2);
  await status.selectOption('open');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Musterinstallation Büro');
  await search.fill('Bühne');
  await expect(panel.getByText('Keine Projekte für diesen Filter.')).toBeVisible();
  await search.fill('');
  await expect(status).toHaveValue('open');
  await expect(rows).toHaveCount(1);
  await search.fill('Büro');
  await rows.first().getByRole('button',{name:'Musterinstallation Büro'}).click();
  await expect(page).toHaveURL(/#projects\/open$/);

  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
  const list=page.getByRole('region',{name:'Interessenten und Kontakte',exact:true});
  await list.getByRole('button',{name:contactName,exact:true}).click();
  await search.fill('Büro');
  await list.getByRole('button',{name:nextName,exact:true}).click();
  await expect(search).toHaveValue('');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Musterwartung');
  await list.getByRole('button',{name:'Kulturhaus am Park',exact:true}).click();
  await expect(panel.getByText('Diesem Kontakt sind noch keine Projekte zugeordnet.')).toBeVisible();
});
