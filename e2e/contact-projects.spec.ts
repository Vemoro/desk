import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Gleichnamige Kontakte zeigen ausschließlich ihre eigenen Projekte',async({page})=>{
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:'a',name:'Mira Muster',email:'montage@example.test'},
    {id:'b',name:'Mira Muster',email:'lager@example.test'},
    {id:'c',name:'Nora Beispiel',email:'nora@example.test'},
  ]}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'montage',contact_id:'a',name:'Musterinstallation',stage:'confirmed',due:'2028-04-15'},
    {id:'lager',contact_id:'b',name:'Musterlager',stage:'planning',due:'2028-04-23'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
  const listing=page.getByRole('region',{name:'Interessenten und Kontakte',exact:true});
  const projects=page.getByRole('region',{name:'Zugehörige Projekte',exact:true});
  await listing.getByRole('row').filter({hasText:'montage@example.test'}).getByRole('button',{name:'Mira Muster'}).click();
  await expect(projects.getByRole('row').nth(1).getByRole('cell')).toHaveText(['Musterinstallation','Bestätigt','15.04.2028']);
  await expect(projects.getByRole('row')).toHaveCount(2);

  await listing.getByRole('row').filter({hasText:'lager@example.test'}).getByRole('button',{name:'Mira Muster'}).click();
  await expect(projects.getByRole('row').nth(1).getByRole('cell')).toHaveText(['Musterlager','Planung','23.04.2028']);
  await expect(projects.getByRole('row')).toHaveCount(2);

  await listing.getByRole('button',{name:'Nora Beispiel'}).click();
  await expect(projects.getByText('Diesem Kontakt sind noch keine Projekte zugeordnet.')).toBeVisible();

  await listing.getByRole('row').filter({hasText:'montage@example.test'}).getByRole('button',{name:'Mira Muster'}).click();
  await projects.getByRole('button',{name:'Musterinstallation',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Musterinstallation',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/#projects\/montage$/);
});
