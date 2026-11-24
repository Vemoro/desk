import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Ressourcenplanung zeigt offene Ausgaben auch bei freigegebenen Geräten',async({page})=>{
  const core={project_id:'muster',starts_at:'2028-05-17T08:00:00Z',ends_at:'2028-05-17T12:00:00Z',quantity:3};
  const checked={...core,id:'r1',item_id:'kit',location_id:'lager',status:'released',checked_out:3};
  const mocks={
    projects:[{id:'muster',name:'Musterinstallation',stage:'running'}],
    items:[
      {id:'kit',name:'Montagekoffer',kind:'equipment'},
      {id:'spare',name:'Ersatzgerät',kind:'equipment'},
      {id:'tape',name:'Klebeband',kind:'consumable'},
    ],
    locations:[{id:'lager',name:'Musterlager'}],
    reservations:[
      checked,
      {...core,id:'r2',item_id:'spare',status:'firm',checked_out:0},
      {...core,id:'r3',item_id:'tape',status:'firm',checked_out:0},
      {...core,id:'r4',user_id:'muster-user',status:'firm',checked_out:0},
    ],
  };
  for(const [resource,json] of Object.entries(mocks)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/users',route=>route.fulfill({json:[{id:'muster-user',name:'Mira Muster'}]}));
  await page.route('**/api/v1/movements',route=>{
    expect(route.request().postDataJSON()).toEqual({action:'return',reservation_id:'r1',quantity:1});
    checked.checked_out=2;
    return route.fulfill({json:{id:'bewegung'}});
  });
  await signIn(page);
  const nav=page.getByRole('navigation',{name:'Hauptnavigation'});
  const openPlan=async()=>{
    await nav.getByRole('button',{name:'Projekte',exact:true}).click();
    await page.getByRole('button',{name:'Musterinstallation',exact:true}).click();
    await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  };
  await openPlan();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
  const quantity=(resource:string)=>panel.getByRole('row').filter({hasText:resource}).locator('td[data-label="Noch ausgegeben"]');
  await expect(quantity('Montagekoffer')).toHaveText('3');
  await expect(quantity('Ersatzgerät')).toHaveText('0');
  await expect(quantity('Klebeband')).toHaveText('–');
  await expect(quantity('Mira Muster')).toHaveText('–');
  await nav.getByRole('button',{name:'Projektlager',exact:true}).click();
  await page.getByText('Ausgabe, Rückgabe oder Verbrauch',{exact:true}).click();
  const form=page.locator('form').filter({has:page.getByRole('button',{name:'Bewegung buchen',exact:true})});
  await form.getByLabel('Bewegungsart').selectOption('return');
  await form.getByLabel('Projektreservierung').selectOption('r1');
  await form.getByRole('button',{name:'Bewegung buchen',exact:true}).click();
  await expect(page.getByText('Lagerbewegung gebucht.')).toBeVisible();
  await openPlan();
  await panel.getByLabel('Ressourcentyp').selectOption('item');
  await panel.getByLabel('Status filtern').selectOption('released');
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  await expect(quantity('Montagekoffer')).toHaveText('2');
});
