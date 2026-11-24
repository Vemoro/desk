import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Kennzahl zählt alle überfälligen Aufgaben aktiver Projekte und folgt Mitternacht',async({page})=>{
  await page.clock.install({time:new Date('2028-05-17T21:59:00Z')});
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'active',name:'Montage im Musterbüro',stage:'running'},
    {id:'complete',name:'Abgerechneter Auftrag',stage:'complete'},
    {id:'cancelled',name:'Abgesagter Auftrag',stage:'cancelled'},
  ]}));
  await page.route('**/api/v1/tasks?*',route=>{
    const task={project_id:'active',status:'todo',due:'2028-05-16'};
    return route.fulfill({json:[
      ...Array.from({length:11},(_,i)=>({...task,id:`late-${i}`,name:`Materialaufgabe ${i+1}`})),
      {...task,id:'today',name:'Heutige Aufgabe',due:'2028-05-17'},
      {...task,id:'future',name:'Spätere Aufgabe',due:'2028-05-19'},
      {...task,id:'none',name:'Aufgabe ohne Datum',due:null},
      {...task,id:'done',name:'Erledigte Aufgabe',status:'done'},
      {...task,id:'closed',name:'Aufgabe am abgerechneten Projekt',project_id:'complete'},
      {...task,id:'cancelled',name:'Aufgabe am abgesagten Projekt',project_id:'cancelled'},
    ]});
  });
  await signIn(page);
  const metric=page.locator('.metric').filter({has:page.getByText('Überfällige Aufgaben',{exact:true})});
  await expect(metric.locator('strong')).toHaveText('11');
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben'})});
  const rows=panel.locator('tbody tr');
  await expect(rows).toHaveCount(10);
  await panel.getByLabel('Termin filtern').selectOption({label:'Heute'});
  await expect(rows).toHaveCount(1);
  await expect(metric.locator('strong')).toHaveText('11');
  await panel.getByLabel('Zuständigkeit').selectOption({label:'Mir zugeordnet'});
  await expect(rows).toHaveCount(0);
  await expect(metric.locator('strong')).toHaveText('11');
  await page.clock.fastForward(70_000);
  await expect(metric.locator('strong')).toHaveText('12');
  await expect(rows).toHaveCount(0);
});
