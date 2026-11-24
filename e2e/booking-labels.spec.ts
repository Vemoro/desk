import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Buchungsoptionen unterscheiden Lagerort und Zeitraum und behalten ihre Zuordnung',async({page})=>{
  const reservations=[
    {id:'11111111-1111-4111-8111-111111111111',location_id:'ost',starts_at:'2028-04-15T06:00:00Z',ends_at:'2028-04-15T08:00:00Z',status:'firm',checked_out:0},
    {id:'22222222-2222-4222-8222-222222222222',location_id:'west',starts_at:'2028-04-15T06:00:00Z',ends_at:'2028-04-15T08:00:00Z',status:'released',checked_out:1},
    {id:'33333333-3333-4333-8333-333333333333',location_id:'ost',starts_at:'2028-04-15T10:00:00Z',ends_at:'2028-04-15T12:00:00Z',status:'firm',checked_out:0},
    {id:'44444444-4444-4444-8444-444444444444',location_id:'ost',starts_at:'2028-04-16T06:00:00Z',ends_at:'2028-04-16T08:00:00Z',status:'released',checked_out:0},
  ];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[{id:'projekt',name:'Musterauftrag'}]}));
  await page.route('**/api/v1/items?*',route=>route.fulfill({json:[{id:'koffer',name:'Musterkoffer'}]}));
  await page.route('**/api/v1/locations?*',route=>route.fulfill({json:[
    {id:'ost',name:'Lager Ost'}, {id:'west',name:'Lager West'},
  ]}));
  await page.route('**/api/v1/reservations?*',route=>route.fulfill({json:reservations.map(row=>({...row,project_id:'projekt',item_id:'koffer'}))}));
  await page.route('**/api/v1/movements',route=>route.fulfill({status:201,json:{id:'movement'}}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
  const choice=page.locator('select[name="reservation_id"]');
  await expect(choice.locator('option')).toHaveText([
    'Auswählen',
    'Musterauftrag · Musterkoffer · Lager Ost · 15.04.2028, 08:00 bis 15.04.2028, 10:00',
    'Musterauftrag · Musterkoffer · Lager West · 15.04.2028, 08:00 bis 15.04.2028, 10:00',
    'Musterauftrag · Musterkoffer · Lager Ost · 15.04.2028, 12:00 bis 15.04.2028, 14:00',
  ]);
  await page.locator('select[name="action"]').selectOption('return');
  await choice.selectOption({label:'Musterauftrag · Musterkoffer · Lager West · 15.04.2028, 08:00 bis 15.04.2028, 10:00'});
  const request=page.waitForRequest(req=>req.method()==='POST' && new URL(req.url()).pathname==='/api/v1/movements');
  await page.getByRole('button',{name:'Bewegung buchen',exact:true}).click();
  expect((await request).postDataJSON()).toMatchObject({reservation_id:reservations[1].id,action:'return'});
  await expect(page.getByRole('status').getByText('Lagerbewegung gebucht.')).toBeVisible();
});
