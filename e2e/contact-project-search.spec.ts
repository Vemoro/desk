import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Die Projektsuche bleibt auf den gewählten Kontakt und Status begrenzt',async({page})=>{
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:'first',name:'Mira Muster',email:'mira@example.test'},
    {id:'second',name:'Nora Beispiel',email:'nora@example.test'},
    {id:'empty',name:'Kulturhaus am Park',email:'kulturhaus@example.test'},
    {id:'foreign',name:'Kontor West',email:'buero@kontor.example.test'},
  ]}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'office',contact_id:'first',name:'Musterinstallation Büro',stage:'planning'},
    {id:'stage',contact_id:'first',name:'Musterinstallation Bühne',stage:'complete'},
    {id:'cancelled',contact_id:'first',name:'Musterabsage',stage:'cancelled'},
    {id:'foreign-project',contact_id:'foreign',name:'Musterinstallation Lager',stage:'planning'},
    {id:'maintenance',contact_id:'second',name:'Musterwartung',stage:'running'},
  ]}));

  await signIn(page);
  const contacts=page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true});
  const list=page.getByRole('region',{name:'Interessenten und Kontakte',exact:true});
  const detail=page.getByRole('region',{name:'Zugehörige Projekte',exact:true});
  const names=detail.locator('tbody').getByRole('button');
  const search=detail.getByRole('searchbox',{name:'Projektnamen suchen',exact:true});
  const status=detail.getByLabel('Projektstatus filtern',{exact:true});
  const mira=list.getByRole('button',{name:'Mira Muster',exact:true});

  await contacts.click();
  await mira.click();
  await expect(names).toHaveCount(3);
  await search.fill('  INSTALLATION  ');
  await expect(names).toHaveText(['Musterinstallation Büro','Musterinstallation Bühne']);
  await status.selectOption('open');
  await expect(names).toHaveText(['Musterinstallation Büro']);
  await search.fill('Bühne');
  await expect(detail.getByRole('status')).toHaveText('Keine Projekte für diese Suche.');
  await search.clear();
  await expect(status).toHaveValue('open');
  await expect(names).toHaveText(['Musterinstallation Büro']);

  await search.fill('Bühne');
  await detail.getByRole('button',{name:'Filter zurücksetzen',exact:true}).press('Enter');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(status).toHaveValue('all');
  await expect(names).toHaveCount(3);
  await search.fill('BÜRO');
  await detail.getByRole('button',{name:'Musterinstallation Büro',exact:true}).click();
  await expect(page).toHaveURL(/#projects\/office$/);

  await contacts.click();
  await mira.click();
  await search.fill('Büro');
  await status.selectOption('closed');
  await list.getByRole('button',{name:'Nora Beispiel',exact:true}).click();
  await expect(search).toHaveValue('');
  await expect(status).toHaveValue('all');
  await expect(names).toHaveText(['Musterwartung']);
  await list.getByRole('button',{name:'Kulturhaus am Park',exact:true}).click();
  await expect(search).toHaveCount(0);
  await expect(detail.getByText('Diesem Kontakt sind noch keine Projekte zugeordnet.')).toBeVisible();
});
