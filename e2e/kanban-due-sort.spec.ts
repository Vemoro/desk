import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

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
  const first=await addProject('Muster Termine');
  const second=await addProject('Muster Folgeprojekt');
  for(const [name,status,due,assignee] of [
    ['Montage spät','todo','2028-05-21',me.id],
    ['Montage ohne Termin zuerst','todo',null,me.id],
    ['Montage gleich Z','todo','2028-05-19',me.id],
    ['Montage gleich A','todo','2028-05-19',me.id],
    ['Montage früh','todo','2028-05-17',me.id],
    ['Montage ohne Termin danach','todo',null,me.id],
    ['Montage ohne Zuständigkeit','todo','2028-05-16',null],
    ['Rückbau','todo','2028-05-15',me.id],
    ['Montage läuft spät','doing','2028-05-24',me.id],
    ['Montage läuft früh','doing','2028-05-18',me.id],
  ]) await add('tasks',{name,status,due,assignee_id:assignee,project_id:first.id});
  await page.reload();
  await page.goto('/#projects/'+first.id+'/tasks');
  const board=page.getByRole('region',{name:'Kanban',exact:true});
  await expect(board.getByRole('button',{name:/Montage spät/})).toBeVisible();
  return {second,board,search:page.getByRole('searchbox',{name:'Aufgaben suchen'}),
    assignee:page.getByRole('combobox',{name:'Aufgaben anzeigen'}),sort:page.getByRole('combobox',{name:'Aufgaben sortieren'}),
    todo:board.getByRole('region',{name:'Offen',exact:true}),doing:board.getByRole('region',{name:'In Arbeit',exact:true})};
}

test('Fälligkeit sortiert jede Spalte stabil und lässt die gespeicherten Positionen unverändert',async({page})=>{
  const {board,sort,search,assignee,todo,doing,second}=await fixture(page);
  const saved=await (await page.request.get('/api/v1/tasks/kanban')).json();
  const titles=todo.locator('.task-card strong');
  const manual=await titles.allTextContents();
  const writes:string[]=[];
  page.on('request',request=>{
    if(new URL(request.url()).pathname.startsWith('/api/v1/') && request.method()!=='GET') writes.push(request.url());
  });
  await expect(sort).toHaveValue('standard');
  await sort.press('ArrowDown');
  await expect(sort).toHaveValue('due');
  await expect(sort).toBeFocused();
  await expect(page.getByText('Zum Umordnen wähle „Standard“.')).toBeVisible();
  await expect(titles).toHaveText(['Rückbau','Montage ohne Zuständigkeit','Montage früh','Montage gleich Z','Montage gleich A',
    'Montage spät','Montage ohne Termin zuerst','Montage ohne Termin danach']);
  await expect(doing.locator('.task-card strong')).toHaveText(['Montage läuft früh','Montage läuft spät']);
  await expect(board.locator('article[draggable="true"]')).toHaveCount(0);
  await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(0);
  await search.fill('montage');
  await assignee.selectOption('me');
  await expect(page.getByText('Zum Umordnen wähle „Standard“, leere die Suche und wähle „Alle“.')).toBeVisible();
  await expect(titles).toHaveText(['Montage früh','Montage gleich Z','Montage gleich A','Montage spät',
    'Montage ohne Termin zuerst','Montage ohne Termin danach']);
  await sort.selectOption('standard');
  await expect(search).toHaveValue('montage');
  await expect(assignee).toHaveValue('me');
  await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(0);
  await search.fill('');
  await assignee.selectOption('all');
  await expect(titles).toHaveText(manual);
  await expect(board.locator('article[draggable="true"]')).toHaveCount(10);
  await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(10);
  expect(await (await page.request.get('/api/v1/tasks/kanban')).json()).toEqual(saved);
  expect(writes).toEqual([]);
  await sort.selectOption('due');
  await page.goto('/#projects/'+second.id+'/tasks');
  await expect(sort).toHaveValue('standard');
});

test('Der Statuswechsel sortiert die Karte in der Zielspalte ein und gibt ihr den Fokus',async({page})=>{
  const {sort,todo,doing}=await fixture(page);
  await sort.selectOption('due');
  await todo.getByRole('button',{name:/Montage gleich Z/}).press('Enter');
  const dialog=page.getByRole('dialog',{name:'Karte bearbeiten'});
  await dialog.getByRole('combobox',{name:'Status'}).selectOption('doing');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  const target=doing.getByRole('button',{name:/Montage gleich Z/});
  await expect(target).toBeFocused();
  const titles=doing.locator('.task-card strong');
  await expect(titles).toHaveText(['Montage läuft früh','Montage gleich Z','Montage läuft spät']);
  await sort.selectOption('standard');
  await expect(titles).toHaveText(['Montage läuft spät','Montage läuft früh','Montage gleich Z']);
});

test('Nach einem fehlgeschlagenen Abruf erhält die verschobene Karte ihren Terminplatz und Fokus',async({page})=>{
  const {sort,todo,doing}=await fixture(page);
  await sort.selectOption('due');
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({status:503,json:{error:'Test-Abruffehler'}}),{times:1});
  const card=todo.getByRole('button',{name:/Montage gleich Z/});
  await card.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Karte bearbeiten'});
  await dialog.getByRole('combobox',{name:'Status'}).selectOption('doing');
  await dialog.getByRole('button',{name:'Karte speichern'}).click();
  await expect(card).toBeFocused();
  await page.getByRole('button',{name:'Ansicht aktualisieren'}).press('Enter');
  await expect(doing.getByRole('button',{name:/Montage gleich Z/})).toBeFocused();
  await expect(doing.locator('.task-card strong')).toHaveText(['Montage läuft früh','Montage gleich Z','Montage läuft spät']);
});

test.describe('Terminsortierung auf dem Smartphone',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:844}});
  test('Nach der Rückkehr zu Standard lässt sich die Position per Touch speichern',async({page})=>{
    const {board,sort,todo}=await fixture(page);
    await sort.selectOption('due');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(0);
    await sort.selectOption('standard');
    await todo.getByRole('button',{name:'Verschieben',exact:true}).first().tap();
    const dialog=page.getByRole('dialog',{name:'Karte verschieben'});
    await dialog.getByRole('combobox',{name:'Zielposition'}).selectOption({label:'Ans Spaltenende'});
    await dialog.getByRole('button',{name:'Karte verschieben'}).tap();
    const titles=todo.locator('.task-card strong');
    await expect(titles.last()).toHaveText('Montage spät');
    await page.reload();
    await expect(titles.last()).toHaveText('Montage spät');
  });
});
