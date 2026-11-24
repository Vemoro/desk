import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Zuständigkeit wird vor der Begrenzung auf zehn Aufgaben gewählt',async({page})=>{
  let currentId='';
  let includeUnassigned=true;
  await page.route('**/api/v1/me',async route=>{
    const actual=await route.fetch();
    if(actual.ok()) currentId=(await actual.json()).id;
    await route.fulfill({response:actual});
  });
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'open',name:'Montage im Musterbüro',stage:'confirmed'},
    {id:'closed',name:'Abgerechnete Montage',stage:'complete'},
  ]}));
  await page.route('**/api/v1/tasks?*',route=>{
    expect(currentId).toBeTruthy();
    return route.fulfill({json:[
      ...Array.from({length:10},(_,index)=>({id:`other-${index}`,name:`Material prüfen ${index}`,project_id:'open',status:'todo',due:'2028-05-10',assignee_id:'anderer'})),
      {id:'own-later',name:'Eigener Aufbau',project_id:'open',status:'doing',due:'2028-05-18',assignee_id:currentId},
      ...(includeUnassigned ? [{id:'unassigned',name:'Unzugeordnete Lieferung',project_id:'open',status:'todo',due:'2028-05-16',assignee_id:null}] : []),
      {id:'own-earlier',name:'Eigene Vorbereitung',project_id:'open',status:'todo',due:'2028-05-17',assignee_id:currentId},
      {id:'own-done',name:'Schon erledigt',project_id:'open',status:'done',due:'2028-05-09',assignee_id:currentId},
      {id:'own-closed',name:'Schon abgerechnet',project_id:'closed',status:'todo',due:'2028-05-09',assignee_id:currentId},
    ]});
  });
  await signIn(page);
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben'})});
  const tasks=panel.getByRole('row').filter({has:page.getByRole('button',{name:'Montage im Musterbüro'})});
  await expect(tasks).toHaveCount(10);
  await expect(panel.getByText('Eigener Aufbau')).toHaveCount(0);
  const filter=panel.getByRole('combobox',{name:'Zuständigkeit'});
  await expect(filter).toHaveValue('all');
  await filter.selectOption({label:'Mir zugeordnet'});
  await expect(tasks).toHaveCount(2);
  await expect(tasks.nth(0)).toContainText('Eigene Vorbereitung');
  await expect(tasks.nth(1)).toContainText('Eigener Aufbau');
  await expect(panel.getByText(/Schon erledigt|Schon abgerechnet/)).toHaveCount(0);
  await filter.selectOption({label:'Ohne Zuständigkeit'});
  await expect(tasks).toHaveCount(1);
  await expect(tasks.first()).toContainText('Unzugeordnete Lieferung');
  await filter.selectOption({label:'Alle'});
  await expect(tasks).toHaveCount(10);

  includeUnassigned=false;
  await page.reload();
  await filter.selectOption({label:'Ohne Zuständigkeit'});
  await expect(panel.getByText('Keine offenen Aufgaben mit Termin für diese Zuständigkeit.')).toBeVisible();
});
