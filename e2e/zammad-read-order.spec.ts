import { expect, test, type Page, type Route } from '@playwright/test';
import { project, signIn } from './session';

const record={id:'projekt',name:'Musterinstallation',stage:'planning',zammad_ticket_id:42};
const path='**/api/v1/projects/projekt/zammad';

function thread(subject:string) {
  return {
    ticket:{id:42,number:'42',url:'https://zammad.example.test/#ticket/zoom/42'},
    articles:[{id:1,subject,from:'kontakt@example.test',body:'Termin zur Musterinstallation',created_at:'2026-11-24T11:00:00Z'}],
    outgoing:[],
  };
}

function hold() {
  let arrival!:()=>void;
  let release!:()=>void;
  const arrived=new Promise<void>(resolve=>{arrival=resolve;});
  const wait=new Promise<void>(resolve=>{release=resolve;});
  return {arrived,arrival,release,wait};
}

async function settle(page:Page,gate:ReturnType<typeof hold>) {
  const completed=page.waitForResponse(response=>response.url().endsWith('/projekt/zammad'));
  gate.release();
  await (await completed).finished();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}

async function open(page:Page,handler:(route:Route)=>Promise<void>) {
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route(path,handler);
  await signIn(page);
  await project(page,record.name);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  await expect(page.getByText('Ausgangsverlauf',{exact:true})).toBeVisible();
}

for(const delayedStatus of [200,503]) {
  test(`Ein verspäteter Zammad-Abruf mit HTTP ${delayedStatus} bleibt wirkungslos`,async({page})=>{
    const gate=hold();
    let phase:'initial'|'delayed'|'latest'|'error'='initial';
    await open(page,async route=>{
      if(phase==='delayed'){
        gate.arrival();
        await gate.wait;
        await route.fulfill(delayedStatus===200 ? {json:thread('Alter Verlauf')} : {status:503,json:{error:'Alter Fehler'}});
      } else if(phase==='error'){
        await route.fulfill({status:503,json:{error:'Neuer Fehler'}});
      } else {
        await route.fulfill({json:thread(phase==='initial'?'Ausgangsverlauf':'Neuer Verlauf')});
      }
    });
    const refresh=page.getByRole('button',{name:'Verlauf aktualisieren'});
    const panel=page.getByRole('region',{name:'Zammad'});
    phase='delayed';
    await refresh.click();
    await gate.arrived;
    phase=delayedStatus===200?'error':'latest';
    await refresh.click();
    if(delayedStatus===200) await expect(panel.getByRole('alert')).toHaveText('Neuer Fehler');
    else await expect(panel.getByText('Neuer Verlauf',{exact:true})).toBeVisible();
    await settle(page,gate);
    await expect(panel.getByText('Alter Verlauf',{exact:true})).toHaveCount(0);
    if(delayedStatus===200) await expect(panel.getByRole('alert')).toHaveText('Neuer Fehler');
    else await expect(panel.getByRole('alert')).toHaveCount(0);
    phase='latest';
    await refresh.click();
    await expect(panel.getByText('Neuer Verlauf',{exact:true})).toBeVisible();
    await expect(panel.getByRole('alert')).toHaveCount(0);
  });
}

test('Ein alter Abruf bleibt nach Verlassen der Kommunikation wirkungslos',async({page})=>{
  const gate=hold();
  let phase='Ausgangsverlauf';
  await open(page,async route=>{
    const subject=phase;
    if(subject==='Verlassener Verlauf'){
      gate.arrival();
      await gate.wait;
    }
    await route.fulfill({json:thread(subject)});
  });
  phase='Verlassener Verlauf';
  await page.getByRole('button',{name:'Verlauf aktualisieren'}).click();
  await gate.arrived;
  await page.getByRole('button',{name:'Überblick',exact:true}).click();
  phase='Neu geöffneter Verlauf';
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  await expect(page.getByText(phase,{exact:true})).toBeVisible();
  await settle(page,gate);
  await expect(page.getByText('Verlassener Verlauf',{exact:true})).toHaveCount(0);
  await expect(page.getByText(phase,{exact:true})).toBeVisible();
});


for(const [order,status] of [['old-first',200],['old-first',503],['latest-first',200],['latest-first',503]] as const){
  test(`Ladeanzeige folgt dem jüngsten Abruf bei ${order} und HTTP ${status}`,async({page})=>{
    const initial=hold();
    const older=hold();
    const latest=hold();
    const requests=[
      {gate:initial,subject:'Ausgangsverlauf',status:200},
      {gate:older,subject:'Alter Verlauf',status:200},
      {gate:latest,subject:'Neuer Verlauf',status},
    ];
    let phase=0;
    await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
    await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
    await page.route(path,async route=>{
      const request=requests[phase];
      expect(request).toBeDefined();
      request.gate.arrival();
      await request.gate.wait;
      if(request.status===503) await route.fulfill({status:503,json:{error:'Neuer Fehler'}});
      else await route.fulfill({json:{...thread(request.subject),outgoing:[
        {id:'muster-versuch',subject:'Musterangebot',status:'unknown'},
      ]}});
    });
    await signIn(page);
    await project(page,record.name);
    await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
    await initial.arrived;
    const panel=page.getByRole('region',{name:'Zammad'});
    const loading=panel.getByRole('status',{name:'Abrufstatus'}).filter({hasText:'Verlauf wird geladen …'});
    const refresh=panel.getByRole('button',{name:'Verlauf aktualisieren'});
    await expect(loading).toBeVisible();
    await settle(page,initial);
    await expect(loading).toHaveCount(0);
    await expect(panel.getByText('Ausgangsverlauf',{exact:true})).toBeVisible();

    phase=1;
    await refresh.click();
    await older.arrived;
    await expect(loading).toBeVisible();
    await expect(panel.getByText('Ausgangsverlauf',{exact:true})).toBeVisible();
    await expect(panel.getByRole('cell',{name:'Ausgang unklar',exact:true})).toBeVisible();
    phase=2;
    await refresh.click();
    await latest.arrived;
    if(order==='old-first'){
      await settle(page,older);
      await expect(loading).toBeVisible();
    }
    await settle(page,latest);
    await expect(loading).toHaveCount(0);
    if(order==='latest-first'){
      await settle(page,older);
      await expect(loading).toHaveCount(0);
    }
    await expect(panel.getByText('Alter Verlauf',{exact:true})).toHaveCount(0);
    if(status===503) await expect(panel.getByRole('alert')).toHaveText('Neuer Fehler');
    else await expect(panel.getByText('Neuer Verlauf',{exact:true})).toBeVisible();
  });
}
