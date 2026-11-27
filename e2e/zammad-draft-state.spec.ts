import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { holdRoute, project, signIn } from './session';

for (const rejected of [false,true]) {
  test(rejected ? 'Ein bestätigter Vorabfehler bei der Wiederholung gibt den Entwurf frei'
    : 'Nach einem Verbindungsabbruch ist vor der Wiederholung eine Prüfung erforderlich', async ({page}) => {
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
      if (messages.length === 2 && rejected) return route.fulfill({status:400,json:{
        error:'Der Anhang muss ein PDF sein.',code:'zammad_message_not_stored',
      }});
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
    if (evidence && !rejected) {
      await mkdir(evidence,{recursive:true});
      for (const [device,width,height] of [['desktop',1440,950],['smartphone',390,844]] as const) {
        await page.setViewportSize({width,height});
        for (const theme of ['hell','dunkel']) {
          await page.locator('html').evaluate((element,mode)=>element.setAttribute('data-theme',mode),theme==='hell'?'light':'dark');
          await editor.getByRole('alert').scrollIntoViewIfNeeded();
          await page.screenshot({path:`${evidence}/${device}-${theme}.png`,animations:'disabled'});
        }
      }
    }

    await expect(check).toBeVisible();
    await expect(replay).toHaveCount(0);
    expect(messages).toHaveLength(1);
    await check.click();
    await expect(replay).toBeVisible();
    await expect(body).toHaveValue('Bitte den Termin am Montag bestätigen.');
    await expect(body).toBeDisabled();
    expect(checks).toEqual([{retry:false}]);
    expect(messages).toHaveLength(1);
    await replay.click();
    if (rejected) {
      await expect(editor.getByRole('alert').last()).toHaveText('Der Anhang muss ein PDF sein.');
      await expect(body).toBeEnabled();
      await expect(body).toHaveValue('Bitte den Termin am Montag bestätigen.');
      expect(messages).toHaveLength(2);
      expect(messages[1]).toEqual(messages[0]);
      await editor.getByLabel('PDF-Anhang').setInputFiles([]);
      await editor.getByRole('button',{name:'Über Zammad senden',exact:true}).click();
      await expect(editor).toBeHidden();
      expect(messages).toHaveLength(3);
      expect(messages[2]).toMatchObject({body:'Bitte den Termin am Montag bestätigen.'});
      expect(messages[2]).not.toHaveProperty('attachment');
      expect(messages[2]).not.toMatchObject({id:(messages[0] as {id:string}).id});
    } else {
      await expect(editor).toBeHidden();
      expect(messages).toHaveLength(2);
      expect(messages[1]).toEqual(messages[0]);
    }
  });
}

for (const [status,history] of [['pending','loaded'],['unknown','outside-list'],['unknown','unavailable']] as const) {
  test(`Ein gespeicherter Versuch bleibt bis zur Bestätigung gesperrt (${status}, ${history})`, async ({page}) => {
    const name = 'Montage Musterbüro';
    const path = '**/api/v1/projects/draft-probe/zammad';
    let draftId = '';
    let sends = 0;
    let historyUnavailable = history==='unavailable';
    let checks = 0;
    await page.route('**/api/v1/projects?*', route => route.fulfill({json:[
      {id:'draft-probe',name,stage:'planning',zammad_ticket_id:42},
    ]}));
    await page.route('**/api/v1/integrations', route => route.fulfill({json:{zammad:true,haben:false}}));
    await page.route(path, route => historyUnavailable
      ? route.fulfill({status:502,json:{error:'Verlauf vorübergehend nicht verfügbar.'}})
      : route.fulfill({json:{
        ticket:{number:'42',title:name,url:'https://zammad.example.test/#ticket/zoom/42'},articles:[],
        outgoing:draftId && history==='loaded' ? [{id:draftId,subject:'Termin für die Installation',status}] : [],
      }}));
    await page.route(path+'/messages', route => {
      sends++;
      draftId=String(route.request().postDataJSON().id);
      if(history==='outside-list') return route.abort();
      return route.fulfill({status:201,json:{id:draftId,status}});
    });
    await page.route(path+'/outgoing/*', route => {
      expect(route.request().url().split('/').at(-1)).toBe(draftId);
      expect(route.request().postDataJSON()).toEqual({retry:false});
      checks++;
      if(history==='outside-list' && checks===1) return route.fulfill({status:201,json:{id:draftId,status}});
      historyUnavailable=true;
      return route.fulfill({status:201,json:{id:draftId,status:'sent'}});
    });

    await signIn(page);
    await project(page,name);
    await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
    const compose = page.getByRole('button',{name:'Antwort schreiben',exact:true});
    await compose.click();
    const editor = page.getByRole('region',{name:'Neue E-Mail',exact:true});
    await editor.getByLabel('Empfänger').fill('kontakt@example.test');
    await editor.getByLabel('Betreff').fill('Termin für die Installation');
    const body = editor.getByLabel('Nachricht');
    await body.fill('Bitte den Termin am Montag bestätigen.');
    await editor.getByRole('button',{name:'Über Zammad senden',exact:true}).click();
    await expect(body).toBeDisabled();
    await expect(body).toHaveValue('Bitte den Termin am Montag bestätigen.');
    const attempt = page.getByRole('row',{name:/Termin für die Installation/});
    if(history==='outside-list') {
      await expect(attempt).toHaveCount(0);
      await editor.getByRole('button',{name:'Sendeversuch prüfen',exact:true}).click();
    }
    await expect(attempt.getByText(status==='pending'?'Ausstehend':'Ausgang unklar',{exact:true})).toBeVisible();
    const refresh = page.getByRole('button',{name:'Verlauf aktualisieren',exact:true});
    await refresh.click();
    await expect(refresh).toBeEnabled();
    expect(sends).toBe(1);
    await attempt.getByRole('button',{name:'Prüfen',exact:true}).click();
    await expect(page.getByText('Verlauf vorübergehend nicht verfügbar.',{exact:true})).toBeVisible();
    await expect(attempt.getByText('An Zammad übergeben',{exact:true})).toBeVisible();
    await expect(editor).toBeHidden();
    await compose.click();
    await expect(body).toHaveValue('');
    await expect(body).toBeEnabled();
    expect(sends).toBe(1);
  });
}
