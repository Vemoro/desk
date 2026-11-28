import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const panel=(page:Page,name:string)=>page.locator('section').filter({has:page.getByRole('heading',{name,exact:true})});

const first='Musterinstallation';
const second='Musterbetreuung';
const third='Musterauftrag ohne Belege';
async function show(page:Page,title:string){
  await project(page,title);
  await page.getByRole('link',{name:'Controlling',exact:true}).click();
}
async function openTarget(page:Page){
  const fixtures={
    projects:[{id:'one',name:first,stage:'planning'},{id:'two',name:second,stage:'planning'},{id:'three',name:third,stage:'planning'}],
    costs:[
      {id:'a',project_id:'one',reference:'RE-M-24',name:'Material Montage',source:'haben-export',cents:3000},
      {id:'b',project_id:'one',reference:'GS-M-24',name:'Gutschrift',source:'haben-export',cents:-3000},
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
  const subtotalAmount=subtotal.locator('strong');
  const filteredEmpty=target.getByRole('status').filter({hasText:'Keine Belege für diese Filter.'});
  const metrics=page.locator('.metrics .metric strong');
  const totals=['25,00 €','17,00 €','-8,00 €','60,00 €'];
  await expect(refs).toHaveCount(4);
  await expect(metrics).toHaveText(totals);
  await expect(search).toBeVisible();
  await search.fill('   ');
  await expect(refs).toHaveCount(4);
  await expect(subtotal).toHaveCount(0);
  await search.fill('  m-24  ');
  await expect(refs).toHaveText(['RE-M-24','GS-M-24']);
  await expect(subtotalAmount).toHaveText('0,00 €');
  await expect(metrics).toHaveText(totals);
  await source.selectOption('manual');
  await expect(filteredEmpty).toBeVisible();
  await expect(refs).toHaveCount(0);
  await expect(subtotal).toHaveCount(0);
  await expect(metrics).toHaveText(totals);
  await source.selectOption('');
  await search.fill('MONTAGE');
  await expect(refs).toHaveText(['RE-M-24','RE-25']);
  await expect(subtotalAmount).toHaveText('37,00 €');
  await source.selectOption('manual');
  await expect(refs).toHaveText(['RE-25']);
  await expect(subtotalAmount).toHaveText('7,00 €');
  await search.fill('nicht vorhanden');
  await expect(filteredEmpty).toBeVisible();
  await expect(subtotal).toHaveCount(0);
  await expect(metrics).toHaveText(totals);
  await target.getByRole('button',{name:'Suche leeren',exact:true}).press('Enter');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(source).toHaveValue('manual');
  await expect(refs).toHaveText(['RE-25','RE-26']);
  await expect(subtotalAmount).toHaveText('17,00 €');
  await expect(metrics).toHaveText(totals);
  await search.fill('Verwaltung');
  await show(page,second);
  await expect(search).toHaveValue('');
  await expect(source).toHaveValue('');
  await expect(refs).toHaveText(['RE-M-24']);
  await show(page,third);
  await search.fill('Montage');
  await expect(target.getByText('Noch keine Einträge.',{exact:true})).toBeVisible();
  await expect(subtotal).toHaveCount(0);
  await expect(filteredEmpty).toHaveCount(0);
});

test('Gemeinsamer Reset entfernt beide Belegfilter und gibt den Fokus an die Suche zurück',async({page})=>{
  const target=await openTarget(page);
  const reset=target.getByRole('button',{name:'Filter zurücksetzen',exact:true});
  const search=target.getByRole('searchbox',{name:'Belege suchen'});
  const source=target.getByLabel('Kostenquelle filtern');
  const refs=target.locator('tbody tr td:first-child');
  const subtotal=target.getByText('Summe der sichtbaren Belege',{exact:false});
  const filteredEmpty=target.getByRole('status').filter({hasText:'Keine Belege für diese Filter.'});
  const metrics=page.locator('.metrics .metric strong');
  const totals=['25,00 €','17,00 €','-8,00 €','60,00 €'];
  const allRefs=['RE-M-24','GS-M-24','RE-25','RE-26'];
  await expect(refs).toHaveText(allRefs);
  await expect(metrics).toHaveText(totals);
  await expect(reset).toBeVisible();
  await expect(reset).toBeDisabled();

  async function resetAndCheck(key:'Enter'|'Space'='Enter'){
    await expect(reset).toBeEnabled();
    await reset.press(key);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await expect(source).toHaveValue('');
    await expect(refs).toHaveText(allRefs);
    await expect(subtotal).toHaveCount(0);
    await expect(filteredEmpty).toHaveCount(0);
    await expect(reset).toBeDisabled();
    await expect(metrics).toHaveText(totals);
  }

  await source.selectOption('manual');
  await expect(refs).toHaveText(['RE-25','RE-26']);
  await expect(subtotal.locator('strong')).toHaveText('17,00 €');
  await resetAndCheck('Space');

  await search.fill('Montage');
  await expect(refs).toHaveText(['RE-M-24','RE-25']);
  await expect(subtotal.locator('strong')).toHaveText('37,00 €');
  await resetAndCheck();

  await search.fill('   ');
  await expect(refs).toHaveText(allRefs);
  await expect(subtotal).toHaveCount(0);
  await resetAndCheck();

  await source.selectOption('haben-export');
  await search.fill('Verwaltung');
  await expect(filteredEmpty).toBeVisible();
  await expect(refs).toHaveCount(0);
  await resetAndCheck();

  await show(page,third);
  const empty=target.getByText('Noch keine Einträge.',{exact:true});
  await expect(empty).toBeVisible();
  await search.fill('Montage');
  await expect(empty).toBeVisible();
  await expect(filteredEmpty).toHaveCount(0);
  await reset.press('Enter');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(reset).toBeDisabled();
  await expect(empty).toBeVisible();
  await expect(subtotal).toHaveCount(0);
});
