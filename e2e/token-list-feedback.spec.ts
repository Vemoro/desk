import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('API-Token-Liste unterscheidet Laden, Fehler und echte Leerantwort',async({page})=>{
  let requests=0;
  let writes=0;
  let response:'error'|'list'|'empty'='error';
  let release!:()=>void;
  const first=new Promise<void>((resolve)=>{release=resolve;});
  await page.route('**/api/v1/tokens',async(route)=>{
    if(route.request().method()!=='GET') writes++;
    requests++;
    if(response==='error'){
      await first;
      return route.fulfill({status:503,json:{error:'Testfehler'}});
    }
    return route.fulfill({json:response==='list'?[{id:'a',label:'Muster-Token',scope:'read'}]:[]});
  });
  await signIn(page);
  const nav=page.getByRole('navigation',{name:'Hauptnavigation'});
  const settings=nav.getByRole('button',{name:'Einstellungen',exact:true});
  await settings.click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'API-Zugriff',exact:true})});
  await expect(panel.getByRole('status')).toHaveText('API-Token werden geladen …');
  await expect(page.getByText('Konto anlegen',{exact:true})).toBeVisible();
  release();
  await expect(panel.getByRole('alert')).toHaveText('Die API-Token konnten nicht geladen werden.');
  await expect(panel.getByText('Keine API-Token erstellt.')).toHaveCount(0);
  const previousRequests=requests;
  response='list';
  await panel.getByRole('button',{name:'Erneut laden',exact:true}).click();
  await expect(panel.getByRole('cell',{name:'Muster-Token',exact:true})).toBeVisible();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(requests).toBeGreaterThan(previousRequests);
  response='empty';
  await nav.getByRole('button',{name:'Übersicht',exact:true}).click();
  await settings.click();
  await expect(panel.getByRole('status')).toHaveText('Keine API-Token erstellt.');

  expect(writes).toBe(0);
});
