import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

test('Interne Notiz bleibt geöffnet und kann einen Beitrag zitieren',async({page})=>{
  const path='**/api/v1/projects/notiz/zammad';
  const articles=[{id:1,kind:'incoming-email',subject:'Anfrage',body:'Termin am Freitag.'}];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[{id:'notiz',name:'Büroinstallation',stage:'planning',zammad_ticket_id:42}]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  const outgoing:object[]=[];
  let forwarded=false;
  await page.route(path,route=>route.fulfill({json:{
    ticket:{number:'42',title:'Büroinstallation',url:'https://zammad.example.test/'},articles,outgoing,
  }}));
  await page.route(path+'/notes',route=>{
    const {id,ticketId,body}=route.request().postDataJSON();
    expect(route.request().postDataJSON()).toEqual({id,ticketId:42,body:'Abstimmen\n\n> Anfrage\n> Termin am Freitag.'});
    expect(ticketId).toBe(42);
    articles.push({id:2,kind:'internal-note',subject:'Neue interne Notiz',body});
    outgoing.push({id,status:'sent',subject:'Interne Notiz'});
    return route.fulfill({status:201,json:{id,status:'sent'}});
  });
  await page.route(path+'/messages',route=>{
    const payload=route.request().postDataJSON();
    expect(payload).toEqual({id:payload.id,recipient:'montage@example.test',subject:'WG: Anfrage',body:'Termin am Freitag.'});
    forwarded=true;
    outgoing.push({id:payload.id,status:'sent',subject:payload.subject});
    return route.fulfill({status:201,json:{id:payload.id,status:'sent'}});
  });
  await signIn(page);
  await project(page,'Büroinstallation');
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  const note=page.getByRole('textbox',{name:'Interne Notiz'});
  await expect(note).toBeVisible();
  await note.fill('Abstimmen');
  await page.setViewportSize({width:390,height:844});
  const compose=page.getByRole('button',{name:'Antwort schreiben',exact:true});
  const freeMessage=page.getByRole('region',{name:'Neue E-Mail'}).getByRole('textbox',{name:'Nachricht'});
  await compose.click();
  await freeMessage.fill('Separater E-Mail-Entwurf');
  await page.getByRole('button',{name:'In Notiz zitieren'}).click();
  await expect(note).toBeFocused();
  await expect(note).toBeInViewport({ratio:1});
  await expect(freeMessage).toBeHidden();
  await page.getByRole('button',{name:'Text weiterleiten'}).click();
  const forwarding=page.getByRole('region',{name:'E-Mail-Weiterleitung'});
  await expect(note).toBeHidden();
  await expect(forwarding.getByRole('textbox',{name:'Empfänger'})).toBeEmpty();
  await expect(forwarding.getByRole('textbox',{name:'Nachricht'})).toHaveValue('\n\nTermin am Freitag.');
  await forwarding.getByRole('textbox',{name:'Empfänger'}).fill('montage@example.test');
  await forwarding.getByRole('textbox',{name:'Nachricht'}).fill('Termin am Freitag.');
  await forwarding.getByRole('button',{name:'E-Mail über Zammad senden'}).click();
  await expect(forwarding).toBeHidden();
  expect(forwarded).toBe(true);
  await page.getByRole('button',{name:'Notiz hinzufügen'}).click();
  await expect(page.getByText('Neue interne Notiz',{exact:true})).toBeVisible();
  await expect(note).toBeVisible();
  await expect(note).toBeEmpty();
  await expect(note).toBeFocused();
  await compose.click();
  await expect(freeMessage).toHaveValue('Separater E-Mail-Entwurf');
});

test('Zammad beantwortet die gewählte E-Mail mit nachvollziehbarem Empfänger und erhält den Entwurf bei einem Fehler',async({page})=>{
  const name='Büroinstallation';
  const path='**/api/v1/projects/reply-test/zammad';
  const articles=[
    {id:12,subject:'Erste Anfrage',body:'Wo sollen wir uns melden?',kind:'incoming-email',reply:{recipient:'antwort@example.test',subject:'Erste Anfrage'}},
    {id:13,subject:'Zweite Anfrage',body:'Welche Uhrzeit passt?',kind:'incoming-email',reply:{recipient:'weiter@example.test',subject:'Zweite Anfrage'}},
    {id:14,subject:'Vermerk',body:'Die Schicht klären.',kind:'internal-note'},
    {id:15,subject:'Rückmeldung',body:'Bitte am Empfang melden.',kind:'outgoing-email'},
  ];
  const outbound:{id:string;replyArticleId:number;recipient:string;subject:string;body:string;attachment?:{name:string;data:string}}[]=[];
  const attempts:{id:string;subject:string;status:string}[]=[];
  let historyUnavailable=false;
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[{id:'reply-test',name,stage:'planning',zammad_ticket_id:42}]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route(path,route=>historyUnavailable
    ? route.fulfill({status:502,json:{error:'Verlauf ist gerade nicht erreichbar.'}})
    : route.fulfill({json:{
      ticket:{id:42,number:'1042',title:'Anfrage des Musterbüros',url:'https://zammad.example.test/'},
      articles,outgoing:attempts,
    }}));
  await page.route(path+'/outgoing/*',route=>{
    if(route.request().postDataJSON().retry) {
      attempts[0]!.status='unknown';
      historyUnavailable=true;
      return route.fulfill({status:201,json:{status:'unknown'}});
    }
    historyUnavailable=false;
    attempts[0]!.status='failed';
    return route.fulfill({status:201,json:{status:'failed'}});
  });
  await page.route(path+'/messages',route=>{
    outbound.push(route.request().postDataJSON());
    if(outbound.length===1) return route.fulfill({status:502,json:{
      error:'Die Antwortadresse kann gerade nicht geprüft werden.',code:'zammad_message_not_stored',
    }});
    if(outbound.length===2) return route.fulfill({status:502,json:{error:'Bad Gateway'}});
    const current=outbound.at(-1)!;
    const status=outbound.length===3 ? 'unknown' : 'sent';
    if(status==='sent') articles.shift();
    attempts.push({id:current.id,subject:current.subject,status});
    return route.fulfill({status:201,json:{status,id:current.id}});
  });
  await signIn(page);
  await project(page,name);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  const ticket=page.getByRole('region',{name:'Anfrage des Musterbüros',exact:true});
  await expect(ticket.getByText('Zammad-Ticket #1042',{exact:true})).toBeVisible();
  await expect(page.getByRole('complementary',{name:'Vorgangsdetails'}).getByRole('link',{name:'Ticket 1042 öffnen'})).toBeVisible();
  const history=page.getByRole('region',{name:'Ticketverlauf'});
  await expect(history.getByText('Interne Notiz',{exact:true})).toBeVisible();
  await expect(history.getByText('Ausgehende E-Mail',{exact:true})).toBeVisible();
  await expect(history.getByRole('button',{name:'Antworten',exact:true})).toHaveCount(2);
  const note=ticket.getByRole('textbox',{name:'Interne Notiz'});
  const compose=ticket.getByRole('button',{name:'Antwort schreiben',exact:true});
  const newMessage=ticket.getByRole('region',{name:'Neue E-Mail',exact:true});
  await note.fill('Interner Entwurf');
  await compose.click();
  await expect(newMessage.getByRole('textbox',{name:'Empfänger'})).toBeFocused();
  await expect(note).toBeHidden();
  await newMessage.getByRole('textbox',{name:'Nachricht'}).fill('Separater Entwurf');
  await newMessage.getByRole('button',{name:'Zur internen Notiz'}).click();
  await expect(compose).toBeFocused();
  await expect(note).toHaveValue('Interner Entwurf');
  await compose.click();
  await expect(newMessage.getByRole('textbox',{name:'Nachricht'})).toHaveValue('Separater Entwurf');
  const reply=history.getByRole('listitem').filter({hasText:'Erste Anfrage'}).getByRole('button',{name:'Antworten',exact:true});
  await reply.click();
  const editor=page.getByRole('region',{name:'E-Mail-Antwort'});
  await expect(editor.getByLabel('Nachricht',{exact:true})).toBeFocused();
  await expect(newMessage).toBeHidden();
  await expect(note).toBeHidden();
  await expect(editor.getByText('antwort@example.test',{exact:true})).toBeVisible();
  await editor.getByRole('button',{name:'Antwort schließen'}).click();
  await expect(reply).toBeFocused();
  await expect(note).toHaveValue('Interner Entwurf');
  await reply.click();
  await expect(editor.getByLabel('Betreff')).toHaveValue('Erste Anfrage');
  await editor.getByLabel('Nachricht',{exact:true}).fill('Bitte am Haupteingang melden.');
  await editor.getByLabel('PDF-Anhang').setInputFiles({
    name:'Muster.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-Muster'),
  });
  await editor.getByRole('button',{name:'E-Mail über Zammad senden'}).click();
  await expect(editor.getByRole('alert')).toHaveText('Die Antwortadresse kann gerade nicht geprüft werden.');
  await expect(editor.getByLabel('Nachricht',{exact:true})).toHaveValue('Bitte am Haupteingang melden.');
  await expect(editor.getByLabel('Nachricht',{exact:true})).toBeEnabled();
  articles[0]!.reply={recipient:'neu@example.test',subject:'Erste Anfrage'};
  await page.getByRole('button',{name:'Verlauf aktualisieren'}).click();
  await expect(editor.getByRole('button',{name:'E-Mail über Zammad senden'})).toBeDisabled();
  await editor.getByRole('button',{name:'Adresse neu@example.test übernehmen'}).click();
  await expect(editor.getByText('neu@example.test',{exact:true})).toBeVisible();
  await expect(editor.getByLabel('Nachricht',{exact:true})).toHaveValue('Bitte am Haupteingang melden.');
  await editor.getByRole('button',{name:'E-Mail über Zammad senden'}).click();
  await expect(editor.getByLabel('Nachricht',{exact:true})).toBeDisabled();
  await editor.getByRole('button',{name:'Mit denselben Angaben fortfahren'}).click();
  await expect(editor.getByRole('alert').last()).toHaveText('Sendezustand prüfen. Der Versuch steht im Projektverlauf.');
  await expect(editor.getByLabel('Betreff')).toBeDisabled();
  await expect(editor.getByLabel('PDF-Anhang')).toBeDisabled();
  await expect(editor.getByRole('button',{name:'E-Mail über Zammad senden'})).toBeDisabled();
  await expect(page.getByText('Ausgang unklar',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Prüfen',exact:true}).click();
  await expect(editor.getByRole('button',{name:'Neuen Entwurf beginnen'})).toBeVisible();
  await page.getByRole('button',{name:'Erneut senden',exact:true}).click();
  const confirmation=page.getByRole('dialog',{name:'Zammad-Sendeversuch wiederholen'});
  await confirmation.getByRole('button',{name:'Erneut senden',exact:true}).click();
  await expect(confirmation.getByRole('alert')).toHaveText('Der Ausgang des Sendeversuchs ist weiterhin unklar.');
  await confirmation.getByRole('button',{name:'Schließen',exact:true}).click();
  await expect(editor.getByRole('button',{name:'Neuen Entwurf beginnen'})).toHaveCount(0);
  await page.getByRole('button',{name:'Prüfen',exact:true}).click();
  await editor.getByRole('button',{name:'Neuen Entwurf beginnen'}).click();
  await expect(editor.getByLabel('Nachricht',{exact:true})).toBeEnabled();
  await editor.getByLabel('Nachricht',{exact:true}).fill('Neue Nachricht nach der Ablehnung.');
  await editor.getByRole('button',{name:'E-Mail über Zammad senden'}).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole('region',{name:'Anfrage des Musterbüros'})).toBeFocused();
  await expect(note).toHaveValue('Interner Entwurf');
  await compose.click();
  await expect(newMessage.getByRole('textbox',{name:'Nachricht'})).toHaveValue('Separater Entwurf');
  await newMessage.getByRole('button',{name:'Zur internen Notiz'}).click();
  await expect(note).toHaveValue('Interner Entwurf');
  expect(outbound).toHaveLength(4);
  expect(outbound[2]).toEqual(outbound[1]);
  expect(outbound[3]?.id).not.toBe(outbound[2]?.id);
  expect(outbound[3]).toMatchObject({
    replyArticleId:12,recipient:'neu@example.test',subject:'Erste Anfrage',body:'Neue Nachricht nach der Ablehnung.',
    attachment:{name:'Muster.pdf',data:Buffer.from('%PDF-Muster').toString('base64')},
  });
});
