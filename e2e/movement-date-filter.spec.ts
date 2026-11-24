import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Datumsfilter berücksichtigt lokale Mitternacht und alle API-Seiten',async({page})=>{
  const entry={item_id:'kit',location_id:'lager',quantity:1,action:'receive'};
  const first='2028-05-17T21:59:00Z';
  const second='2028-05-17T22:01:00Z';
  const offsets:number[]=[];
  await page.route('**/api/v1/movements?*',route=>{
    const offset=Number(new URL(route.request().url()).searchParams.get('offset'));
    offsets.push(offset);
    return route.fulfill({json:offset===0?[
      {...entry,id:'a',project_id:'muster',created_at:first,delivery_reference:'Vor Mitternacht'},
      {...entry,id:'b',project_id:'kunde',created_at:second,delivery_reference:'Anderes Projekt'},
      ...Array.from({length:198},(_,index)=>({...entry,id:`other-${index}`,created_at:'2028-05-15T12:00:00Z'})),
    ]:[{...entry,id:'c',project_id:'muster',created_at:second,delivery_reference:'Nach Mitternacht'}]});
  });
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'muster',name:'Musterbüro',stage:'planning'}, {id:'kunde',name:'Musterveranstaltung',stage:'planning'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  await expect(panel.getByText('201 Bewegungen',{exact:true})).toBeVisible();
  expect(offsets).toEqual([0,200]);
  const from=panel.getByLabel('Vom Datum');
  const to=panel.getByLabel('Bis Datum');
  await from.fill('2028-05-18');
  await expect(panel.getByText('2 Bewegungen',{exact:true})).toBeVisible();
  await panel.getByLabel('Projekt filtern').selectOption('muster');
  await to.fill('2028-05-18');
  await expect(panel.getByText('Nach Mitternacht',{exact:true})).toBeVisible();
  await expect(panel.getByText('Vor Mitternacht',{exact:true})).toHaveCount(0);
  await expect(panel.getByText('Anderes Projekt',{exact:true})).toHaveCount(0);
  const search=panel.getByRole('searchbox',{name:'Lagerbewegungen suchen'});
  await search.fill('Vor Mitternacht');
  await expect(panel.getByText('Keine Bewegungen für diese Filter.')).toBeVisible();
  await search.fill('Nach Mitternacht');
  await expect(panel.getByText('Nach Mitternacht',{exact:true})).toBeVisible();
  await search.fill('');

  await to.fill('2028-05-17');
  await expect(panel.getByText('Das Bis-Datum liegt vor dem Vom-Datum.')).toBeVisible();
  await from.fill('');
  await expect(panel.getByText('Vor Mitternacht',{exact:true})).toBeVisible();
  await expect(panel.getByText('Nach Mitternacht',{exact:true})).toHaveCount(0);
  await panel.getByRole('button',{name:'Filter zurücksetzen'}).click();
  await expect(from).toHaveValue('');
  await expect(to).toHaveValue('');
  await expect(panel.getByLabel('Projekt filtern')).toHaveValue('');
  await expect(panel.getByText('201 Bewegungen',{exact:true})).toBeVisible();
});
