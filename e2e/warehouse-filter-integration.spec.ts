import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

const panel=(page:Page,name:string)=>page.locator('.panel').filter({has:page.getByRole('heading',{name,exact:true})});

async function openTarget(page:Page){
  const motion={action:'issue',quantity:1,project_id:'office',created_at:'2028-05-17T09:00:00Z'};
  const booking={project_id:'office',status:'firm',checked_out:1};
  const fixtures={
    projects:[{id:'office',name:'Musterinstallation',stage:'running'}],
    items:[
      {id:'kit',name:'Montagekoffer',code:'MK-01',inventory_number:'INV-0101',kind:'equipment'},
      {id:'tool',name:'Messgerät',code:'MG-01',kind:'equipment'},
    ],
    locations:[{id:'ost',name:'Musterlager Ost'},{id:'west',name:'Musterlager West'}],
    reservations:[{...booking,id:'r1',item_id:'kit',location_id:'ost'},{...booking,id:'r2',item_id:'tool',location_id:'west'}],
    movements:[
      {...motion,id:'m1',location_id:'ost',item_id:'kit',delivery_reference:'LS-01'},
      {...motion,id:'m2',location_id:'west',item_id:'tool',delivery_reference:'LS-02'},
    ],
  };
  for(const [resource,json] of Object.entries(fixtures))
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  await page.route('**/api/v1/stock',route=>route.fulfill({json:[
    {item_id:'kit',location_id:'ost',physical:5,reserved:3,free:2},
    {item_id:'kit',location_id:'west',physical:4,reserved:4,free:0},
    {item_id:'tool',location_id:'ost',physical:3,reserved:3,free:0},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  return panel(page,'Bestand je Lagerort');
}

test('Bestand, offene Ausgaben und Lagerbewegungen behalten getrennte Filter',async({page})=>{
  const stock=await openTarget(page);
  const checkout=panel(page,'Offene Ausgaben');
  const movement=panel(page,'Lagerbewegungen');
  const stockSearch=stock.getByRole('searchbox',{name:'Bestand suchen'});
  const availability=stock.getByRole('checkbox',{name:'Nur mit freiem Bestand'});
  const item=checkout.getByLabel('Artikel filtern');
  const delivery=movement.getByRole('searchbox',{name:'Lagerbewegungen suchen'});
  await expect(stock.locator('tbody tr')).toHaveCount(3);
  await stockSearch.fill('INV-0101');
  await stock.getByLabel('Lagerort filtern').selectOption('ost');
  await availability.check();
  await item.selectOption('tool');
  await delivery.fill('LS-01');
  await expect(stock.locator('tbody tr').first().getByRole('cell')).toHaveText(['Montagekoffer','Musterlager Ost','5','3','2']);
  await expect(checkout.locator('tbody tr')).toHaveCount(1);
  await expect(checkout.getByRole('link',{name:'Musterinstallation'})).toHaveAttribute('href','#projects/office');
  await expect(checkout.locator('tbody tr').first()).toContainText('Messgerät');
  await expect(movement.locator('tbody tr')).toHaveCount(1);
  await expect(movement.getByText('LS-01',{exact:true})).toBeVisible();
  await expect(movement.getByRole('button',{name:'CSV herunterladen'})).toBeEnabled();

  await stock.getByRole('button',{name:'Filter zurücksetzen'}).click();
  await expect(stock.locator('tbody tr')).toHaveCount(3);
  await expect(availability).not.toBeChecked();
  await expect(item).toHaveValue('tool');
  await expect(checkout.locator('tbody tr')).toHaveCount(1);
  await expect(delivery).toHaveValue('LS-01');
  await expect(movement.locator('tbody tr')).toHaveCount(1);
});
