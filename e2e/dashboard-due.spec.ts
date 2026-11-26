import { expect, test } from '@playwright/test';
import { kanbanTaskResponse, projectResponse } from '../src/server/contracts';
import { signIn } from './session';

test.use({timezoneId:'America/Los_Angeles'});

test('Fällige Aufgaben aktiver Projekte sind vor dem Zehnerlimit nach Termin sortiert',async({page})=>{
  await page.clock.install({time:new Date('2028-05-18T06:58:55Z')});
  await page.clock.pauseAt(new Date('2028-05-18T06:59:00Z'));
  const fixtureId=(number:number)=>`61000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
  const [active,second,closed,cancelled]=[1,2,3,4].map(fixtureId);
  const projects=projectResponse.array().parse([
    {id:active,name:'Montage im Musterbüro',stage:'confirmed'},
    {id:second,name:'Werkstatt des Musterbüros',stage:'planning'},
    {id:closed,name:'Abgerechnetes Projekt',stage:'complete'},
    {id:cancelled,name:'Abgesagtes Projekt',stage:'cancelled'},
  ].map(project=>({
    ...project,contact_id:fixtureId(5),notes:'',due:null,offer_ref:'',invoice_ref:'',
    external_link:'',communication_note:'',haben_offer_id:null,haben_offer:null,cost_center:'',zammad_ticket_id:null,
  })));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:projects}));
  const task=(number:number,name:string,project_id:string,day:string|null,status='todo')=>({
    id:fixtureId(number),name,project_id,status,due:day&&`2028-05-${day}T00:00:00.000Z`,assignee_id:null,kanban_position:number,
  });
  let tasks=kanbanTaskResponse.array().parse([
    ...Array.from({length:10},(_,index)=>task(20+index,`Abgerechnet ${index}`,closed,'15')),
    task(30,'Abgesagte Aufgabe',cancelled,'16'),
    task(31,'Ergebnis dokumentieren',active,'20'),
    task(32,'Materialrückgabe planen',active,'18'),
    task(34,'Werkzeug bereitlegen',second,'16','doing'),
    task(33,'Werkzeug bereitlegen',active,'16'),
    task(35,'Material vorbereiten',active,'16'),
    task(36,'Zugang abstimmen',active,'14'),
    task(37,'Erledigte Aufgabe',active,'16','done'),
    task(38,'Team einweisen',active,'17'),
    task(39,'Aufgabe ohne Termin',active,null),
    ...Array.from({length:7},(_,index)=>task(40+index,`Folgeaufgabe ${index}`,active,'19')),
  ]);
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

  await page.clock.fastForward(60_000);
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
