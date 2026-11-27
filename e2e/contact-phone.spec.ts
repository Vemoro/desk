import { test, expect } from '@playwright/test';
import { signIn } from './session';

const contacts=[
  {id:'mira',name:'Mira Muster',email:'montage@example.test',phone:'+49 (30) 123-4567'},
  {id:'noah',name:'Noah Beispiel',email:'lager@example.test',phone:''},
  {id:'eve',name:'Eve Werk',email:'service@example.test',phone:'089 77012'},
];

test('Kontaktsuche berücksichtigt formatierte Telefonnummern, Namen und E-Mail',async({page})=>{
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:contacts}));
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
    await expect(page.getByText('Keine Kontakte entsprechen der Suche.',{exact:true})).toBeVisible();
  }
  await search.clear();
  await expect(table.getByRole('row')).toHaveCount(4);
});

for(const [device,width] of [['Desktop',1440],['Smartphone',390]] as const) {
  test(`${device}: Rand-Leerzeichen ändern die Treffer der Kontaktsuche nicht`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:contacts}));
    await signIn(page);
    if(width===390) await page.getByRole('button',{name:'Menü',exact:true}).click();
    await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
    const search=page.getByRole('searchbox',{name:'Kontakte suchen'});
    const match=page.getByRole('button',{name:'Mira Muster',exact:true});
    const rows=page.getByRole('table').getByRole('row');

    for(const query of ['  montage@example.test  ','  Mira Muster  ',' 30 123-4 ']) {
      await search.fill(query);
      await expect(search).toHaveValue(query);
      await expect(match).toBeVisible();
      await expect(rows).toHaveCount(2);
    }
    await search.fill('   ');
    await expect(rows).toHaveCount(4);
    for(const query of [' Mira  Muster ',' kein Treffer ']) {
      await search.fill(query);
      await expect(page.getByText('Keine Kontakte entsprechen der Suche.',{exact:true})).toBeVisible();
    }
  });
}
