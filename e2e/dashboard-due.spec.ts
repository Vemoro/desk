import { expect, test } from '@playwright/test';
import { signIn } from './session';

test.use({timezoneId:'America/Los_Angeles'});

test('Fällige Aufgaben aktiver Projekte sind vor dem Zehnerlimit nach Termin sortiert',async({page})=>{
  await page.clock.install({time:new Date('2028-05-18T06:59:00Z')});
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'active',name:'Montage im Musterbüro',stage:'confirmed'},
    {id:'second',name:'Werkstatt des Musterbüros',stage:'planning'},
    {id:'closed',name:'Abgerechnetes Projekt',stage:'complete'},
    {id:'cancelled',name:'Abgesagtes Projekt',stage:'cancelled'},
  ]}));
  const overdue='2028-05-16T00:00:00.000Z';
  let tasks=[
    ...Array.from({length:10},(_,index)=>({id:`excluded-${index}`,name:`Abgerechnet ${index}`,project_id:'closed',status:'todo',due:'2028-05-15'})),
    {id:'cancelled',name:'Abgesagte Aufgabe',project_id:'cancelled',status:'todo',due:overdue},
    {id:'later',name:'Ergebnis dokumentieren',project_id:'active',status:'todo',due:'2028-05-20'},
    {id:'future',name:'Materialrückgabe planen',project_id:'active',status:'todo',due:'2028-05-18'},
    {id:'equal-b',name:'Werkzeug bereitlegen',project_id:'second',status:'doing',due:overdue},
    {id:'equal-a',name:'Werkzeug bereitlegen',project_id:'active',status:'todo',due:'2028-05-16'},
    {id:'old',name:'Material vorbereiten',project_id:'active',status:'todo',due:overdue},
    {id:'older',name:'Zugang abstimmen',project_id:'active',status:'todo',due:'2028-05-14'},
    {id:'done',name:'Erledigte Aufgabe',project_id:'active',status:'done',due:overdue},
    {id:'today',name:'Team einweisen',project_id:'active',status:'todo',due:'2028-05-17T00:00:00.000Z'},
    {id:'no-due',name:'Aufgabe ohne Termin',project_id:'active',status:'todo',due:null},
    ...Array.from({length:7},(_,index)=>({id:`future-${index}`,name:`Folgeaufgabe ${index}`,project_id:'active',status:'todo',due:'2028-05-19'})),
  ];
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({json:tasks}));
  await signIn(page);
  const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben',exact:true})});
  const rows=panel.getByRole('row').filter({has:page.getByRole('cell')});
  await expect(rows).toHaveCount(10);
  await expect(rows.nth(0)).toContainText('Zugang abstimmen');
  await expect(rows.nth(1)).toContainText('Material vorbereiten');
  await expect(rows.nth(2)).toContainText('Werkzeug bereitlegen');
  await expect(rows.nth(2)).toContainText('Montage im Musterbüro');
  await expect(rows.nth(3)).toContainText('Werkzeug bereitlegen');
  await expect(rows.nth(3)).toContainText('Werkstatt des Musterbüros');
  await expect(rows.nth(1)).toContainText('16.05.2028');
  await expect(rows.nth(1)).toContainText('Überfällig');
  const today=rows.filter({hasText:'Team einweisen'});
  const nextDay=rows.filter({hasText:'Materialrückgabe planen'});
  await expect(rows.nth(4)).toContainText('Team einweisen');
  await expect(rows.nth(5)).toContainText('Materialrückgabe planen');
  await expect(rows.nth(6)).toContainText('Folgeaufgabe 0');
  await expect(today).toContainText('17.05.2028');
  await expect(today).toContainText('Heute');
  await expect(nextDay).toContainText('18.05.2028');
  await expect(nextDay).not.toContainText(/Heute|Überfällig/);
  await expect(panel.getByText(/Abgerechnet|Abgesagte|Erledigte|Aufgabe ohne Termin|Ergebnis dokumentieren|Folgeaufgabe 4/)).toHaveCount(0);

  await page.clock.fastForward(70_000);
  await expect(today).toContainText('Überfällig');
  await expect(today).toContainText('17.05.2028');
  await expect(nextDay).toContainText('Heute');
  await expect(nextDay).toContainText('18.05.2028');

  await rows.first().getByRole('button',{name:'Montage im Musterbüro'}).press('Enter');
  await expect(page.getByRole('heading',{name:'Montage im Musterbüro',exact:true})).toBeVisible();

  tasks=[];
  await page.goto('/');
  await expect(panel.getByText('Keine offenen Aufgaben mit Termin.')).toBeVisible();
});
