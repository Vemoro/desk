import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Ist-Kosten filtern und einen sichtbaren Beleg zuordnen',async({page})=>{
  const costs=[
    {id:'a',reference:'B-410',name:'Montage',source:'manual',project_id:null,cents:3100},
    {id:'b',reference:'B-420',name:'Montagematerial',source:'haben-export',project_id:null,cents:5000},
    {id:'c',reference:'B-430',name:'Montagefahrt',source:'manual',project_id:'projekt',cents:2500},
    {id:'d',reference:'B-440',name:'Kurierfahrt',source:'manual',project_id:null,cents:2000},
    {id:'e',reference:'B-450',name:'Versand',source:'muster-api',project_id:null,cents:1200},
  ];
  let rejectAssignment=true;
  await page.route('**/api/v1/costs?*',route=>route.fulfill({json:costs}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[{id:'projekt',name:'Büroinstallation',stage:'planning'}]}));
  await page.route('**/api/v1/costs/a',route=>{
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON()).toEqual({project_id:'projekt'});
    if(rejectAssignment){
      rejectAssignment=false;
      return route.fulfill({status:409,json:{error:'Zuordnung vorübergehend nicht möglich.'}});
    }
    costs[0].project_id='projekt';
    return route.fulfill({json:costs[0]});
  });
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Ist-Kosten',exact:true}).click();
  const search=page.getByRole('searchbox',{name:'Belege suchen'});
  const source=page.getByLabel('Quelle filtern');
  const assignment=page.getByLabel('Zuordnung filtern');
  const result=(visible:number)=>page.getByText(visible+' von 5 Belegen',{exact:true});
  await expect(result(5)).toBeVisible();
  await source.selectOption({label:'muster-api'});
  await expect(result(1)).toBeVisible();
  await expect(page.getByRole('cell',{name:'B-450',exact:true})).toBeVisible();
  await source.selectOption('');
  await search.fill('  b-42  ');
  await expect(result(1)).toBeVisible();
  await expect(page.getByRole('cell',{name:'B-420',exact:true})).toBeVisible();
  await search.fill('MONT');
  await expect(result(3)).toBeVisible();
  await source.selectOption('manual');
  await expect(result(2)).toBeVisible();
  await assignment.selectOption('unassigned');
  await expect(result(1)).toBeVisible();

  const project=page.getByLabel('Projekt für B-410');
  await project.focus();
  await project.selectOption('projekt');
  await expect(page.getByRole('alert')).toContainText('Zuordnung vorübergehend nicht möglich.');
  await expect(project).toHaveValue('');
  await expect(project).toBeFocused();
  await expect(result(1)).toBeVisible();
  await expect(search).toHaveValue('MONT');
  await expect(source).toHaveValue('manual');
  await expect(assignment).toHaveValue('unassigned');

  await project.selectOption('projekt');
  await expect(page.getByText('Keine Belege für diese Filter.',{exact:true})).toBeVisible();
  await expect(result(0)).toBeVisible();
  await expect(assignment).toBeFocused();
  await expect(search).toHaveValue('MONT');
  await expect(source).toHaveValue('manual');
  await expect(assignment).toHaveValue('unassigned');
  await page.getByRole('button',{name:'Filter zurücksetzen',exact:true}).press('Enter');
  await expect(search).toBeFocused();
  await expect(result(5)).toBeVisible();
  await expect(project).toHaveValue('projekt');
});

test('Eine leere Ist-Kosten-Liste erklärt, wo Belege erscheinen',async({page})=>{
  await page.route('**/api/v1/costs?*',route=>route.fulfill({json:[]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Ist-Kosten',exact:true}).click();
  await expect(page.getByText('Hier erscheinen importierte oder einzeln erfasste Belege.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Filter zurücksetzen',exact:true})).toBeDisabled();
});
