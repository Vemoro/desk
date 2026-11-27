import { expect, test, type Page, type Request } from '@playwright/test';
import { kanbanTaskResponse, projectResponse } from '../src/server/contracts';
import { signIn } from './session';

async function openDashboard(page:Page, nextTask:boolean) {
  await page.clock.install({time:new Date('2028-05-17T21:59:00Z')});
  await page.clock.pauseAt(new Date('2028-05-17T21:59:20Z'));
  await signIn(page);
  const projects=projectResponse.array().parse(await (await page.request.get('/api/v1/projects?limit=100')).json());
  const project=projects.find(({cost_center})=>cost_center==='K-103');
  if(!project) throw new Error('Das aktive Musterprojekt K-103 fehlt.');
  const task=(number:number,name:string,day:string)=>({
    id:`65000000-0000-4000-8000-${String(number).padStart(12,'0')}`,name,status:'todo',
    project_id:project.id,due:`2028-05-${day}T00:00:00.000Z`,assignee_id:null,kanban_position:number,
  });
  const tasks=kanbanTaskResponse.array().parse([
    task(1,'Lieferzeit bestätigen','17'),
    ...(nextTask ? [task(2,'Materialübergabe prüfen','18')] : []),
  ]);
  await page.route('**/api/v1/tasks/kanban',route=>route.fulfill({json:tasks}));
  await page.reload();
  const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben',exact:true})});
  const period=panel.getByRole('combobox',{name:'Aufgabentermine filtern'});
  const assignee=panel.getByRole('combobox',{name:'Aufgaben anzeigen'});
  const rows=panel.getByRole('row').filter({has:page.getByRole('cell')});
  await assignee.selectOption('unassigned');
  return {period,assignee,rows};
}

const disappearingRows=[
  {period:'today',nextTask:true,old:'Lieferzeit bestätigen',remaining:'Materialübergabe prüfen'},
  {period:'today',nextTask:false,old:'Lieferzeit bestätigen',remaining:null},
  {period:'later',nextTask:true,old:'Materialübergabe prüfen',remaining:null},
] as const;

for(const example of disappearingRows) {
  test(`Tageswechsel erhält den Fokus im Terminfilter (${example.period}, ${example.remaining??'leer'})`,async({page})=>{
    const {period,assignee,rows}=await openDashboard(page,example.nextTask);
    await period.selectOption(example.period);
    const oldRow=rows.filter({hasText:example.old});
    await assignee.focus();
    await page.keyboard.press('Tab');
    await expect(period).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(oldRow.getByRole('button')).toBeFocused();
    const requests:string[]=[];
    const track=(request:Request)=>{
      if(new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request.url());
    };
    page.on('request',track);
    await page.clock.fastForward(45_000);
    await expect(oldRow).toHaveCount(0);
    await expect(period).toBeFocused();
    expect(await period.evaluate(element=>element.matches(':focus-visible'))).toBe(true);
    await expect(period).toHaveValue(example.period);
    await expect(assignee).toHaveValue('unassigned');
    if(example.remaining) {
      const next=rows.filter({hasText:example.remaining}).getByRole('button');
      await page.keyboard.press('Tab');
      await expect(next).toBeFocused();
    } else {
      await expect(rows).toHaveCount(0);
      await page.keyboard.press('Shift+Tab');
      await expect(assignee).toBeFocused();
    }
    expect(requests).toEqual([]);
    page.off('request',track);
  });
}

test('Tageswechsel belässt den Fokus in einer erhaltenen Zeile',async({page})=>{
  const {period,rows}=await openDashboard(page,true);
  await period.focus();
  await page.keyboard.press('Tab');
  const row=rows.filter({hasText:'Lieferzeit bestätigen'});
  const button=row.getByRole('button');
  await expect(button).toBeFocused();
  await page.clock.fastForward(45_000);
  await expect(row.getByText('Überfällig',{exact:true})).toBeVisible();
  await expect(button).toBeFocused();
});

test('Tageswechsel belässt den Fokus außerhalb der Aufgabenliste',async({page})=>{
  const {period,rows}=await openDashboard(page,true);
  await period.selectOption('today');
  const projectList=page.getByRole('button',{name:'Alle Projekte',exact:true});
  await projectList.focus();
  await page.clock.fastForward(45_000);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Materialübergabe prüfen');
  await expect(projectList).toBeFocused();
});
