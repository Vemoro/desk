import { test, expect, type Page, type Route } from '@playwright/test';
import { holdRoute, settleResponse, signIn } from './session';
async function openExport(page:Page){
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  await page.getByRole('button',{name:'Musterinstallation',exact:true}).click();
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  return page.getByRole('button',{name:'Angebotspositionen exportieren',exact:true});
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
  const newestContact=page.getByRole('table').getByRole('button',{name:'Neuer Kontakt',exact:true});
  await expect(newestContact).toBeVisible();
  await expect(page.getByRole('button',{name:'Aus Haben importieren',exact:true})).toBeVisible();
  await settleResponse(page,oldFlags,{haben:false,zammad:false});
  await settleResponse(page,oldContacts,contact('Alter Kontakt'));
  await expect(newestContact).toBeVisible();
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
    const newestContact=page.getByRole('table').getByRole('button',{name:'Neuer Kontakt',exact:true});
    await expect(newestContact).toBeVisible();
    if(secondOld){
      await settleResponse(page,old,contact('Alter Kontakt nach Anmeldung'));
      await expect(newestContact).toBeVisible();
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

async function switchAccount(page:Page,email:string){
  await page.getByRole('button',{name:'Abmelden',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD!);
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await expect(page.getByRole('complementary').getByText('Muster Zweitkonto',{exact:true})).toBeVisible();
}

async function secondAccount(page:Page){
  const email=`muster-zweitkonto-${crypto.randomUUID()}@example.test`;
  const response=await page.request.post('/api/v1/users',{
    headers:{Origin:new URL(page.url()).origin},
    data:{email,password:process.env.DESK_DEMO_PASSWORD,
      name:'Muster Zweitkonto',role:'member'},
  });
  expect(response.ok(),await response.text()).toBeTruthy();
  return email;
}

for(const operation of ['download','project'] as const){
  test(`Späte Antwort für ${operation} bleibt nach Kontowechsel ohne Seiteneffekt`,async({page})=>{
    let downloads=0;
    page.on('download',()=>downloads++);
    const delayed=holdRoute();
    await signIn(page);
    const email=await secondAccount(page);
    if(operation==='download'){
      await page.route('**/api/v1/projects/projekt/offer-positions',route=>delayed.resolve(route));
      await (await openExport(page)).click();
    }else{
      await page.route('**/api/v1/projects',route=>delayed.resolve(route));
      await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
      await page.getByText('Projekt anlegen',{exact:true}).click();
      await page.getByLabel('Projektname').fill('Auftrag des ersten Kontos');
      const contact=page.getByLabel('Interessent');
      await contact.selectOption({label:'Kulturhaus am Park'});
      await page.getByRole('button',{name:'Projekt speichern',exact:true}).click();
    }
    const request=await delayed.request;
    try{
      await switchAccount(page,email);
      const address=page.url();
      await settleResponse(page,request,operation==='download'?[{name:'Musterartikel',quantity:1,unit_cents:100}]:{id:'alter-auftrag'},operation==='download'?200:201);
      await expect(page).toHaveURL(address);
      await expect(page.getByRole('complementary').getByText('Muster Zweitkonto',{exact:true})).toBeVisible();
      expect(downloads).toBe(0);
    }finally{
      await request.abort().catch(()=>{});
    }
  });
}

test('Ein Haben-Kontaktkonflikt zeigt beide Stände ohne Hinweis auf eine Speicherung',async({page})=>{
  let reads=0;
  await page.route('**/api/v1/contacts?*',route=>{
    if(++reads>1) return route.fulfill({status:503,json:{error:'Simulierter Abruffehler'}});
    return route.fulfill({json:contact('Musterkontakt')});
  });
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{haben:true,zammad:false}}));
  await page.route('**/api/v1/contacts/kontakt/haben',route=>route.fulfill({json:{
    action:'conflict',desk:{name:'Musterkontakt',email:'desk@example.test',phone:''},
    haben:{name:'Mustervergleich',email:'haben@example.test',phone:''},
  }}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
  await page.getByRole('button',{name:'Musterkontakt',exact:true}).click();
  await page.getByText('Haben-Kontakt',{exact:true}).click();
  await page.getByRole('button',{name:'Abgleichen',exact:true}).click();
  await expect(page.getByText('Beide Stände unterscheiden sich.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Ansicht aktualisieren',exact:true})).toHaveCount(0);
  expect(reads).toBe(1);
});

test('Zwei schnelle Abmeldeklicks lösen nur eine Abmeldung aus',async({page})=>{
  let requests=0;
  const delayed=holdRoute();
  await page.route('**/api/v1/logout',route=>{
    requests++;
    if(requests===1){delayed.resolve(route);return;}
    return route.continue();
  });
  await signIn(page);
  const logout=page.getByRole('button',{name:'Abmelden',exact:true});
  await logout.evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
  const first=await delayed.request;
  try{
    const response=await first.fetch();
    await first.fulfill({response});
    await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
    expect(requests).toBe(1);
    await signIn(page);
    await expect(page.getByRole('navigation',{name:'Hauptnavigation'})).toBeVisible();
  }finally{
    await first.abort().catch(()=>{});
  }
});
