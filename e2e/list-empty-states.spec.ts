import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

async function openList(page:Page,title:string) {
  const menu=page.getByRole('button',{name:'Menü',exact:true});
  if(await menu.isVisible()) await menu.click();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:title,exact:true}).click();
  await expect(page.getByRole('heading',{name:title,level:1,exact:true})).toBeVisible();
}

test('Leere Projektliste führt in das bestehende Formular und erhält Filter',async({page})=>{
  await page.setViewportSize({width:390,height:550});
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[]}));
  await signIn(page);
  await openList(page,'Projekte');
  const list=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Projekte',level:2,exact:true})});
  const name=page.getByLabel('Projektname',{exact:true});
  await expect(list.getByText('Hier erscheinen deine Projekte.')).toBeVisible();
  await list.getByRole('button',{name:'Neues Projekt',exact:true}).press('Enter');
  await expect(name).toBeFocused();
  await expect(name).toBeInViewport({ratio:1});
  const search=page.getByRole('searchbox',{name:'Projekte suchen'});
  await search.fill('Westflügel');
  await expect(list.getByText('Keine Projekte entsprechen den Filtern.')).toBeVisible();
  await expect(list.getByRole('button',{name:'Neues Projekt',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Neues Projekt',exact:true}).click();
  await expect(search).toHaveValue('Westflügel');
  await list.getByRole('button',{name:'Filter zurücksetzen',exact:true}).click();
  await expect(search).toBeFocused();
  await expect(list.getByText('Hier erscheinen deine Projekte.')).toBeVisible();
});

test('Ohne Kontakte führen Projektliste und Kontaktleerstand zur Erfassung',async({page})=>{
  await page.setViewportSize({width:390,height:320});
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[]}));
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[]}));
  await signIn(page);
  await openList(page,'Projekte');
  await expect(page.getByText('Lege zuerst einen Kontakt an, um ein Projekt zu erstellen.')).toBeVisible();
  await expect(page.getByText('Projekt anlegen',{exact:true})).toHaveCount(0);
  const projects=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Projekte',level:2,exact:true})});
  await projects.getByRole('button',{name:'Zu den Kontakten'}).press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page.getByRole('heading',{name:'Kontakte',level:1,exact:true})).toBeInViewport({ratio:1});
  const list=page.getByRole('region',{name:'Interessenten und Kontakte'});
  await expect(list.getByText('Hier erscheinen deine Interessenten und Kontakte.')).toBeVisible();
  await list.getByRole('button',{name:'Neuer Kontakt'}).click();
  await expect(list.getByLabel('Name',{exact:true})).toBeFocused();
});

test('Suche leeren stellt die Kontakte und den Fokus wieder her',async({page})=>{
  await signIn(page);
  await openList(page,'Kontakte');
  const search=page.getByRole('searchbox',{name:'Kontakte suchen'});
  await search.fill('ZZ ohne Treffer');
  await expect(page.getByText('Keine Kontakte entsprechen der Suche.')).toBeVisible();
  await page.getByRole('button',{name:'Suche leeren',exact:true}).press('Enter');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('button',{name:'Kontor West',exact:true})).toBeVisible();
});

test('Ein fehlgeschlagener Abruf zeigt keinen Projektleerstand',async({page})=>{
  await signIn(page);
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/v1/projects?*',async route=>{
    await pending;
    await route.fulfill({status:503,json:{error:'Synthetischer Ladefehler'}});
  });
  await page.goto('/#projects');
  await page.reload();
  await expect(page.getByText('Desk wird geladen …')).toBeVisible();
  await expect(page.getByText('Hier erscheinen deine Projekte.')).toHaveCount(0);
  release();
  await expect(page.getByText('Desk-Daten konnten nicht geladen werden.')).toBeVisible();
  await expect(page.getByText('Hier erscheinen deine Projekte.')).toHaveCount(0);
});

test('Mitarbeitende können die vorhandene Kontaktanlage vom Seitenkopf öffnen',async({page})=>{
  await page.goto('/');
  await page.getByLabel('E-Mail').fill('noah@example.test');
  await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD!);
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Übersicht',level:1})).toBeVisible();
  await openList(page,'Kontakte');
  await page.locator('.page-title').getByRole('button',{name:'Neuer Kontakt',exact:true}).press('Enter');
  await expect(page.getByLabel('Name',{exact:true})).toBeFocused();
});

for(const [missing,label,summary,field] of [
  ['','Wareneingang erfassen','Wareneingang','Artikel'],
  ['items','Neuer Artikel','Artikel anlegen','Artikelname'],
  ['locations','Neuer Lagerort','Lagerort anlegen','Lagerort'],
]) {
  test(`Leerer Bestand verweist auf ${label}`,async({page})=>{
    await page.setViewportSize({width:390,height:550});
    await page.route('**/api/v1/stock',route=>route.fulfill({json:[]}));
    if(missing) await page.route(`**/api/v1/${missing}?*`,route=>route.fulfill({json:[]}));
    await signIn(page);
    await openList(page,'Projektlager');
    const stock=page.locator('section').filter({has:page.getByRole('heading',{name:'Bestand je Lagerort',exact:true})});
    await expect(stock.getByRole('status')).toBeVisible();
    await stock.getByRole('button',{name:label,exact:true}).press('Enter');
    const form=stock.locator('details').filter({has:page.locator('summary').getByText(summary,{exact:true})});
    await expect(form.getByLabel(field,{exact:true})).toBeFocused();
    await expect(form.getByLabel(field,{exact:true})).toBeInViewport({ratio:1});
    await expect(page.getByRole('heading',{name:'Offene Ausgaben'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Lagerbewegungen'})).toBeVisible();
  });
}
