import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

async function fixture(page:Page) {
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const me=await (await page.request.get('/api/v1/me')).json();
  const users=await (await page.request.get('/api/v1/users')).json();
  const other=users.find((user:{id:string})=>user.id!==me.id && user.name==='Noah Beispiel');
  const contacts=await (await page.request.get('/api/v1/contacts')).json();
  const suffix=crypto.randomUUID().slice(0,8);
  async function add(path:string,data:unknown) {
    const response=await page.request.post('/api/v1/'+path,{headers:{Origin:origin},data});
    expect(response.status()).toBe(201);
    return response.json();
  }
  const first=await add('projects',{name:'Muster Kanban '+suffix,contact_id:contacts[0].id});
  const second=await add('projects',{name:'Muster Folgeauftrag '+suffix,contact_id:contacts[0].id});
  for(const [name,assignment,status,project] of [
    ['Eigene Karte zuerst',me.id,'todo',first.id],['Verdeckte Karte',other.id,'todo',first.id],
    ['Eigene Karte danach',me.id,'todo',first.id],['Ohne Konto',null,'todo',first.id],
    ['Verdecktes Ziel',other.id,'doing',first.id],['Zweites Projekt',other.id,'todo',second.id],
  ]) await add('tasks',{name,assignee_id:assignment,status,project_id:project});
  await page.reload();
  await page.goto('/#projects/'+first.id+'/tasks');
  const board=page.getByRole('region',{name:'Kanban',exact:true});
  await expect(board.getByRole('button',{name:/Eigene Karte zuerst/})).toBeVisible();
  return {board,other,first,second};
}

test('Der Zuständigkeitsfilter erhält Reihenfolge, Schreibwege und Fokus',async({page})=>{
  const {board,other,second}=await fixture(page);
  const filter=page.getByRole('combobox',{name:'Aufgaben anzeigen',exact:true});
  const todo=board.getByRole('region',{name:'Offen',exact:true});
  const doing=board.getByRole('region',{name:'In Arbeit',exact:true});
  const snapshot=await (await page.request.get('/api/v1/tasks/kanban')).json();
  await expect(todo.getByRole('heading')).toHaveText('Offen 4');
  await filter.selectOption('me');
  await expect(todo.getByRole('heading')).toHaveText('Offen 2');
  await expect(todo.locator('.task-card strong')).toHaveText(['Eigene Karte zuerst','Eigene Karte danach']);
  await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(0);
  await expect(todo.locator('article[draggable="true"]')).toHaveCount(0);
  await expect(todo.getByRole('button',{name:/Eigene Karte zuerst/})).toHaveCSS('cursor','pointer');
  await expect(page.getByText('Zum Umordnen wähle „Alle“.')).toBeVisible();
  expect(await (await page.request.get('/api/v1/tasks/kanban')).json()).toEqual(snapshot);

  const dialog=page.getByRole('dialog',{name:'Karte bearbeiten'});
  await todo.getByRole('button',{name:/Eigene Karte zuerst/}).press('Enter');
  await dialog.getByRole('combobox',{name:'Status'}).selectOption('doing');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  const moved=doing.getByRole('button',{name:/Eigene Karte zuerst/});
  await expect(moved).toBeFocused();
  await moved.press('Enter');
  await dialog.getByRole('combobox',{name:'Verantwortlich'}).selectOption(other.id);
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(filter).toBeFocused();
  await expect(moved).toHaveCount(0);

  await filter.selectOption('unassigned');
  await expect(todo.locator('.task-card strong')).toHaveText(['Ohne Konto']);
  await filter.selectOption('all');
  await expect(doing.locator('.task-card strong')).toHaveText(['Verdecktes Ziel','Eigene Karte zuerst']);
  await expect(todo.locator('.task-card strong')).toHaveText(['Verdeckte Karte','Eigene Karte danach','Ohne Konto']);
  await expect(doing.getByRole('button',{name:'Verschieben',exact:true}).first()).toBeEnabled();
  await expect(doing.locator('article[draggable="true"]')).toHaveCount(2);
  await expect(moved).toHaveCSS('cursor','grab');
  await filter.selectOption('me');
  await page.goto('/#projects/'+second.id+'/tasks');
  await expect(filter).toHaveValue('all');
  await expect(todo.locator('.task-card strong')).toHaveText(['Zweites Projekt']);
});

test('Die Schnellerfassung erklärt ausgeblendete Karten und der Leerzustand lässt sich zurücksetzen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const {board,second}=await fixture(page);
  const filter=page.getByRole('combobox',{name:'Aufgaben anzeigen',exact:true});
  await page.goto('/#projects/'+second.id+'/tasks');
  await filter.selectOption('me');
  await expect(page.getByText('Keine Aufgaben für diesen Filter.')).toBeVisible();
  const todo=board.getByRole('region',{name:'Offen',exact:true});
  await todo.getByText('Karte hinzufügen',{exact:true}).click();
  const input=todo.getByRole('textbox',{name:'Kartentitel'});
  await input.fill('Musterkarte aus der Schnellerfassung');
  await input.press('Enter');
  await expect(page.getByText('Karte angelegt. Sie erscheint unter „Alle“ oder „Ohne Zuständigkeit“.')).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(todo.getByRole('heading')).toHaveText('Offen 0');
  await expect(todo.getByRole('button',{name:'Musterkarte aus der Schnellerfassung',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Filter zurücksetzen',exact:true}).press('Enter');
  await expect(filter).toHaveValue('all');
  await expect(page.getByRole('searchbox',{name:'Aufgaben suchen'})).toBeFocused();
  await expect(todo.getByRole('heading')).toHaveText('Offen 2');
  await filter.selectOption('unassigned');
  await expect(todo.getByRole('heading')).toHaveText('Offen 1');
  await expect(todo.getByRole('button',{name:'Musterkarte aus der Schnellerfassung',exact:true})).toBeVisible();
});

test('Der verspätete Wechsel aus dem Filter gibt den Fokus an die Auswahl zurück',async({page})=>{
  const {board,other}=await fixture(page);
  const filter=page.getByRole('combobox',{name:'Aufgaben anzeigen',exact:true});
  await filter.selectOption('me');
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({status:503,json:{error:'Test-Abruffehler'}}),{times:1});
  const card=board.getByRole('button',{name:/Eigene Karte zuerst/});
  const taskId=await card.getAttribute('data-task-id');
  await card.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Karte bearbeiten'});
  await dialog.getByRole('combobox',{name:'Verantwortlich'}).selectOption(other.id);
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(dialog).toHaveCount(0);
  expect((await (await page.request.get('/api/v1/tasks/'+taskId)).json()).assignee_id).toBe(other.id);
  await expect(card).toBeFocused();
  await page.getByRole('button',{name:'Ansicht aktualisieren',exact:true}).press('Enter');
  await expect(card).toHaveCount(0);
  await expect(filter).toBeFocused();
});

test('Eine gespeicherte ausgeblendete Karte bleibt auch nach Abruffehler erklärt',async({page})=>{
  const {board,first}=await fixture(page);
  await page.getByRole('combobox',{name:'Aufgaben anzeigen',exact:true}).selectOption('me');
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({status:503,json:{error:'Test-Abruffehler'}}),{times:1});
  const todo=board.getByRole('region',{name:'Offen',exact:true});
  await todo.getByText('Karte hinzufügen',{exact:true}).click();
  const input=todo.getByRole('textbox',{name:'Kartentitel'});
  const name='Musterkarte trotz Abruffehler';
  await input.fill(name);
  await input.press('Enter');
  await expect(page.getByText('Die Änderung wurde gespeichert. Die Ansicht konnte nicht aktualisiert werden.')).toBeVisible();
  const feedback=todo.getByText('Karte angelegt. Sie erscheint unter „Alle“ oder „Ohne Zuständigkeit“.');
  await expect(feedback).toBeVisible();
  await expect(input).toBeFocused();
  const tasks=await (await page.request.get('/api/v1/tasks/kanban')).json();
  expect(tasks.find((task:{name:string;project_id:string})=>task.name===name && task.project_id===first.id)?.assignee_id).toBeNull();
  const retry=page.getByRole('button',{name:'Ansicht aktualisieren',exact:true});
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(todo.getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(feedback).toBeVisible();
});
