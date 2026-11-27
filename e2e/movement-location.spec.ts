import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Lagerbewegungen zeigen den Ort der jeweiligen Buchung',async({page})=>{
  await page.route('**/api/v1/locations?*',route=>route.fulfill({json:[
    {id:'ost',name:'Lager Ost'}, {id:'west',name:'Lager West'},
  ]}));
  await page.route('**/api/v1/items?*',route=>route.fulfill({json:[{id:'koffer',name:'Musterkoffer'}]}));
  await page.route('**/api/v1/movements?*',route=>route.fulfill({json:[
    {id:'1',item_id:'koffer',location_id:'ost',action:'receive',quantity:4,project_id:null,created_at:'2028-04-15T09:00:00Z'},
    {id:'2',item_id:'koffer',location_id:'west',action:'return',quantity:2,created_at:'2028-04-16T09:00:00Z'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  await expect(section.getByRole('columnheader',{name:'Lagerort',exact:true})).toBeVisible();
  const received=section.getByRole('row').filter({hasText:'Wareneingang'});
  const returned=section.getByRole('row').filter({hasText:'Rückgabe'});
  await expect(received.getByRole('cell',{name:'Lager Ost',exact:true})).toBeVisible();
  await expect(returned.getByRole('cell',{name:'Lager West',exact:true})).toBeVisible();
  await page.setViewportSize({width:375,height:812});
  for(const [row,location] of [[received,'Lager Ost'],[returned,'Lager West']] as const) {
    const cell=row.locator('[data-label="Lagerort"]');
    await expect(cell).toBeVisible();
    await expect(cell).toHaveText(location);
    expect(await cell.evaluate((element)=>getComputedStyle(element,'::before').content)).toBe('"Lagerort"');
  }
});
