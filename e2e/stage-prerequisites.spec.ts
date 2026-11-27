import { expect, test } from '@playwright/test';
import { projectResponse } from '../src/server/contracts';
import { project, signIn } from './session';

test('Fehlende Referenzen sperren nur den betreffenden Projektübergang bis zum Speichern',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await signIn(page);
  const headers={Origin:new URL(page.url()).origin};
  const contacts=await page.request.get('/api/v1/contacts');
  expect(contacts.ok()).toBeTruthy();
  const name='Muster Referenzen '+crypto.randomUUID().slice(0,8);
  const response=await page.request.post('/api/v1/projects',{headers,data:{name,contact_id:(await contacts.json())[0].id}});
  expect(response.status()).toBe(201);
  const path='/api/v1/projects/'+(await response.json()).id;
  await page.reload();
  await page.getByRole('button',{name:'Menü',exact:true}).click();
  await project(page,name);
  const actions=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Auftrag und Abrechnung',exact:true})});
  const offer=actions.getByRole('button',{name:'Angebot',exact:true});
  const completed=actions.getByRole('button',{name:'Abgerechnet',exact:true});
  const cancel=actions.getByRole('button',{name:'Abgesagt',exact:true});
  const save=actions.getByRole('button',{name:'Referenzen speichern',exact:true});
  async function expectRejectedStage(stage:string,currentStage:string,message:string) {
    const blocked=await page.request.patch(path+'/stage',{headers,data:{stage}});
    expect(blocked.status()).toBe(409);
    expect(await blocked.json()).toMatchObject({error:message});
    expect(await (await page.request.get(path)).json()).toMatchObject({stage:currentStage});
  }

  await actions.getByRole('button',{name:'Planung',exact:true}).click();
  const offerHint=actions.getByText('Für „Angebot“ zuerst das Feld „Angebotsreferenz“ speichern.');
  await expect(offerHint).toBeVisible();
  await expect(offer).toBeDisabled();
  await expect(cancel).toBeEnabled();
  await expectRejectedStage('offered','planning','Zuerst eine Angebotsreferenz erfassen.');
  const offerField=actions.getByLabel('Angebotsreferenz');
  await offerField.fill('ANG-22');
  await expect(offer).toBeDisabled();
  await save.press('Enter');
  await expect(offerHint).toHaveCount(0);
  await expect(offer).toBeEnabled();
  await offer.press('Enter');
  await actions.getByRole('button',{name:'Bestätigt',exact:true}).click();
  await actions.getByRole('button',{name:'In Durchführung',exact:true}).click();

  const invoiceHint=actions.getByText('Für „Abgerechnet“ zuerst das Feld „Rechnungsreferenz“ speichern.');
  await expect(invoiceHint).toBeVisible();
  await expect(completed).toBeDisabled();
  await expect(cancel).toBeEnabled();
  await expectRejectedStage('complete','running','Zuerst eine Rechnungsreferenz erfassen.');
  await actions.getByLabel('Rechnungsreferenz').fill('RE-22');
  await expect(completed).toBeDisabled();
  await save.press('Enter');
  await expect(invoiceHint).toHaveCount(0);
  await expect(completed).toBeEnabled();
  await completed.press('Enter');
  await expect(page.getByRole('status').getByText('Projektstatus: Abgerechnet.')).toBeVisible();
  expect(await (await page.request.get(path)).json()).toMatchObject({stage:'complete',offer_ref:'ANG-22',invoice_ref:'RE-22'});
});

test('Eine gespeicherte Haben-Angebots-ID genügt bei deaktivierter Anbindung',async({page})=>{
  const record=projectResponse.parse({
    id:'a1c8e5aa-981a-4968-b08d-379612166e8b',name:'Verknüpfter Musterauftrag',stage:'planning',
    contact_id:'59418d14-ff9e-414e-aa1c-cf992d7b7bb3',notes:'',due:null,offer_ref:'',invoice_ref:'',
    external_link:'',communication_note:'',haben_offer_id:'59418d14-ff9e-414e-aa1c-cf992d7b7bb2',
    haben_offer:null,cost_center:'',zammad_ticket_id:null,
  });
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{haben:false,zammad:false}}));
  await signIn(page);
  await project(page,record.name);
  await expect(page.getByRole('button',{name:'Angebot',exact:true})).toBeEnabled();
  await expect(page.getByText(/zuerst das Feld/)).toHaveCount(0);
  await expect(page.getByText('Haben-Angebot',{exact:true})).toHaveCount(0);
});
