import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const office='Büroinstallation Westflügel';
const event='Veranstaltungsbetreuung im Kulturhaus';
const slot={project_id:'office',user_id:null,item_id:null,location_id:null,quantity:1,status:'released',checked_out:0,
  starts_at:'2028-05-17T08:00:00Z',ends_at:'2028-05-17T10:00:00Z'};
const fixtures={
  projects:[{id:'office',name:office,stage:'running'},{id:'event',name:event,stage:'planning'}],
  items:[
    {id:'case-ost',name:'Montagekoffer',kind:'equipment',inventory_number:'INV-1001'},
    {id:'case-west',name:'Montagekoffer',kind:'equipment',inventory_number:'INV-1002'},
    {id:'meter',name:'Messgerät',kind:'equipment',inventory_number:'INV-1003'},
  ],
  locations:[{id:'nord',name:'Musterlager Nord'},{id:'ost',name:'Musterlager Ost'},{id:'west',name:'Musterlager West'}],
  reservations:[
    {...slot,id:'ost-case',location_id:'ost',item_id:'case-ost',checked_out:1},
    {...slot,id:'west-case',location_id:'west',item_id:'case-west',checked_out:1},
    {...slot,id:'ost-meter',location_id:'ost',item_id:'meter',status:'tentative',
      starts_at:'2028-05-18T08:00:00Z',ends_at:'2028-05-18T10:00:00Z'},
    {...slot,id:'worker',user_id:'mira'},
    {...slot,id:'next-case',project_id:'event',location_id:'west',item_id:'case-west'},
  ],
};

async function openPlanning(page:Page,name:string) {
  await project(page,name);
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
}

test('Der Lagerortfilter grenzt jede Filterkombination auf den Standort ein',async({page})=>{
  for(const [resource,json] of Object.entries(fixtures)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/users',route=>route.fulfill({json:[{id:'mira',name:'Mira Muster'}]}));
  await signIn(page);
  await openPlanning(page,office);

  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
  const place=panel.getByRole('combobox',{name:'Lagerort',exact:true});
  const type=panel.getByLabel('Ressourcentyp',{exact:true});
  const search=panel.getByRole('searchbox',{name:'Ressourcen suchen',exact:true});
  const status=panel.getByLabel('Status filtern',{exact:true});
  const day=panel.getByLabel('Am Datum',{exact:true});
  const issues=panel.getByRole('checkbox',{name:'Nur offene Geräteausgaben',exact:true});
  const reset=panel.getByRole('button',{name:'Filter zurücksetzen',exact:true});
  const count=panel.getByRole('status');
  const empty=panel.getByText('Keine Reservierungen für diese Filter.',{exact:true});
  const rows=panel.locator('tbody tr');
  const expectEastCase=async()=>{
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('INV-1001');
    await expect(count).toHaveText('1 Reservierung');
  };

  await expect(count).toHaveText('4 Reservierungen');
  await expect(rows.filter({hasText:'Mira Muster'})).toHaveCount(1);
  await expect(place.locator('option')).toHaveText(['Alle Lagerorte','Musterlager Nord','Musterlager Ost','Musterlager West']);
  await expect(place).toHaveValue('');

  await place.selectOption('nord');
  await expect(count).toHaveText('0 Reservierungen');
  await expect(empty).toBeVisible();
  await place.selectOption('west');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('INV-1002');
  await place.selectOption('ost');
  await expect(count).toHaveText('2 Reservierungen');

  await search.fill('Montagekoffer');
  await expectEastCase();
  await search.clear();
  await type.selectOption('user');
  await expect(count).toHaveText('0 Reservierungen');
  await expect(empty).toBeVisible();
  await type.selectOption('item');
  await expect(count).toHaveText('2 Reservierungen');
  await type.selectOption('');
  await status.selectOption('released');
  await expectEastCase();
  await status.selectOption('');
  await day.fill('2028-05-17');
  await expectEastCase();
  await day.clear();
  await issues.check();
  await expectEastCase();
  await issues.uncheck();

  await expect(count).toHaveText('2 Reservierungen');
  await expect(reset).toBeEnabled();
  await reset.press('Enter');
  await expect(place).toHaveValue('');
  await expect(type).toBeFocused();
  await expect(count).toHaveText('4 Reservierungen');
  await place.selectOption('ost');
  await openPlanning(page,event);
  await expect(place).toHaveValue('');
  await expect(count).toHaveText('1 Reservierung');
  await expect(rows.first()).toContainText('Musterlager West');
});
