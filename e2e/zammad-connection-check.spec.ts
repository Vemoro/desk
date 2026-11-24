import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Der Zammad-Lesetest startet erst beim Absenden und zeigt sein Ergebnis in den Einstellungen',async({page})=>{
  const submitted: unknown[]=[];
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{haben:false,zammad:true}}));
  await page.route('**/api/v1/integrations/zammad/check',route=>{
    const body=route.request().postDataJSON();
    submitted.push(body);
    return body.id===42 ? route.fulfill({status:201,json:{ok:true}})
      : route.fulfill({status:502,json:{error:'Zammad ist nicht erreichbar oder die Antwort ist unklar.'}});
  });
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Einstellungen',exact:true}).click();
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
  expect(submitted).toEqual([{id:42},{id:43}]);
});
