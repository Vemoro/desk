import { test, expect, type Page } from '@playwright/test';
import { signIn, project } from './session';

const projectRow={id:'projekt',name:'Musterinstallation',stage:'planning',zammad_ticket_id:42};
const position={id:'position',project_id:projectRow.id,kind:'sell',name:'Montagekoffer',quantity:2,unit_cents:1400};
const attempt={id:'versuch',subject:'Angebot für die Musterinstallation',status:'unknown'};
const dialog= (page:Page)=>page.getByRole('dialog');

test.beforeEach(async({page})=>{
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[projectRow]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  page.on('dialog',native=>void native.dismiss());
});

async function assertDismissal(page:Page,trigger:ReturnType<Page['locator']>,title:string){
  await trigger.click();
  const modal=dialog(page);
  await expect(modal).toHaveAccessibleName(title);
  const cancel=modal.getByRole('button',{name:'Abbrechen',exact:true});
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await cancel.click();
  await expect(modal).toBeHidden();
  await expect(trigger).toBeFocused();
}

test('Kalkulationsposition erst nach einer Bestätigung entfernen',async({page})=>{
  let removed=false;
  let requests=0;
  let release!:()=>void;
  const gate=new Promise<void>((resolve)=>{release=resolve;});
  await page.route('**/api/v1/lines?*',route=>route.fulfill({json:removed?[]:[position]}));
  await page.route('**/api/v1/lines/position',async(route)=>{
    expect(route.request().method()).toBe('DELETE');
    requests++;
    await gate;
    removed=true;
    await route.fulfill({json:{id:position.id}});
  });
  await signIn(page);
  await project(page,projectRow.name);
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  await page.getByText('Position bearbeiten',{exact:true}).click();
  const trigger=page.getByRole('button',{name:'Position entfernen',exact:true});
  await assertDismissal(page,trigger,'Kalkulationsposition entfernen');
  expect(requests).toBe(0);

  await trigger.click();
  const modal=dialog(page);
  await expect(modal).toHaveAccessibleDescription(/Montagekoffer/);
  const confirm=modal.getByRole('button',{name:'Position entfernen',exact:true});
  await page.keyboard.press('Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button',{name:'Abbrechen',exact:true})).toBeFocused();
  await confirm.evaluate((button)=>{
    button.click();
    button.click();
  });
  await expect.poll(()=>requests).toBe(1);
  await expect(modal.getByRole('button',{name:'Wird ausgeführt …',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  release();
  await expect(modal).toBeHidden();
  await expect(trigger).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Kalkulation',exact:true})).toBeFocused();
  expect(requests).toBe(1);
});

for(const status of ['sent','failed','unknown','http'] as const){
  test(`Zammad-Wiederholung mit Ergebnis ${status}`,async({page})=>{
    let outgoingStatus='unknown';
    let requests=0;
    await page.route('**/api/v1/projects/projekt/zammad',route=>route.fulfill({json:{
      ticket:{id:42,number:'42',url:'https://zammad.example.test/#ticket/zoom/42'},
      articles:[],outgoing:[{...attempt,status:outgoingStatus}],
    }}));
    await page.route('**/api/v1/projects/projekt/zammad/outgoing/versuch',route=>{
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({retry:true});
      requests++;
      if(status==='http') return route.fulfill({status:409,json:{error:'Bitte zuerst den Ticketverlauf prüfen.'}});
      outgoingStatus=status;
      return route.fulfill({json:{id:attempt.id,status}});
    });
    await signIn(page);
    await project(page,projectRow.name);
    await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
    const trigger=page.getByRole('button',{name:'Erneut senden',exact:true});
    if(status==='sent'){
      await assertDismissal(page,trigger,'Zammad-Sendeversuch wiederholen');
      expect(requests).toBe(0);
    }
    await trigger.click();
    const modal=dialog(page);
    await expect(modal).toHaveAccessibleDescription(/Referenz des Sendeversuchs.*Angebot für die Musterinstallation/);
    await modal.getByRole('button',{name:'Erneut senden',exact:true}).click();
    if(status==='sent'){
      await expect(modal).toBeHidden();
      await expect(trigger).toHaveCount(0);
      await expect(page.getByRole('region',{name:'Kommunikation',exact:true})).toBeFocused();
    } else {
      const message={
        failed:'Zammad hat den Sendeversuch abgelehnt.',
        unknown:'Der Ausgang des Sendeversuchs ist weiterhin unklar.',
        http:'Bitte zuerst den Ticketverlauf prüfen.',
      }[status];
      await expect(modal.getByRole('alert')).toHaveText(message);
      await expect(modal.getByRole('button',{name:'Erneut senden',exact:true})).toBeDisabled();
      await modal.getByRole('button',{name:'Schließen',exact:true}).click();
      await expect(trigger).toBeFocused();
      await expect(page.getByText(message,{exact:true})).toHaveCount(0);
      await trigger.click();
      await expect(modal.getByRole('button',{name:'Abbrechen',exact:true})).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden();
    }
    expect(requests).toBe(1);
  });
}

for(const scenario of [
  {name:'Kalkulation',tab:'Ressourcen & Kalkulation',action:'Position entfernen',path:'**/api/v1/lines/position',method:'DELETE',result:{id:position.id},error:'Die Position wurde zwischenzeitlich geändert.'},
  {name:'Zammad',tab:'Kommunikation',action:'Erneut senden',path:'**/api/v1/projects/projekt/zammad/outgoing/versuch',method:'POST',result:{id:attempt.id,status:'sent'},error:'Mindestens eine Minute warten und den Ticketverlauf erneut prüfen.'},
] as const) {
  for(const outcome of ['Erfolg','Konflikt'] as const) {
    test(`${scenario.name} zeigt nach einem Wechsel der Projektansicht den ${outcome} der laufenden Bestätigung`,async({page})=>{
      const release=Promise.withResolvers<void>();
      let requests=0;
      let saved=false;
      await page.route('**/api/v1/lines?*',route=>route.fulfill({json:saved ? [] : [position]}));
      await page.route('**/api/v1/projects/projekt/zammad',route=>route.fulfill({json:{
        ticket:{id:42,number:'42',url:'https://zammad.example.test/#ticket/zoom/42'},
        articles:[],outgoing:[{...attempt,status:saved ? 'sent' : attempt.status}],
      }}));
      await page.route(scenario.path,async route=>{
        expect(route.request().method()).toBe(scenario.method);
        requests++;
        await release.promise;
        saved=outcome==='Erfolg';
        await route.fulfill(saved ? {json:scenario.result} : {status:409,json:{error:scenario.error}});
      });
      async function openConfirmation() {
        await project(page,projectRow.name);
        await page.getByRole('link',{name:scenario.tab,exact:true}).click();
        if(scenario.name==='Kalkulation') await page.getByText('Position bearbeiten',{exact:true}).click();
        await page.getByRole('button',{name:scenario.action,exact:true}).click();
      }
      try {
        await signIn(page);
        await openConfirmation();
        await dialog(page).getByRole('button',{name:scenario.action,exact:true}).click();
        await expect.poll(()=>requests).toBe(1);
        await page.goBack();
        await openConfirmation();
        const reopened=dialog(page);
        await expect(reopened.getByRole('alert')).toHaveText('Diese Aktion läuft bereits.');
        await expect(reopened.getByRole('button',{name:scenario.action,exact:true})).toBeDisabled();
        release.resolve();
        if(outcome==='Erfolg') {
          await expect(reopened).toBeHidden();
          await expect(page.getByRole('button',{name:scenario.action,exact:true})).toHaveCount(0);
          if(scenario.name==='Zammad') await expect(page.getByText('An Zammad übergeben',{exact:true})).toBeVisible();
        } else {
          await expect(reopened.getByRole('alert')).toHaveText(scenario.error);
          await expect(reopened.getByRole('button',{name:scenario.action,exact:true})).toBeDisabled();
          await reopened.getByRole('button',{name:'Schließen',exact:true}).click();
          await expect(page.getByRole('button',{name:scenario.action,exact:true})).toBeFocused();
        }
        expect(requests).toBe(1);
      } finally {
        release.resolve();
      }
    });
  }
}
