import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const projectName='Musterinstallation';
const emptyLabel='Dieses Ticket enthält noch keine Nachrichten.';
const loadingLabel='Ticketverlauf wird geladen …';
const ticket={id:42,number:'42',title:'Anfrage vom Musterbüro',url:'https://zammad.example.test/'};
const path='**/api/v1/projects/muster/zammad';
const outgoing=[{id:'attempt',subject:'Angebot gesendet',status:'sent'}];

async function openTarget(page:Page) {
  const record={id:'muster',name:projectName,stage:'planning',zammad_ticket_id:42};
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await signIn(page);
  await project(page,projectName);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
}

test('Leerer Ticketverlauf unterscheidet sich von Laden und einer Suche ohne Treffer',async({page})=>{
  let finish!:()=>void;
  const gate=new Promise<void>(resolve=>{finish=resolve;});
  let emptyResponse=true;
  await page.route(path,async route=>{
    const empty=emptyResponse;
    if(empty) await gate;
    await route.fulfill({json:{
      ticket,outgoing,articles:empty ? [] : [
        {id:1,subject:'Montage bestätigt',body:'Der Termin steht.',created_at:'2028-05-17T09:00:00Z'},
      ],
    }});
  });
  const history=page.getByRole('region',{name:'Ticketverlauf',exact:true});
  const empty=history.getByText(emptyLabel,{exact:true});
  const loading=page.getByRole('status').filter({hasText:loadingLabel});
  try {
    await openTarget(page);
    await expect(loading).toBeVisible();
    await expect(history).toHaveAttribute('aria-busy','true');
    await expect(empty).toHaveCount(0);
  } finally {
    finish();
  }

  await expect(empty).toBeVisible();
  await expect(loading).toHaveCount(0);
  await expect(history).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('row',{name:/Angebot gesendet.*An Zammad übergeben/})).toBeVisible();
  await page.getByText('Antwort schreiben',{exact:true}).click();
  const subject=page.getByLabel('Betreff',{exact:true});
  await subject.fill('Rückfrage zum Termin');

  emptyResponse=false;
  await page.getByRole('button',{name:'Verlauf aktualisieren',exact:true}).click();
  await expect(history.getByText('Montage bestätigt',{exact:true})).toBeVisible();
  await expect(empty).toHaveCount(0);
  await history.getByRole('searchbox',{name:'Ticketverlauf durchsuchen'}).fill('Transport');
  await expect(history.getByText('Keine Nachrichten für diese Suche.',{exact:true})).toBeVisible();
  await expect(empty).toHaveCount(0);
  await expect(subject).toHaveValue('Rückfrage zum Termin');
});

test('Fehler beim ersten Abruf zeigt keinen leeren Ticketverlauf',async({page})=>{
  const problem='Verlauf vorübergehend nicht verfügbar.';
  await page.route(path,route=>route.fulfill({status:503,json:{error:problem}}));
  await openTarget(page);

  const history=page.getByRole('region',{name:'Ticketverlauf',exact:true});
  await expect(history.getByRole('alert')).toHaveText(problem);
  await expect(history.getByText(emptyLabel,{exact:true})).toHaveCount(0);
  await expect(history).toHaveAttribute('aria-busy','false');
  await expect(page.getByRole('status').filter({hasText:loadingLabel})).toHaveCount(0);
});
