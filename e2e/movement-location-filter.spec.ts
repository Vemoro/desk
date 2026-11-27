import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Lagerort beschränkt Bewegungen über alle API-Seiten unabhängig von offenen Ausgaben',async({page})=>{
  const movement={item_id:'kit',project_id:'muster',quantity:1,action:'issue',created_at:'2028-05-17T22:15:00Z'};
  const offsets:number[]=[];
  await page.route('**/api/v1/movements?*',route=>{
    const offset=Number(new URL(route.request().url()).searchParams.get('offset'));
    offsets.push(offset);
    return route.fulfill({json:offset===0?[
      {...movement,id:'west',location_id:'west',delivery_reference:'LS-MUSTER-WEST'},
      ...Array.from({length:199},(_,index)=>({...movement,id:`other-${index}`,location_id:'west',action:'receive'})),
    ]:[{...movement,id:'east',location_id:'east',delivery_reference:'LS-MUSTER-OST'}]});
  });
  const resources={
    projects:[{id:'muster',name:'Montage im Musterbüro',stage:'running'}],
    items:[{id:'kit',name:'Montagekoffer',code:'WK-200',kind:'equipment'}],
    locations:[{id:'west',name:'Musterlager West'},{id:'east',name:'Musterlager Ost'},{id:'empty',name:'Musterlager Reserve'}],
    reservations:[{id:'r1',project_id:'muster',item_id:'kit',location_id:'west',quantity:1,status:'firm',checked_out:1}],
  };
  for(const [resource,json] of Object.entries(resources)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const movements=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  const checkouts=page.locator('section').filter({has:page.getByRole('heading',{name:'Offene Ausgaben',exact:true})});
  await expect(movements.getByText('201 von 201 Bewegungen',{exact:true})).toBeVisible();
  expect(offsets).toEqual([0,200]);

  const location=movements.getByLabel('Lagerort filtern');
  const openLocation=checkouts.getByLabel('Lagerort filtern');
  await expect(location).toHaveValue('');
  await expect(location.getByRole('option').first()).toHaveText('Alle Lagerorte');
  await movements.getByLabel('Projekt filtern').selectOption('muster');
  await movements.getByLabel('Bewegungsart filtern').selectOption('issue');
  await movements.getByRole('searchbox',{name:'Lagerbewegungen suchen'}).fill('LS-MUSTER');
  await movements.getByLabel('Vom Datum').fill('2028-05-18');
  await movements.getByLabel('Bis Datum').fill('2028-05-18');
  await expect(movements.getByText('2 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(movements.getByText('LS-MUSTER-WEST',{exact:true})).toBeVisible();
  await expect(movements.getByText('LS-MUSTER-OST',{exact:true})).toBeVisible();
  await location.selectOption('east');
  await expect(movements.getByText('1 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(movements.getByText('LS-MUSTER-OST',{exact:true})).toBeVisible();
  await expect(movements.getByText('LS-MUSTER-WEST',{exact:true})).toHaveCount(0);
  await expect(openLocation).toHaveValue('');
  await expect(checkouts.getByRole('cell',{name:'Musterlager West',exact:true})).toBeVisible();

  await openLocation.selectOption('east');
  await expect(checkouts.getByText('Keine offenen Ausgaben für diese Filter.')).toBeVisible();
  await expect(movements.getByText('LS-MUSTER-OST',{exact:true})).toBeVisible();
  await location.selectOption('empty');
  await expect(movements.getByText('0 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(movements.getByText('Keine Lagerbewegungen für diese Filter.')).toBeVisible();
  await movements.getByRole('button',{name:'Filter zurücksetzen'}).click();
  await expect(location).toHaveValue('');
  await expect(movements.getByRole('searchbox',{name:'Lagerbewegungen suchen'})).toBeFocused();
  await expect(movements.getByText('201 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(openLocation).toHaveValue('east');
});
