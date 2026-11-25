import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Kontaktsuche berücksichtigt formatierte Telefonnummern, Namen und E-Mail',async({page})=>{
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:'mira',name:'Mira Muster',email:'montage@example.test',phone:'+49 (30) 123-4567'},
    {id:'noah',name:'Noah Beispiel',email:'lager@example.test',phone:''},
    {id:'eve',name:'Eve Werk',email:'service@example.test',phone:'089 77012'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
  const search=page.getByRole('searchbox',{name:'Kontakte suchen'});
  const table=page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(4);
  for(const query of ['30 123-4','301234','+49 (30) 123-4567','MIRA','montage@example']){
    await search.fill(query);
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table.getByText('+49 (30) 123-4567',{exact:true})).toBeVisible();
  }
  for(const query of ['999','+ () -','Mira 301234']){
    await search.fill(query);
    await expect(page.getByText('Noch keine Einträge.',{exact:true})).toBeVisible();
  }
  await search.clear();
  await expect(table.getByRole('row')).toHaveCount(4);
});
