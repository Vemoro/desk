import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

test('Der Projektverlauf zeigt den neuen Status und die ausgelöste Freigabe',async({page})=>{
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const headers={Origin:origin};
  const contact=await page.request.post('/api/v1/contacts',{headers,data:{name:'Muster Verlauf'}});
  expect(contact.status()).toBe(201);
  const name=`Musterverlauf ${crypto.randomUUID().slice(0,8)}`;
  const created=await page.request.post('/api/v1/projects',{headers,data:{name,contact_id:(await contact.json()).id}});
  expect(created.status()).toBe(201);
  const booking=await page.request.post('/api/v1/reservations',{headers,data:{
    project_id:(await created.json()).id,user_id:(await (await page.request.get('/api/v1/me')).json()).id,quantity:1,
    starts_at:'2033-02-17T08:00:00.000Z',ends_at:'2033-02-17T10:00:00.000Z',
  }});
  expect(booking.status()).toBe(201);
  await page.reload();
  await project(page,name);
  const views=page.getByRole('navigation',{name:'Projektansichten'});
  const history=views.getByRole('button',{name:'Verlauf'});
  await expect(history).toBeVisible();
  await history.click();
  await expect(page.getByText('Noch keine Einträge.')).toBeVisible();
  await views.getByRole('button',{name:'Überblick'}).click();
  await page.getByRole('button',{name:'Abgesagt',exact:true}).click();
  await expect(page.getByText('Projektstatus: Abgesagt.')).toBeVisible();
  await views.getByRole('button',{name:'Verlauf'}).click();
  const rows=page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('Freigegeben');
  await expect(rows.nth(1)).toContainText('Mira Muster · Automatische Freigabe');
  await expect(rows.nth(2)).toContainText('Anfrage → Abgesagt');
  await project(page,'Büroinstallation Westflügel');
  await views.getByRole('button',{name:'Verlauf'}).click();
  await expect(page.getByRole('table')).toContainText('Angebot → Bestätigt');
  await expect(page.getByRole('table')).not.toContainText('Anfrage → Abgesagt');
});
