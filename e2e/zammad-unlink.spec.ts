import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

test('Zammad-Zuordnung verlangt Bestätigung und erlaubt erneutes Verknüpfen',async({page})=>{
  const name='Büroinstallation Westflügel';
  const note='Manueller Kontakt zum Musterkunden';
  const url='https://example.test/vorgang';
  let linked:number|null=42;
  const submitted:unknown[]=[];
  let shouldRejectLink=true;
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
  await page.route('**/api/v1/projects/*/zammad/link',route=>{
    const {id}=route.request().postDataJSON();
    if(shouldRejectLink) {
      shouldRejectLink=false;
      return route.fulfill({status:502,json:{error:'Ticket vorübergehend nicht verfügbar.'}});
    }
    linked=id;
    return route.fulfill({status:201,json:{id}});
  });

  await signIn(page);
  await project(page,name);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  const unlink=page.getByRole('button',{name:'Ticketverknüpfung lösen'});
  await expect(page.getByRole('link',{name:'Ticket TEST-42 öffnen'})).toBeVisible();
  page.once('dialog',async dialog=>{
    expect(dialog.message()).toContain('42');
    await dialog.dismiss();
  });
  await unlink.click();
  expect(submitted).toEqual([]);
  await expect(page.getByRole('link',{name:'Ticket TEST-42 öffnen'})).toBeVisible();

  page.once('dialog',dialog=>dialog.accept());
  await unlink.click();
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
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(linkButton).toBeFocused();
  await linkButton.click();
  await page.getByLabel('Ticket-ID').fill('43');
  await dialog.getByRole('button',{name:'Ticket verknüpfen',exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Ticket vorübergehend nicht verfügbar.');
  await expect(dialog.getByLabel('Ticket-ID')).toHaveValue('43');
  await dialog.getByRole('button',{name:'Ticket verknüpfen',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Ticket TEST-43 öffnen'})).toBeVisible();
});
