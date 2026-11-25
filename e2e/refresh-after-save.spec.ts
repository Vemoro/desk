import { expect, test, type Page, type Route } from '@playwright/test';
import { signIn } from './session';

async function createWithFailedRefresh(page:Page,status:401|503) {
  let writes=0;
  let failures=1;
  await page.route('**/api/v1/projects**',async(route)=>{
    const request=route.request();
    if(request.method()==='POST' && new URL(request.url()).pathname==='/api/v1/projects') {
      writes++;
      await route.fulfill({response:await route.fetch()});
      return;
    }
    if(request.method()==='GET' && writes>0 && failures>0) {
      failures--;
      await route.fulfill({status,json:{error:'Simulierter Abruffehler.'}});
      return;
    }
    await route.continue();
  });

  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  await page.getByText('Projekt anlegen',{exact:true}).click();
  const name='Muster Aktualisierung '+crypto.randomUUID().slice(0,8);
  await page.getByLabel('Projektname').fill(name);
  await page.getByLabel('Interessent').selectOption({label:'Kulturhaus am Park'});
  await page.getByRole('button',{name:'Projekt speichern'}).click();
  return {name,writes:()=>writes};
}

test('Gespeichertes Projekt wird nach einem reinen Abruf wieder sichtbar',async({page})=>{
  const result=await createWithFailedRefresh(page,503);
  const saved=page.getByText('Die Änderung wurde gespeichert. Die Ansicht konnte nicht aktualisiert werden.');
  await expect(saved).toBeVisible();
  await expect(page.getByText(result.name,{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Ansicht aktualisieren',exact:true}).click();
  await expect(page.getByRole('heading',{name:result.name,exact:true})).toBeVisible();
  await expect(saved).toHaveCount(0);
  expect(result.writes()).toBe(1);
});

test('Ein 401 nach dem Speichern öffnet die Anmeldung mit der Speichermeldung',async({page})=>{
  const result=await createWithFailedRefresh(page,401);
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  await expect(page.getByText('Die Änderung wurde gespeichert. Bitte erneut anmelden, um die Ansicht zu aktualisieren.')).toBeVisible();
  expect(result.writes()).toBe(1);
});


test('Ein älterer Abruf kann den Hinweis nach einer weiteren Speicherung nicht ausblenden',async({page})=>{
  let writes=0;
  let readsAfterFirstWrite=0;
  let failedAfterSecondWrite=false;
  let releaseOld:()=>void=()=>{};
  const oldGate=new Promise<void>(resolve=>{releaseOld=resolve;});
  let markOldReady:()=>void=()=>{};
  const oldReady=new Promise<void>(resolve=>{markOldReady=resolve;});

  await page.route('**/api/v1/projects**',async(route)=>{
    const request=route.request();
    if(request.method()==='POST' && new URL(request.url()).pathname==='/api/v1/projects') {
      const response=await route.fetch();
      if(response.ok()) writes++;
      await route.fulfill({response});
      return;
    }
    if(request.method()==='GET' && writes===1) {
      readsAfterFirstWrite++;
      if(readsAfterFirstWrite===1) {
        await route.fulfill({status:503,json:{error:'Erster Abruf fehlgeschlagen.'}});
        return;
      }
      const response=await route.fetch();
      markOldReady();
      await oldGate;
      await route.fulfill({response});
      return;
    }
    if(request.method()==='GET' && writes===2 && !failedAfterSecondWrite) {
      failedAfterSecondWrite=true;
      await route.fulfill({status:503,json:{error:'Zweiter Abruf fehlgeschlagen.'}});
      return;
    }
    await route.continue();
  });

  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  await page.getByText('Projekt anlegen',{exact:true}).click();
  const suffix=crypto.randomUUID().slice(0,8);
  const first='Muster Erster Abruf '+suffix;
  const second='Muster Weiterer Abruf '+suffix;
  const name=page.getByLabel('Projektname');
  const save=page.getByRole('button',{name:'Projekt speichern',exact:true});
  const retry=page.getByRole('button',{name:'Ansicht aktualisieren',exact:true});
  await name.fill(first);
  await page.getByLabel('Interessent').selectOption({label:'Kulturhaus am Park'});
  await save.click();
  await retry.click();

  try {
    await oldReady;
    await name.fill(second);
    await save.click();
    await expect.poll(()=>failedAfterSecondWrite).toBe(true);
    await expect(save).toBeEnabled();
  } finally {
    releaseOld();
  }
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page.getByRole('heading',{name:second,exact:true})).toBeVisible();
  expect(writes).toBe(2);
});

test('Ein fehlgeschlagener neuerer Export-Abruf hält die bestätigte Speicherung sichtbar',async({page})=>{
  let writes=0;
  let readsAfterWrite=0;
  let holdFirst!:(route:Route)=>void;
  const firstRead=new Promise<Route>(resolve=>{holdFirst=resolve;});
  await page.route('**/api/v1/contacts',async route=>{
    const response=await route.fetch();
    if(route.request().method()==='POST' && response.ok()) writes++;
    await route.fulfill({response});
  });
  await page.route('**/api/v1/stock',route=>{
    if(!writes) return route.continue();
    readsAfterWrite++;
    if(readsAfterWrite===1){holdFirst(route);return;}
    if(readsAfterWrite===2) return route.fulfill({status:503,json:{error:'Zweiter Abruf fehlgeschlagen'}});
    return route.continue();
  });
  await signIn(page);
  const nav=page.getByRole('navigation',{name:'Hauptnavigation'});
  await nav.getByRole('button',{name:'Kontakte',exact:true}).click();
  await page.getByText('Kontakt anlegen',{exact:true}).click();
  const name='Musterkontakt '+crypto.randomUUID().slice(0,8);
  await page.getByLabel('Name',{exact:true}).fill(name);
  await page.getByRole('button',{name:'Kontakt speichern',exact:true}).click();
  const first=await firstRead;
  try{
    await nav.getByRole('button',{name:'Projekte',exact:true}).click();
    await page.getByRole('button',{name:'Büroinstallation Westflügel',exact:true}).click();
    await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
    await page.getByRole('button',{name:'Angebotspositionen exportieren',exact:true}).click();
    await expect.poll(()=>readsAfterWrite).toBe(2);
    await first.fulfill({status:503,json:{error:'Erster Abruf fehlgeschlagen'}});
    const retry=page.getByRole('button',{name:'Ansicht aktualisieren',exact:true});
    await expect(page.getByText('Die Änderung wurde gespeichert. Die Ansicht konnte nicht aktualisiert werden.')).toBeVisible();
    await retry.click();
    await expect(retry).toHaveCount(0);
    await nav.getByRole('button',{name:'Kontakte',exact:true}).click();
    await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
    expect(writes).toBe(1);
  }finally{
    await first.abort().catch(()=>{});
  }
});
