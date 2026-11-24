import { expect, test } from '@playwright/test';
import { signIn } from './session';

const cases = [
  {label:'HTML 502',status:502,contentType:'text/html',body:'<h1>Bad Gateway</h1>',
    text:'Die Aktion konnte nicht abgeschlossen werden (HTTP 502).'},
  {label:'leerer 401',status:401,contentType:'text/plain',body:'',
    text:'Die Aktion konnte nicht abgeschlossen werden (HTTP 401).',logsOut:true},
  {label:'JSON 409',status:409,contentType:'application/json',body:'{"error":"Der Kontakt ist bereits vorhanden."}',
    text:'Der Kontakt ist bereits vorhanden.'},
  {label:'JSON null',status:409,contentType:'application/json',body:'null',
    text:'Die Aktion konnte nicht abgeschlossen werden (HTTP 409).'},
  {label:'nicht-textförmiges error',status:409,contentType:'application/json',body:'{"error":12}',
    text:'Die Aktion konnte nicht abgeschlossen werden (HTTP 409).'},
  {label:'HTML 2xx',status:200,contentType:'text/html',body:'<p>Keine JSON-Antwort</p>',
    text:'Desk hat keine gültige JSON-Antwort erhalten.'},
  {label:'leere 2xx',status:204,contentType:'text/plain',body:'',
    text:'Desk hat keine gültige JSON-Antwort erhalten.'},
];

for(const response of cases) {
  test(`Desk verarbeitet ${response.label} nach einem Kontaktformular`,async({page})=>{
    await page.route('**/api/v1/contacts**',async route=>{
      if(route.request().method()!=='POST') return route.continue();
      const {status,contentType,body}=response;
      await route.fulfill({status,contentType,body});
    });
    await signIn(page);
    await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
    await page.getByText('Kontakt anlegen',{exact:true}).click();
    await page.getByLabel('Name',{exact:true}).fill('Musterkontakt');
    await page.getByRole('button',{name:'Kontakt speichern',exact:true}).click();
    await expect(page.getByRole('alert')).toHaveText(response.text);
    await expect(page.getByRole('heading',{name:response.logsOut?'Anmelden':'Kontakte',exact:true})).toBeVisible();
  });
}
