import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const panel=(page:Page,name:string)=>page.locator('.panel').filter({has:page.getByRole('heading',{name,exact:true})});

const first='Musterinstallation';
const second='Musterbetreuung';
async function show(page:Page,title:string){
  await project(page,title);
  await page.getByRole('button',{name:'Controlling',exact:true}).click();
}
async function openTarget(page:Page){
  const fixtures={
    projects:[{id:'one',name:first,stage:'planning'},{id:'two',name:second,stage:'planning'}],
    costs:[
      {id:'a',project_id:'one',reference:'RE-M-24',name:'Material Montage',source:'haben-export',cents:3000},
      {id:'b',project_id:'one',reference:'GS-M-24',name:'Gutschrift',source:'haben-export',cents:-500},
      {id:'c',project_id:'one',reference:'RE-25',name:'Transport Montage',source:'manual',cents:700},
      {id:'d',project_id:'one',reference:'RE-26',name:'Verwaltung',source:'manual',cents:1000},
      {id:'e',project_id:'two',reference:'RE-M-24',name:'Material Montage',source:'manual',cents:9100},
    ],
    lines:[
      {id:'in',project_id:'one',kind:'buy',quantity:5,unit_cents:500},
      {id:'out',project_id:'one',kind:'sell',quantity:2,unit_cents:3000},
    ],
  };
  for(const [resource,json] of Object.entries(fixtures))
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  await signIn(page);
  await show(page,first);
  return panel(page,'Belegbezogene Ist-Kosten');
}

test('Belegsuche im Projekt kombiniert Quelle und Suchbegriff und summiert nur Treffer',async({page})=>{
  const target=await openTarget(page);
  const search=target.getByRole('searchbox',{name:'Belege suchen'});
  const source=target.getByLabel('Kostenquelle filtern');
  const refs=target.locator('tbody tr td:first-child');
  const subtotal=target.getByText('Summe der sichtbaren Belege',{exact:false});
  const metrics=page.locator('.metrics .metric strong');
  const totals=['25,00 €','42,00 €','17,00 €','60,00 €'];
  await expect(refs).toHaveCount(4);
  await expect(metrics).toHaveText(totals);
  await search.fill('  m-24  ');
  await expect(refs).toHaveText(['RE-M-24','GS-M-24']);
  await expect(subtotal).toContainText('25,00');
  await search.fill('MONTAGE');
  await expect(refs).toHaveText(['RE-M-24','RE-25']);
  await expect(subtotal).toContainText('37,00');
  await source.selectOption('manual');
  await expect(refs).toHaveText(['RE-25']);
  await expect(subtotal).toContainText('7,00');
  await search.fill('nicht vorhanden');
  await expect(target.getByText('Keine Belege für diese Filter.')).toBeVisible();
  await expect(subtotal).toHaveCount(0);
  await expect(metrics).toHaveText(totals);
  await search.fill('');
  await expect(source).toHaveValue('manual');
  await expect(refs).toHaveText(['RE-25','RE-26']);
  await expect(subtotal).toContainText('17,00');
  await expect(metrics).toHaveText(totals);
  await search.fill('Verwaltung');
  await show(page,second);
  await expect(search).toHaveValue('');
  await expect(source).toHaveValue('');
  await expect(refs).toHaveText(['RE-M-24']);
});

test('Projektcontrolling setzt Belegsuche und Quellenfilter gemeinsam zurück',async({page})=>{
  const target=await openTarget(page);
  const reset=target.getByRole('button',{name:'Filter zurücksetzen'});
  const search=target.getByRole('searchbox',{name:'Belege suchen'});
  const source=target.getByLabel('Kostenquelle filtern');
  const refs=target.locator('tbody tr td:first-child');
  const subtotal=target.getByText('Summe der sichtbaren Belege',{exact:false});
  const noResults=target.getByText('Keine Belege für diese Filter.');
  const metrics=page.locator('.metrics .metric strong');
  const totals=['25,00 €','42,00 €','17,00 €','60,00 €'];

  await expect(reset).toBeDisabled();
  await source.selectOption('manual');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(source).toHaveValue('');

  await search.fill('Montage');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(search).toHaveValue('');
  await search.fill('   ');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(search).toHaveValue('');

  await source.selectOption('manual');
  await search.fill('Montage');
  await expect(refs).toHaveText(['RE-25']);
  await expect(subtotal).toContainText('7,00');
  await reset.click();
  await expect(subtotal).toHaveCount(0);
  await source.selectOption('manual');
  await search.fill('kein Treffer');
  await expect(noResults).toBeVisible();
  await reset.click();

  await expect(search).toHaveValue('');
  await expect(source).toHaveValue('');
  await expect(refs).toHaveText(['RE-M-24','GS-M-24','RE-25','RE-26']);
  await expect(noResults).toHaveCount(0);
  await expect(metrics).toHaveText(totals);
  await expect(reset).toBeDisabled();
});
