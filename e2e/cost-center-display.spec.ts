import { test, expect } from '@playwright/test';
import { chooseObject, signIn } from './session';

test('Beleg-Kostenstelle bleibt bei manueller Zuordnung sichtbar',async({page})=>{
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const projects=await page.request.get('/api/v1/projects');
  expect(projects.ok()).toBe(true);
  const [project]=(await projects.json() as {id:string;name:string;cost_center:string}[])
    .filter(row=>row.cost_center);
  expect(project).toBeTruthy();
  const suffix=crypto.randomUUID().slice(0,8);
  const reference='BELEG-'+suffix;
  const withoutCenter='OHNE-'+suffix;
  const center='LIEFERANT-'+suffix+'X'.repeat(190);
  expect(center).not.toBe(project.cost_center);
  const inserted=await page.request.post('/api/v1/costs',{headers:{Origin:origin},data:{entries:[
    {source:'haben-export',reference,name:'Montagematerial',cents:1200,cost_center:center},
    {source:'haben-export',reference:withoutCenter,name:'Fahrt',cents:3200},
  ]}});
  expect(inserted.status(),await inserted.text()).toBe(201);
  const [created]=await inserted.json() as {id:string;cost_center:string;project_id:string|null}[];
  expect(created.cost_center).toBe(center);
  expect(created.project_id).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();

  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Ist-Kosten',exact:true}).click();
  const imported=page.getByRole('row').filter({has:page.getByText(reference,{exact:true})});
  const missing=page.getByRole('row').filter({has:page.getByText(withoutCenter,{exact:true})});
  const cell=(row:typeof imported)=>row.locator('[data-label="Kostenstelle"]');
  const assignment=page.getByRole('combobox',{name:'Zuordnung filtern'});
  const search=page.getByRole('searchbox',{name:'Belege suchen'});
  await expect(cell(imported)).toHaveText(center);
  await expect(cell(missing)).toHaveText('–');
  expect(await cell(imported).evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);

  await search.fill(center);
  await expect(imported).toHaveCount(0);
  await search.fill('');
  await page.setViewportSize({width:375,height:812});
  await expect(cell(imported)).toBeVisible();
  expect(await cell(imported).evaluate(element=>getComputedStyle(element,'::before').content)).toBe('"Kostenstelle"');
  expect(await cell(imported).evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);

  await assignment.selectOption({label:'Ohne Zuordnung'});
  const projectSelect=imported.getByRole('combobox',{name:'Projekt für '+reference});
  await projectSelect.focus();
  const response=page.waitForResponse(reply=>reply.url().endsWith('/api/v1/costs/'+created.id) && reply.request().method()==='PATCH');
  await chooseObject(page,projectSelect,project.name);
  const updated=await response;
  expect(updated.ok()).toBe(true);
  expect(await updated.json()).toMatchObject({project_id:project.id,cost_center:center});
  await expect(imported).toHaveCount(0);
  await expect(assignment).toHaveValue('unassigned');
  await expect(assignment).toBeFocused();
  await assignment.selectOption({label:'Alle Belege'});
  await expect(projectSelect).toHaveValue(project.name);
  await expect(cell(imported)).toHaveText(center);
});
