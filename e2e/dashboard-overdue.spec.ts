import { expect, test, type Page, type Request } from '@playwright/test';
import { kanbanTaskResponse, projectResponse } from '../src/server/contracts';
import { signIn } from './session';

async function openDashboard(page:Page, overdue:number) {
  await page.clock.install({time:new Date('2028-05-17T21:59:00Z')});
  await page.clock.pauseAt(new Date('2028-05-17T21:59:20Z'));
  await signIn(page);
  const me=await (await page.request.get('/api/v1/me')).json();
  const id=(number:number)=>`65000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
  const [active,complete,cancelled,missing]=[1,2,3,4].map(id);
  const projects=projectResponse.array().parse([
    {id:active,name:'Montage im Musterbüro',stage:'confirmed'},
    {id:complete,name:'Abgerechnete Montage',stage:'complete'},
    {id:cancelled,name:'Abgesagte Montage',stage:'cancelled'},
  ].map(project=>({...project,contact_id:id(5),notes:'',due:null,offer_ref:'',invoice_ref:'',
    external_link:'',communication_note:'',haben_offer_id:null,haben_offer:null,cost_center:'',zammad_ticket_id:null})));
  const task=(number:number,name:string,day:string|null,project_id=active,status='todo',assignee_id:string|null=me.id)=>({
    id:id(number),name,project_id,status,due:day && `2028-05-${day}T00:00:00.000Z`,assignee_id,kanban_position:number,
  });
  const tasks=kanbanTaskResponse.array().parse([
    ...Array.from({length:overdue},(_,index)=>task(10+index,`Materialaufgabe ${index}`,'16',active,'todo',null)),
    task(30,'Abnahme vorbereiten','17'),
    task(31,'Lieferung annehmen','18'),
    task(32,'Aufgabe ohne Termin',null),
    task(33,'Erledigte Aufgabe','16',active,'done'),
    task(34,'Abgerechnete Aufgabe','16',complete),
    task(35,'Abgesagte Aufgabe','16',cancelled),
    task(36,'Aufgabe ohne geladenes Projekt','16',missing),
  ]);
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:projects}));
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({json:tasks}));
  await page.reload();
  return {
    metric:page.locator('.metric').filter({has:page.getByText('Überfällige Aufgaben',{exact:true})}).locator('strong'),
    panel:page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben',exact:true})}),
  };
}

for(const overdue of [0,1]) {
  test(`Die Kennzahl zeigt ${overdue} überfällige Aufgaben aus aktiven Projekten`,async({page})=>{
    const {metric}=await openDashboard(page,overdue);
    await expect(metric).toHaveText(String(overdue));
  });
}

test('Die Kennzahl zählt vor den Tabellenfiltern und aktualisiert sich um lokale Mitternacht',async({page})=>{
  const {metric,panel}=await openDashboard(page,11);
  const rows=panel.getByRole('row').filter({has:page.getByRole('cell')});
  const period=panel.getByRole('combobox',{name:'Aufgabentermine filtern'});
  const assignee=panel.getByRole('combobox',{name:'Aufgaben anzeigen'});
  await expect(metric).toHaveText('11');
  await expect(rows).toHaveCount(10);
  await expect(panel.getByRole('status')).toHaveText('10 von 13 Aufgaben angezeigt');
  const requests:string[]=[];
  const track=(request:Request)=>{
    if(new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request.url());
  };
  page.on('request',track);

  await period.selectOption('overdue');
  await assignee.selectOption('me');
  await expect(rows).toHaveCount(0);
  await expect(metric).toHaveText('11');
  await period.selectOption('today');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Abnahme vorbereiten');
  await expect(metric).toHaveText('11');

  await expect(page.locator('.metrics').locator('a, button, input, select, textarea, [tabindex]')).toHaveCount(0);
  await assignee.focus();
  await page.keyboard.press('Tab');
  await expect(period).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rows.first().getByRole('button',{name:'Montage im Musterbüro'})).toBeFocused();

  await page.clock.fastForward(45_000);
  await expect(metric).toHaveText('12');
  await expect(period).toHaveValue('today');
  await expect(assignee).toHaveValue('me');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Lieferung annehmen');
  await expect(panel.getByText('Abnahme vorbereiten',{exact:true})).toHaveCount(0);
  expect(requests).toEqual([]);
  page.off('request',track);
});
