import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

test('Die Ticketdetails erklären die Sperre beim Laden und bei Versandhistorie',async({page})=>{
  const name='Büroinstallation Westflügel';
  const first=Promise.withResolvers<void>();
  const retry=Promise.withResolvers<void>();
  let retrying=false;
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{haben:false,zammad:true}}));
  await page.route(/\/api\/v1\/projects\?/,async route=>{
    const response=await route.fetch();
    const projects=await response.json() as {name:string}[];
    await route.fulfill({response,json:projects.map(row=>row.name===name ? {...row,zammad_ticket_id:42} : row)});
  });
  await page.route('**/api/v1/projects/*/zammad',async route=>{
    // The development build can run mount effects twice before the explicit retry.
    if(!retrying) {
      await first.promise;
      return route.fulfill({status:502,json:{error:'Verlauf vorübergehend nicht verfügbar.'}});
    }
    await retry.promise;
    return route.fulfill({json:{
      ticket:{id:42,number:'TEST-42',url:'https://example.test/#ticket/zoom/42'},articles:[],
      outgoing:[{id:'sendeversuch-1',subject:'Musterangebot',status:'sent'}],
    }});
  });

  await signIn(page);
  await project(page,name);
  await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
  const unlink=page.getByRole('button',{name:'Ticketverknüpfung lösen',exact:true});
  const refresh=page.getByRole('button',{name:'Verlauf aktualisieren'});
  const waiting='Die Verknüpfung lässt sich lösen, sobald der Ticketverlauf geprüft ist.';
  await expect(unlink).toBeDisabled();
  await expect(unlink).toHaveAccessibleDescription(waiting);
  first.resolve();
  await expect(page.getByRole('alert')).toContainText('Verlauf vorübergehend nicht verfügbar.');
  await expect(unlink).toBeEnabled();
  await expect(page.getByText(waiting,{exact:true})).toHaveCount(0);

  retrying=true;
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(unlink).toHaveAccessibleDescription(waiting);
  retry.resolve();
  await expect(unlink).toHaveCount(0);
  await expect(page.getByRole('complementary',{name:'Vorgangsdetails'}))
    .toContainText('Die Verknüpfung bleibt bestehen, weil für dieses Ticket Sendeversuche vorliegen.');
});

test('Zammad-Zuordnung verlangt Bestätigung und erlaubt erneutes Verknüpfen',async({page})=>{
  const name='Büroinstallation Westflügel';
  const note='Manueller Kontakt zum Musterkunden';
  const url='https://example.test/vorgang';
  let linked:number|null=42;
  const submitted:unknown[]=[];
  let shouldRejectLink=true;
  const allowLinkError=Promise.withResolvers<void>();
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{haben:false,zammad:true}}));
  await page.route(/\/api\/v1\/projects\?/,async route=>{
    const response=await route.fetch();
    const projects=await response.json() as {name:string}[];
    const json=projects.map(row=>row.name===name
      ? {...row,zammad_ticket_id:linked,communication_note:note,external_link:url} : row);
    await route.fulfill({response,json});
  });
  await page.route('**/api/v1/projects/*/zammad',route=>route.fulfill({json:{
    ticket:linked ? {id:linked,number:`TEST-${linked}`,url:`https://example.test/#ticket/zoom/${linked}`} : undefined,
    articles:[],outgoing:[],
  }}));
  await page.route('**/api/v1/projects/*/zammad/unlink',route=>{
    submitted.push(route.request().postDataJSON());
    linked=null;
    return route.fulfill({status:201,json:{ok:true}});
  });
  await page.route('**/api/v1/projects/*/zammad/link',async route=>{
    const {id}=route.request().postDataJSON();
    if(shouldRejectLink) {
      shouldRejectLink=false;
      await allowLinkError.promise;
      return route.fulfill({status:502,json:{error:'Ticket vorübergehend nicht verfügbar.'}});
    }
    linked=id;
    return route.fulfill({status:201,json:{id}});
  });

  await signIn(page);
  await project(page,name);
  await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
  const unlink=page.getByRole('button',{name:'Ticketverknüpfung lösen'});
  await expect(page.getByRole('link',{name:'Ticket TEST-42 öffnen'})).toBeVisible();
  await unlink.click();
  const confirmation=page.getByRole('dialog',{name:'Ticketverknüpfung lösen'});
  await expect(confirmation).toContainText('TEST-42');
  await confirmation.getByRole('button',{name:'Abbrechen'}).click();
  await expect(unlink).toBeFocused();
  expect(submitted).toEqual([]);
  await expect(page.getByRole('link',{name:'Ticket TEST-42 öffnen'})).toBeVisible();

  await unlink.click();
  await confirmation.getByRole('button',{name:'Verknüpfung lösen',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Ticketverknüpfung gelöst.');
  expect(submitted).toEqual([{id:42}]);
  await expect(page.getByRole('link',{name:'Ticket TEST-42 öffnen'})).toHaveCount(0);
  await expect(page.getByText(note,{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Vorgang öffnen'})).toHaveAttribute('href',url);
  await expect(page.getByLabel('Vorgangslink')).toHaveCount(0);

  const linkButton=page.getByRole('button',{name:'Ticket verknüpfen',exact:true});
  await expect(page.getByLabel('Ticket-ID')).toHaveCount(0);
  await linkButton.click();
  const dialog=page.getByRole('dialog',{name:'Ticket verknüpfen'});
  await expect(dialog.getByLabel('Ticket-ID')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button',{name:'Ticket verknüpfen',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button',{name:'Schließen',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(linkButton).toBeFocused();
  await linkButton.click();
  await page.getByLabel('Ticket-ID').fill('43');
  await dialog.getByRole('button',{name:'Ticket verknüpfen',exact:true}).click();
  try {
    await expect(dialog.getByRole('button',{name:'Wird gespeichert …'})).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Ticket-ID')).toBeFocused();
  } finally {
    allowLinkError.resolve();
  }
  await expect(dialog.getByRole('alert')).toHaveText('Ticket vorübergehend nicht verfügbar.');
  await expect(dialog.getByLabel('Ticket-ID')).toHaveValue('43');
  await dialog.getByRole('button',{name:'Ticket verknüpfen',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Ticket TEST-43 öffnen'})).toBeVisible();
});
