import { test, expect, type Page, type Route } from '@playwright/test';
import { signIn } from './session';

function holdRoute(){
  let resolve!:(route:Route)=>void;
  const request=new Promise<Route>((done)=>{resolve=done;});
  return {request,resolve};
}
async function openExport(page:Page){
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  await page.getByRole('button',{name:'Musterinstallation',exact:true}).click();
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  return page.getByRole('button',{name:'Angebotspositionen exportieren',exact:true});
}
async function settleResponse(page:Page,route:Route,json:unknown,status=200){
  const response=page.waitForResponse((response)=>response.request()===route.request());
  await route.fulfill({status,json});
  await (await response).finished();
  await page.evaluate(()=>new Promise<void>((done)=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
}
const project={id:'projekt',name:'Musterinstallation',stage:'planning'};
const contact=(name:string)=>[{id:'kontakt',name,email:'montage@example.test'}];

test.beforeEach(async({page})=>{
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[project]}));
  await page.route('**/api/v1/projects/projekt/offer-positions',route=>route.fulfill({json:[]}));
});

test('ein älterer Abruf kann neuere Kontakte und Integrationsflags nicht überschreiben',async({page})=>{
  const olderContacts=holdRoute();
  const olderFlags=holdRoute();
  let contactsLoad=0;
  let flagsLoad=0;
  await page.route('**/api/v1/contacts?*',route=>{
    contactsLoad++;
    if(contactsLoad===2) return olderContacts.resolve(route);
    return route.fulfill({json:contact(contactsLoad===1?'Erster Kontakt':'Neuer Kontakt')});
  });
  await page.route('**/api/v1/integrations',route=>{
    flagsLoad++;
    if(flagsLoad===2) return olderFlags.resolve(route);
    return route.fulfill({json:{haben:flagsLoad>=3,zammad:false}});
  });
  await signIn(page);
  const exportButton=await openExport(page);
  await exportButton.click();
  const [oldContacts,oldFlags]=await Promise.all([olderContacts.request,olderFlags.request]);
  await exportButton.click();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
  await expect(page.getByRole('button',{name:'Neuer Kontakt',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Aus Haben importieren',exact:true})).toBeVisible();
  await settleResponse(page,oldFlags,{haben:false,zammad:false});
  await settleResponse(page,oldContacts,contact('Alter Kontakt'));
  await expect(page.getByRole('button',{name:'Neuer Kontakt',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Aus Haben importieren',exact:true})).toBeVisible();
});

for(const staleStatus of [200,401]){
  test(`Antwort ${staleStatus} der beendeten Sitzung verändert die Anmeldung nicht`,async({page})=>{
    const olderContacts=holdRoute();
    const secondOlderContacts=holdRoute();
    let calls=0;
    await page.route('**/api/v1/contacts?*',route=>{
      calls++;
      if(calls===2) return olderContacts.resolve(route);
      if(staleStatus===200 && calls===3) return secondOlderContacts.resolve(route);
      return route.fulfill({json:contact(calls===1?'Erster Kontakt':'Neuer Kontakt')});
    });
    await signIn(page);
    const exportButton=await openExport(page);
    await exportButton.click();
    const old=await olderContacts.request;
    let secondOld:Route|undefined;
    if(staleStatus===200){
      await exportButton.click();
      secondOld=await secondOlderContacts.request;
    }
    await page.getByRole('button',{name:'Abmelden',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
    if(staleStatus===200){
      await settleResponse(page,secondOld!,contact('Alter Kontakt'));
      await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    await page.getByLabel('E-Mail').fill('mira@example.test');
    await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD!);
    await page.getByRole('button',{name:'Anmelden',exact:true}).click();
    const nav=page.getByRole('navigation',{name:'Hauptnavigation'});
    await nav.getByRole('button',{name:'Kontakte',exact:true}).click();
    await expect(page.getByRole('button',{name:'Neuer Kontakt',exact:true})).toBeVisible();
    if(secondOld){
      await settleResponse(page,old,contact('Alter Kontakt nach Anmeldung'));
      await expect(page.getByRole('button',{name:'Neuer Kontakt',exact:true})).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    } else {
      await settleResponse(page,old,{error:'Alte Sitzung abgelaufen'},401);
      await expect(nav).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    await page.route('**/api/v1/contacts?*',route=>route.fulfill({status:401,json:{error:'Sitzung abgelaufen'}}));
    await (await openExport(page)).click();
    await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  });
}

test('ein verspäteter 401 hinterlässt vor der Neuanmeldung keine Meldung',async({page})=>{
  const pending=holdRoute();
  let calls=0;
  await page.route('**/api/v1/contacts?*',route=>{
    if(++calls===2) return pending.resolve(route);
    return route.fulfill({json:contact('Mira Muster')});
  });
  await signIn(page);
  await (await openExport(page)).click();
  const request=await pending.request;
  await page.getByRole('button',{name:'Abmelden',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  await settleResponse(page,request,{error:'Alte Sitzung abgelaufen'},401);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
