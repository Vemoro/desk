import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Projektreservierungen nach Ressourcentyp und Status filtern',async({page})=>{
  const projects=[
    {id:'montage',name:'Musterinstallation',stage:'planning'},
    {id:'event',name:'Musterveranstaltung',stage:'planning'},
    {id:'empty',name:'Musterprojekt ohne Planung',stage:'planning'},
  ];
  const window={starts_at:'2028-04-15T08:00:00Z',ends_at:'2028-04-15T09:00:00Z',quantity:1};
  const reservations=[
    {...window,id:'r1',project_id:'montage',user_id:'mira',status:'tentative'},
    {...window,id:'r2',project_id:'montage',item_id:'kit',status:'tentative'},
    {...window,id:'r3',project_id:'event',user_id:'other',status:'tentative'},
  ];
  const mocks={
    projects,
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
  await page.route('**/api/v1/reservations/r1',route=>{
    expect(route.request().postDataJSON()).toEqual({status:'released'});
    reservations[0].status='released';
    return route.fulfill({json:reservations[0]});
  });
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  await page.getByRole('button',{name:'Musterinstallation',exact:true}).click();
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  const panel=page.getByRole('heading',{name:'Ressourcenplanung',exact:true}).locator('xpath=../..');
  const type=panel.getByLabel('Ressourcentyp');
  const status=panel.getByLabel('Status filtern');
  await expect(panel.getByText('2 Reservierungen',{exact:true})).toBeVisible();
  await expect(panel.getByRole('cell',{name:'Noah Beispiel',exact:true})).toHaveCount(0);
  await type.selectOption({label:'Personal'});
  await status.selectOption({label:'Vorgemerkt'});
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  await expect(panel.getByRole('cell',{name:'Montagekoffer',exact:true})).toBeHidden();
  await panel.getByRole('button',{name:'Freigeben',exact:true}).click();
  await expect(panel.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
  await expect(type).toHaveValue('user');
  await expect(status).toHaveValue('tentative');
  await panel.getByRole('button',{name:'Filter zurücksetzen',exact:true}).click();
  await expect(panel.getByRole('row').filter({hasText:'Mira Muster'}).getByText('Freigegeben',{exact:true})).toBeVisible();
  await expect(panel.getByText('2 Reservierungen',{exact:true})).toBeVisible();
  await type.selectOption({label:'Inventar'});
  await page.getByRole('button',{name:'Projekte',exact:true}).last().click();
  await page.getByRole('button',{name:'Musterveranstaltung',exact:true}).click();
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  await expect(type).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(panel.getByRole('cell',{name:'Noah Beispiel',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Projekte',exact:true}).last().click();
  await page.getByRole('button',{name:'Musterprojekt ohne Planung',exact:true}).click();
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  await expect(panel.getByText('0 Reservierungen',{exact:true})).toBeVisible();
  await expect(panel.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
});
