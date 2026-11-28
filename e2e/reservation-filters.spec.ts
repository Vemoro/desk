import { test, expect, type Page } from '@playwright/test';
import { holdRoute, project, settleResponse, signIn } from './session';

async function planning(page:Page, holdStatus=false) {
  const window={starts_at:'2028-04-15T08:00:00Z',ends_at:'2028-04-15T09:00:00Z',quantity:1};
  const reservations=[
    {...window,id:'r1',project_id:'montage',user_id:'mira',status:'tentative'},
    {...window,id:'r2',project_id:'montage',item_id:'kit',status:'tentative'},
    {...window,id:'r3',project_id:'event',user_id:'other',status:'tentative'},
    {...window,id:'r4',project_id:'montage',user_id:'other',status:'firm'},
  ];
  const mocks={
    projects:[
      {id:'montage',name:'Musterinstallation',stage:'confirmed'},
      {id:'event',name:'Musterveranstaltung',stage:'planning'},
    ],
    reservations,
    items:[{id:'kit',name:'Montagekoffer'}],
  };
  for(const [resource,json] of Object.entries(mocks)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/users',route=>route.fulfill({json:[
    {id:'mira',name:'Mira Muster'},
    {id:'other',name:'Noah Beispiel'},
  ]}));
  const firm=holdRoute(), released=holdRoute();
  await page.route('**/api/v1/reservations/r1',route=>{
    if(holdStatus) return (route.request().postDataJSON().status==='firm' ? firm : released).resolve(route);
    reservations[0].status=route.request().postDataJSON().status;
    return route.fulfill({json:reservations[0]});
  });

  await signIn(page);
  await project(page,'Musterinstallation');
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
  return {panel,firm,released,reservation:reservations[0]};
}

test('Ressourcenfilter kombinieren, nach Freigabe behalten und zurücksetzen',async({page})=>{
  const {panel}=await planning(page);
  const type=panel.getByLabel('Ressourcentyp');
  const status=panel.getByLabel('Status filtern');
  await expect(panel.getByText('3 Reservierungen',{exact:true})).toBeVisible();
  await type.selectOption('user');
  await status.selectOption('tentative');
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  await expect(panel.getByRole('cell',{name:'Mira Muster',exact:true})).toBeVisible();
  await expect(panel.getByRole('cell',{name:'Montagekoffer',exact:true})).toBeHidden();
  await expect(panel.getByRole('cell',{name:'Noah Beispiel',exact:true})).toBeHidden();

  await panel.getByRole('button',{name:'Freigeben',exact:true}).press('Enter');
  await page.getByRole('dialog',{name:'Reservierung freigeben'}).getByRole('button',{name:'Reservierung freigeben'}).click();
  await expect(panel.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
  await expect(type).toHaveValue('user');
  await expect(status).toHaveValue('tentative');
  await expect(type).toBeFocused();
  await panel.getByRole('button',{name:'Filter zurücksetzen',exact:true}).press('Enter');
  await expect(type).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(type).toBeFocused();
  await expect(panel.getByRole('row').filter({hasText:'Mira Muster'}).getByText('Freigegeben',{exact:true})).toBeVisible();

  await type.selectOption('item');
  await status.selectOption('tentative');
  await page.evaluate(()=>{location.hash='projects/event/planning';});
  await expect(page.getByRole('heading',{name:'Musterveranstaltung',exact:true})).toBeVisible();
  await expect(type).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  await expect(panel.getByRole('cell',{name:'Noah Beispiel',exact:true})).toBeVisible();
  await expect(panel.getByRole('cell',{name:'Montagekoffer',exact:true})).toBeHidden();
});

test('Fest reservieren erhält Auswahl und Tastaturfokus bei gefilterter Tabelle',async({page})=>{
  const {panel}=await planning(page);
  const type=panel.getByLabel('Ressourcentyp');
  const status=panel.getByLabel('Status filtern');
  await type.selectOption('user');
  await status.selectOption('tentative');
  await panel.getByRole('button',{name:'Fest reservieren',exact:true}).press('Enter');
  await expect(panel.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
  await expect(type).toHaveValue('user');
  await expect(status).toHaveValue('tentative');
  await expect(type).toBeFocused();
  await status.selectOption('firm');
  await expect(panel.getByText('2 Reservierungen',{exact:true})).toBeVisible();
  await expect(panel.getByRole('row').filter({hasText:'Mira Muster'}).getByText('Fest reserviert',{exact:true})).toBeVisible();
});

test('Statusaktion erhält Fokus nach überlappender Aktualisierung',async({page})=>{
  const {panel,firm,released,reservation}=await planning(page,true);
  const type=panel.getByLabel('Ressourcentyp');
  const row=panel.getByRole('row').filter({hasText:'Mira Muster'});
  await type.selectOption('user');
  const firmButton=row.getByRole('button',{name:'Fest reservieren',exact:true});
  const releaseButton=row.getByRole('button',{name:'Freigeben',exact:true});
  await firmButton.press('Enter');
  const first=await firm.request;
  await page.keyboard.press('Shift+Tab');
  await expect(releaseButton).toBeFocused();
  await page.keyboard.press('Enter');
  const modal=page.getByRole('dialog',{name:'Reservierung freigeben'});
  await modal.getByRole('button',{name:'Reservierung freigeben'}).click();
  const second=await released.request;

  reservation.status='firm';
  await settleResponse(page,first,reservation);
  await expect(row.getByText('Fest reserviert',{exact:true})).toBeVisible();
  await expect(modal).toBeVisible();

  reservation.status='released';
  await settleResponse(page,second,reservation);
  await expect(row.getByText('Freigegeben',{exact:true})).toBeVisible();
  await expect(releaseButton).toBeHidden();
  await expect(type).toBeFocused({timeout:2000});
});

test('Reservierungsfreigabe bestätigt einmal und gibt den Fokus bei Abbruch oder Fehler zurück',async({page})=>{
  const {panel,reservation}=await planning(page);
  const type=panel.getByLabel('Ressourcentyp');
  const status=panel.getByLabel('Status filtern');
  await type.selectOption('user');
  await status.selectOption('tentative');
  const first=holdRoute(),second=holdRoute();
  let requests=0;
  await page.route('**/api/v1/reservations/r1',route=>(requests++===0?first:second).resolve(route));
  const release=panel.getByRole('button',{name:'Freigeben',exact:true});
  const modal=page.getByRole('dialog',{name:'Reservierung freigeben'});
  const confirm=modal.getByRole('button',{name:'Reservierung freigeben',exact:true});

  await release.press('Enter');
  await expect(modal.getByRole('button',{name:'Abbrechen',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(release).toBeFocused();
  expect(requests).toBe(0);

  await release.press('Enter');
  await confirm.evaluate(button=>{button.click();button.click();});
  const rejected=await first.request;
  expect(requests).toBe(1);
  await settleResponse(page,rejected,{error:'Kurzzeitig nicht erreichbar.'},503);
  await expect(modal.getByRole('alert')).toHaveText('Kurzzeitig nicht erreichbar.');
  await modal.getByRole('button',{name:'Schließen',exact:true}).click();
  await expect(release).toBeFocused();

  await release.press('Enter');
  await confirm.click();
  const saved=await second.request;
  expect(requests).toBe(2);
  reservation.status='released';
  await settleResponse(page,saved,reservation);
  await expect(panel.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
  await expect(type).toBeFocused();
});
