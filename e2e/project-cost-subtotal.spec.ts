import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const projectName='Musterinstallation';
const projectRow={id:'subtotal-project',name:projectName,stage:'planning'};
const baseCosts=[
  {id:'import',project_id:projectRow.id,reference:'RE-01',name:'Montagematerial',source:'haben-export',cents:2300},
  {id:'credit',project_id:projectRow.id,reference:'GS-01',name:'Materialgutschrift',source:'haben-export',cents:-400},
  {id:'manual',project_id:projectRow.id,reference:'RE-02',name:'Transport',source:'manual',cents:1700},
  {id:'offset',project_id:projectRow.id,reference:'GS-02',name:'Transportgutschrift',source:'manual',cents:-1700},
];
async function openControlling(page:Page){
  let costs=[...baseCosts];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[projectRow]}));
  await page.route('**/api/v1/costs?*',route=>route.fulfill({json:costs}));
  await page.route('**/api/v1/lines?*',route=>route.fulfill({json:[
    {id:'buy',project_id:projectRow.id,kind:'buy',name:'Muster-Einkauf',quantity:2,unit_cents:1250},
    {id:'sell',project_id:projectRow.id,kind:'sell',name:'Muster-Verkauf',quantity:3,unit_cents:2200},
  ]}));
  await page.route('**/api/v1/costs',route=>{
    expect(route.request().method()).toBe('POST');
    costs=costs.filter(entry=>entry.source!=='haben-export');
    return route.fulfill({json:{inserted:1}});
  });
  await signIn(page);
  await project(page,projectName);
  await page.getByRole('link',{name:'Controlling',exact:true}).click();
  return page.locator('section').filter({has:page.getByRole('heading',{name:'Belegbezogene Ist-Kosten',exact:true})});
}

test('Projektcontrolling summiert sichtbare Belege unabhängig von den Projektkennzahlen',async({page})=>{
  const panel=await openControlling(page);
  const filter=panel.getByLabel('Kostenquelle filtern');
  const rows=panel.locator('tbody tr');
  const subtotal=panel.getByText('Summe der sichtbaren Belege',{exact:false});
  const metrics=page.locator('.metrics .metric strong');
  const projectAmounts=['25,00 €','19,00 €','-6,00 €','66,00 €'];
  await expect(rows).toHaveCount(4);
  await expect(subtotal).toHaveCount(0);
  await expect(metrics).toHaveText(projectAmounts);
  await filter.selectOption('haben-export');
  await expect(subtotal).toHaveText(/19,00\s*€/);
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('RE-01');
  await expect(rows.last()).toContainText('GS-01');
  await expect(metrics).toHaveText(projectAmounts);
  await filter.selectOption('manual');
  await expect(subtotal).toHaveText(/0,00\s*€/);
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('RE-02');
  await expect(rows.last()).toContainText('GS-02');
  await expect(metrics).toHaveText(projectAmounts);
  await filter.selectOption('');
  await expect(subtotal).toHaveCount(0);
  await expect(rows).toHaveCount(4);
  await expect(metrics).toHaveText(projectAmounts);

  await filter.selectOption('haben-export');
  await panel.getByText('Ist-Kosten erfassen',{exact:true}).click();
  await panel.getByLabel('Belegreferenz').fill('RE-03');
  await panel.getByLabel('Bezeichnung').fill('Musterbeleg');
  await panel.getByLabel('Netto in Euro').fill('0');
  await panel.getByRole('button',{name:'Kosten speichern'}).click();
  await expect(filter).toHaveValue('');
  await expect(rows).toHaveCount(2);
  await expect(subtotal).toHaveCount(0);
});
