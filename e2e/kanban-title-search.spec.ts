import { expect, test, type Page } from '@playwright/test';
import { holdRoute, signIn } from './session';

async function fixture(page:Page) {
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const me=await (await page.request.get('/api/v1/me')).json();
  const contacts=await (await page.request.get('/api/v1/contacts')).json();
  async function add(resource:string,data:unknown) {
    const response=await page.request.post('/api/v1/'+resource,{headers:{Origin:origin},data});
    expect(response.status()).toBe(201);
    return response.json();
  }
  const addProject=(name:string)=>add('projects',{name:name+' '+crypto.randomUUID(),contact_id:contacts[0].id});
  const first=await addProject('Muster Montage');
  const second=await addProject('Muster Folgeauftrag');
  for(const [name,status,assignee] of [
    ['Montage prüfen','todo',me.id],['Montage reservieren','todo',null],
    ['Montage planen','todo',me.id],['Montage freigeben','doing',me.id],
  ]) await add('tasks',{name,status,assignee_id:assignee,project_id:first.id});
  await add('tasks',{name:'Vorgang im Folgeprojekt',status:'todo',project_id:second.id});
  await page.reload();
  await page.goto('/#projects/'+first.id+'/tasks');
  const board=page.getByRole('region',{name:'Kanban',exact:true});
  await expect(board.getByRole('button',{name:/Montage prüfen/})).toBeVisible();
  return {first,second,board,search:page.getByRole('searchbox',{name:'Aufgaben suchen'}),
    assignee:page.getByRole('combobox',{name:'Aufgaben anzeigen'}),todo:board.getByRole('region',{name:'Offen',exact:true}),
    doing:board.getByRole('region',{name:'In Arbeit',exact:true})};
}

test('Titelsuche und Zuständigkeit filtern gemeinsam ohne Positionsänderung',async({page})=>{
  const {board,search,assignee,todo,doing,second}=await fixture(page);
  const snapshot=await (await page.request.get('/api/v1/tasks/kanban')).json();
  await search.fill('  mOnTaGe  ');
  await expect(todo.getByRole('heading')).toHaveText('Offen 3');
  await expect(board.locator('article[draggable="true"]')).toHaveCount(0);
  await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(0);
  await assignee.selectOption('me');
  await expect(todo.locator('.task-card strong')).toHaveText(['Montage prüfen','Montage planen']);
  await expect(doing.getByRole('heading')).toHaveText('In Arbeit 1');
  await expect(page.getByRole('status').filter({hasText:/^3 Aufgaben$/})).toBeVisible();
  await search.fill('fremder Titel');
  await expect(page.getByText('Keine Aufgaben für diese Suche.')).toBeVisible();
  await search.fill('');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(assignee).toHaveValue('me');
  await assignee.selectOption('all');
  await search.fill('   ');
  await expect(board.locator('article[draggable="true"]')).toHaveCount(4);
  await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(4);
  expect(await (await page.request.get('/api/v1/tasks/kanban')).json()).toEqual(snapshot);
  await search.fill('Montage');
  await assignee.selectOption('me');
  await page.goto('/#projects/'+second.id+'/tasks');
  await expect(search).toHaveValue('');
  await expect(assignee).toHaveValue('all');
  await expect(todo.locator('.task-card strong')).toHaveText(['Vorgang im Folgeprojekt']);
});

test('Nach Status- und Titeländerungen bleibt der Fokus im Kanban',async({page})=>{
  const {search,todo,doing}=await fixture(page);
  await search.fill('montage');
  const dialog=page.getByRole('dialog',{name:'Karte bearbeiten'});
  await todo.getByRole('button',{name:/Montage prüfen/}).press('Enter');
  await dialog.getByRole('textbox',{name:'Kartentitel'}).fill('Montage fertig prüfen');
  await dialog.getByRole('combobox',{name:'Status'}).selectOption('doing');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  const moved=doing.getByRole('button',{name:/Montage fertig prüfen/});
  await expect(moved).toBeFocused();
  await moved.press('Enter');
  await dialog.getByRole('textbox',{name:'Kartentitel'}).fill('Ausführung fertig prüfen');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(moved).toHaveCount(0);
  await expect(search).toBeFocused();
});

test('Die Zuständigkeitsauswahl erhält den Fokus, wenn nur die Zuständigkeit nicht passt',async({page})=>{
  const {search,assignee,todo}=await fixture(page);
  await search.fill('montage');
  await assignee.selectOption('me');
  const card=todo.getByRole('button',{name:/Montage prüfen/});
  await card.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Karte bearbeiten'});
  await dialog.getByRole('combobox',{name:'Verantwortlich'}).selectOption({label:'Noah Beispiel'});
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(card).toHaveCount(0);
  await expect(assignee).toBeFocused();
});

test('Nach einem verzögerten Abruf erhält die verschobene Karte den Fokus',async({page})=>{
  const {search,todo,doing}=await fixture(page);
  await search.fill('montage');
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({status:503,json:{error:'Test-Abruffehler'}}),{times:1});
  const oldCard=todo.getByRole('button',{name:/Montage prüfen/});
  await oldCard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Karte bearbeiten'});
  await dialog.getByRole('combobox',{name:'Status'}).selectOption('doing');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(oldCard).toBeFocused();
  await page.getByRole('button',{name:'Ansicht aktualisieren'}).press('Enter');
  await expect(doing.getByRole('button',{name:/Montage prüfen/})).toBeFocused();
});

test('Beim späteren Ausblenden bleibt bewusst gesetzter Fokus erhalten',async({page})=>{
  const {search,assignee,todo}=await fixture(page);
  await search.fill('montage');
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({status:503,json:{error:'Test-Abruffehler'}}),{times:1});
  const card=todo.getByRole('button',{name:/Montage prüfen/});
  await card.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Karte bearbeiten'});
  await dialog.getByRole('textbox',{name:'Kartentitel'}).fill('Ausführung prüfen');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(card).toBeFocused();
  const delayed=holdRoute();
  await page.route('**/api/v1/tasks/kanban',delayed.resolve,{times:1});
  await page.getByRole('button',{name:'Ansicht aktualisieren'}).press('Enter');
  const request=await delayed.request;
  await assignee.focus();
  await request.continue();
  await expect(card).toHaveCount(0);
  await expect(assignee).toBeFocused();
});

test('Bei abgelehnter Schnellerfassung bleiben Titel und Spalte erhalten',async({page})=>{
  const {search,doing}=await fixture(page);
  await search.fill('montage');
  await page.route('**/api/v1/tasks',route=>route.fulfill({status:422,json:{error:'Test-Schreibablehnung'}}),{times:1});
  await doing.getByText('Karte hinzufügen',{exact:true}).click();
  const input=doing.getByRole('textbox',{name:'Kartentitel'});
  await input.fill('Montage erneut prüfen');
  await input.press('Enter');
  await expect(doing.getByText('Test-Schreibablehnung')).toBeVisible();
  await expect(input).toHaveValue('Montage erneut prüfen');
  await expect(doing.getByText('Karte angelegt.',{exact:true})).toHaveCount(0);
});

test('Die Schnellerfassung erklärt die aktuell wirksamen Filter nach einem Abruffehler',async({page})=>{
  const {first,search,assignee,todo}=await fixture(page);
  const title='Werkzeug im Musterlager';
  let releasePost!:()=>void;
  const pendingPost=new Promise<void>(resolve=>{releasePost=resolve;});
  let posts=0;
  await page.route('**/api/v1/tasks',async route=>{
    posts++;
    await pendingPost;
    await route.continue();
  });
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({status:503,json:{error:'Test-Abruffehler'}}),{times:1});
  await search.fill('montage');
  await todo.getByText('Karte hinzufügen',{exact:true}).click();
  const input=todo.getByRole('textbox',{name:'Kartentitel'});
  await input.fill(title);
  await input.press('Enter');
  try {
    await expect.poll(()=>posts).toBe(1);
    await todo.getByText('Karte hinzufügen',{exact:true}).click();
    await assignee.focus();
    await assignee.selectOption('me');
  } finally {
    releasePost();
  }
  await expect(todo.getByText('Karte angelegt. Leere die Suche und wähle „Alle“ oder „Ohne Zuständigkeit“.')).toBeVisible();
  await expect(assignee).toBeFocused();
  await assignee.selectOption('all');
  await expect(todo.getByText('Karte angelegt. Leere die Suche, damit die Karte erscheint.')).toBeVisible();
  await assignee.selectOption('me');
  await search.fill('');
  await expect(todo.getByText('Karte angelegt. Sie erscheint unter „Alle“ oder „Ohne Zuständigkeit“.')).toBeVisible();
  await page.getByRole('button',{name:'Ansicht aktualisieren'}).click();
  await assignee.selectOption('unassigned');
  await expect(todo.getByRole('button',{name:title,exact:true})).toBeVisible();
  expect(posts).toBe(1);
  const tasks=await (await page.request.get('/api/v1/tasks/kanban')).json();
  expect(tasks.filter((task:{name:string;project_id:string})=>task.name===title && task.project_id===first.id)).toHaveLength(1);
});
