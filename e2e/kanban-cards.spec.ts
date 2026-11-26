import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

async function openKanban(page:Page) {
  await signIn(page);
  await project(page,'Büroinstallation Westflügel');
  await page.getByRole('link',{name:'Kanban',exact:true}).click();
  return page.getByRole('region',{name:'Kanban',exact:true});
}

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
});
