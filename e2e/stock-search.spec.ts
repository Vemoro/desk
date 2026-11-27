import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Lagerbestand nach Artikelmerkmalen und Lagerort suchen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/v1/locations?*',route=>route.fulfill({json:[
    {id:'ost',name:'Lager Ost'},{id:'west',name:'Lager West'},
  ]}));
  await page.route('**/api/v1/items?*',route=>route.fulfill({json:[
    {id:'a',name:'Montagekoffer',code:'ART-35',inventory_number:null},
    {id:'b',name:'Klebeband',code:'ART-60',inventory_number:null},
    {id:'c',name:'Mustergerät',code:'ART-72',inventory_number:'INV-42'},
  ]}));
  await page.route('**/api/v1/stock',route=>route.fulfill({json:[
    {item_id:'a',location_id:'ost',physical:7,reserved:2,free:5},
    {item_id:'a',location_id:'west',physical:8,reserved:5,free:3},
    {item_id:'b',location_id:'ost',physical:3,reserved:0,free:3},
    {item_id:'c',location_id:'west',physical:1,reserved:0,free:1},
  ]}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'installation',name:'Büroinstallation Westflügel'},
    {id:'veranstaltung',name:'Veranstaltungsbetreuung im Kulturhaus'},
  ]}));
  await page.route('**/api/v1/reservations?*',route=>route.fulfill({json:[
    {id:'booking-ost',project_id:'installation',item_id:'a',location_id:'ost',status:'firm',checked_out:1,
      starts_at:'2028-05-17T08:00:00Z',ends_at:'2028-05-17T12:00:00Z'},
    {id:'booking-west',project_id:'veranstaltung',item_id:'a',location_id:'west',status:'firm',checked_out:2,
      starts_at:'2028-05-17T08:00:00Z',ends_at:'2028-05-17T12:00:00Z'},
  ]}));
  await signIn(page);
  await page.getByRole('button',{name:'Menü',exact:true}).click();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const panelFor=(title:string)=>page.locator('section.panel').filter({has:page.getByRole('heading',{name:title,exact:true})});
  const panel=panelFor('Bestand je Lagerort');
  const search=panel.getByRole('searchbox',{name:'Bestand suchen'});
  const location=panel.getByRole('combobox',{name:'Lagerort filtern',exact:true});
  const stockRows=panel.locator('tbody tr');
  const open=panelFor('Offene Ausgaben');
  const openRows=open.locator('tbody tr');
  const checkoutLocation=open.getByRole('combobox',{name:'Lagerort filtern',exact:true});
  const checkoutProject=open.getByRole('combobox',{name:'Projekt filtern',exact:true});
  const reset=panel.getByRole('button',{name:'Filter zurücksetzen',exact:true});
  const resetOpen=open.getByRole('button',{name:'Filter zurücksetzen',exact:true});

  await expect(stockRows).toHaveCount(4);
  await expect(reset).toBeDisabled();
  await expect(openRows).toHaveCount(2);
  await location.selectOption({label:'Lager West'});
  for(const query of ['  montAGe  ','rt-3']){
    await search.fill(query);
    await expect(stockRows).toHaveCount(1);
    await expect(stockRows.first().getByRole('cell')).toHaveText(['Montagekoffer','Lager West','8','5','3']);
  }
  await search.fill('nV-4');
  await expect(stockRows).toHaveCount(1);
  await expect(stockRows.first().getByRole('cell')).toHaveText(['Mustergerät (INV-42)','Lager West','1','0','1']);
  await expect(openRows).toHaveCount(2);
  await expect(checkoutLocation).toHaveValue('');

  await checkoutLocation.selectOption({label:'Lager Ost'});
  await checkoutProject.selectOption({label:'Büroinstallation Westflügel'});
  await expect(openRows).toHaveCount(1);
  await expect(openRows.first().getByRole('cell')).toHaveText(['Büroinstallation Westflügel','Montagekoffer','Lager Ost','1']);
  await expect(stockRows.first().getByRole('cell')).toHaveText(['Mustergerät (INV-42)','Lager West','1','0','1']);
  await search.fill('Klebeband');
  await expect(panel.getByRole('status')).toHaveText('Kein Bestand für diese Filter.');
  await expect(openRows).toHaveCount(1);
  await reset.click();
  await expect(stockRows).toHaveCount(4);
  await expect(stockRows.filter({hasText:'Lager Ost'}).filter({hasText:'Montagekoffer'}).getByRole('cell'))
    .toHaveText(['Montagekoffer','Lager Ost','7','2','5']);
  await expect(stockRows.filter({hasText:'Lager West'}).filter({hasText:'Montagekoffer'}).getByRole('cell'))
    .toHaveText(['Montagekoffer','Lager West','8','5','3']);
  await expect(search).toHaveValue('');
  await expect(location).toHaveValue('');
  await expect(reset).toBeDisabled();
  await expect(checkoutLocation).toHaveValue('ost');
  await expect(checkoutProject).toHaveValue('installation');
  await search.fill('Klebeband');
  await resetOpen.click();
  await expect(openRows).toHaveCount(2);
  await expect(search).toHaveValue('Klebeband');
  await expect(stockRows.first().getByRole('cell')).toHaveText(['Klebeband','Lager Ost','3','0','3']);
});
