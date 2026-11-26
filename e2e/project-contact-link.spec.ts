import { expect, test, type Page } from '@playwright/test';
import { holdRoute, project, settleResponse, signIn } from './session';

const contactName='Kontor Muster';
const assignedName='Musterinstallation';
const missingName='Musterwartung';
async function openTarget(page:Page,saveError?:string){
  const contacts=[
    {id:'first',name:contactName,email:'eins@example.test'},
    {id:'second',name:contactName,email:'zwei@example.test'},
  ];
  const projects=[
    {id:'assigned',name:assignedName,stage:'planning',contact_id:'first'},
    {id:'missing',name:missingName,stage:'planning',contact_id:'unknown'},
  ];
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:contacts}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:projects}));
  await page.route('**/api/v1/projects/assigned',route=>{
    expect(route.request().method()).toBe('PATCH');
    if(saveError) return route.fulfill({status:400,json:{error:saveError}});
    projects[0].contact_id=route.request().postDataJSON().contact_id;
    return route.fulfill({json:projects[0]});
  });
  await signIn(page);
  await project(page,assignedName);
  return page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Projektdaten',exact:true})});
}

test('Projektdetail öffnet den tatsächlich gespeicherten Kontakt per ID',async({page})=>{
  const panel=await openTarget(page);
  const action=panel.getByRole('link',{name:contactName,exact:true});
  const edit=panel.getByRole('combobox',{name:'Kontakt',exact:true});
  await expect(action).toHaveAttribute('href','#contacts/first');
  await edit.selectOption('second');
  await expect(action).toHaveAttribute('href','#contacts/first');
  await action.focus();
  await page.keyboard.press('Enter');
  let detail=page.getByRole('region',{name:contactName,exact:true});
  await expect(detail.getByLabel('E-Mail')).toHaveValue('eins@example.test');

  await page.goBack();
  await expect(edit).toHaveValue('first');
  await edit.selectOption('second');
  await panel.getByRole('button',{name:'Projektdaten speichern'}).click();
  await expect(action).toHaveAttribute('href','#contacts/second');
  await action.click();
  detail=page.getByRole('region',{name:contactName,exact:true});
  await expect(detail.getByLabel('E-Mail')).toHaveValue('zwei@example.test');

  await project(page,missingName);
  await expect(panel.getByText('Kontakt nicht verfügbar',{exact:true})).toBeVisible();
  await expect(action).toHaveCount(0);
  await expect(edit).toBeVisible();
});

test('Eine Haben-Rückmeldung bleibt beim zugehörigen Kontakt',async({page})=>{
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{haben:true,zammad:false}}));
  await page.route('**/api/v1/contacts/second/haben',route=>route.fulfill({json:{
    action:'conflict',haben_id:'muster',desk:{name:contactName,email:'zwei@example.test'},
    haben:{name:'Kontor aus Haben',email:'kontakt@example.test'},
  }}));
  const panel=await openTarget(page);
  await panel.getByRole('link',{name:contactName,exact:true}).click();
  const detail=page.getByRole('region',{name:contactName,exact:true});
  await expect(detail.getByLabel('E-Mail')).toHaveValue('eins@example.test');
  const list=page.getByRole('region',{name:'Interessenten und Kontakte',exact:true});
  await list.getByRole('row').filter({hasText:'zwei@example.test'}).getByRole('button',{name:contactName}).click();
  await expect(detail.getByLabel('E-Mail')).toHaveValue('zwei@example.test');
  await detail.getByText('Haben-Kontakt',{exact:true}).click();
  const habenId=detail.getByLabel('Vorhandene Haben-Kontakt-ID');
  await habenId.fill('muster-zweiter-kontakt');
  await detail.getByRole('button',{name:'Abgleichen',exact:true}).click();
  await expect(detail.getByRole('button',{name:'Haben übernehmen'})).toBeVisible();
  await page.goBack();
  await expect(detail.getByLabel('E-Mail')).toHaveValue('eins@example.test');
  await expect(habenId).toHaveValue('');
  await expect(detail.getByRole('button',{name:'Haben übernehmen'})).toHaveCount(0);
});

test('Verspätete Haben-Rückmeldung lässt den Konflikt des geöffneten Kontakts stehen',async({page})=>{
  const conflict=(email:string)=>({
    action:'conflict',haben_id:'muster',desk:{name:contactName,email},
    haben:{name:'Kontor aus Haben',email:'kontakt@example.test'},
  });
  const pending=holdRoute();
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{haben:true,zammad:false}}));
  await page.route('**/api/v1/contacts/first/haben',pending.resolve);
  await page.route('**/api/v1/contacts/second/haben',route=>route.fulfill({json:conflict('zwei@example.test')}));
  const panel=await openTarget(page);
  await panel.getByRole('link',{name:contactName,exact:true}).click();
  const detail=page.getByRole('region',{name:contactName,exact:true});
  await detail.getByText('Haben-Kontakt',{exact:true}).click();
  const sync=detail.getByRole('button',{name:'Abgleichen',exact:true});
  await sync.click();
  const oldRequest=await pending.request;
  const list=page.getByRole('region',{name:'Interessenten und Kontakte',exact:true});
  await list.getByRole('row').filter({hasText:'zwei@example.test'}).getByRole('button',{name:contactName}).click();
  await expect(detail.getByLabel('E-Mail')).toHaveValue('zwei@example.test');
  await sync.click();
  const resolveConflict=detail.getByRole('button',{name:'Haben übernehmen'});
  await expect(resolveConflict).toBeVisible();
  await settleResponse(page,oldRequest,conflict('eins@example.test'));
  await expect(resolveConflict).toBeVisible();
});

test('Fehler beim Speichern des Projekts bleibt im Projekt',async({page})=>{
  const message='Projekt konnte nicht gespeichert werden.';
  const panel=await openTarget(page,message);
  await panel.getByRole('combobox',{name:'Kontakt',exact:true}).selectOption('second');
  await panel.getByRole('button',{name:'Projektdaten speichern'}).click();
  await expect(page.getByRole('alert')).toHaveText(message);
  const link=panel.getByRole('link',{name:contactName,exact:true});
  await expect(link).toHaveAttribute('href','#contacts/first');
  await link.click();
  const detail=page.getByRole('region',{name:contactName,exact:true});
  await expect(detail.getByLabel('E-Mail')).toHaveValue('eins@example.test');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
