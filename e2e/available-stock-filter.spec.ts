import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

async function openTarget(page:Page,allReserved=false){
  const fixtures={
    projects:[{id:'office',name:'Musterinstallation',stage:'running'}],
    items:[{id:'a',name:'Montagekoffer',code:'MK-01',kind:'equipment'},{id:'b',name:'Messgerät',code:'MG-01',kind:'equipment'}],
    locations:[{id:'ost',name:'Musterlager Ost'},{id:'west',name:'Musterlager West'}],
    reservations:[{id:'r1',item_id:'b',project_id:'office',location_id:'ost',status:'firm',checked_out:1}],
    movements:[{id:'m1',action:'issue',item_id:'b',project_id:'office',location_id:'ost',
      quantity:1,created_at:'2028-05-17T09:00:00Z'}],
  };
  for(const [resource,json] of Object.entries(fixtures)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/stock',route=>route.fulfill({json:[
    {item_id:'a',location_id:'ost',physical:5,reserved:allReserved?5:3,free:allReserved?0:2},
    {item_id:'a',location_id:'west',physical:4,reserved:4,free:0},
    {item_id:'b',location_id:'ost',physical:3,reserved:3,free:0},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  return page.locator('.panel').filter({has:page.getByRole('heading',{name:'Bestand je Lagerort',exact:true})});
}

test('Freier Bestand kombiniert sich mit Suche und Standort und wirkt nur in der Bestandstabelle',async({page})=>{
  const target=await openTarget(page);
  const available=target.getByRole('checkbox',{name:'Nur mit freiem Bestand'});
  const rows=target.locator('tbody tr');
  const search=target.getByRole('searchbox',{name:'Bestand suchen'});
  const location=target.getByLabel('Lagerort filtern');
  const reset=target.getByRole('button',{name:'Filter zurücksetzen'});
  await expect(rows).toHaveCount(3);
  await expect(available).not.toBeChecked();
  await available.check();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole('cell')).toHaveText(['Montagekoffer','Musterlager Ost','5','3','2']);
  await search.fill('Montagekoffer');
  await location.selectOption('ost');
  await expect(rows).toHaveCount(1);
  await location.selectOption('west');
  await expect(target.getByText('Kein Bestand für diese Filter.')).toBeVisible();

  for(const heading of ['Offene Ausgaben','Lagerbewegungen']){
    const panel=page.locator('.panel').filter({has:page.getByRole('heading',{name:heading,exact:true})});
    await expect(panel.locator('tbody tr')).toHaveCount(1);
    await expect(panel.locator('tbody tr').first()).toContainText('Messgerät');
  }
  await reset.click();
  await expect(available).not.toBeChecked();
  await expect(search).toHaveValue('');
  await expect(location).toHaveValue('');
  await expect(rows).toHaveCount(3);
});

test('Nur mit freiem Bestand zeigt bei vollständiger Reservierung einen Leerhinweis',async({page})=>{
  const target=await openTarget(page,true);
  const available=target.getByRole('checkbox',{name:'Nur mit freiem Bestand'});
  const reset=target.getByRole('button',{name:'Filter zurücksetzen'});
  const rows=target.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await available.check();
  await expect(target.getByText('Kein Bestand für diese Filter.')).toBeVisible();
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(available).not.toBeChecked();
  await expect(rows).toHaveCount(3);
});
