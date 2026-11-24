import { test, expect } from '@playwright/test';
import { signIn, project } from './session';

test('Kanban kombiniert Titelsuche und Zuständigkeit',async({page})=>{
  const projectRow={id:'project',name:'Musterinstallation',stage:'planning'};
  const tasks=[
    {id:'eins',project_id:'project',name:'Material prüfen',status:'todo'},
    {id:'zwei',project_id:'project',name:'Material einräumen',status:'doing'},
    {id:'drei',project_id:'project',name:'Termin abstimmen',status:'todo'},
    {id:'vier',project_id:'project',name:'Material zählen',status:'todo',assignee_id:'besetzt'},
    {id:'fuenf',project_id:'anderes',name:'Material abholen',status:'todo'},
  ];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[projectRow]}));
  await page.route('**/api/v1/tasks?*',route=>route.fulfill({json:tasks}));
  await page.route('**/api/v1/tasks/eins',route=>{
    expect(route.request().postDataJSON()).toEqual({status:'doing'});
    tasks[0].status='doing';
    return route.fulfill({json:tasks[0]});
  });
  await signIn(page);
  await project(page,projectRow.name);
  await page.getByRole('button',{name:'Kanban',exact:true}).click();
  const query=page.getByRole('searchbox',{name:'Aufgabentitel suchen'});
  await page.getByRole('combobox',{name:'Aufgaben anzeigen'}).selectOption({label:'Ohne Zuständigkeit'});
  await query.fill('  MATERIAL  ');
  await expect(page.getByText('2 Aufgaben',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Offen 1',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'In Arbeit 1',exact:true})).toBeVisible();
  await expect(page.getByText('Material zählen',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Material abholen',{exact:true})).toHaveCount(0);
  await page.getByRole('combobox',{name:'Status für Material prüfen'}).selectOption('doing');
  await expect(page.getByRole('heading',{name:'In Arbeit 2',exact:true})).toBeVisible();
  await query.fill('unbekannt');
  await expect(page.getByText('Keine Aufgaben für diese Filter.')).toBeVisible();
  await page.getByRole('button',{name:'Suche leeren',exact:true}).click();
  await expect(query).toHaveValue('');
  await expect(page.getByText('3 Aufgaben',{exact:true})).toBeVisible();
});
