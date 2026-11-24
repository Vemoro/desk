import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const projectName='Musterinstallation';
async function openKanban(page:Page){
  const projectRow={id:'reset-board',name:projectName,stage:'planning'};
  const tasks=[
    {id:'later',name:'Material spät',status:'todo',due:'2028-05-18'},
    {id:'early',name:'Material früh',status:'todo',due:'2028-05-15'},
    {id:'notes',name:'Netz prüfen',status:'todo',due:'2028-05-16'},
    {id:'assigned',name:'Material vergeben',status:'todo',due:'2028-05-16',assignee_id:'person'},
    {id:'doing-late',name:'Geräte montieren',status:'doing',due:'2028-05-17'},
    {id:'doing-early',name:'Anfahrt abstimmen',status:'doing',due:'2028-05-14'},
  ].map(task=>({...task,project_id:projectRow.id}));
  await page.clock.setFixedTime(new Date('2028-05-17T12:00:00Z'));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[projectRow]}));
  await page.route('**/api/v1/tasks?*',route=>route.fulfill({json:tasks}));
  await signIn(page);
  await project(page,projectName);
  await page.getByRole('button',{name:'Kanban',exact:true}).click();
  return {
    search:page.getByRole('searchbox',{name:'Aufgabentitel suchen'}),
    assignee:page.getByRole('combobox',{name:'Aufgaben anzeigen'}),
    due:page.getByRole('combobox',{name:'Aufgabentermine filtern'}),
    sort:page.getByRole('combobox',{name:'Aufgaben sortieren'}),
  };
}

test('Kanban setzt die Filter gemeinsam zurück und lässt die Sortierung bestehen',async({page})=>{
  const {search,assignee,due,sort}=await openKanban(page);
  const reset=page.getByRole('button',{name:'Filter zurücksetzen',exact:true});
  const cards=page.locator('.board article strong');
  const open=page.locator('.board-column').filter({has:page.getByRole('heading',{name:/^Offen /})}).locator('article strong');
  const doing=page.locator('.board-column').filter({has:page.getByRole('heading',{name:/^In Arbeit /})}).locator('article strong');
  await expect(reset).toBeDisabled();
  await expect(cards).toHaveCount(6);
  await sort.selectOption('due');
  await expect(reset).toBeDisabled();

  await search.fill('Material');
  await assignee.selectOption('unassigned');
  await due.selectOption('overdue');
  await expect(cards).toHaveText(['Material früh']);
  await reset.click();
  await expect(search).toHaveValue('');
  await expect(assignee).toHaveValue('all');
  await expect(due).toHaveValue('all');
  await expect(sort).toHaveValue('due');
  await expect(open).toHaveText(['Material früh','Netz prüfen','Material vergeben','Material spät']);
  await expect(doing).toHaveText(['Anfahrt abstimmen','Geräte montieren']);
  await expect(reset).toBeDisabled();

  await due.selectOption('today');
  await expect(cards).toHaveText(['Geräte montieren']);
  await reset.click();
  await expect(due).toHaveValue('all');
  await expect(cards).toHaveCount(6);

  await assignee.selectOption('unassigned');
  await expect(cards).toHaveCount(5);
  await reset.click();
  await expect(assignee).toHaveValue('all');
  await expect(cards).toHaveCount(6);

  await search.fill('   ');
  await expect(cards).toHaveCount(6);
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(search).toHaveValue('');
  await expect(reset).toBeDisabled();
  await expect(sort).toHaveValue('due');
});
