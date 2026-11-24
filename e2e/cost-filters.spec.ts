import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Ist-Kosten filtern und einen sichtbaren Beleg zuordnen',async({page})=>{
  const costs=[
    {id:'a',reference:'B-41',name:'Montage',source:'manual',project_id:null,cents:3100},
    {id:'b',reference:'B-42',name:'Montagematerial',source:'csv',project_id:null,cents:5000},
    {id:'c',reference:'B-43',name:'Fahrt',source:'manual',project_id:'projekt',cents:2500},
  ];
  await page.route('**/api/v1/costs?*',route=>route.fulfill({json:costs}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[{id:'projekt',name:'Büroinstallation'}]}));
  await page.route('**/api/v1/costs/a',route=>{
    expect(route.request().postDataJSON()).toEqual({project_id:'projekt'});
    costs[0].project_id='projekt';
    return route.fulfill({json:costs[0]});
  });
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Ist-Kosten',exact:true}).click();
  const search=page.getByRole('searchbox',{name:'Belege suchen'});
  const source=page.getByLabel('Quelle filtern');
  const assignment=page.getByLabel('Zuordnung filtern');
  await expect(page.getByText('3 Belege',{exact:true})).toBeVisible();
  await search.fill('b-42');
  await expect(page.getByText('1 Beleg',{exact:true})).toBeVisible();
  await expect(page.getByRole('cell',{name:'B-42',exact:true})).toBeVisible();
  await search.fill('MONTAGE');
  await source.selectOption({label:'Manuell'});
  await assignment.selectOption({label:'Ohne Zuordnung'});
  await expect(page.getByText('1 Beleg',{exact:true})).toBeVisible();
  await page.getByLabel('Projekt für B-41').selectOption({label:'Büroinstallation'});
  await expect(page.getByText('Keine Belege für diese Filter.',{exact:true})).toBeVisible();
  await expect(search).toHaveValue('MONTAGE');
  await expect(source).toHaveValue('manual');
  await expect(assignment).toHaveValue('unassigned');
  await page.getByRole('button',{name:'Filter zurücksetzen',exact:true}).click();
  await expect(page.getByText('3 Belege',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Projekt für B-41')).toHaveValue('projekt');
});
