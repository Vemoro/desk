import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const projectName='Musterinstallation';
const apiPath='/api/v1/projects/muster/zammad';
async function openTarget(page:Page){
  const data={id:'muster',name:projectName,stage:'planning',zammad_ticket_id:42};
  const common={from:'Mira Muster',created_at:'2028-05-17T09:00:00Z',content_type:'text/plain'};
  const articles=[
    {...common,id:1,subject:'Montage bestätigt',body:'Der Termin steht.'},
    {...common,id:2,subject:'Rückfrage zum Material',body:'<p title="Geheimattribut">Der Termin bleibt. <b>Montagekoffer</b> mitbringen.</p>',content_type:'text/html'},
    {...common,id:3,subject:'Anfahrt',body:'Bitte am Haupteingang melden.'},
  ];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[data]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route('**/api/v1/projects/muster',route=>{
    expect(route.request().method()).toBe('PATCH');
    data.zammad_ticket_id=43;
    return route.fulfill({json:data});
  });
  await page.route('**'+apiPath,route=>route.fulfill({json:{
    ticket:{id:data.zammad_ticket_id,number:String(data.zammad_ticket_id),title:'Anfrage vom Musterbüro',url:'https://zammad.example.test/'},
    articles:data.zammad_ticket_id===42?articles:[{...common,id:4,subject:'Neues Ticket',body:'Rückmeldung für den Folgeauftrag.'}],
    outgoing:[],
  }}));
  await signIn(page);
  await project(page,projectName);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  const panel=page.getByRole('region',{name:'Anfrage vom Musterbüro',exact:true});
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
  await page.getByRole('button',{name:'Verweis hinzufügen',exact:true}).click();
  await page.getByLabel('Kommunikationsnotiz').fill('Ticketbezug aktualisiert.');
  await page.getByRole('button',{name:'Verweis speichern',exact:true}).click();
  await expect(subjects).toHaveText(['Neues Ticket']);
  await expect(search).toHaveValue('');
});
