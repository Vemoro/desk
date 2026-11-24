import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Lieferscheinreferenz der richtigen Buchung bleibt nach Neuladen mobil sichtbar',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await signIn(page);
  const suffix=crypto.randomUUID().slice(0,8);
  const itemName='Musterkabel '+suffix;
  const origin=new URL(page.url()).origin;
  const headers={Origin:origin};
  const itemResponse=await page.request.post('/api/v1/items',{headers,data:{name:itemName,code:suffix,kind:'consumable'}});
  const locationResponse=await page.request.post('/api/v1/locations',{headers,data:{name:'Musterlager '+suffix}});
  expect(itemResponse.status()).toBe(201);
  expect(locationResponse.status()).toBe(201);
  const item=await itemResponse.json();
  const location=await locationResponse.json();
  const old=await page.request.post('/api/v1/movements',{headers,data:{action:'receive',item_id:item.id,location_id:location.id,quantity:2}});
  expect(old.status()).toBe(201);

  await page.reload();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  await page.getByText('Wareneingang',{exact:true}).first().click();
  const form=page.locator('form').filter({has:page.getByRole('button',{name:'Wareneingang buchen',exact:true})});
  await form.getByRole('combobox',{name:'Artikel',exact:true}).selectOption(item.id);
  await form.getByRole('combobox',{name:'Lagerort',exact:true}).selectOption(location.id);
  await form.getByLabel('Menge',{exact:true}).fill('3');
  await form.getByLabel('Lieferscheinreferenz',{exact:true}).fill('  LS-2028-42  ');
  const saved=page.waitForResponse((response)=>response.url().endsWith('/api/v1/movements') && response.request().method()==='POST');
  await form.getByRole('button',{name:'Wareneingang buchen',exact:true}).click();
  expect((await saved).status()).toBe(201);
  await page.reload();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  const rows=panel.locator('tr').filter({hasText:itemName});
  await expect(rows).toHaveCount(2);
  const cell=(quantity:string)=>rows.filter({has:page.locator('[data-label="Menge"]').getByText(quantity,{exact:true})})
    .locator('[data-label="Lieferschein"]');
  await expect(cell('3')).toBeVisible();
  await expect(cell('3')).toHaveText('LS-2028-42');
  expect(await cell('3').evaluate((element)=>getComputedStyle(element,'::before').content)).toBe('"Lieferschein"');
  await expect(cell('2')).toBeVisible();
  await expect(cell('2')).toHaveText('–');
});
