import { expect, test, type Request } from '@playwright/test';
import { kanbanTaskResponse, projectResponse } from '../src/server/contracts';
import { signIn } from './session';

test.use({timezoneId:'Europe/Berlin'});

test('Termin und Zuständigkeit wirken vor dem Zeilenlimit und folgen der lokalen Mitternacht',async({page})=>{
  await page.clock.install({time:new Date('2028-05-17T21:59:00Z')});
  await page.clock.pauseAt(new Date('2028-05-17T21:59:20Z'));
  await signIn(page);
  const me=await (await page.request.get('/api/v1/me')).json();
  const users=await (await page.request.get('/api/v1/users')).json();
  const colleague=users.find((user:{id:string})=>user.id!==me.id);
  const id=(number:number)=>`63000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
  const [active,closed]=[1,2].map(id);
  const projects=projectResponse.array().parse([
    {id:active,name:'Montage im Musterbüro',stage:'confirmed'},
    {id:closed,name:'Abgerechnete Montage',stage:'complete'},
  ].map(project=>({...project,contact_id:id(5),notes:'',due:null,offer_ref:'',invoice_ref:'',
    external_link:'',communication_note:'',haben_offer_id:null,haben_offer:null,cost_center:'',zammad_ticket_id:null})));
  const task=(number:number,name:string,day:string|null,assignee_id:string|null,project_id=active,status='todo')=>({
    id:id(number),name,project_id,status,due:day && `2028-05-${day}T00:00:00.000Z`,assignee_id,kanban_position:number,
  });
  const tasks=kanbanTaskResponse.array().parse([
    ...Array.from({length:11},(_,index)=>task(20+index,`Material alte Planung ${index}`,'15',null)),
    task(40,'Eigene heutige Aufgabe','17',me.id),
    task(41,'Fremde heutige Aufgabe','17',colleague.id),
    task(42,'Eigene morgige Aufgabe','18',me.id),
    task(43,'Heute erledigt','17',me.id,active,'done'),
    task(44,'Heute abgerechnet','17',me.id,closed),
    task(45,'Aufgabe ohne Termin',null,me.id),
  ]);
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:projects}));
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({json:tasks}));
  await page.reload();
  const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben',exact:true})});
  const rows=panel.getByRole('row').filter({has:page.getByRole('cell')});
  const period=panel.getByRole('combobox',{name:'Aufgabentermine filtern'});
  const assignee=panel.getByRole('combobox',{name:'Aufgaben anzeigen'});
  const row=(title:string)=>rows.filter({hasText:title});
  await expect(period).toHaveValue('all');
  await expect(rows).toHaveCount(10);
  await expect(row('Eigene heutige Aufgabe')).toHaveCount(0);
  await expect(row('Eigene morgige Aufgabe')).toHaveCount(0);
  const requests:string[]=[];
  const track=(request:Request)=>{
    if(new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request.url());
  };
  page.on('request',track);
  await period.selectOption('overdue');
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText('Überfällig');
  await period.selectOption('today');
  await expect(rows).toHaveCount(2);
  await expect(row('Eigene heutige Aufgabe')).toContainText('17.05.2028');
  await expect(row('Eigene heutige Aufgabe')).toContainText('Heute');
  await expect(row('Fremde heutige Aufgabe')).toBeVisible();
  await expect(panel.getByText(/Heute erledigt|Heute abgerechnet|Aufgabe ohne Termin/)).toHaveCount(0);
  await assignee.selectOption('me');
  await expect(row('Eigene heutige Aufgabe')).toBeVisible();
  await expect(row('Fremde heutige Aufgabe')).toHaveCount(0);
  await expect(row('Eigene morgige Aufgabe')).toHaveCount(0);
  await period.selectOption('later');
  await expect(row('Eigene morgige Aufgabe')).toBeVisible();
  await expect(row('Eigene morgige Aufgabe')).not.toContainText(/Heute|Überfällig/);
  await period.selectOption('overdue');
  await expect(panel.getByText('Keine offenen Aufgaben für diese Filter.')).toBeVisible();
  await period.press('Home');
  await expect(period).toHaveValue('all');
  await expect(period).toBeFocused();
  await expect(rows).toHaveCount(2);
  await period.selectOption('today');
  await page.clock.fastForward(45_000);
  await expect(period).toHaveValue('today');
  await expect(assignee).toHaveValue('me');
  await expect(row('Eigene morgige Aufgabe')).toContainText('18.05.2028');
  await expect(row('Eigene morgige Aufgabe')).toContainText('Heute');
  await expect(row('Eigene heutige Aufgabe')).toHaveCount(0);
  await period.selectOption('overdue');
  await expect(row('Eigene heutige Aufgabe')).toContainText('17.05.2028');
  await expect(row('Eigene heutige Aufgabe')).toContainText('Überfällig');
  await expect(row('Eigene morgige Aufgabe')).toHaveCount(0);
  expect(requests).toEqual([]);
  page.off('request',track);
});
