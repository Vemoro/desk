import { expect, test, type Request } from '@playwright/test';
import { kanbanTaskResponse, projectResponse } from '../src/server/contracts';
import { signIn } from './session';

test.use({timezoneId:'Europe/Berlin'});

test('Die Übersicht zählt alle Treffer vor dem Limit und aktualisiert sie um lokale Mitternacht',async({page})=>{
  await page.clock.install({time:new Date('2028-05-17T21:59:00Z')});
  await page.clock.pauseAt(new Date('2028-05-17T21:59:20Z'));
  await signIn(page);
  const me=await (await page.request.get('/api/v1/me')).json();
  const users=await (await page.request.get('/api/v1/users')).json();
  const colleague=users.find((user:{id:string})=>user.id!==me.id);
  const id=(number:number)=>`64000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
  const [active,closed,cancelled]=[1,2,3].map(id);
  const projects=projectResponse.array().parse([
    {id:active,name:'Montage im Musterbüro',stage:'confirmed'},
    {id:closed,name:'Abgerechnete Montage',stage:'complete'},
    {id:cancelled,name:'Abgesagte Montage',stage:'cancelled'},
  ].map(project=>({...project,contact_id:id(5),notes:'',due:null,offer_ref:'',invoice_ref:'',
    external_link:'',communication_note:'',haben_offer_id:null,haben_offer:null,cost_center:'',zammad_ticket_id:null})));
  const task=(number:number,name:string,day:string|null,assignee_id:string|null,project_id=active,status='todo')=>({
    id:id(number),name,project_id,status,due:day && `2028-05-${day}T00:00:00.000Z`,assignee_id,kanban_position:number,
  });
  const tasks=kanbanTaskResponse.array().parse([
    ...Array.from({length:10},(_,index)=>task(20+index,`Montageaufgabe ${index}`,'17',null)),
    ...Array.from({length:3},(_,index)=>task(40+index,`Eigene Vorbereitung ${index}`,'17',me.id)),
    task(50,'Anderweitig zugeordnet','17',colleague.id),
    task(51,'Abnahme vorbereiten','18',me.id),
    task(52,'Material zurückgeben','18',me.id),
    task(53,'Lieferung annehmen','18',null),
    task(60,'Heute erledigt','17',me.id,active,'done'),
    task(61,'Heute abgerechnet','17',me.id,closed),
    task(62,'Heute abgesagt','17',me.id,cancelled),
    task(63,'Aufgabe ohne Termin',null,me.id),
  ]);
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:projects}));
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({json:tasks}));
  await page.reload();
  const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben',exact:true})});
  const count=panel.getByRole('status');
  const rows=panel.getByRole('row').filter({has:page.getByRole('cell')});
  const period=panel.getByRole('combobox',{name:'Aufgabentermine filtern'});
  const assignee=panel.getByRole('combobox',{name:'Aufgaben anzeigen'});
  await expect(count).toHaveText('10 von 17 Aufgaben angezeigt');
  await expect(rows).toHaveCount(10);
  const requests:string[]=[];
  const track=(request:Request)=>{
    if(new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request.url());
  };
  page.on('request',track);
  await period.selectOption('today');
  await expect(count).toHaveText('10 von 14 Aufgaben angezeigt');
  await expect(rows).toHaveCount(10);
  await assignee.selectOption('unassigned');
  await expect(count).toHaveText('10 Aufgaben');
  await expect(rows).toHaveCount(10);
  await period.selectOption('later');
  await expect(count).toHaveText('1 Aufgabe');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Lieferung annehmen');
  await period.selectOption('overdue');
  await expect(count).toHaveText('Keine offenen Aufgaben für diese Filter.');
  await expect(rows).toHaveCount(0);

  await period.selectOption('today');
  await assignee.selectOption('me');
  await expect(count).toHaveText('3 Aufgaben');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('Eigene Vorbereitung 0');
  await page.clock.fastForward(45_000);
  await expect(period).toHaveValue('today');
  await expect(assignee).toHaveValue('me');
  await expect(count).toHaveText('2 Aufgaben');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Abnahme vorbereiten');
  await expect(rows.last()).toContainText('Material zurückgeben');
  await expect(panel.getByText(/Eigene Vorbereitung|Heute erledigt|Heute abgerechnet|Heute abgesagt|Aufgabe ohne Termin/)).toHaveCount(0);
  expect(requests).toEqual([]);
  page.off('request',track);
});
