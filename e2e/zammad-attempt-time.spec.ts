import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

test('Zammad zeigt den letzten Sendeversuch in lokaler Zeit und aktualisiert ihn',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const record={id:'projekt',name:'Musterinstallation',stage:'planning',zammad_ticket_id:42};
  const path='**/api/v1/projects/projekt/zammad';
  let attemptedAt='2026-11-24T09:05:00Z';
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route(path,route=>route.fulfill({json:{
    ticket:{id:42,number:'42',url:'https://zammad.example.test/#ticket/zoom/42'},
    articles:[{id:1,subject:'Termin',from:'kontakt@example.test',created_at:'2026-11-24T08:10:00Z',body:'Bitte um Rückmeldung.'}],
    outgoing:[
      {id:'first',subject:'Angebot',status:'unknown',attempted_at:attemptedAt},
      {id:'second',subject:'Bestätigung',status:'sent',attempted_at:'2026-11-24T08:10:00Z'},
      {id:'third',subject:'Älterer Eintrag',status:'sent'},
    ],
  }}));
  await page.route(path+'/outgoing/first',route=>{
    expect(route.request().postDataJSON()).toMatchObject({retry:true});
    attemptedAt='2026-11-24T10:49:00Z';
    return route.fulfill({json:{id:'first',status:'sent'}});
  });
  await signIn(page);
  await project(page,record.name);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  const panel=page.getByRole('region',{name:'Zammad'});
  const first=panel.getByRole('row').filter({hasText:'Angebot'});
  const second=panel.getByRole('row').filter({hasText:'Bestätigung'});
  const third=panel.getByRole('row').filter({hasText:'Älterer Eintrag'});
  const dateCell=first.locator('td[data-label="Letzter Versuch"]');
  await expect(dateCell).toHaveText('24.11.2026, 10:05');
  await dateCell.scrollIntoViewIfNeeded();
  await expect(dateCell).toBeInViewport();
  expect(await dateCell.evaluate(cell=>getComputedStyle(cell,'::before').content)).toContain('Letzter Versuch');
  await expect(second.locator('td[data-label="Letzter Versuch"]')).toHaveText('24.11.2026, 09:10');
  await expect(panel.getByText('kontakt@example.test · 24.11.2026, 09:10')).toBeVisible();
  await expect(third.locator('td[data-label="Letzter Versuch"]')).toHaveText('–');
  await first.getByRole('button',{name:'Erneut senden',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Erneut senden',exact:true}).click();
  await expect(dateCell).toHaveText('24.11.2026, 11:49');
});
