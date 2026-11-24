import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Beleg-Kostenstelle bleibt bei manueller Zuordnung sichtbar',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const costs=[
    {id:'b1',reference:'B-1',name:'Material',source:'haben-export',cost_center:'LIEF-42',project_id:null as string|null,cents:1200},
    {id:'b2',reference:'B-2',name:'Fahrt',source:'manual',cost_center:'',project_id:null,cents:3200},
  ];
  await page.route('**/api/v1/costs?*',route=>route.fulfill({json:costs}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'p1',name:'Musterinstallation',cost_center:'PROJEKT-02'},
  ]}));
  await page.route('**/api/v1/costs/b1',route=>{
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON()).toEqual({project_id:'p1'});
    costs[0].project_id='p1';
    return route.fulfill({json:costs[0]});
  });
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Ist-Kosten',exact:true}).click();
  const b1=page.locator('tr').filter({hasText:'B-1'});
  const b2=page.locator('tr').filter({hasText:'B-2'});
  const center=(row:typeof b1)=>row.locator('[data-label="Kostenstelle"]');
  await expect(center(b1)).toBeVisible();
  await expect(center(b1)).toHaveText('LIEF-42');
  expect(await center(b1).evaluate((cell)=>getComputedStyle(cell,'::before').content)).toBe('"Kostenstelle"');
  await expect(center(b2)).toHaveText('–');
  const assignment=page.getByRole('combobox',{name:'Zuordnung filtern'});
  await assignment.selectOption({label:'Ohne Zuordnung'});
  await b1.getByRole('combobox',{name:'Projekt für B-1'}).selectOption({label:'Musterinstallation'});
  await expect(b1).toHaveCount(0);
  await expect(assignment).toHaveValue('unassigned');
  await assignment.selectOption({label:'Alle Belege'});
  await expect(b1.getByRole('combobox',{name:'Projekt für B-1'})).toHaveValue('p1');
  await expect(center(b1)).toHaveText('LIEF-42');
});
