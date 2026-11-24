import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const first='Musterinstallation';
const second='Musterbetreuung';
async function showPlanning(page:Page,projectName:string){
  await project(page,projectName);
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
}
async function openTarget(page:Page){
  const slot={project_id:'p1',location_id:'ost',quantity:1,status:'firm',checked_out:0,ends_at:'2028-05-17T13:00:00Z'};
  const fixtures={
    projects:[{id:'p1',name:first,stage:'planning'},{id:'p2',name:second,stage:'planning'}],
    items:[{id:'kit',name:'Montagekoffer',kind:'equipment'},{id:'late',name:'Transportwagen',kind:'equipment'},
      {id:'tool',name:'Messgerät',kind:'equipment'}],
    locations:[{id:'ost',name:'Musterlager Ost'}],
    reservations:[
      {...slot,id:'r1',item_id:'late',status:'tentative',starts_at:'2028-05-17T10:00:00Z'},
      {...slot,id:'r2',item_id:'kit',starts_at:'2028-05-17T10:30:00+02:00'},
      {...slot,id:'r3',item_id:'tool',starts_at:'2028-05-17T08:30:00Z'},
      {...slot,id:'r4',user_id:'mira',starts_at:'2028-05-17T08:00:00Z'},
      {...slot,id:'r5',project_id:'p2',item_id:'tool',starts_at:'2028-05-17T09:00:00Z'},
    ],
  };
  for(const [resource,json] of Object.entries(fixtures)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/users',route=>route.fulfill({json:[{id:'mira',name:'Mira Muster'}]}));
  await signIn(page);
  await showPlanning(page,first);
  return page.locator('.panel').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
}

test('Ressourcenplanung sortiert chronologisch mit stabiler Reihenfolge und behält aktive Filter',async({page})=>{
  const target=await openTarget(page);
  const sort=target.getByRole('combobox',{name:'Reservierungen sortieren'});
  const names=target.locator('tbody tr td:first-child');
  const original=['Transportwagen','Montagekoffer','Messgerät','Mira Muster'];
  const chronological=['Mira Muster','Montagekoffer','Messgerät','Transportwagen'];
  const expectedNames=(values:string[])=>values.map(name=>new RegExp('^'+name));
  await expect(sort).toHaveValue('standard');
  await expect(names).toHaveText(expectedNames(original));
  await sort.selectOption({label:'Frühester Beginn zuerst'});
  await expect(names).toHaveText(expectedNames(chronological));
  await target.getByLabel('Ressourcentyp').selectOption('item');
  await target.getByLabel('Status filtern').selectOption('firm');
  await expect(names).toHaveText(expectedNames(['Montagekoffer','Messgerät']));
  await target.getByRole('button',{name:'Filter zurücksetzen'}).click();
  await expect(sort).toHaveValue('start');
  await expect(names).toHaveText(expectedNames(chronological));
  await sort.selectOption('standard');
  await expect(names).toHaveText(expectedNames(original));
  await sort.selectOption('start');
  await showPlanning(page,second);
  await expect(sort).toHaveValue('standard');
  await expect(names).toHaveText(expectedNames(['Messgerät']));
});
