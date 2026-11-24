import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const panel=(page:Page,name:string)=>page.locator('.panel').filter({has:page.getByRole('heading',{name,exact:true})});

const first='Musterinstallation';
const second='Musterbetreuung';
async function show(page:Page,title:string){
  await project(page,title);
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
}
async function openTarget(page:Page){
  const slot={project_id:'one',location_id:'ost',quantity:1,status:'firm',checked_out:0,
    starts_at:'2028-05-17T08:00:00Z',ends_at:'2028-05-17T10:00:00Z'};
  const fixtures={
    projects:[{id:'one',name:first,stage:'running'},{id:'two',name:second,stage:'planning'}],
    items:[{id:'a',name:'Montagekoffer',kind:'equipment'},{id:'b',name:'Montagekoffer',kind:'equipment'},
      {id:'c',name:'Messgerät',kind:'equipment'}],
    locations:[{id:'ost',name:'Musterlager Ost'},{id:'west',name:'Musterlager West'}],
    reservations:[
      {...slot,id:'r1',item_id:'a',checked_out:1},
      {...slot,id:'r2',item_id:'b',location_id:'west'},
      {...slot,id:'r3',item_id:'c',status:'tentative'},
      {...slot,id:'r4',user_id:'mira',location_id:null},
      {...slot,id:'r5',item_id:'b',project_id:'two',location_id:'west'},
    ],
  };
  for(const [resource,json] of Object.entries(fixtures))
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  await page.route('**/api/v1/users',route=>route.fulfill({json:[{id:'mira',name:'Mira Muster'}]}));
  await signIn(page);
  await show(page,first);
  return panel(page,'Ressourcenplanung');
}

test('Lagerortfilter kombiniert sich mit allen Filtern der Ressourcenplanung',async({page})=>{
  const target=await openTarget(page);
  const place=target.getByRole('combobox',{name:'Lagerort',exact:true});
  const type=target.getByLabel('Ressourcentyp');
  const search=target.getByRole('searchbox',{name:'Ressourcen suchen'});
  const state=target.getByLabel('Status filtern');
  const day=target.getByLabel('Am Datum');
  const checkout=target.getByRole('checkbox',{name:'Nur offene Geräteausgaben'});
  const rows=target.locator('tbody tr');
  const reset=target.getByRole('button',{name:'Filter zurücksetzen'});
  await expect(place.locator('option')).toHaveText(['Alle Lagerorte','Musterlager Ost','Musterlager West']);
  await expect(rows).toHaveCount(4);
  await place.selectOption('west');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Musterlager West');
  await place.selectOption('ost');
  await expect(target.getByText('2 Reservierungen',{exact:true})).toBeVisible();
  await type.selectOption('user');
  await expect(target.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
  await type.selectOption('item');
  await search.fill('  MONTAGE ');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Musterlager Ost');
  await search.fill('');
  await state.selectOption('tentative');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Messgerät');
  await state.selectOption('');
  await day.fill('2028-05-18');
  await expect(rows).toHaveCount(0);
  await day.fill('2028-05-17');
  await expect(rows).toHaveCount(2);
  await checkout.check();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Montagekoffer');

  await reset.click();
  await expect(place).toHaveValue('');
  await place.selectOption('ost');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(place).toHaveValue('');
  await expect(rows).toHaveCount(4);
  await place.selectOption('ost');
  await show(page,second);
  await expect(place).toHaveValue('');
  await expect(rows.first()).toContainText('Musterlager West');
});
