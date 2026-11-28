import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

const selected = {id:'muster-buero',name:'Büroinstallation Westflügel',stage:'confirmed',due:'2026-11-27T00:00:00.000Z',zammad_ticket_id:42};
const projects = [selected,
  {id:'muster-laufend',name:'Aufbau für Muster Auftragsservice',stage:'running',due:'2026-11-28T00:00:00.000Z'},
  {id:'muster-fertig',name:'Abgerechneter Musterauftrag',stage:'complete',due:'2026-11-27T00:00:00.000Z'},
  {id:'muster-abgesagt',name:'Abgesagter Musterauftrag',stage:'cancelled',due:'2026-11-27T00:00:00.000Z'},
];
const reservations = ['tentative','firm','released'].map((status,index)=>({
  id:'muster-reservierung-'+index, project_id:selected.id, status, quantity:1,
  starts_at:'2026-12-03T08:00:00Z', ends_at:'2026-12-03T12:00:00Z',
  user_id:'muster-person',duration_minutes:240,
}));
const outgoing = ['pending','unknown','failed','sent'].map((status,index)=>({
  id:'muster-versuch-'+index, status, subject:['Aufbauplan','Terminbestätigung','Unterlagen zur Installation','Projektinformationen'][index],
  attempted_at:'2026-11-27T09:00:00Z',
}));

async function mockStatusViews(page:Page) {
  await page.clock.setFixedTime(new Date('2026-11-28T10:00:00Z'));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:projects}));
  await page.route('**/api/v1/reservations?*',route=>route.fulfill({json:reservations}));
  await page.route('**/api/v1/users?*',route=>route.fulfill({json:[{id:'muster-person',name:'Noah Muster'}]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{haben:false,zammad:true}}));
  await page.route('**/api/v1/projects/muster-buero/zammad',route=>route.fulfill({json:{
    ticket:{number:'42',title:'Muster Auftragsservice',url:'https://zammad.example.test/#ticket/zoom/42'}, articles:[], outgoing,
  }}));
}

async function openProjects(page:Page) {
  const menu=page.getByRole('button',{name:'Menü',exact:true});
  if(await menu.isVisible()) await menu.click();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
}

for(const [theme,width] of [['light',1440],['dark',390]] as const){
  test(`Arbeitsstatus zeigt Ausnahmen in ${theme} bei ${width} Pixeln`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.addInitScript(value=>localStorage.setItem('desk-theme',value),theme);
    await mockStatusViews(page);
    let checks=0;
    await page.route('**/api/v1/projects/muster-buero/zammad/outgoing/muster-versuch-1',route=>{
      expect(route.request().postDataJSON()).toEqual({retry:false});
      checks++;
      return route.fulfill({json:{status:'unknown'}});
    });
    await signIn(page);
    await openProjects(page);
    const project=page.getByRole('button',{name:selected.name,exact:true});
    const overdue=page.getByRole('row').filter({has:project});
    await expect(overdue.getByText('Überfällig',{exact:true})).toBeVisible();
    const deadline=overdue.getByRole('cell',{name:/27\.11\.2026/});
    await expect(deadline).toHaveCount(1);
    for(const name of projects.slice(1).map(row=>row.name)){
      const row=page.getByRole('row').filter({hasText:name});
      await expect(row).toBeVisible();
      await expect(row.getByText('Überfällig',{exact:true})).toHaveCount(0);
    }

    await project.press('Enter');
    await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).press('Enter');
    const reservation=page.getByRole('table').filter({has:page.getByRole('columnheader',{name:'Ressource',exact:true})});
    await expect(reservation.locator('[data-work-status="waiting"]')).toHaveText('Vorgemerkt');
    await expect(reservation.locator('[data-work-status="active"]')).toHaveText('Fest reserviert');
    await expect(reservation.locator('[data-work-status="neutral"]')).toHaveText('Freigegeben');

    await page.getByRole('link',{name:'Kommunikation',exact:true}).press('Enter');
    const unknown=page.getByRole('row').filter({hasText:'Terminbestätigung'});
    const rejected=page.getByRole('row').filter({hasText:'Unterlagen zur Installation'});
    await expect(unknown.getByRole('cell').filter({hasText:'Ausgang unklar'})).toContainText('Mit „Prüfen“');
    await expect(rejected.getByRole('cell').filter({hasText:'Abgelehnt'})).toContainText('Zammad hat den Versuch abgelehnt.');
    await expect(page.getByRole('row').filter({hasText:'Aufbauplan'}).getByText('Ausstehend',{exact:true})).toBeVisible();
    await expect(page.getByRole('row').filter({hasText:'Projektinformationen'}).getByText('An Zammad übergeben',{exact:true})).toBeVisible();
    await unknown.getByRole('button',{name:'Prüfen',exact:true}).press('Enter');
    await expect.poll(()=>checks).toBe(1);
  });
}
