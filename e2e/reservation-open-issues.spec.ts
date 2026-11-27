import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

test('Offene Geräteausgaben greifen mit Status, Datum und Ressourcentyp und reagieren auf Rückgabe',async({page})=>{
  const slot={project_id:'muster',location_id:'lager',quantity:2,status:'released',checked_out:2,
    starts_at:'2028-05-17T08:00:00Z',ends_at:'2028-05-17T10:00:00Z'};
  const outstanding={...slot,id:'r1',item_id:'kit'};
  const resources={
    projects:[{id:'muster',name:'Musterinstallation',stage:'running'}],
    items:[
      {id:'kit',name:'Montagekoffer',kind:'equipment'},
      {id:'firm',name:'Werkzeugkoffer',kind:'equipment'},
      {id:'later',name:'Transportwagen',kind:'equipment'},
      {id:'returned',name:'Messgerät',kind:'equipment'},
      {id:'consumable',name:'Klebeband',kind:'consumable'},
    ],
    locations:[{id:'lager',name:'Musterlager'}],
    reservations:[
      outstanding,
      {...slot,id:'r2',item_id:'firm',status:'firm'},
      {...slot,id:'r3',item_id:'later',starts_at:'2028-05-18T08:00:00Z',ends_at:'2028-05-18T10:00:00Z'},
      {...slot,id:'r4',item_id:'returned',checked_out:0},
      {...slot,id:'r5',item_id:'consumable',checked_out:0},
      {...slot,id:'r6',user_id:'worker',checked_out:0},
    ],
  };
  for(const [resource,json] of Object.entries(resources)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/users',route=>route.fulfill({json:[{id:'worker',name:'Mira Muster'}]}));
  await page.route('**/api/v1/movements',route=>{
    expect(route.request().postDataJSON()).toEqual({reservation_id:'r1',action:'return',quantity:2});
    outstanding.checked_out=0;
    return route.fulfill({json:{id:'m1'}});
  });
  await page.route('**/api/v1/lines',route=>route.fulfill({json:{id:'line'}}));
  await signIn(page);
  await project(page,'Musterinstallation');
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
  const openField=panel.locator('label').filter({has:page.getByRole('checkbox',{name:'Nur offene Geräteausgaben',exact:true})});
  const open=openField.getByRole('checkbox');
  const type=panel.getByLabel('Ressourcentyp');
  const status=panel.getByLabel('Status filtern');
  const date=panel.getByLabel('Am Datum');
  const rows=panel.locator('tbody tr');
  await expect(rows).toHaveCount(6);
  await expect(open).toBeVisible();
  await expect(open).not.toBeChecked();

  await open.focus();
  await open.press('Space');
  await expect(open).toBeChecked();
  await expect(openField).toHaveCSS('outline-style','solid');
  await expect(openField).toHaveCSS('outline-offset','-2px');
  await status.selectOption('released');
  await date.fill('2028-05-17');
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  await expect(rows.first()).toContainText('Montagekoffer');
  await type.selectOption('user');
  await expect(panel.getByText('0 Reservierungen',{exact:true})).toBeVisible();
  await expect(panel.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
  await type.selectOption('');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Montagekoffer');

  const returnStatus=await page.evaluate(async()=>{
    const response=await fetch('/api/v1/movements',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reservation_id:'r1',action:'return',quantity:2}),
    });
    return response.status;
  });
  expect(returnStatus).toBe(200);
  await page.getByText('Position anlegen',{exact:true}).click();
  await page.getByLabel('Position',{exact:true}).fill('Musterposition');
  await page.getByLabel('Einzelpreis netto in Euro').fill('12');
  const saveLine=page.getByRole('button',{name:'Position speichern',exact:true});
  await page.locator('form').filter({has:saveLine}).locator('select[name="kind"]').selectOption('buy');
  await saveLine.click();
  await expect(panel.getByText('0 Reservierungen',{exact:true})).toBeVisible();
  await expect(panel.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
  await expect(open).toBeChecked();
  await expect(date).toHaveValue('2028-05-17');
  await expect(status).toHaveValue('released');
  const reset=panel.getByRole('button',{name:'Filter zurücksetzen'});
  await reset.focus();
  await reset.press('Enter');
  await expect(type).toBeFocused();
  await expect(open).not.toBeChecked();
  await expect(type).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(date).toHaveValue('');
  await expect(panel.getByText('6 Reservierungen',{exact:true})).toBeVisible();
});
