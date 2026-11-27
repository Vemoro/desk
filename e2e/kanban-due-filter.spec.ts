import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

test.use({timezoneId:'Europe/Berlin'});

async function fixture(page:Page) {
  await page.clock.install({time:new Date('2028-05-17T21:59:00Z')});
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
  const first=await addProject('Muster Material');
  const second=await addProject('Muster Folgeprojekt');
  for(const [name,status,due,assignee] of [
    ['Material vorbereiten','todo','2028-05-16',null],['Material inventarisieren','todo','2028-05-15',null],
    ['Material transportieren','doing','2028-05-16',me.id],['Notizen abgleichen','review','2028-05-16',null],
    ['Schlüssel abholen','done','2028-05-16',null],['Material prüfen','review','2028-05-17',null],
    ['Lieferung annehmen','done','2028-05-17',null],['Geräte montieren','todo','2028-05-18',null],
    ['Lageplan anfordern','todo',null,null],['Anfrage lesen','done',null,null],
  ]) await add('tasks',{project_id:first.id,name,status,due,assignee_id:assignee});
  await add('tasks',{project_id:second.id,name:'Aufbau abstimmen',status:'todo'});
  await page.reload();
  await page.goto('/#projects/'+first.id+'/tasks');
  const board=page.getByRole('region',{name:'Kanban',exact:true});
  await expect(board.getByRole('button',{name:/Material vorbereiten/})).toBeVisible();
  return {first,second,board,titles:board.locator('.task-card strong'),date:page.getByRole('combobox',{name:'Aufgabentermine filtern'}),
    todo:board.getByRole('region',{name:'Offen',exact:true}),doing:board.getByRole('region',{name:'In Arbeit',exact:true}),
    search:page.getByRole('searchbox',{name:'Aufgaben suchen'}),assignee:page.getByRole('combobox',{name:'Aufgaben anzeigen'}),
    sort:page.getByRole('combobox',{name:'Aufgaben sortieren'}),dialog:page.getByRole('dialog',{name:'Karte bearbeiten'})};
}

test('Terminfilter kombiniert die Auswahl und aktualisiert Heute zur lokalen Mitternacht',async({page})=>{
  const {second,board,titles,date,todo,search,assignee,sort}=await fixture(page);
  await expect(date).toHaveValue('all');
  await expect(titles).toHaveCount(10);
  await date.selectOption('overdue');
  await expect(titles).toHaveText(['Material vorbereiten','Material inventarisieren','Material transportieren','Notizen abgleichen']);
  await search.fill('Material');
  await assignee.selectOption('unassigned');
  await sort.selectOption('due');
  await expect(todo.locator('.task-card strong')).toHaveText(['Material inventarisieren','Material vorbereiten']);
  await expect(titles).toHaveCount(2);
  await expect(page.getByRole('status').filter({hasText:/^2 Aufgaben$/})).toBeVisible();
  await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(0);
  await expect(board.locator('article[draggable="true"]')).toHaveCount(0);
  await expect(page.getByText(/Zum Umordnen.*„Standard“.*„Alle“.*„Alle Termine“/)).toBeVisible();
  await search.fill('Schlüssel');
  await expect(page.getByText('Keine Aufgaben für diese Filter.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Suche leeren'}).click();
  await assignee.selectOption('all');
  await date.selectOption('all');
  await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(0);
  await sort.selectOption('standard');
  await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(10);
  await expect(board.locator('article[draggable="true"]')).toHaveCount(10);
  await date.selectOption('undated');
  await expect(titles).toHaveText(['Lageplan anfordern','Anfrage lesen']);
  await date.selectOption('today');
  await expect(titles).toHaveText(['Material prüfen','Lieferung annehmen']);
  await board.getByRole('button',{name:/Material prüfen/}).focus();
  await page.clock.fastForward(70_000);
  await expect(date).toHaveValue('today');
  await expect(titles).toHaveText(['Geräte montieren']);
  await expect(date).toBeFocused();
  await page.goto('/#projects/'+second.id+'/tasks');
  await expect(date).toHaveValue('all');
  await expect(titles).toHaveText(['Aufbau abstimmen']);
});

test('Nach Mitternacht kehrt der Fokus beim Schließen der ausgefilterten Karte zum Terminfilter zurück',async({page})=>{
  const {board,date,dialog}=await fixture(page);
  await date.selectOption('today');
  const card=board.getByRole('button',{name:/Material prüfen/});
  await card.press('Enter');
  const close=dialog.getByRole('button',{name:'Schließen',exact:true});
  await expect(close).toBeVisible();
  await page.clock.fastForward(70_000);
  await expect(card).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await close.click();
  await expect(date).toBeFocused();
});

test('Kartenfokus folgt einem Statuswechsel oder einer Änderung an Titel und Termin',async({page})=>{
  const {board,date,todo,doing,dialog,search}=await fixture(page);
  await date.selectOption('overdue');
  await todo.getByRole('button',{name:'Material vorbereiten',exact:false}).press('Enter');
  await dialog.getByRole('combobox',{name:'Status'}).selectOption('doing');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  const moved=doing.getByRole('button',{name:'Material vorbereiten',exact:false});
  await expect(moved).toBeFocused();
  await moved.press('Enter');
  await dialog.getByRole('combobox',{name:'Status'}).selectOption('done');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(moved).toHaveCount(0);
  await expect(date).toBeFocused();

  await date.selectOption('today');
  await search.fill('prüfen');
  const card=board.getByRole('button',{name:'Material prüfen',exact:false});
  await card.press('Enter');
  await dialog.getByRole('textbox',{name:'Kartentitel'}).fill('Material inspizieren');
  await dialog.getByLabel('Fällig am').fill('2028-05-18');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(card).toHaveCount(0);
  await expect(date).toBeFocused();
});

test('Nach Abruffehler und Mitternacht erhält die wieder sichtbare Karte den Fokus',async({page})=>{
  const {board,date,dialog}=await fixture(page);
  await date.selectOption('today');
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({status:503,json:{error:'Test-Abruffehler'}}),{times:1});
  const card=board.getByRole('button',{name:/Material prüfen/});
  await card.press('Enter');
  await dialog.getByLabel('Fällig am').fill('2028-05-18');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(card).toBeFocused();
  await page.clock.fastForward(70_000);
  await expect(card).toHaveCount(0);
  await page.getByRole('button',{name:'Ansicht aktualisieren'}).press('Enter');
  await expect(card).toBeFocused();
});

test('Ein konkurrierender Schreibzugriff nach Abruffehler lässt den Fokus beim wirksamen Filter',async({page})=>{
  const {board,date,dialog,search}=await fixture(page);
  await date.selectOption('today');
  await search.fill('prüfen');
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({status:503,json:{error:'Test-Abruffehler'}}),{times:1});
  const card=board.getByRole('button',{name:/Material prüfen/});
  const taskId=await card.getAttribute('data-task-id');
  await card.press('Enter');
  await dialog.getByLabel('Fällig am').fill('2028-05-18');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(card).toBeFocused();
  const response=await page.request.patch('/api/v1/tasks/'+taskId,
    {headers:{Origin:new URL(page.url()).origin},data:{due:'2028-05-17',name:'Material inspizieren'}});
  expect(response.ok()).toBeTruthy();
  await page.getByRole('button',{name:'Ansicht aktualisieren'}).press('Enter');
  await expect(card).toHaveCount(0);
  await expect(search).toBeFocused();
});

test('Nach der Rückkehr zu Alle Termine und Standard lassen sich beide Positionswege speichern',async({page})=>{
  const {date,sort,todo}=await fixture(page);
  await date.selectOption('overdue');
  await sort.selectOption('due');
  await date.selectOption('all');
  await sort.selectOption('standard');
  const first=todo.getByRole('button',{name:/Material vorbereiten/});
  const second=todo.getByRole('button',{name:/Material inventarisieren/});
  const titles=todo.locator('.task-card strong');
  await second.dragTo(first,{targetPosition:{x:12,y:5}});
  await expect(titles.first()).toHaveText('Material inventarisieren');
  await page.reload();
  await expect(titles.first()).toHaveText('Material inventarisieren');
  const editPosition=todo.getByRole('button',{name:'Verschieben',exact:true}).first();
  await editPosition.press('Enter');
  const move=page.getByRole('dialog',{name:'Karte verschieben'});
  await move.getByRole('combobox',{name:'Zielposition'}).selectOption({label:'Ans Spaltenende'});
  await move.getByRole('button',{name:'Karte verschieben'}).click();
  await expect(titles.last()).toHaveText('Material inventarisieren');
  await page.reload();
  await expect(titles.last()).toHaveText('Material inventarisieren');
});

test('Schnellerfassung nennt nach dem Speichern auch den Terminfilter',async({page})=>{
  const {first,date,todo,assignee,search}=await fixture(page);
  let writes=0;
  page.on('request',request=>{
    if(new URL(request.url()).pathname==='/api/v1/tasks' && request.method()==='POST') writes++;
  });
  await date.selectOption('today');
  await search.fill('Werkzeug');
  await assignee.selectOption('me');
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({status:503,json:{error:'Test-Abruffehler'}}),{times:1});
  await todo.getByText('Karte hinzufügen',{exact:true}).click();
  const title=todo.getByRole('textbox',{name:'Kartentitel'});
  await title.fill('Lageplan übertragen');
  await title.press('Enter');
  const status=todo.getByRole('status');
  await expect(status).toHaveText(/Die Karte hat keinen Termin.*leere die Suche.*Ohne Zuständigkeit.*Alle Termine.*Ohne Termin/);
  await expect(page.getByText('Die Änderung wurde gespeichert. Die Ansicht konnte nicht aktualisiert werden.')).toBeVisible();
  await page.getByRole('button',{name:'Suche leeren'}).click();
  await assignee.selectOption('unassigned');
  await expect(status).toHaveText('Die Karte hat keinen Termin. Damit sie erscheint, wähle bei „Aufgabentermine filtern“ „Alle Termine“ oder „Ohne Termin“.');
  await page.getByRole('button',{name:'Ansicht aktualisieren'}).click();
  await expect(todo.getByRole('button',{name:'Lageplan übertragen',exact:true})).toHaveCount(0);
  await date.selectOption('undated');
  await expect(todo.getByRole('button',{name:'Lageplan übertragen',exact:true})).toBeVisible();
  expect(writes).toBe(1);
  const tasks=await (await page.request.get('/api/v1/tasks/kanban')).json();
  expect(tasks.filter((task:{project_id:string;name:string;due:string|null})=>
    task.project_id===first.id && task.name==='Lageplan übertragen' && task.due===null)).toHaveLength(1);
});
