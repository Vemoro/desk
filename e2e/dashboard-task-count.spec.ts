import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Übersicht zählt fällige Aufgaben vor dem Limit und aktualisiert die Trefferzahl um Mitternacht',async({page})=>{
  await page.clock.install({time:new Date('2028-05-17T21:59:00Z')});
  let currentId='';
  await page.route('**/api/v1/me',async route=>{
    const response=await route.fetch();
    if(response.ok()) currentId=(await response.json()).id;
    await route.fulfill({response});
  });
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'muster',name:'Montage im Musterbüro',stage:'confirmed'},
    {id:'beendet',name:'Beendetes Projekt',stage:'complete'},
  ]}));
  await page.route('**/api/v1/tasks?*',route=>{
    const day='2028-05-17';
    const task={project_id:'muster',status:'todo'};
    return route.fulfill({json:[
      ...Array.from({length:10},(_,index)=>({...task,id:`free-${index}`,name:`Montageaufgabe ${index+1}`,due:day})),
      ...Array.from({length:3},(_,index)=>({...task,id:`mine-${index}`,name:`Eigene Vorbereitung ${index+1}`,due:day,assignee_id:currentId})),
      {...task,id:'other',name:'Anderweitig zugeordnet',due:day,assignee_id:'anderer'},
      {...task,id:'later-a',name:'Material zurückgeben',due:'2028-05-18',assignee_id:currentId},
      {...task,id:'later-b',name:'Abnahme vorbereiten',due:'2028-05-18',assignee_id:currentId},
      {...task,id:'done',name:'Erledigte Aufgabe',due:day,status:'done'},
      {...task,id:'closed',name:'Aufgabe aus beendetem Projekt',due:day,project_id:'beendet'},
    ]});
  });
  await signIn(page);
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben'})});
  const count=panel.getByRole('status');
  const rows=panel.getByRole('row').filter({has:page.getByRole('button',{name:'Montage im Musterbüro',exact:true})});
  const period=panel.getByLabel('Termin filtern');
  const assignee=panel.getByLabel('Zuständigkeit');
  await expect(count).toHaveText('10 von 16 Aufgaben angezeigt');
  await expect(rows).toHaveCount(10);
  await period.selectOption({label:'Heute'});
  await expect(count).toHaveText('10 von 14 Aufgaben angezeigt');
  await assignee.selectOption({label:'Ohne Zuständigkeit'});
  await expect(count).toHaveText('10 Aufgaben');
  await expect(rows).toHaveCount(10);
  await period.selectOption({label:'Später'});
  await expect(panel.getByText('Keine offenen Aufgaben mit Termin für diese Filter.')).toBeVisible();
  await expect(count).toBeEmpty();
  await expect(rows).toHaveCount(0);

  await period.selectOption({label:'Heute'});
  await assignee.selectOption({label:'Mir zugeordnet'});
  await expect(count).toHaveText('3 Aufgaben');
  await expect(rows).toHaveCount(3);
  await page.clock.fastForward(70_000);
  await expect(count).toHaveText('2 Aufgaben');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Material zurückgeben');
});
