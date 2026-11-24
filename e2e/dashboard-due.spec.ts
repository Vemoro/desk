import { expect, test } from '@playwright/test';
import { signIn } from './session';

test.use({timezoneId:'America/Los_Angeles'});

test('Übersicht priorisiert offene Aufgaben aktiver Projekte vor dem Zehnerlimit',async({page})=>{
  await page.clock.setFixedTime(new Date('2028-05-18T01:00:00Z'));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'active',name:'Montage im Musterbüro',stage:'confirmed'},
    {id:'closed',name:'Abgerechnetes Projekt',stage:'complete'},
    {id:'cancelled',name:'Abgesagtes Projekt',stage:'cancelled'},
  ]}));
  const overdue='2028-05-16T00:00:00.000Z';
  let tasks=[
    ...Array.from({length:10},(_,index)=>({id:`excluded-${index}`,name:`Abgerechnet ${index}`,project_id:'closed',status:'todo',due:'2028-05-15'})),
    {id:'cancelled',name:'Abgesagte Aufgabe',project_id:'cancelled',status:'todo',due:overdue},
    {id:'future',name:'Materialrückgabe planen',project_id:'active',status:'todo',due:'2028-05-18'},
    {id:'old',name:'Material vorbereiten',project_id:'active',status:'todo',due:overdue},
    {id:'equal',name:'Werkzeug bereitlegen',project_id:'active',status:'doing',due:overdue},
    {id:'done',name:'Erledigte Aufgabe',project_id:'active',status:'done',due:overdue},
    {id:'today',name:'Team einweisen',project_id:'active',status:'todo',due:'2028-05-17T00:00:00.000Z'},
    {id:'no-due',name:'Aufgabe ohne Termin',project_id:'active',status:'todo',due:null},
    ...Array.from({length:7},(_,index)=>({id:`future-${index}`,name:`Folgeaufgabe ${index}`,project_id:'active',status:'todo',due:'2028-05-19'})),
  ];
  await page.route('**/api/v1/tasks?*',route=>route.fulfill({json:tasks}));
  await signIn(page);
  const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben'})});
  const rows=panel.getByRole('row').filter({has:page.getByRole('button',{name:'Montage im Musterbüro'})});
  await expect(rows).toHaveCount(10);
  await expect(rows.nth(0)).toContainText('Material vorbereiten');
  await expect(rows.nth(1)).toContainText('Werkzeug bereitlegen');
  await expect(rows.nth(0)).toContainText('16.05.2028');
  await expect(rows.nth(0)).toContainText('Überfällig');
  await expect(rows.nth(2)).toContainText('Team einweisen');
  await expect(rows.nth(2)).toContainText('Heute');
  await expect(rows.nth(3)).toContainText('Materialrückgabe planen');
  await expect(panel.getByText('Folgeaufgabe 6')).toHaveCount(0);
  await expect(panel.getByText(/Abgerechnet|Abgesagte|Erledigte|Aufgabe ohne Termin/)).toHaveCount(0);
  await rows.first().getByRole('button',{name:'Montage im Musterbüro'}).click();
  await expect(page.getByRole('heading',{name:'Montage im Musterbüro',exact:true})).toBeVisible();

  tasks=[];
  await page.goto('/');
  await expect(panel.getByText('Keine offenen Aufgaben mit Termin.')).toBeVisible();
});
