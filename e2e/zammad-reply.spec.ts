import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

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
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[{id:'reply-test',name,stage:'planning',zammad_ticket_id:42}]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route(path,route=>route.fulfill({json:{
    ticket:{id:42,number:'1042',title:'Anfrage des Musterbüros',url:'https://zammad.example.test/'},
    articles,outgoing:attempts,
  }}));
  await page.route(path+'/outgoing/*',route=>{
    attempts[0]!.status='failed';
    return route.fulfill({status:201,json:{status:'failed'}});
  });
  await page.route(path+'/messages',route=>{
    outbound.push(route.request().postDataJSON());
    if(outbound.length===1) return route.fulfill({status:502,json:{error:'Die Antwortadresse kann gerade nicht geprüft werden.'}});
    if(outbound.length===2) return route.abort('failed');
    const current=outbound.at(-1)!;
    const status=outbound.length===3 ? 'unknown' : 'sent';
    if(status==='sent') articles.shift();
    attempts.push({id:current.id,subject:current.subject,status});
    return route.fulfill({status:201,json:{status,id:current.id}});
  });
  await signIn(page);
  await project(page,name);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  const history=page.getByRole('region',{name:'Ticketverlauf'});
  await expect(history.getByText('Interne Notiz',{exact:true})).toBeVisible();
  await expect(history.getByText('Ausgehende E-Mail',{exact:true})).toBeVisible();
  await expect(history.getByRole('button',{name:'Antworten',exact:true})).toHaveCount(2);
  await page.getByText('Antwort schreiben',{exact:true}).click();
  await page.getByLabel('Nachricht',{exact:true}).fill('Separater Entwurf');
  const reply=history.getByRole('listitem').filter({hasText:'Erste Anfrage'}).getByRole('button',{name:'Antworten',exact:true});
  await reply.click();
  const editor=page.getByRole('region',{name:'E-Mail-Antwort'});
  await expect(editor.getByLabel('Nachricht',{exact:true})).toBeFocused();
  await expect(editor.getByText('antwort@example.test',{exact:true})).toBeVisible();
  await editor.getByRole('button',{name:'Antwort schließen'}).click();
  await expect(reply).toBeFocused();
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
  await editor.getByRole('button',{name:'Neuen Entwurf beginnen'}).click();
  await expect(editor.getByLabel('Nachricht',{exact:true})).toBeEnabled();
  await editor.getByLabel('Nachricht',{exact:true}).fill('Neue Nachricht nach der Ablehnung.');
  await editor.getByRole('button',{name:'E-Mail über Zammad senden'}).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole('region',{name:'Anfrage des Musterbüros'})).toBeFocused();
  await expect(page.getByLabel('Nachricht',{exact:true})).toHaveValue('Separater Entwurf');
  expect(outbound).toHaveLength(4);
  expect(outbound[2]).toEqual(outbound[1]);
  expect(outbound[3]?.id).not.toBe(outbound[2]?.id);
  expect(outbound[3]).toMatchObject({
    replyArticleId:12,recipient:'neu@example.test',subject:'Erste Anfrage',body:'Neue Nachricht nach der Ablehnung.',
    attachment:{name:'Muster.pdf',data:Buffer.from('%PDF-Muster').toString('base64')},
  });
});
