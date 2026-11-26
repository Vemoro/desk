import { expect, test, type Page } from '@playwright/test';
import { holdRoute, project, signIn } from './session';

async function openKanban(page:Page,title='Büroinstallation Westflügel') {
  await signIn(page);
  await project(page,title);
  await page.getByRole('link',{name:'Kanban',exact:true}).click();
  return page.getByRole('region',{name:'Kanban',exact:true});
}

test('Ziehen speichert Positionen innerhalb und zwischen Kanban-Spalten',async({page})=>{
  const board=await openKanban(page,'Veranstaltungsbetreuung im Kulturhaus');
  const open=board.getByRole('region',{name:'Offen',exact:true});
  const review=board.getByRole('region',{name:'Prüfung',exact:true});
  const titles=open.locator('.task-card strong');
  await expect(titles).toHaveText(['Übergabe dokumentieren','Termin rückbestätigen']);
  const handover=open.getByRole('button',{name:/Übergabe dokumentieren/});
  const appointment=open.getByRole('button',{name:/Termin rückbestätigen/});
  const handoverCard=open.locator('article').filter({hasText:'Übergabe dokumentieren'});
  const appointmentCard=open.locator('article').filter({hasText:'Termin rückbestätigen'});
  const targetBounds=(await handoverCard.boundingBox())!;
  const columnBounds=(await open.boundingBox())!;
  const dataTransfer=await page.evaluateHandle(()=>new DataTransfer());
  await appointmentCard.dispatchEvent('dragstart',{dataTransfer});
  await open.dispatchEvent('dragover',{dataTransfer,clientY:targetBounds.y-4});
  await expect(handoverCard).toHaveAttribute('data-drop-before','');
  await appointmentCard.dispatchEvent('dragend',{dataTransfer});
  await expect(handoverCard).not.toHaveAttribute('data-drop-before','');
  await appointment.dragTo(open,{targetPosition:{x:targetBounds.x-columnBounds.x+12,y:targetBounds.y-columnBounds.y-4}});
  await expect(titles).toHaveText(['Termin rückbestätigen','Übergabe dokumentieren']);
  await review.getByRole('button',{name:/Materialliste prüfen/}).dragTo(handover,{targetPosition:{x:12,y:5}});
  await expect(titles).toHaveText(['Termin rückbestätigen','Materialliste prüfen','Übergabe dokumentieren']);
  await page.reload();
  await expect(titles).toHaveText(['Termin rückbestätigen','Materialliste prüfen','Übergabe dokumentieren']);
  await expect(review.locator('.task-card')).toHaveCount(0);
});

test('Schnellerfassung behält bei Fehler und Erfolg die gewählte Spalte',async({page})=>{
  const board=await openKanban(page);
  const review=board.getByRole('region',{name:'Prüfung',exact:true});
  const title=review.getByRole('textbox',{name:'Kartentitel'});
  const cardName=`Montage abschließen ${crypto.randomUUID().slice(0,8)}`;
  let attempts=0;
  await page.route('**/api/v1/tasks',route=>{
    if(route.request().method()==='POST' && ++attempts===1) {
      return route.fulfill({status:409,json:{error:'Die Karte konnte nicht angelegt werden.'}});
    }
    return route.continue();
  });

  await review.getByText('Karte hinzufügen',{exact:true}).click();
  await expect(title).toBeFocused();
  await title.fill(cardName);
  await title.press('Enter');
  await expect(review.getByRole('alert')).toHaveText('Die Karte konnte nicht angelegt werden.');
  await expect(title).toHaveValue(cardName);
  await title.press('Enter');
  await expect(review.getByRole('button',{name:cardName,exact:true})).toBeVisible();
  await expect(title).toHaveValue('');
  await expect(title).toBeFocused();
  expect(attempts).toBe(2);
  await page.reload();
  await expect(review.getByRole('button',{name:cardName,exact:true})).toBeVisible();
});

test('Kartendialog hält Fokus und Eingaben und zeigt eine gespeicherte Statusänderung',async({page})=>{
  const board=await openKanban(page);
  const previous=board.getByRole('region',{name:'Offen',exact:true}).getByRole('button',{name:/Termin rückbestätigen/});
  const dialog=page.getByRole('dialog',{name:'Karte bearbeiten'});
  const title=dialog.getByRole('textbox',{name:'Kartentitel'});
  await previous.focus();
  await previous.press('Enter');
  await expect(title).toBeFocused();
  await dialog.getByRole('button',{name:'Karte speichern'}).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button',{name:'Schließen'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button',{name:'Karte speichern'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(previous).toBeFocused();

  let rejected=false;
  await page.route('**/api/v1/tasks/*',route=>{
    if(route.request().method()==='PATCH' && !rejected) {
      rejected=true;
      return route.fulfill({status:409,json:{error:'Die Karte konnte nicht gespeichert werden.'}});
    }
    return route.continue();
  });
  await previous.click();
  await title.fill('Termin beim Kunden bestätigt');
  const status=dialog.getByRole('combobox',{name:'Status'});
  await status.selectOption('done');
  const taskId=await previous.getAttribute('data-task-id');
  const change=await page.request.patch(`/api/v1/tasks/${taskId}`,{
    headers:{Origin:new URL(page.url()).origin},data:{due:'2028-05-27'},
  });
  expect(change.ok()).toBeTruthy();
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Die Karte konnte nicht gespeichert werden.');
  await expect(title).toHaveValue('Termin beim Kunden bestätigt');
  await expect(status).toHaveValue('done');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(dialog).toHaveCount(0);
  const moved=board.getByRole('region',{name:'Erledigt',exact:true}).getByRole('button',{name:/Termin beim Kunden bestätigt/});
  await expect(moved).toContainText('27.05.2028');
  await expect(moved).toBeFocused();
});

test('Eine späte Speicherantwort lässt den Fokus bei der nächsten Spalte',async({page})=>{
  const board=await openKanban(page);
  const open=board.getByRole('region',{name:'Offen',exact:true});
  const review=board.getByRole('region',{name:'Prüfung',exact:true});
  const pending=holdRoute();
  await page.route('**/api/v1/tasks',route=>{pending.resolve(route);});
  const from=open.getByRole('textbox',{name:'Kartentitel'});
  const next=review.getByRole('textbox',{name:'Kartentitel'});
  const cardName=`Einweisung ${crypto.randomUUID().slice(0,8)}`;

  await open.getByText('Karte hinzufügen',{exact:true}).click();
  await from.fill(cardName);
  await from.press('Enter');
  const request=await pending.request;
  try {
    await review.getByText('Karte hinzufügen',{exact:true}).click();
    await expect(next).toBeFocused();
    await next.fill('Materialliste mitbringen');
  } finally {
    await request.continue();
  }
  await expect(open.getByRole('button',{name:cardName})).toBeVisible();
  await expect(next).toHaveValue('Materialliste mitbringen');
  await expect(next).toBeFocused();
});

test.describe('Kanban mit Touch',()=>{
  test.use({hasTouch:true});
  test('Am Smartphone scrollt nur das Board und die letzte Spalte bleibt bedienbar',async({page})=>{
    const board=await openKanban(page);
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    expect(await board.evaluate(element=>element.scrollWidth)).toBeGreaterThan(390);
    const done=board.getByRole('region',{name:'Erledigt',exact:true});
    await done.getByRole('button',{name:/Bedarf mit Kunde abstimmen/}).tap();
    expect(await board.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
    await expect(page.getByRole('dialog',{name:'Karte bearbeiten'})).toBeVisible();
  });
  test('Per Touch eine Karte vor einer bestimmten Position ablegen',async({page})=>{
    const board=await openKanban(page,'Veranstaltungsbetreuung im Kulturhaus');
    await page.setViewportSize({width:390,height:844});
    const done=board.getByRole('region',{name:'Erledigt',exact:true});
    await done.getByRole('button',{name:'Verschieben',exact:true}).tap();
    const dialog=page.getByRole('dialog',{name:'Karte verschieben'});
    await expect(dialog.getByRole('combobox',{name:'Zielspalte'})).toBeFocused();
    await dialog.getByRole('combobox',{name:'Zielspalte'}).selectOption('doing');
    await dialog.getByRole('combobox',{name:'Zielposition'}).selectOption({label:'1. Vor Einsatz vorbereiten'});
    await dialog.getByRole('button',{name:'Karte verschieben'}).tap();
    const doing=board.getByRole('region',{name:'In Arbeit',exact:true});
    await expect(doing.locator('.task-card strong')).toHaveText(['Bedarf mit Kunde abstimmen','Einsatz vorbereiten']);
    await page.reload();
    await expect(doing.locator('.task-card strong')).toHaveText(['Bedarf mit Kunde abstimmen','Einsatz vorbereiten']);
  });
});

test('Tastatur-Verschieben aktualisiert das Board bei einer veralteten Zielposition',async({page})=>{
  const board=await openKanban(page);
  const open=board.getByRole('region',{name:'Offen',exact:true});
  const doing=board.getByRole('region',{name:'In Arbeit',exact:true});
  const card=open.locator('article').filter({hasText:'Übergabe dokumentieren'});
  const button=card.getByRole('button',{name:'Verschieben',exact:true});
  await button.focus();
  await button.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Karte verschieben'});
  await dialog.getByRole('combobox',{name:'Zielspalte'}).selectOption('doing');
  await dialog.getByRole('combobox',{name:'Zielposition'}).selectOption({label:'1. Vor Einsatz vorbereiten'});
  const target=await doing.getByRole('button',{name:/Einsatz vorbereiten/}).getAttribute('data-task-id');
  const update=await page.request.patch(`/api/v1/tasks/${target}`,{
    headers:{Origin:new URL(page.url()).origin},data:{status:'review'},
  });
  expect(update.ok()).toBeTruthy();
  await dialog.getByRole('button',{name:'Karte verschieben'}).press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText('Die Zielkarte befindet sich nicht mehr in dieser Spalte.');
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  await expect(doing.locator('.task-card')).toHaveCount(0);
  await expect(board.getByRole('region',{name:'Prüfung',exact:true}).getByRole('button',{name:/Einsatz vorbereiten/})).toBeVisible();
  await expect(card).toBeVisible();

  await button.press('Enter');
  await dialog.getByRole('combobox',{name:'Zielspalte'}).selectOption('doing');
  await dialog.getByRole('button',{name:'Karte verschieben'}).press('Enter');
  await expect(dialog).toHaveCount(0);
  const moved=doing.locator('article').filter({hasText:'Übergabe dokumentieren'});
  await expect(moved.getByRole('button',{name:'Verschieben',exact:true})).toBeFocused();
});
