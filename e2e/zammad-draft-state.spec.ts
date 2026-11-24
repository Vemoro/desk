import { expect, test, type Page, type Route } from '@playwright/test';
import { project, signIn } from './session';

const record={id:'projekt',name:'Musterinstallation',stage:'planning',zammad_ticket_id:42};
const path='**/api/v1/projects/projekt/zammad';
type Attempt={id:string;subject:string;status:string;attempted_at?:string};

async function compose(page:Page,send:(route:Route)=>Promise<void>) {
  const messages:Record<string,unknown>[]=[];
  const outgoing:Attempt[]=[];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route(path,route=>route.fulfill({json:{
    ticket:{id:42,number:'42',url:'https://zammad.example.test/#ticket/zoom/42'},
    articles:[],outgoing,
  }}));
  await page.route(path+'/messages',async route=>{
    expect(route.request().method()).toBe('POST');
    messages.push(route.request().postDataJSON());
    await send(route);
  });
  await signIn(page);
  await project(page,record.name);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  await expect(page.getByRole('link',{name:'Ticket 42 öffnen'})).toBeVisible();
  await page.getByText('Antwort schreiben',{exact:true}).click();
  const panel=page.getByRole('region',{name:'Zammad'});
  const recipient=panel.getByLabel('Empfänger',{exact:true});
  const subject=panel.getByLabel('Betreff',{exact:true});
  const body=panel.getByLabel('Nachricht',{exact:true});
  const submit=panel.getByRole('button',{name:'Über Zammad senden',exact:true});
  const fill=async(text:string)=>{
    await recipient.fill('kontakt@example.test');
    await subject.fill('Musterangebot');
    await body.fill(text);
  };
  await fill('Unser Musterangebot für die Installation.');
  return {panel,recipient,subject,body,submit,fill,messages,outgoing};
}

for(const status of ['pending','unknown'] as const){
  test(`Gespeicherter Versuch mit Status ${status} sperrt den ursprünglichen Entwurf`,async({page})=>{
    const ui=await compose(page,route=>{
      const message=route.request().postDataJSON();
      ui.outgoing.push({...message,status});
      return route.fulfill({json:{id:message.id,status}});
    });
    await ui.submit.click();
    await expect(ui.body).toBeDisabled();
    await expect(ui.subject).toBeDisabled();
    await expect(ui.recipient).toBeDisabled();
    await expect(ui.panel.getByLabel('PDF-Anhang')).toBeDisabled();
    await expect(ui.submit).toBeDisabled();
    await expect(ui.body).toHaveValue('Unser Musterangebot für die Installation.');
    await expect(ui.panel.getByRole('button',{name:'Prüfen',exact:true})).toBeVisible();
    const update=page.waitForResponse(response=>response.url().endsWith('/projekt/zammad'));
    await ui.panel.getByRole('button',{name:'Verlauf aktualisieren'}).click();
    await (await update).finished();
    await expect(ui.panel.getByRole('status')).toContainText(status==='pending'?'Sendeversuch steht aus':'Ausgang ist unklar');
    expect(ui.messages).toHaveLength(1);

    // Eine bestätigte Prüfung räumt den Entwurf auch bei einem folgenden Abruffehler auf.
    await page.route(path+'/outgoing/*',route=>{
      expect(route.request().postDataJSON()).toEqual({retry:false});
      return route.fulfill({json:{id:ui.messages[0].id,status:'sent'}});
    });
    await page.route(path,route=>route.fulfill({status:503,json:{error:'Verlauf vorübergehend nicht verfügbar.'}}));
    await ui.panel.getByRole('button',{name:'Prüfen',exact:true}).click();
    await expect(ui.panel.getByRole('alert')).toHaveText('Verlauf vorübergehend nicht verfügbar.');
    await expect(ui.body).toBeEnabled();
    await expect(ui.body).toHaveValue('');
    expect(ui.messages).toHaveLength(1);
  });
}

test('Ohne gespeicherten Versuch erlaubt die Prüfung nur denselben Entwurf',async({page})=>{
  let checks=0;
  const ui=await compose(page,route=>ui.messages.length===1 ? route.abort() : route.fulfill({
    json:{id:ui.messages[0].id,status:'sent'},
  }));
  await ui.panel.getByLabel('PDF-Anhang').setInputFiles({
    name:'musterangebot.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 Musterangebot'),
  });
  await ui.submit.click();
  const replay=ui.panel.getByRole('button',{name:'Unveränderten Entwurf erneut übermitteln'});
  const check=ui.panel.getByRole('button',{name:'Sendeversuch prüfen'});
  await expect(check).toBeVisible();
  await expect(ui.body).toBeDisabled();
  await expect(replay).toHaveCount(0);
  await page.route(path+'/outgoing/*',route=>{
    expect(route.request().url().split('/').at(-1)).toBe(ui.messages[0].id);
    expect(route.request().postDataJSON()).toEqual({retry:false});
    checks++;
    return route.fulfill({status:404,json:{error:'Datensatz nicht gefunden.'}});
  });
  await check.click();
  await expect(replay).toBeVisible();
  expect(ui.messages).toHaveLength(1);
  await replay.click();
  await expect(ui.body).toBeEnabled();
  await expect(ui.body).toHaveValue('');
  expect(ui.messages).toHaveLength(2);
  expect(ui.messages[1]).toEqual(ui.messages[0]);
  expect(ui.messages[0].attachment).toMatchObject({name:'musterangebot.pdf'});
  expect(checks).toBe(1);
});

test('Bestätigte Ablehnung erlaubt ausdrücklich einen neuen Entwurf',async({page})=>{
  const ui=await compose(page,route=>{
    const message=route.request().postDataJSON();
    const status=ui.messages.length===1?'failed':'sent';
    ui.outgoing.push({...message,status});
    return route.fulfill({json:{id:message.id,status}});
  });
  await ui.submit.click();
  await expect(ui.body).toBeDisabled();
  await expect(ui.panel.getByRole('button',{name:'Erneut senden',exact:true})).toBeVisible();
  await ui.panel.getByRole('button',{name:'Neuen Entwurf beginnen'}).click();
  await expect(ui.body).toBeEnabled();
  await expect(ui.body).toHaveValue('');
  expect(ui.messages).toHaveLength(1);
  await ui.fill('Korrigiertes Angebot für die Installation.');
  await ui.submit.click();
  await expect(ui.body).toHaveValue('');
  expect(ui.messages).toHaveLength(2);
  expect(ui.messages[1].id).not.toBe(ui.messages[0].id);
  expect(ui.messages[1].body).toBe('Korrigiertes Angebot für die Installation.');
});

test('Bestätigter Eingabefehler vor Speicherung lässt sich korrigieren',async({page})=>{
  const ui=await compose(page,route=>ui.messages.length===1
    ? route.fulfill({status:400,json:{error:'Der Anhang muss ein PDF sein.'}})
    : route.fulfill({json:{id:ui.messages[1].id,status:'sent'}}));
  await ui.panel.getByLabel('PDF-Anhang').setInputFiles({
    name:'falscher-anhang.pdf',mimeType:'application/pdf',buffer:Buffer.from('Kein PDF'),
  });
  await ui.submit.click();
  await expect(page.getByText('Der Anhang muss ein PDF sein.',{exact:true})).toBeVisible();
  await expect(ui.body).toBeEnabled();
  await expect(ui.body).toHaveValue('Unser Musterangebot für die Installation.');
  await ui.panel.getByLabel('PDF-Anhang').setInputFiles([]);
  await ui.body.fill('Nachricht ohne Anhang.');
  await ui.submit.click();
  await expect(ui.body).toHaveValue('');
  expect(ui.messages).toHaveLength(2);
  expect(ui.messages[1]).not.toHaveProperty('attachment');
  expect(ui.messages[1].id).not.toBe(ui.messages[0].id);
});

test('Verbindungsabbruch beim Wiederholen sperrt den abgelehnten Entwurf bis zur erneuten Ablehnung',async({page})=>{
  let reviews=0;
  const ui=await compose(page,route=>{
    const message=route.request().postDataJSON();
    ui.outgoing.push({...message,status:'failed',attempted_at:'2026-11-24T10:00:00.000Z'});
    return route.fulfill({json:{id:message.id,status:'failed'}});
  });
  await page.route(path+'/outgoing/*',route=>{
    const {retry}=route.request().postDataJSON();
    expect(route.request().url().split('/').at(-1)).toBe(ui.messages[0].id);
    reviews++;
    if(retry){
      return route.abort();
    }
    if(reviews===3) ui.outgoing[0].attempted_at='2026-11-24T10:01:00.000Z';
    return route.fulfill({json:{id:ui.messages[0].id,status:'failed'}});
  });
  await ui.submit.click();
  const next=ui.panel.getByRole('button',{name:'Neuen Entwurf beginnen'});
  await expect(next).toBeVisible();
  await ui.panel.getByRole('button',{name:'Erneut senden',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Erneut senden',exact:true}).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button',{name:'Schließen',exact:true}).click();
  await expect(next).toHaveCount(0);
  await expect(ui.body).toBeDisabled();
  await expect(ui.body).toHaveValue('Unser Musterangebot für die Installation.');
  expect(ui.messages).toHaveLength(1);
  const check=ui.panel.getByRole('button',{name:'Sendeversuch prüfen'});
  const refreshed=page.waitForResponse(response=>response.url().endsWith('/projekt/zammad'));
  await check.click();
  await (await refreshed).finished();
  await expect(next).toHaveCount(0);
  await expect(ui.body).toBeDisabled();
  await check.click();
  await expect(next).toBeVisible();
  await next.click();
  await expect(ui.body).toBeEnabled();
  await expect(ui.body).toHaveValue('');
  expect(ui.messages).toHaveLength(1);
  expect(reviews).toBe(3);
});
