import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

async function fixture(page:Page) {
  await page.clock.setFixedTime(new Date('2028-05-17T12:00:00+02:00'));
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const contacts=await (await page.request.get('/api/v1/contacts')).json();
  const users=await (await page.request.get('/api/v1/users')).json();
  const other=users.find((user:{name:string})=>user.name==='Noah Beispiel');
  async function add(resource:string,data:unknown) {
    const response=await page.request.post('/api/v1/'+resource,{headers:{Origin:origin},data});
    expect(response.status()).toBe(201);
    return response.json();
  }
  const project=await add('projects',{name:'Muster Filterreset '+crypto.randomUUID(),contact_id:contacts[0].id});
  for(const [name,status,due,assignee] of [
    ['Material spät','todo','2028-05-18',null],['Material früh','todo','2028-05-15',null],
    ['Netz prüfen','todo','2028-05-16',null],['Material vergeben','todo','2028-05-16',other.id],
    ['Geräte montieren','doing','2028-05-17',null],['Anfahrt abstimmen','doing','2028-05-14',null],
  ]) await add('tasks',{project_id:project.id,name,status,due,assignee_id:assignee});
  await page.reload();
  await page.goto('/#projects/'+project.id+'/tasks');
  const board=page.getByRole('region',{name:'Kanban',exact:true});
  const cards=board.locator('.task-card strong');
  await expect(cards).toHaveCount(6);
  return {board,cards,search:page.getByRole('searchbox',{name:'Aufgaben suchen'}),
    assignee:page.getByRole('combobox',{name:'Aufgaben anzeigen'}),date:page.getByRole('combobox',{name:'Aufgabentermine filtern'}),
    sort:page.getByRole('combobox',{name:'Aufgaben sortieren'}),reset:page.getByRole('button',{name:'Filter zurücksetzen',exact:true})};
}

test('Gemeinsames Zurücksetzen erhält Sortierung und Positionen',async({page})=>{
  const {board,cards,search,assignee,date,sort,reset}=await fixture(page);
  const requests:string[]=[];
  const snapshot=await (await page.request.get('/api/v1/tasks/kanban')).json();
  page.on('request',request=>{
    if(new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request.method()+' '+request.url());
  });
  await expect(reset).toBeDisabled();
  await sort.selectOption('due');
  await expect(reset).toBeDisabled();
  await search.fill('Material');
  await assignee.selectOption('unassigned');
  await date.selectOption('overdue');
  await expect(cards).toHaveText(['Material früh']);
  await expect(page.getByRole('status').filter({hasText:/^1 Aufgabe$/})).toBeVisible();
  await reset.press('Enter');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(assignee).toHaveValue('all');
  await expect(date).toHaveValue('all');
  await expect(sort).toHaveValue('due');
  await expect(cards).toHaveText(['Material früh','Netz prüfen','Material vergeben','Material spät','Anfahrt abstimmen','Geräte montieren']);
  await expect(page.getByRole('status').filter({hasText:/^6 Aufgaben$/})).toBeVisible();
  await expect(page.getByText('Zum Umordnen wähle „Standard“.')).toBeVisible();
  await expect(reset).toBeDisabled();
  await expect(board.getByRole('button',{name:'Verschieben',exact:true})).toHaveCount(0);
  await expect(board.locator('article[draggable="true"]')).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(await (await page.request.get('/api/v1/tasks/kanban')).json()).toEqual(snapshot);
});

test('Einzelfilter, Leerzustände und reine Leerzeichen lassen sich zurücksetzen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const {board,cards,search,assignee,date,reset}=await fixture(page);
  const move=board.getByRole('button',{name:'Verschieben',exact:true});
  const draggable=board.locator('article[draggable="true"]');
  await expect(reset).toBeDisabled();
  await search.fill('  ');
  await expect(cards).toHaveCount(6);
  await expect(move).toHaveCount(6);
  await expect(draggable).toHaveCount(6);
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(reset).toBeDisabled();

  await search.fill('Fehlender Titel');
  await expect(page.getByText('Keine Aufgaben für diese Suche.')).toBeVisible();
  await reset.click();
  await expect(cards).toHaveCount(6);
  await assignee.selectOption('me');
  await expect(page.getByText('Keine Aufgaben für diesen Filter.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Alle anzeigen',exact:true})).toHaveCount(0);
  await reset.click();
  await expect(assignee).toHaveValue('all');
  await expect(cards).toHaveCount(6);
  await date.selectOption('today');
  await expect(cards).toHaveText(['Geräte montieren']);
  await expect(move).toHaveCount(0);
  await reset.click();
  await expect(date).toHaveValue('all');
  await expect(search).toBeFocused();
  await expect(move).toHaveCount(6);
  await expect(draggable).toHaveCount(6);
});
