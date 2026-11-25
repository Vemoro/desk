import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

test('Zammad-Zuordnung verlangt Bestätigung und erlaubt erneutes Verknüpfen',async({page})=>{
  const name='Büroinstallation Westflügel';
  const note='Manueller Kontakt zum Musterkunden';
  const url='https://example.test/vorgang';
  let linked:number|null=42;
  const submitted:unknown[]=[];
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
  await expect(page.getByLabel('Kommunikationsnotiz')).toHaveValue(note);
  await expect(page.getByLabel('Vorgangslink')).toHaveValue(url);

  await page.getByText('Vorhandenes Ticket verknüpfen',{exact:true}).click();
  await page.getByLabel('Ticket-ID').fill('43');
  await page.getByRole('button',{name:'Ticket verknüpfen',exact:true}).click();
  await expect(page.getByRole('link',{name:'Ticket TEST-43 öffnen'})).toBeVisible();
});
