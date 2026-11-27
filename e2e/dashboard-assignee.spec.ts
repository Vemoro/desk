import { expect, test } from '@playwright/test';
import { kanbanTaskResponse, projectResponse } from '../src/server/contracts';
import { signIn } from './session';

test('Die Übersicht filtert nach Konto-ID vor der Zehn-Zeilen-Grenze',async({page})=>{
  await page.clock.setFixedTime(new Date('2028-05-17T12:00:00+02:00'));
  await signIn(page);
  const me=await (await page.request.get('/api/v1/me')).json();
  const users=await (await page.request.get('/api/v1/users')).json();
  const colleague=users.find((user:{id:string})=>user.id!==me.id);
  const id=(number:number)=>`62000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
  const [active,second,closed,cancelled]=[1,2,3,4].map(id);
  const projects=projectResponse.array().parse([
    {id:active,name:'Montage im Musterbüro',stage:'confirmed'},
    {id:second,name:'Lager im Musterbüro',stage:'planning'},
    {id:closed,name:'Abgerechnete Montage',stage:'complete'},
    {id:cancelled,name:'Abgesagte Montage',stage:'cancelled'},
  ].map(project=>({...project,contact_id:id(5),notes:'',due:null,offer_ref:'',invoice_ref:'',
    external_link:'',communication_note:'',haben_offer_id:null,haben_offer:null,cost_center:'',zammad_ticket_id:null})));
  const task=(number:number,name:string,projectId:string,day:string|null,assignee_id:string|null,status='todo')=>({
    id:id(number),name,project_id:projectId,status,due:day && `2028-05-${day}T00:00:00.000Z`,assignee_id,kanban_position:number,
  });
  let tasks=kanbanTaskResponse.array().parse([
    ...Array.from({length:10},(_,index)=>task(20+index,`Fremde Vorbereitung ${index}`,active,'10',colleague.id)),
    task(30,'Eigene Vorbereitung',active,'17',me.id),
    ...Array.from({length:10},(_,index)=>task(40+index,`Eigener Aufbau ${index}`,second,'18',me.id,'doing')),
    task(60,'Unzugeordnete Lieferung',active,'16',null),
    task(61,'Schon erledigt',active,'09',me.id,'done'),
    task(62,'Schon abgerechnet',closed,'09',me.id),
    task(63,'Schon abgesagt',cancelled,'09',me.id),
    task(64,'Ohne Datum',active,null,me.id),
  ]);
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:projects}));
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({json:tasks}));
  await page.route('**/api/v1/users',route=>route.fulfill({json:users.map((user:{id:string;name:string})=>
    user.id===colleague.id ? {...user,name:me.name} : user)}));
  await page.reload();
  const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben',exact:true})});
  const rows=panel.getByRole('row').filter({has:page.getByRole('cell')});
  const filter=panel.getByRole('combobox',{name:'Aufgaben anzeigen'});
  await expect(filter).toHaveValue('all');
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText('Fremde Vorbereitung 0');
  await expect(rows.first()).toContainText(me.name);
  await expect(panel.getByText('Eigene Vorbereitung')).toHaveCount(0);
  const requests:string[]=[];
  const track=(request:import('@playwright/test').Request)=>{
    if(new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request.url());
  };
  page.on('request',track);
  await filter.selectOption('me');
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText('Eigene Vorbereitung');
  await expect(rows.last()).toContainText('Eigener Aufbau 8');
  await expect(panel.getByText(/Fremde Vorbereitung|Schon erledigt|Schon abgerechnet|Schon abgesagt|Ohne Datum/)).toHaveCount(0);
  await filter.selectOption('unassigned');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Unzugeordnete Lieferung');
  expect(requests).toEqual([]);
  page.off('request',track);
  await rows.first().getByRole('button',{name:'Montage im Musterbüro',exact:true}).press('Enter');
  await expect(page.getByRole('heading',{name:'Montage im Musterbüro',level:1})).toBeVisible();
  await expect(page.getByRole('link',{name:'Überblick',exact:true})).toHaveAttribute('aria-current','page');

  tasks=tasks.filter(task=>task.assignee_id!==null);
  await page.goto('/');
  await expect(filter).toHaveValue('all');
  await filter.selectOption('unassigned');
  await expect(panel.getByText('Keine offenen Aufgaben mit Termin für diese Zuständigkeit.')).toBeVisible();
  await filter.press('Home');
  await expect(filter).toBeFocused();
  await expect(filter).toHaveValue('all');
  await expect(rows).toHaveCount(10);
});
