import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const projectName='Musterinstallation';
const secondName='Musterbetreuung';
const slot={project_id:'muster',location_id:'lager',quantity:1,status:'released',checked_out:1,
  starts_at:'2028-05-17T08:00:00Z',ends_at:'2028-05-17T10:00:00Z'};
const resources={
  projects:[{id:'muster',name:projectName,stage:'running'},{id:'other',name:secondName,stage:'planning'}],
  items:[
    {id:'a',name:'Montagekoffer',kind:'equipment',inventory_number:'INV-1001'},
    {id:'b',name:'Montagekoffer',kind:'equipment',inventory_number:'INV-1002'},
    {id:'tape',name:'Klebeband',kind:'consumable'},
  ],
  locations:[{id:'lager',name:'Musterlager'}],
  reservations:[
    {...slot,id:'r1',item_id:'a'},
    {...slot,id:'r2',item_id:'b',checked_out:0},
    {...slot,id:'r3',item_id:'tape',checked_out:0},
    {...slot,id:'r4',user_id:'worker',checked_out:0},
    {...slot,id:'r5',project_id:'other',item_id:'tape',checked_out:0},
  ],
};
async function openTarget(page:Page){
  for(const [resource,json] of Object.entries(resources)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/users',route=>route.fulfill({json:[{id:'worker',name:'Mira Muster'}]}));
  await signIn(page);
  await openPlanning(page,projectName);
  return page.locator('.panel').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
}
async function openPlanning(page:Page,name:string){
  await project(page,name);
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
}

test('Ressourcensuche kombiniert Name und Inventarnummer mit allen vorhandenen Filtern',async({page})=>{
  const panel=await openTarget(page);
  const search=panel.getByRole('searchbox',{name:'Ressourcen suchen'});
  const rows=panel.locator('tbody tr');
  const type=panel.getByLabel('Ressourcentyp');
  const status=panel.getByLabel('Status filtern');
  const date=panel.getByLabel('Am Datum');
  const open=panel.getByRole('checkbox',{name:'Nur offene Geräteausgaben'});
  const reset=panel.getByRole('button',{name:'Filter zurücksetzen'});
  const empty=panel.getByText('Keine Reservierungen für diese Filter.');
  await search.fill('  IRA MUS  ');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Mira Muster');
  await search.fill('klebeband');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Klebeband');
  await search.fill('Montagekoffer');
  await expect(rows).toHaveCount(2);
  await expect(panel.getByText('2 Reservierungen',{exact:true})).toBeVisible();
  await search.fill('inv-1002');
  await expect(rows).toHaveCount(1);
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();

  await type.selectOption('user');
  await expect(empty).toBeVisible();
  await type.selectOption('item');
  await expect(rows).toHaveCount(1);
  await status.selectOption('firm');
  await expect(empty).toBeVisible();
  await status.selectOption('released');
  await expect(rows).toHaveCount(1);
  await date.fill('2028-05-18');
  await expect(empty).toBeVisible();
  await date.fill('2028-05-17');
  await expect(rows).toHaveCount(1);
  await open.check();
  await expect(empty).toBeVisible();
  await search.fill('INV-1001');
  await expect(rows).toHaveCount(1);

  await reset.click();
  await expect(search).toHaveValue('');
  await expect(rows).toHaveCount(4);
  await search.fill('INV-1001');
  await openPlanning(page,secondName);
  await expect(search).toHaveValue('');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Klebeband');
});
