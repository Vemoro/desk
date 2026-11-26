import { expect, test, type Page, type Route } from '@playwright/test';
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
  await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
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

for(const fromOpening of [false,true]){
  test(fromOpening ? 'Ein erneuter Abruf beim Öffnen behält den jüngsten Fehler'
    : 'Eine ältere Antwort beendet den jüngsten manuellen Abruf nicht',async({page})=>{
    const older=holdRoute();
    const newer=holdRoute();
    const previous={...thread('Bisheriger Verlauf'),outgoing};
    const current=thread('Aktueller Verlauf');
    const currentError='Aktueller Abruf fehlgeschlagen';
    const olderTitle='Verspäteter Verlauf';
    let reads=0;
    await page.route(path,route=>{
      expect(route.request().method()).toBe('GET');
      const attempt=++reads-(fromOpening?0:1);
      if(attempt===0) return route.fulfill({json:previous});
      if(attempt===1) return older.resolve(route);
      if(attempt===2) return newer.resolve(route);
      return route.fulfill({json:current});
    });
    await openTarget(page);
    const history=page.getByRole('region',{name:'Ticketverlauf',exact:true});
    const loading=page.getByRole('status').filter({hasText:loadingLabel});
    const refresh=page.getByRole('button',{name:'Verlauf aktualisieren',exact:true});
    const visibleVersion=history.getByText('Aktueller Verlauf',{exact:true});
    const previousVersion=history.getByText('Bisheriger Verlauf',{exact:true});
    const outgoingStatus=page.getByRole('row',{name:/Angebot gesendet.*An Zammad übergeben/});
    let newRequest:Route|undefined;
    if(!fromOpening){
      await expect(previousVersion).toBeVisible();
      await refresh.click();
    }
    const oldRequest=await older.request;
    try {
      await expect(loading).toBeVisible();
      await expect(history).toHaveAttribute('aria-busy','true');
      await expect(refresh).toBeEnabled();
      await refresh.press('Enter');
      await expect(refresh).toBeFocused();
      newRequest=await newer.request;

      if(fromOpening){
        await settleResponse(page,newRequest,{error:currentError},503);
        await expect(history.getByRole('alert')).toHaveText(currentError);
        await expect(loading).toHaveCount(0);
        await settleResponse(page,oldRequest,thread(olderTitle));
        await expect(history.getByRole('alert')).toHaveText(currentError);
      }else{
        await expect(previousVersion).toBeVisible();
        await expect(outgoingStatus).toBeVisible();
        await settleResponse(page,oldRequest,{error:'Alter Abruffehler'},503);
        await expect(loading).toBeVisible();
        await expect(history).toHaveAttribute('aria-busy','true');
        await expect(history.getByRole('alert')).toHaveCount(0);
        await expect(previousVersion).toBeVisible();
        await expect(outgoingStatus).toBeVisible();
        await settleResponse(page,newRequest,current);
        await expect(visibleVersion).toBeVisible();
      }
      await expect(history.getByText(olderTitle,{exact:true})).toHaveCount(0);
      await expect(loading).toHaveCount(0);
      await expect(history).toHaveAttribute('aria-busy','false');

      await refresh.click();
      await expect(visibleVersion).toBeVisible();
      await expect(history.getByRole('alert')).toHaveCount(0);
      expect(reads).toBe(fromOpening?3:4);
    } finally {
      await oldRequest.abort().catch(()=>{});
      await newRequest?.abort().catch(()=>{});
    }
  });
}

for(const staleStatus of [200,503]){
  test(`Verspäteter Ticketabruf (${staleStatus}) überschreibt weder aktuellen Stand noch Entwurf`,async({page})=>{
    const older=holdRoute();
    let phase:'initial'|'older'|'newer'|'recovered'='initial';
    const oldTitle='Alter Verlauf';
    const oldError='Alter Abruffehler';
    const currentTitle='Aktueller Verlauf';
    const currentError='Aktueller Abruffehler';
    await page.route(path,route=>{
      if(phase==='older') return older.resolve(route);
      if(phase==='newer' && staleStatus===200) return route.fulfill({status:503,json:{error:currentError}});
      return route.fulfill({json:thread(phase==='initial'?'Ausgangsverlauf':currentTitle)});
    });
    await page.route(path+'/notes',route=>route.fulfill({status:201,json:{status:'sent'}}));
    await openTarget(page);
    const history=page.getByRole('region',{name:'Ticketverlauf',exact:true});
    const refresh=page.getByRole('button',{name:'Verlauf aktualisieren',exact:true});
    const note=page.getByRole('textbox',{name:'Interne Notiz',exact:true});
    await expect(history.getByText('Ausgangsverlauf',{exact:true})).toBeVisible();
    phase='older';
    await refresh.click();
    const oldRequest=await older.request;
    try {
      phase='newer';
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

      phase='recovered';
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
  let initialView=true;
  const heldRequests:Route[]=[];
  await page.route(path,route=>{
    if(initialView) {
      heldRequests.push(route);
      return older.resolve(route);
    }
    return route.fulfill({json:thread('Verlauf nach Wiederöffnen')});
  });
  await openTarget(page);
  await older.request;
  const history=page.getByRole('region',{name:'Ticketverlauf',exact:true});
  try {
    await expect(history).toHaveAttribute('aria-busy','true');
    await page.getByRole('link',{name:'Überblick',exact:true}).click();
    await expect(history).toHaveCount(0);
    initialView=false;
    await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
    const current=history.getByText('Verlauf nach Wiederöffnen',{exact:true});
    await expect(current).toBeVisible();
    const note=page.getByRole('textbox',{name:'Interne Notiz',exact:true});
    await note.fill('Entwurf nach Wiederöffnen');
    for(const request of heldRequests) {
      await settleResponse(page,request,thread('Verlauf aus verlassener Ansicht'));
    }
    await expect(current).toBeVisible();
    await expect(history.getByText('Verlauf aus verlassener Ansicht',{exact:true})).toHaveCount(0);
    await expect(note).toHaveValue('Entwurf nach Wiederöffnen');
  } finally {
    await Promise.all(heldRequests.map(request=>request.abort().catch(()=>{})));
  }
});

test('Nur ein aktueller Versandnachweis darf die unbestätigte interne Notiz zurücksetzen',async({page})=>{
  const older=holdRoute();
  const noteText='Interne Notiz mit unklarem Ergebnis';
  let attemptId='';
  let phase:'initial'|'older'|'newer'|'confirmed'='initial';
  await page.route(path+'/notes',route=>{
    attemptId=route.request().postDataJSON().id;
    return route.fulfill({status:201,json:{id:attemptId,status:'unknown'}});
  });
  const attempt=(status:string)=>({...thread('Synthetischer Verlauf'),outgoing:[
    {id:attemptId,subject:noteText,status},
  ]});
  await page.route(path,route=>{
    if(phase==='older') return older.resolve(route);
    return route.fulfill({json:phase==='initial' ? thread('Synthetischer Verlauf') : attempt(phase==='newer'?'unknown':'sent')});
  });
  await openTarget(page);
  const refresh=page.getByRole('button',{name:'Verlauf aktualisieren',exact:true});
  const note=page.getByRole('textbox',{name:'Interne Notiz',exact:true});
  await expect(page.getByText('Synthetischer Verlauf',{exact:true})).toBeVisible();
  phase='older';
  await refresh.click();
  const oldRequest=await older.request;
  try {
    phase='newer';
    await note.fill(noteText);
    await page.getByRole('button',{name:'Notiz hinzufügen',exact:true}).click();
    const unclear=page.getByRole('row',{name:/Ausgang unklar/});
    await expect(unclear).toBeVisible();
    await expect(note).toBeDisabled();

    await settleResponse(page,oldRequest,attempt('sent'));
    await expect(unclear).toBeVisible();
    await expect(note).toHaveValue(noteText);
    await expect(note).toBeDisabled();

    phase='confirmed';
    await refresh.click();
    await expect(page.getByRole('row',{name:/An Zammad übergeben/})).toBeVisible();
    await expect(note).toBeEnabled();
    await expect(note).toBeEmpty();
  } finally {
    await oldRequest.abort().catch(()=>{});
  }
});
