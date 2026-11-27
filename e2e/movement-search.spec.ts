import { test, expect } from '@playwright/test';
import { holdRoute, signIn } from './session';

test('Bewegungssuche findet Artikel und Lieferscheine auch auf einer späteren API-Seite',async({page})=>{
  const entry={item_id:'kit',location_id:'lager',quantity:1,created_at:'2028-05-17T12:00:00Z'};
  const distractors=Array.from({length:198},(_,index)=>({...entry,id:`other-${index}`,item_id:'other',action:'issue'}));
  const offsets:number[]=[];
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
  await page.route('**/api/v1/reservations?*',route=>route.fulfill({json:[
    {id:'booking',item_id:'kit',location_id:'lager',project_id:'muster',status:'firm',checked_out:1,
      starts_at:entry.created_at,ends_at:'2028-05-17T15:00:00Z'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  expect(offsets).toEqual([0,200]);
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  const query=panel.getByRole('searchbox',{name:'Lagerbewegungen suchen'});
  const checkout=page.locator('section').filter({has:page.getByRole('heading',{name:'Offene Ausgaben',exact:true})});
  const checkoutProject=checkout.getByLabel('Projekt filtern');
  await checkoutProject.selectOption('muster');
  await query.fill('  mUsTeR-2  ');
  await expect(panel.getByText('1 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(panel.getByText('LS-MUSTER-2',{exact:true})).toBeVisible();
  for(const keyword of ['Montagekoff','k-20','v-07']){
    await query.fill(keyword);
    await expect(panel.getByText('3 von 201 Bewegungen',{exact:true})).toBeVisible();
    await expect(panel.getByText('LS-MUSTER-2',{exact:true})).toBeVisible();
  }
  await panel.getByLabel('Projekt filtern').selectOption('kunde');
  await panel.getByLabel('Bewegungsart filtern').selectOption('receive');
  await expect(panel.getByText('1 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(panel.getByText('LS-MUSTER-2',{exact:true})).toBeVisible();
  await query.fill('ohne-treffer');
  await expect(panel.getByText('Keine Lagerbewegungen für diese Filter.')).toBeVisible();
  await panel.getByRole('button',{name:'Filter zurücksetzen'}).press('Enter');
  await expect(query).toBeFocused();
  await expect(query).toHaveValue('');
  await expect(panel.getByLabel('Projekt filtern')).toHaveValue('');
  await expect(panel.getByLabel('Bewegungsart filtern')).toHaveValue('');
  await expect(panel.getByText('201 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(checkoutProject).toHaveValue('muster');
});

test('Die Suche erhält eine offene und eine laufende Lagerkorrektur',async({page})=>{
  const entry={item_id:'kit',location_id:'lager',created_at:'2028-05-17T12:00:00Z'};
  const receipt={...entry,id:'receipt',action:'receive',quantity:5,delivery_reference:'LS-MUSTER-1'};
  const part={...entry,id:'part',action:'correct_receive',quantity:2,corrects_movement_id:receipt.id};
  const booked={...entry,id:'booked',action:'correct_receive',quantity:1,corrects_movement_id:receipt.id};
  const held=holdRoute();
  let received=false;
  await page.route('**/api/v1/movements?*',route=>route.fulfill({json:received?[booked,part,receipt]:[part,receipt]}));
  await page.route('**/api/v1/movements/receipt/corrections',held.resolve,{times:1});
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  const query=panel.getByRole('searchbox',{name:'Lagerbewegungen suchen'});
  const stock=page.getByRole('searchbox',{name:'Bestand suchen'});
  await stock.fill('MAT-11');
  await query.fill('LS-MUSTER-1');
  await expect(panel.getByText('1 von 2 Bewegungen',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Korrigieren',exact:true}).click();
  const quantity=panel.getByLabel('Korrekturmenge');
  const reason=panel.getByLabel('Begründung');
  await expect(quantity).toHaveAttribute('max','3');
  await quantity.fill('2');
  await reason.fill('Musterlieferung nachgezählt');
  await query.fill('kein Treffer');
  await expect(quantity).toBeHidden();
  await query.fill('LS-MUSTER-1');
  await expect(quantity).toHaveValue('2');
  await expect(reason).toHaveValue('Musterlieferung nachgezählt');
  await quantity.fill('1');
  await panel.getByRole('button',{name:'Korrektur buchen',exact:true}).click();
  const request=await held.request;
  expect(request.request().postDataJSON()).toMatchObject({quantity:1,reason:'Musterlieferung nachgezählt'});
  await query.fill('kein Treffer');
  await expect(panel.getByText('Eine ausgeblendete Korrektur wird noch gebucht.',{exact:true})).toBeVisible();
  received=true;
  await request.fulfill({status:201,json:booked});
  await expect(panel.getByText('Eine ausgeblendete Korrektur wird noch gebucht.',{exact:true})).toHaveCount(0);
  await query.fill('LS-MUSTER-1');
  await expect(panel.getByText('1 von 3 Bewegungen',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Korrigieren',exact:true}).click();
  await expect(quantity).toHaveAttribute('max','2');
  await panel.getByRole('button',{name:'Filter zurücksetzen',exact:true}).press('Enter');
  await expect(query).toBeFocused();
  await expect(stock).toHaveValue('MAT-11');
});
