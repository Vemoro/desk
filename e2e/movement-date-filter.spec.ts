import { test, expect, type Page } from '@playwright/test';
import { signIn } from './session';

const entry={item_id:'kit',location_id:'lager',quantity:1,action:'receive',project_id:'muster'};

function movement(id:string,created_at:string,fields:Partial<typeof entry>={}) {
  return {...entry,id,created_at,delivery_reference:id,...fields};
}

async function openMovements(page:Page) {
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  return page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
}

test('Datumsfilter kombiniert Buchungstag, Suche, Projekt und Bewegungsart über alle API-Seiten',async({page})=>{
  const offsets:number[]=[];
  await page.route('**/api/v1/movements?*',route=>{
    const offset=Number(new URL(route.request().url()).searchParams.get('offset'));
    offsets.push(offset);
    return route.fulfill({json:offset===0?[
      movement('Vor Mitternacht','2028-05-17T21:59:59.999Z'),
      movement('Anderes Projekt','2028-05-17T22:00:00Z',{project_id:'kunde'}),
      movement('Andere Bewegungsart','2028-05-18T10:00:00Z',{action:'issue'}),
      movement('Ende des Buchungstags','2028-05-18T21:59:59.999Z'),
      movement('Beginn des Folgetags','2028-05-18T22:00:00Z'),
      ...Array.from({length:195},(_,index)=>movement('alt-'+index,'2028-05-16T12:00:00Z')),
    ]:[movement('Ziel um Mitternacht','2028-05-17T22:00:00Z')]});
  });
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'muster',name:'Musterbüro',stage:'planning'}, {id:'kunde',name:'Musterveranstaltung',stage:'planning'},
  ]}));
  const panel=await openMovements(page);
  await expect(panel.getByText('201 von 201 Bewegungen',{exact:true})).toBeVisible();
  expect(offsets).toEqual([0,200]);
  const from=panel.getByLabel('Vom Datum');
  const to=panel.getByLabel('Bis Datum');
  const project=panel.getByLabel('Projekt filtern');
  const kind=panel.getByLabel('Bewegungsart filtern');
  const search=panel.getByRole('searchbox',{name:'Lagerbewegungen suchen'});
  await expect(from).toHaveAccessibleDescription('Browser-Zeitzone Europe/Berlin');
  await from.fill('2028-05-18');
  await expect(panel.getByText('5 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(panel.getByText('Vor Mitternacht',{exact:true})).toHaveCount(0);
  await expect(panel.getByText('Beginn des Folgetags',{exact:true})).toBeVisible();

  await to.fill('2028-05-18');
  await expect(panel.getByText('4 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(panel.getByText('Ende des Buchungstags',{exact:true})).toBeVisible();
  await expect(panel.getByText('Beginn des Folgetags',{exact:true})).toHaveCount(0);
  await project.selectOption('muster');
  await expect(panel.getByText('3 von 201 Bewegungen',{exact:true})).toBeVisible();
  await kind.selectOption('receive');
  await expect(panel.getByText('2 von 201 Bewegungen',{exact:true})).toBeVisible();
  await search.fill('ZIEL');
  await expect(panel.getByText('1 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(panel.getByText('Ziel um Mitternacht',{exact:true})).toBeVisible();

  await to.fill('2028-05-17');
  await expect(to).toHaveAttribute('aria-invalid','true');
  await expect(to).toHaveAccessibleDescription(/Das Bis-Datum liegt vor dem Vom-Datum/);
  await expect(panel.getByText('Keine Lagerbewegungen für diese Filter.')).toHaveCount(0);
  await expect(from).toHaveValue('2028-05-18');
  await expect(to).toHaveValue('2028-05-17');
  await from.fill('');
  await expect(to).not.toHaveAttribute('aria-invalid','true');
  await expect(panel.getByText('Keine Lagerbewegungen für diese Filter.')).toBeVisible();
  await search.fill('Vor Mitternacht');
  await expect(panel.getByText('Vor Mitternacht',{exact:true})).toBeVisible();
  await from.fill('2028-05-17');
  await panel.getByRole('button',{name:'Filter zurücksetzen'}).press('Enter');
  await expect(search).toBeFocused();
  for(const field of [from,to,search,kind,project]) await expect(field).toHaveValue('');
  await expect(panel.getByText('201 von 201 Bewegungen',{exact:true})).toBeVisible();
});

test('Lokale Kalendertage berücksichtigen 23 und 25 Stunden',async({page})=>{
  await page.route('**/api/v1/movements?*',route=>route.fulfill({json:[
    movement('Vor dem kurzen Tag','2026-03-28T22:59:59.999Z'),
    movement('Beginn des kurzen Tags','2026-03-28T23:00:00Z'),
    movement('Ende des kurzen Tags','2026-03-29T21:59:59.999Z'),
    movement('Nach dem kurzen Tag','2026-03-29T22:00:00Z'),
    movement('Erstes 02:30','2026-10-25T00:30:00Z'),
    movement('Zweites 02:30','2026-10-25T01:30:00Z'),
    movement('Letzte Stunde des langen Tags','2026-10-25T22:59:59.999Z'),
    movement('Nach dem langen Tag','2026-10-25T23:00:00Z'),
  ]}));
  const panel=await openMovements(page);
  const from=panel.getByLabel('Vom Datum');
  const to=panel.getByLabel('Bis Datum');
  await from.fill('2026-03-29');
  await to.fill('2026-03-29');
  await expect(panel.getByText('2 von 8 Bewegungen',{exact:true})).toBeVisible();
  await expect(panel.getByText('Beginn des kurzen Tags',{exact:true})).toBeVisible();
  await expect(panel.getByText('Ende des kurzen Tags',{exact:true})).toBeVisible();
  await from.fill('2026-10-25');
  await to.fill('2026-10-25');
  await expect(panel.getByText('3 von 8 Bewegungen',{exact:true})).toBeVisible();
  for(const reference of ['Erstes 02:30','Zweites 02:30','Letzte Stunde des langen Tags']){
    await expect(panel.getByText(reference,{exact:true})).toBeVisible();
  }
});

test.describe('Browser-Zeitzone UTC',()=>{
  test.use({timezoneId:'UTC'});

  test('Die Buchung an Berliner Mitternacht zählt in UTC noch zum Vortag',async({page})=>{
    await page.route('**/api/v1/movements?*',route=>route.fulfill({json:[
      movement('Ziel um Mitternacht','2028-05-17T22:00:00Z'),
      movement('Mitternacht in UTC','2028-05-18T00:00:00Z'),
    ]}));
    const panel=await openMovements(page);
    const from=panel.getByLabel('Vom Datum');
    await expect(from).toHaveAccessibleDescription('Browser-Zeitzone UTC');
    await from.fill('2028-05-18');
    await expect(panel.getByText('1 von 2 Bewegungen',{exact:true})).toBeVisible();
    await expect(panel.getByText('Mitternacht in UTC',{exact:true})).toBeVisible();
    await expect(panel.getByText('Ziel um Mitternacht',{exact:true})).toHaveCount(0);
  });
});
