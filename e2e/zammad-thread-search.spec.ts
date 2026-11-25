import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const projectName='Musterinstallation';
const apiPath='/api/v1/projects/muster/zammad';
async function openTarget(page:Page,withAttempts=false,ticketTitle='Anfrage vom Musterbüro'){
  const data={id:'muster',name:projectName,stage:'planning',zammad_ticket_id:42 as number|null};
  const common={from:'Mira Muster',created_at:'2028-05-17T09:00:00Z',content_type:'text/plain'};
  const articles=[
    {...common,id:1,subject:'Montage bestätigt',body:'Der Termin steht.',
      kind:'incoming-email',reply:{recipient:'muster@example.test',subject:'Montage bestätigt'}},
    {...common,id:2,subject:'Rückfrage zum Material',body:'<p title="Geheimattribut">Der Termin bleibt. <b>Montagekoffer</b> mitbringen.</p>',content_type:'text/html'},
    {...common,id:3,subject:'Anfahrt',body:'Bitte am Haupteingang melden.'},
  ];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[data]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route('**'+apiPath+'/unlink',route=>{
    expect(route.request().postDataJSON()).toEqual({id:42});
    data.zammad_ticket_id=null;
    return route.fulfill({status:201,json:{ok:true}});
  });
  await page.route('**'+apiPath+'/link',route=>{
    expect(route.request().postDataJSON()).toEqual({id:43});
    data.zammad_ticket_id=43;
    return route.fulfill({status:201,json:{id:43}});
  });
  await page.route('**'+apiPath,route=>route.fulfill({json:{
    ticket:{id:data.zammad_ticket_id,number:String(data.zammad_ticket_id),title:ticketTitle,url:'https://zammad.example.test/'},
    articles:data.zammad_ticket_id===42?articles:[{...common,id:4,subject:'Neues Ticket',body:'Rückmeldung für den Folgeauftrag.'}],
    outgoing:withAttempts ? [{id:'muster-sendeversuch',subject:'Anfrage bestätigen',status:'sent'}] : [],
  }}));
  await signIn(page);
  await project(page,projectName);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  const panel=page.getByRole('region',{name:ticketTitle,exact:true});
  await expect(panel.getByText('Montage bestätigt',{exact:true})).toBeVisible();
  return panel;
}

test('Zammad filtert lokal den sichtbaren Ticketverlauf und lässt den Entwurf stehen',async({page})=>{
  const panel=await openTarget(page);
  const search=panel.getByRole('searchbox',{name:'Ticketverlauf durchsuchen'});
  const subjects=panel.locator('.thread li strong');
  const empty=panel.getByText('Keine Nachrichten für diese Suche.');
  let reads=0;
  page.on('request',request=>{if(new URL(request.url()).pathname===apiPath) reads++;});
  await expect(subjects).toHaveText(['Montage bestätigt','Rückfrage zum Material','Anfahrt']);
  await panel.getByText('Antwort schreiben',{exact:true}).click();
  const draft=panel;
  await draft.getByLabel('Betreff').fill('Entwurf Betreff');
  await draft.getByLabel('Nachricht').fill('Entwurf zur Montage');

  await search.fill('  MONTAGE BESTÄTIGT ');
  await expect(subjects).toHaveText(['Montage bestätigt']);
  await search.fill('montagekoffer');
  await expect(subjects).toHaveText(['Rückfrage zum Material']);
  await search.fill('termin');
  await expect(subjects).toHaveText(['Montage bestätigt','Rückfrage zum Material']);
  await search.fill('Geheimattribut');
  await expect(subjects).toHaveCount(0);
  await expect(empty).toBeVisible();
  await expect(draft.getByLabel('Betreff')).toHaveValue('Entwurf Betreff');
  await expect(draft.getByLabel('Nachricht')).toHaveValue('Entwurf zur Montage');
  expect(reads).toBe(0);

  await search.fill('');
  await expect(subjects).toHaveText(['Montage bestätigt','Rückfrage zum Material','Anfahrt']);
  await search.fill('termin');
  await page.getByRole('button',{name:'Ticketverknüpfung lösen',exact:true}).click();
  await page.getByRole('dialog',{name:'Ticketverknüpfung lösen'}).getByRole('button',{name:'Verknüpfung lösen',exact:true}).click();
  await page.getByRole('button',{name:'Ticket verknüpfen',exact:true}).click();
  const linkDialog=page.getByRole('dialog',{name:'Ticket verknüpfen'});
  await linkDialog.getByLabel('Ticket-ID').fill('43');
  await linkDialog.getByRole('button',{name:'Ticket verknüpfen',exact:true}).click();
  await expect(subjects).toHaveText(['Neues Ticket']);
  await expect(search).toHaveValue('');
});

test('Zammad scrollt am Desktop den Verlauf und hält den Notizeditor sichtbar',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  const ticket=await openTarget(page,true);
  const activity=page.getByRole('region',{name:'Ticketaktivität'});
  const note=page.getByRole('textbox',{name:'Interne Notiz'});
  const details=page.getByRole('complementary',{name:'Vorgangsdetails'});
  const subject=ticket.getByRole('heading',{name:'Anfrage vom Musterbüro'});
  const attempts=activity.getByRole('heading',{name:'Sendeversuche'});
  await expect(note).toBeInViewport({ratio:1});
  await expect(subject).toBeInViewport();
  await expect(details.getByRole('heading',{name:'Ticketdetails'})).toBeInViewport();
  const before=await note.boundingBox();
  await activity.focus();
  await activity.press('End');
  await expect.poll(()=>activity.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  expect(await note.boundingBox()).toEqual(before);
  await expect(subject).toBeInViewport();
  await expect(attempts).toBeInViewport();
  await expect(details.getByRole('heading',{name:'Ticketdetails'})).toBeInViewport();

  for(const viewport of [{width:1210,height:690},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await expect.poll(()=>activity.evaluate(element=>getComputedStyle(element).overflowY)).toBe('visible');
    await expect(note).toBeVisible();
    expect((await note.boundingBox())!.y).toBeGreaterThan((await attempts.boundingBox())!.y);
    expect((await details.boundingBox())!.y).toBeGreaterThan((await note.boundingBox())!.y);
  }
});

test('Zammad lässt auch bei langem Ticketbetreff Platz für Verlauf und Antworten',async({page})=>{
  await page.setViewportSize({width:1001,height:720});
  const title='Büroinstallation mit mehreren Gebäudeabschnitten und abgestimmtem Zeitfenster '.repeat(4).trim();
  const ticket=await openTarget(page,true,title);
  await expect(ticket.getByRole('textbox',{name:'Interne Notiz'})).toBeInViewport({ratio:1});
  await expect(ticket.getByRole('heading',{name:title,exact:true})).toHaveAttribute('title',title);
  const reply=ticket.getByRole('button',{name:'Antworten',exact:true});
  await reply.click();
  const editor=ticket.getByRole('region',{name:'E-Mail-Antwort'});
  await expect(editor.getByRole('textbox',{name:'Nachricht'})).toBeFocused();
  await editor.getByRole('button',{name:'Antwort schließen'}).click();
  await expect(reply).toBeFocused();
});
