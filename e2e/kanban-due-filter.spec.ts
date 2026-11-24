import { test, expect } from '@playwright/test';
import { signIn, project } from './session';

test.use({timezoneId:'Europe/Berlin'});

test('Kanban grenzt Fälligkeiten im lokalen Kalender ein',async({page})=>{
  const projectRow={id:'date-project',name:'Musterinstallation',stage:'planning'};
  const otherProject={id:'other-project',name:'Musterbetreuung',stage:'planning'};
  const tasks=[
    {id:'yesterday',name:'Material vorbereiten',status:'todo',due:'2028-05-16',project_id:projectRow.id},
    {id:'older',name:'Material inventarisieren',status:'todo',due:'2028-05-15',project_id:projectRow.id},
    {id:'assigned',name:'Material transportieren',status:'doing',due:'2028-05-16',project_id:projectRow.id,assignee_id:'other-person'},
    {id:'notes',name:'Notizen abgleichen',status:'review',due:'2028-05-16',project_id:projectRow.id},
    {id:'done',name:'Schlüssel abholen',status:'done',due:'2028-05-16',project_id:projectRow.id},
    {id:'open-today',name:'Material prüfen',status:'review',due:'2028-05-17',project_id:projectRow.id},
    {id:'done-today',name:'Lieferung annehmen',status:'done',due:'2028-05-17',project_id:projectRow.id},
    {id:'tomorrow',name:'Geräte montieren',status:'todo',due:'2028-05-18',project_id:projectRow.id},
    {id:'no-date',name:'Lageplan anfordern',status:'todo',due:null,project_id:projectRow.id},
    {id:'done-no-date',name:'Anfrage lesen',status:'done',due:null,project_id:projectRow.id},
    {id:'other-task',name:'Aufbau abstimmen',status:'todo',due:null,project_id:otherProject.id},
  ];
  await page.clock.install({time:new Date('2028-05-17T21:59:00Z')});
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[projectRow,otherProject]}));
  await page.route('**/api/v1/tasks?*',route=>route.fulfill({json:tasks}));
  await page.route('**/api/v1/tasks/yesterday',route=>{
    expect(route.request().postDataJSON()).toEqual({status:'doing'});
    const task=tasks.find(task=>task.id==='yesterday')!;
    task.status='doing';
    return route.fulfill({json:task});
  });
  await signIn(page);
  await project(page,projectRow.name);
  await page.getByRole('button',{name:'Kanban',exact:true}).click();

  const dateFilter=page.getByRole('combobox',{name:'Aufgabentermine filtern'});
  const search=page.getByRole('searchbox',{name:'Aufgabentitel suchen'});
  const assignee=page.getByRole('combobox',{name:'Aufgaben anzeigen'});
  const cards=page.locator('.board article strong');
  const open=page.locator('.board-column').filter({has:page.getByRole('heading',{name:/^Offen /})});
  const doing=page.locator('.board-column').filter({has:page.getByRole('heading',{name:/^In Arbeit /})});
  await expect(dateFilter).toHaveValue('all');
  await expect(cards).toHaveCount(10);

  await dateFilter.selectOption({label:'Überfällig'});
  await expect(cards).toHaveText(['Material vorbereiten','Material inventarisieren','Material transportieren','Notizen abgleichen']);
  await search.fill('Schlüssel');
  await expect(page.getByText('Keine Aufgaben für diese Filter.',{exact:true})).toBeVisible();
  await search.fill('Material');
  await assignee.selectOption({label:'Ohne Zuständigkeit'});
  await page.getByRole('combobox',{name:'Aufgaben sortieren'}).selectOption({label:'Frühester Termin zuerst'});
  await expect(cards).toHaveText(['Material inventarisieren','Material vorbereiten']);
  await open.getByRole('combobox',{name:'Status für Material vorbereiten'}).selectOption('doing');
  await expect(doing.locator('article strong')).toHaveText(['Material vorbereiten']);
  await expect(open.locator('article strong')).toHaveText(['Material inventarisieren']);

  await search.fill('');
  await assignee.selectOption({label:'Alle'});
  await dateFilter.selectOption({label:'Ohne Termin'});
  await expect(cards).toHaveText(['Lageplan anfordern','Anfrage lesen']);
  await dateFilter.selectOption({label:'Heute'});
  await expect(cards).toHaveText(['Material prüfen','Lieferung annehmen']);
  await page.clock.fastForward(70_000);
  await expect(dateFilter).toHaveValue('today');
  await expect(cards).toHaveText(['Geräte montieren']);

  await project(page,otherProject.name);
  await page.getByRole('button',{name:'Kanban',exact:true}).click();
  await expect(dateFilter).toHaveValue('all');
  await expect(cards).toHaveText(['Aufbau abstimmen']);
});
