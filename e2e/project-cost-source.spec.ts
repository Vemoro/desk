import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

test('Kostenquelle filtert nur Belege des offenen Projekts und lässt Projektkennzahlen vollständig',async({page})=>{
  const projects=[
    {id:'first',name:'Musterinstallation',stage:'planning'},
    {id:'second',name:'Musterwartung',stage:'planning'},
    {id:'empty',name:'Musterprojekt ohne Belege',stage:'planning'},
  ];
  const originalCosts=[
    {id:'a',project_id:'first',reference:'RE-01',name:'Material',source:'haben-export',cents:2300},
    {id:'b',project_id:'first',reference:'RE-02',name:'Transport',source:'manual',cents:1700},
    {id:'c',project_id:'second',reference:'RE-03',name:'Werkzeug',source:'manual',cents:1000},
    {id:'d',project_id:'second',reference:'RE-04',name:'Montage',source:'partner',cents:4300},
  ];
  let costs=originalCosts;
  let refreshes=0;
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:projects}));
  await page.route('**/api/v1/costs?*',route=>route.fulfill({json:costs}));
  await page.route('**/api/v1/lines?*',route=>route.fulfill({json:[
    {id:'buy',project_id:'first',kind:'buy',name:'Muster-Einkauf',quantity:2,unit_cents:1250},
    {id:'sale',project_id:'first',kind:'sell',name:'Muster-Verkauf',quantity:3,unit_cents:2200},
  ]}));
  await page.route('**/api/v1/costs',route=>{
    expect(route.request().method()).toBe('POST');
    costs=++refreshes===1 ? originalCosts.filter(entry=>entry.id!=='a') : originalCosts;
    return route.fulfill({json:{inserted:1}});
  });
  await signIn(page);
  const open=async(name:string)=>{
    await project(page,name);
    await page.getByRole('link',{name:'Controlling',exact:true}).click();
  };
  await open(projects[0].name);
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Belegbezogene Ist-Kosten'})});
  const filter=panel.getByLabel('Kostenquelle filtern');
  const rows=panel.locator('tbody tr');
  const actual=page.locator('.metric').filter({has:page.getByText('Ist-Kosten',{exact:true})});
  const assertProjectTotals=async()=>{
    for(const [label,value] of [
      ['Einkauf geplant','25,00'],['Ist-Kosten','40,00'],['Abweichung','15,00'],['Verkauf geplant','66,00'],
    ]){
      const metric=page.locator('.metric').filter({has:page.getByText(label,{exact:true})});
      await expect(metric.locator('strong')).toHaveText(value+' €');
    }
  };
  await assertProjectTotals();
  await expect(filter.locator('option')).toHaveText(['Alle Quellen','haben-export','manual']);
  await filter.selectOption('haben-export');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('RE-01');
  await assertProjectTotals();
  await filter.selectOption('');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('RE-02');
  await assertProjectTotals();

  await filter.selectOption('haben-export');
  await panel.getByText('Ist-Kosten erfassen',{exact:true}).click();
  await panel.getByLabel('Belegreferenz').fill('TEST-HINWEIS');
  await panel.getByLabel('Bezeichnung').fill('Manuelle Kontrolle');
  await panel.getByLabel('Netto in Euro').fill('1');
  await panel.getByRole('button',{name:'Kosten speichern'}).click();
  await expect(filter).toHaveValue('');
  await expect(filter.locator('option')).toHaveText(['Alle Quellen','manual']);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('RE-02');
  await expect(actual).toContainText('17,00');

  await panel.getByLabel('Belegreferenz').fill('TEST-NACHLADEN');
  await panel.getByLabel('Bezeichnung').fill('Erneut laden');
  await panel.getByLabel('Netto in Euro').fill('1');
  await panel.getByRole('button',{name:'Kosten speichern'}).click();
  await expect(filter.locator('option')).toHaveText(['Alle Quellen','haben-export','manual']);
  await expect(filter).toHaveValue('');
  await expect(rows).toHaveCount(2);

  await filter.selectOption('manual');
  await open(projects[1].name);
  await expect(filter).toHaveValue('');
  await expect(filter.locator('option')).toHaveText(['Alle Quellen','manual','partner']);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('RE-03');
  await expect(rows.nth(1)).toContainText('RE-04');
  await open(projects[2].name);
  await expect(filter).toHaveValue('');
  await expect(panel.getByText('Noch keine Einträge.')).toBeVisible();
});
