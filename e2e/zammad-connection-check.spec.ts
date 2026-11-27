import { expect, test } from '@playwright/test';
import { holdRoute, signIn } from './session';

test('Ein laufender Zammad-Lesetest bleibt beim Bereichswechsel erhalten',async({page})=>{
  const held=holdRoute();
  await page.route('**/api/v1/integrations/zammad/check',held.resolve);
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Einstellungen',exact:true}).click();
  const integrations=page.getByRole('link',{name:/^Integrationen /});
  await integrations.click();
  const ticket=page.getByRole('spinbutton',{name:'Zammad-Ticket-ID'});
  await ticket.fill('42');
  await page.getByRole('button',{name:'Zammad-Verbindung prüfen'}).click();
  const request=await held.request;
  expect(request.request().postDataJSON()).toEqual({id:42});
  await page.getByRole('link',{name:/^Team /}).click();
  await expect(ticket).toBeHidden();
  await integrations.click();
  await expect(ticket).toHaveValue('42');
  await expect(page.getByRole('button',{name:'Wird geprüft …'})).toBeDisabled();
  await request.fulfill({status:201,json:{ok:true}});
  await expect(page.getByText('Ticket 42 und sein Verlauf sind erreichbar.')).toBeVisible();
});

test('Der Zammad-Lesetest startet erst beim Absenden und zeigt sein Ergebnis in den Einstellungen',async({page})=>{
  const submitted: unknown[]=[];
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{haben:false,zammad:true}}));
  await page.route('**/api/v1/integrations/zammad/check',route=>{
    const body=route.request().postDataJSON();
    submitted.push(body);
    if(body.id===42) return route.fulfill({status:201,json:{ok:true}});
    if(body.id===43) return route.fulfill({status:502,json:{error:'Zammad ist nicht erreichbar oder die Antwort ist unklar.'}});
    return route.fulfill({status:401,json:{error:'Anmeldung erforderlich.'}});
  });
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Einstellungen',exact:true}).click();
  await page.getByRole('link',{name:/^Integrationen /}).click();
  const panel=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Integrationen',exact:true})});
  const id=panel.getByRole('spinbutton',{name:'Zammad-Ticket-ID'});
  const submit=panel.getByRole('button',{name:'Zammad-Verbindung prüfen'});
  await id.fill('42');
  expect(submitted).toEqual([]);
  await submit.click();
  await expect(panel.getByRole('status')).toHaveText('Ticket 42 und sein Verlauf sind erreichbar.');
  await id.fill('43');
  await submit.click();
  await expect(panel.getByRole('alert')).toContainText('Zammad ist nicht erreichbar');
  await expect(panel.getByRole('status')).toHaveCount(0);
  await id.fill('44');
  await submit.click();
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('Anmeldung erforderlich.');
  expect(submitted).toEqual([{id:42},{id:43},{id:44}]);
});
