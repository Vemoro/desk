import { expect, test, type Page } from '@playwright/test';
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
