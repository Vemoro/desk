import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Lagerbestand nach Artikelmerkmalen und Lagerort suchen',async({page})=>{
  await page.route('**/api/v1/locations?*',route=>route.fulfill({json:[
    {id:'ost',name:'Lager Ost'},{id:'west',name:'Lager West'},
  ]}));
  await page.route('**/api/v1/items?*',route=>route.fulfill({json:[
    {id:'a',name:'Montagekoffer',code:'ART-35',inventory_number:'INV-42'},
    {id:'b',name:'Klebeband',code:'ART-60',inventory_number:null},
  ]}));
  await page.route('**/api/v1/stock',route=>route.fulfill({json:[
    {item_id:'a',location_id:'ost',physical:7,reserved:2,free:5},
    {item_id:'a',location_id:'west',physical:8,reserved:5,free:3},
    {item_id:'b',location_id:'ost',physical:3,reserved:0,free:3},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const panel=page.getByRole('heading',{name:'Bestand je Lagerort',exact:true}).locator('xpath=../..');
  const search=panel.getByRole('searchbox',{name:'Bestand suchen'});
  const location=panel.getByRole('combobox',{name:'Lagerort filtern',exact:true});
  await expect(panel.getByRole('row')).toHaveCount(4);
  await location.selectOption({label:'Lager West'});
  for(const query of ['montage','rt-3','nv-4']){
    await search.fill(query);
    await expect(panel.getByRole('row')).toHaveCount(2);
    await expect(panel.getByRole('row').nth(1).getByRole('cell')).toHaveText(['Montagekoffer','Lager West','8','5','3']);
  }
  await search.fill('Klebeband');
  await expect(panel.getByText('Kein Bestand für diese Filter.',{exact:true})).toBeVisible();
  const open=page.getByRole('heading',{name:'Offene Ausgaben',exact:true}).locator('xpath=../..');
  await open.getByRole('combobox',{name:'Lagerort filtern',exact:true}).selectOption({label:'Lager Ost'});
  await panel.getByRole('button',{name:'Filter zurücksetzen',exact:true}).click();
  await expect(panel.getByRole('row')).toHaveCount(4);
  await expect(panel.getByRole('row').filter({hasText:'Lager Ost'}).filter({hasText:'Montagekoffer'}).getByRole('cell'))
    .toHaveText(['Montagekoffer','Lager Ost','7','2','5']);
  await expect(panel.getByRole('row').filter({hasText:'Lager West'}).getByRole('cell'))
    .toHaveText(['Montagekoffer','Lager West','8','5','3']);
  await expect(search).toHaveValue('');
  await expect(location).toHaveValue('');
  await expect(open.getByRole('combobox',{name:'Lagerort filtern',exact:true})).toHaveValue('ost');
});
