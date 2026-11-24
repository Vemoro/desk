import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Bewegungssuche findet Artikel und Lieferscheine auch auf einer späteren API-Seite',async({page})=>{
  const entry={item_id:'kit',location_id:'lager',quantity:1,created_at:'2028-05-17T12:00:00Z'};
  const distractors=Array.from({length:198},(_,index)=>({...entry,id:`other-${index}`,item_id:'other',action:'issue'}));
  let offsets:number[]=[];
  await page.route('**/api/v1/movements?*',route=>{
    const offset=Number(new URL(route.request().url()).searchParams.get('offset'));
    offsets.push(offset);
    return route.fulfill({json:offset===0?[
      {...entry,id:'one',project_id:'muster',action:'receive',delivery_reference:'LS-MUSTER-1'},
      {...entry,id:'two',project_id:'kunde',action:'issue'},
      ...distractors,
    ]:[{...entry,id:'three',project_id:'kunde',action:'receive',delivery_reference:'LS-MUSTER-2'}]});
  });
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'muster',name:'Musterbüro',stage:'planning'}, {id:'kunde',name:'Musterveranstaltung',stage:'planning'},
  ]}));
  await page.route('**/api/v1/items?*',route=>route.fulfill({json:[
    {id:'kit',name:'Montagekoffer',code:'WK-200',inventory_number:'INV-073'},
    {id:'other',name:'Andere Kiste',code:'WK-100'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  expect(offsets).toEqual([0,200]);
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  const query=panel.getByRole('searchbox',{name:'Lagerbewegungen suchen'});
  await query.fill('  mUsTeR-2  ');
  await expect(panel.getByText('1 Bewegung',{exact:true})).toBeVisible();
  await expect(panel.getByText('LS-MUSTER-2',{exact:true})).toBeVisible();
  await query.fill('wk-200');
  await panel.getByLabel('Projekt filtern').selectOption('kunde');
  await panel.getByLabel('Bewegungsart filtern').selectOption('receive');
  await expect(panel.getByText('1 Bewegung',{exact:true})).toBeVisible();
  await expect(panel.getByText('LS-MUSTER-2',{exact:true})).toBeVisible();
  for(const keyword of ['Montagekoff','inv-073']){
    await query.fill(keyword);
    await expect(panel.getByText('LS-MUSTER-2',{exact:true})).toBeVisible();
  }
  await query.fill('ohne-treffer');
  await expect(panel.getByText('Keine Bewegungen für diese Filter.')).toBeVisible();
  await panel.getByRole('button',{name:'Filter zurücksetzen'}).click();
  await expect(query).toHaveValue('');
  await expect(panel.getByLabel('Projekt filtern')).toHaveValue('');
  await expect(panel.getByLabel('Bewegungsart filtern')).toHaveValue('');
  await expect(panel.getByText('201 Bewegungen',{exact:true})).toBeVisible();
});
