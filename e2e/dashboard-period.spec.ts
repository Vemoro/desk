import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Termin und Zuständigkeit wirken vor dem Zeilenlimit und folgen lokaler Mitternacht',async({page})=>{
  await page.clock.install({time:new Date('2028-05-17T21:59:00Z')});
  let currentId='';
  await page.route('**/api/v1/me',async route=>{
    const response=await route.fetch();
    if(response.ok()) currentId=(await response.json()).id;
    await route.fulfill({response});
  });
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'muster',name:'Montage im Musterbüro',stage:'confirmed'},
  ]}));
  await page.route('**/api/v1/tasks?*',route=>{
    const task={project_id:'muster',status:'todo'};
    return route.fulfill({json:[
      ...Array.from({length:10},(_,index)=>({...task,id:`old-${index}`,name:`Material alte Planung ${index}`,due:'2028-05-15'})),
      {...task,id:'today-own',name:'Heutige eigene Aufgabe',due:'2028-05-17',assignee_id:currentId},
      {...task,id:'today-other',name:'Heutige fremde Aufgabe',due:'2028-05-17',assignee_id:'anderer'},
      {...task,id:'tomorrow-own',name:'Morgige eigene Aufgabe',due:'2028-05-18',assignee_id:currentId},
    ]});
  });
  await signIn(page);
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben'})});
  const period=panel.getByLabel('Termin filtern');
  const assignee=panel.getByLabel('Zuständigkeit');
  const row=(title:string)=>panel.getByRole('row').filter({hasText:title});
  await expect(row('Heutige eigene Aufgabe')).toHaveCount(0);
  await expect(period).toHaveValue('all');
  await period.selectOption({label:'Heute'});
  await expect(row('Heutige eigene Aufgabe')).toContainText('Heute');
  await expect(row('Heutige fremde Aufgabe')).toBeVisible();
  await assignee.selectOption({label:'Mir zugeordnet'});
  await expect(row('Heutige eigene Aufgabe')).toBeVisible();
  await expect(row('Heutige fremde Aufgabe')).toHaveCount(0);
  await expect(row('Morgige eigene Aufgabe')).toHaveCount(0);
  await period.selectOption({label:'Später'});
  await expect(row('Morgige eigene Aufgabe')).toBeVisible();
  await period.selectOption({label:'Überfällig'});
  await expect(panel.getByText('Keine offenen Aufgaben mit Termin für diese Filter.')).toBeVisible();

  await period.selectOption({label:'Heute'});
  await page.clock.fastForward(70_000);
  await expect(row('Morgige eigene Aufgabe')).toContainText('Heute');
  await expect(row('Heutige eigene Aufgabe')).toHaveCount(0);
  await period.selectOption({label:'Überfällig'});
  await expect(row('Heutige eigene Aufgabe')).toContainText('Überfällig');
  await expect(row('Morgige eigene Aufgabe')).toHaveCount(0);
});
