import { expect, test, type Page } from '@playwright/test';
import { holdRoute, project, settleResponse, signIn } from './session';

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

function thread(subject:string) {
  return {ticket,outgoing:[],articles:[{id:1,kind:'internal-note',subject,body:'Synthetischer Ticketverlauf.'}]};
}

for(const staleStatus of [200,503]){
  test(`Verspäteter Ticketabruf (${staleStatus}) überschreibt weder aktuellen Stand noch Entwurf`,async({page})=>{
    const older=holdRoute();
    let calls=0;
    const oldTitle='Alter Verlauf';
    const oldError='Alter Abruffehler';
    const currentTitle='Aktueller Verlauf';
    const currentError='Aktueller Abruffehler';
    await page.route(path,route=>{
      calls++;
      if(calls===2) return older.resolve(route);
      if(calls===3 && staleStatus===200) return route.fulfill({status:503,json:{error:currentError}});
      return route.fulfill({json:thread(calls===1?'Ausgangsverlauf':currentTitle)});
    });
    await page.route(path+'/notes',route=>route.fulfill({status:201,json:{status:'sent'}}));
    await openTarget(page);
    const history=page.getByRole('region',{name:'Ticketverlauf',exact:true});
    const refresh=page.getByRole('button',{name:'Verlauf aktualisieren',exact:true});
    const note=page.getByRole('textbox',{name:'Interne Notiz',exact:true});
    await expect(history.getByText('Ausgangsverlauf',{exact:true})).toBeVisible();
    await refresh.click();
    const oldRequest=await older.request;
    try {
      await note.fill('Neue interne Notiz');
      await page.getByRole('button',{name:'Notiz hinzufügen',exact:true}).click();
      const current=staleStatus===200
        ? history.getByRole('alert').filter({hasText:currentError})
        : history.getByText(currentTitle,{exact:true});
      await expect(current).toBeVisible();
      await expect(note).toBeEmpty();
      await note.fill('Entwurf nach dem aktuellen Abruf');
      await settleResponse(page,oldRequest,staleStatus===200 ? thread(oldTitle) : {error:oldError},staleStatus);
      await expect(current).toBeVisible();
      await expect(history.getByText(oldTitle,{exact:true})).toHaveCount(0);
      await expect(history.getByText(oldError,{exact:true})).toHaveCount(0);
      await expect(note).toHaveValue('Entwurf nach dem aktuellen Abruf');

      await refresh.click();
      await expect(history.getByText(currentTitle,{exact:true})).toBeVisible();
      await expect(history.getByRole('alert')).toHaveCount(0);
    } finally {
      await oldRequest.abort().catch(()=>{});
    }
  });
}

test('Ticketabruf aus verlassener Kommunikation verändert die erneut geöffnete Ansicht nicht',async({page})=>{
  const older=holdRoute();
  let calls=0;
  await page.route(path,route=>{
    if(++calls===1) return older.resolve(route);
    return route.fulfill({json:thread('Verlauf nach Wiederöffnen')});
  });
  await openTarget(page);
  const oldRequest=await older.request;
  const history=page.getByRole('region',{name:'Ticketverlauf',exact:true});
  try {
    await expect(history).toHaveAttribute('aria-busy','true');
    await page.getByRole('button',{name:'Überblick',exact:true}).click();
    await expect(history).toHaveCount(0);
    await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
    const current=history.getByText('Verlauf nach Wiederöffnen',{exact:true});
    await expect(current).toBeVisible();
    const note=page.getByRole('textbox',{name:'Interne Notiz',exact:true});
    await note.fill('Entwurf nach Wiederöffnen');
    await settleResponse(page,oldRequest,thread('Verlauf aus verlassener Ansicht'));
    await expect(current).toBeVisible();
    await expect(history.getByText('Verlauf aus verlassener Ansicht',{exact:true})).toHaveCount(0);
    await expect(note).toHaveValue('Entwurf nach Wiederöffnen');
  } finally {
    await oldRequest.abort().catch(()=>{});
  }
});
