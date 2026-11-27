import { test, expect } from '@playwright/test';
import { holdRoute, signIn } from './session';

test('Eine ausstehende Kontosperre aktualisiert die neu geöffnete Tokenliste',async({page})=>{
  const held=holdRoute();
  let blocked=false;
  await page.route('**/api/v1/users/*/access',held.resolve);
  await page.route('**/api/v1/tokens',route=>route.fulfill({
    json:blocked?[]:[{id:'noah-token',label:'Token des Musterkontos',scope:'read'}],
  }));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Einstellungen',exact:true}).click();
  await page.getByRole('link',{name:/^API-Zugriff /}).click();
  const row=page.getByRole('row').filter({hasText:'Token des Musterkontos'});
  await expect(row).toBeVisible();
  await page.getByRole('link',{name:/^Team /}).click();
  await page.getByRole('row').filter({hasText:'Noah'}).getByRole('button',{name:'Konto sperren'}).click();
  await page.getByRole('dialog',{name:'Konto sperren'}).getByRole('button',{name:'Konto sperren'}).click();
  const request=await held.request;
  expect(request.request().postDataJSON()).toEqual({blocked:true});
  await page.goBack();
  await expect(row).toBeVisible();
  blocked=true;
  await request.fulfill({json:{blocked:true}});
  await expect(page.getByText('Konto gesperrt.',{exact:true})).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('API-Token-Liste unterscheidet Laden, Fehler und echte Leerantwort',async({page})=>{
  let requests=0;
  let writes=0;
  let signedIn=false;
  let response:'error'|'list'|'empty'='error';
  let release!:()=>void;
  const first=new Promise<void>((resolve)=>{release=resolve;});
  page.on('request',(request)=>{
    const path=new URL(request.url()).pathname;
    if(signedIn && request.method()!=='GET' && path.startsWith('/api/v1/')) writes++;
  });
  await page.route('**/api/v1/tokens',async(route)=>{
    requests++;
    if(response==='error'){
      await first;
      return route.fulfill({status:503,json:{error:'Testfehler'}});
    }
    return route.fulfill({json:response==='list'?[{id:'a',label:'Muster-Token',scope:'read'}]:[]});
  });
  await signIn(page);
  signedIn=true;
  const nav=page.getByRole('navigation',{name:'Hauptnavigation'});
  const settings=nav.getByRole('button',{name:'Einstellungen',exact:true});
  const api=page.getByRole('link',{name:/^API-Zugriff /});
  await settings.click();
  await api.click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'API-Zugriff',exact:true})});
  await expect(panel.getByRole('status')).toHaveText('API-Token werden geladen …');
  await expect(page.getByText('Konto anlegen',{exact:true})).toHaveCount(0);
  release();
  await expect(panel.getByRole('alert')).toHaveText('Die API-Token konnten nicht geladen werden.');
  await expect(panel.getByText('Keine API-Token erstellt.')).toHaveCount(0);
  const retry=panel.getByRole('button',{name:'Erneut laden',exact:true});
  await retry.focus();
  const failedRetry=page.waitForResponse(result=>new URL(result.url()).pathname==='/api/v1/tokens');
  await retry.press('Enter');
  expect((await failedRetry).status()).toBe(503);
  await expect(retry).toBeFocused();
  const previousRequests=requests;
  response='list';
  await retry.press('Enter');
  await expect(panel.getByRole('cell',{name:'Muster-Token',exact:true})).toBeVisible();
  await expect(panel).toBeFocused();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(requests).toBeGreaterThan(previousRequests);
  response='empty';
  await nav.getByRole('button',{name:'Übersicht',exact:true}).click();
  await settings.click();
  await api.click();
  await expect(panel.getByRole('status')).toHaveText('Keine API-Token erstellt.');

  expect(writes).toBe(0);
});

test('Ein erzeugter API-Token bleibt nach einem Bereichswechsel kopierbar',async({page})=>{
  const post=holdRoute();
  const token={id:'muster',label:'Muster-Token',scope:'read'};
  let created=false;
  await page.route('**/api/v1/tokens',route=>{
    if(route.request().method()==='POST') {
      post.resolve(route);
      return;
    }
    return route.fulfill({json:created?[token]:[]});
  });
  await signIn(page);
  await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Einstellungsbereiche'});
  const api=nav.getByRole('link',{name:/^API-Zugriff /});
  const team=nav.getByRole('link',{name:/^Team /});
  await api.click();
  await page.getByText('API-Token erzeugen',{exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill(token.label);
  await page.getByLabel('Berechtigung',{exact:true}).selectOption(token.scope);
  await page.getByRole('button',{name:'Token erzeugen',exact:true}).click();
  const request=await post.request;
  await team.click();
  created=true;
  await request.fulfill({status:201,json:{...token,token:'desk_synthetischer_token'}});
  await expect(page.getByText('API-Token erzeugt.',{exact:true})).toBeVisible();
  const copy=page.getByLabel('Token jetzt kopieren');
  await expect(copy).toHaveCount(0);
  await api.click();
  await expect(copy).toHaveValue('desk_synthetischer_token');
  await expect(page.getByRole('cell',{name:token.label,exact:true})).toBeVisible();
});

test('Ein ausstehender Token-Widerruf aktualisiert die neu geöffnete Liste',async({page})=>{
  const deletion=holdRoute();
  const old={id:'alter-token',label:'Alter Muster-Token',scope:'read'};
  const next={id:'neuer-token',label:'Neuer Muster-Token',scope:'read'};
  let removed=false;
  let created=false;
  await page.route('**/api/v1/tokens',route=>{
    if(route.request().method()==='POST'){
      created=true;
      return route.fulfill({status:201,json:{...next,token:'desk_neuer_synthetischer_token'}});
    }
    return route.fulfill({json:[...(removed?[]:[old]),...(created?[next]:[])]});
  });
  await page.route('**/api/v1/tokens/alter-token',route=>deletion.resolve(route));
  await signIn(page);
  await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
  const api=page.getByRole('link',{name:/^API-Zugriff /});
  await api.click();
  const oldRow=page.getByRole('row').filter({hasText:old.label});
  await oldRow.getByRole('button',{name:'Widerrufen',exact:true}).click();
  await page.getByRole('dialog',{name:'API-Token widerrufen'})
    .getByRole('button',{name:'Token widerrufen',exact:true}).click();
  const request=await deletion.request;

  await page.goBack();
  await expect(page.getByRole('heading',{name:'Team',exact:true})).toBeVisible();
  await api.click();
  await expect(oldRow).toBeVisible();
  await page.getByText('API-Token erzeugen',{exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill(next.label);
  await page.getByLabel('Berechtigung',{exact:true}).selectOption(next.scope);
  await page.getByRole('button',{name:'Token erzeugen',exact:true}).click();
  const copy=page.getByLabel('Token jetzt kopieren');
  await expect(copy).toHaveValue('desk_neuer_synthetischer_token');

  removed=true;
  await request.fulfill({json:{id:old.id}});
  await expect(oldRow).toHaveCount(0);
  await expect(page.getByRole('row').filter({hasText:next.label})).toBeVisible();
  await expect(copy).toHaveValue('desk_neuer_synthetischer_token');
});
