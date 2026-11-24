import { test, expect } from '@playwright/test';
import { signIn, project } from './session';

test('Kanban sortiert pro Spalte stabil nach Fälligkeit und Statuswechsel',async({page})=>{
  const projectRow={id:'p1',name:'Musterinstallation',stage:'planning'};
  const tasks=[
    {id:'late',name:'Material spät',status:'todo',due:'2028-04-18',project_id:'p1'},
    {id:'none',name:'Material ohne Termin',status:'todo',due:null,project_id:'p1'},
    {id:'a',name:'Material früh A',status:'todo',due:'2028-04-15',project_id:'p1'},
    {id:'b',name:'Material früh B',status:'todo',due:'2028-04-15',project_id:'p1'},
    {id:'active',name:'Material bereit',status:'doing',due:'2028-04-14',project_id:'p1'},
    {id:'other',name:'Termin klären',status:'todo',due:'2028-04-13',project_id:'p1'},
    {id:'assigned',name:'Material vergeben',status:'todo',due:'2028-04-12',project_id:'p1',assignee_id:'person'},
  ];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[projectRow]}));
  await page.route('**/api/v1/tasks?*',route=>route.fulfill({json:tasks}));
  await page.route('**/api/v1/tasks/late',route=>{
    expect(route.request().postDataJSON()).toEqual({status:'doing'});
    tasks[0].status='doing';
    return route.fulfill({json:tasks[0]});
  });
  await signIn(page);
  await project(page,projectRow.name);
  await page.getByRole('button',{name:'Kanban',exact:true}).click();
  const sort=page.getByRole('combobox',{name:'Aufgaben sortieren'});
  const open=page.locator('.board-column').filter({has:page.getByRole('heading',{name:/^Offen /})});
  const doing=page.locator('.board-column').filter({has:page.getByRole('heading',{name:/^In Arbeit /})});
  const cards=(column:typeof open)=>column.locator('article strong');
  await page.getByRole('searchbox',{name:'Aufgabentitel suchen'}).fill('Material');
  await page.getByRole('combobox',{name:'Aufgaben anzeigen'}).selectOption({label:'Ohne Zuständigkeit'});
  await expect(cards(open)).toHaveText(['Material spät','Material ohne Termin','Material früh A','Material früh B']);
  await sort.selectOption({label:'Frühester Termin zuerst'});
  await expect(cards(open)).toHaveText(['Material früh A','Material früh B','Material spät','Material ohne Termin']);
  await open.getByRole('combobox',{name:'Status für Material spät'}).selectOption('doing');
  await expect(cards(doing)).toHaveText(['Material bereit','Material spät']);
  await expect(cards(open)).toHaveText(['Material früh A','Material früh B','Material ohne Termin']);
  await sort.selectOption({label:'Standard'});
  await expect(cards(open)).toHaveText(['Material ohne Termin','Material früh A','Material früh B']);
  await expect(cards(doing)).toHaveText(['Material spät','Material bereit']);
});
