import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { holdRoute, project, signIn } from './session';

test('Nach einem Verbindungsabbruch ist vor der Wiederholung eine Prüfung erforderlich', async ({page}) => {
  const name = 'Montage Musterbüro';
  const path = '**/api/v1/projects/draft-probe/zammad';
  const messages: unknown[] = [];
  const checks: unknown[] = [];
  const initialSend = holdRoute();
  await page.route('**/api/v1/projects?*', route => route.fulfill({json:[
    {id:'draft-probe',name,stage:'planning',zammad_ticket_id:42},
  ]}));
  await page.route('**/api/v1/integrations', route => route.fulfill({json:{zammad:true,haben:false}}));
  await page.route(path, route => route.fulfill({json:{
    ticket:{number:'42',title:name,url:'https://zammad.example.test/#ticket/zoom/42'},
    articles:[],outgoing:[],
  }}));
  await page.route(path+'/messages', async route => {
    const message = route.request().postDataJSON();
    messages.push(message);
    if (messages.length === 1) { initialSend.resolve(route); return; }
    return route.fulfill({status:201,json:{id:message.id,status:'sent'}});
  });
  await page.route(path+'/outgoing/*', route => {
    checks.push(route.request().postDataJSON());
    return route.fulfill({status:404,json:{error:'Der Sendeversuch wurde nicht gefunden.',code:'zammad_attempt_not_found'}});
  });

  await signIn(page);
  await project(page,name);
  await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
  await page.getByRole('button',{name:'Antwort schreiben',exact:true}).click();
  const editor = page.getByRole('region',{name:'Neue E-Mail',exact:true});
  await editor.getByLabel('Empfänger').fill('kontakt@example.test');
  await editor.getByLabel('Betreff').fill('Termin für die Installation');
  const body = editor.getByLabel('Nachricht');
  await body.fill('Bitte den Termin am Montag bestätigen.');
  await editor.getByLabel('PDF-Anhang').setInputFiles({
    name:'Musterangebot.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 Musterangebot'),
  });
  const check = editor.getByRole('button',{name:'Sendeversuch prüfen',exact:true});
  const replay = editor.getByRole('button',{name:'Mit denselben Angaben fortfahren',exact:true});
  await editor.getByRole('button',{name:'Über Zammad senden',exact:true}).click();
  const pending = await initialSend.request;
  await expect(body).toBeDisabled();
  await expect(check).toHaveCount(0);
  await expect(replay).toHaveCount(0);
  await pending.abort();
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(body).toBeDisabled();
  const evidence = process.env.DESK_ZAMMAD_DRAFT_EVIDENCE;
  if (evidence) {
    await mkdir(evidence,{recursive:true});
    for (const [device,width,height] of [['desktop',1440,950],['smartphone',390,844]] as const) {
      await page.setViewportSize({width,height});
      for (const theme of ['hell','dunkel']) {
        await page.locator('html').evaluate((element,mode)=>element.setAttribute('data-theme',mode),theme==='hell'?'light':'dark');
        await editor.getByRole('button',{name:/Mit denselben Angaben fortfahren|Sendeversuch prüfen/}).scrollIntoViewIfNeeded();
        await page.screenshot({path:`${evidence}/${device}-${theme}.png`,animations:'disabled'});
      }
    }
  }

});
