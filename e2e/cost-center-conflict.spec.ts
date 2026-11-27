import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

async function openTarget(page:Page){
  await signIn(page);
  await project(page,'Büroinstallation Westflügel');
  return page.getByRole('alert');
}
async function submitConflict(page:Page){
  await page.getByLabel('Kostenstelle',{exact:true}).fill('K-102');
  await page.getByLabel('Projektnotiz').fill('Abstimmung mit dem Kontor steht aus.');
  await page.getByRole('button',{name:'Projektdaten speichern'}).click();
}

test('Belegte Kostenstelle meldet den Konflikt und erhält die Eingaben',async({page})=>{
  const alert=await openTarget(page);
  const response=page.waitForResponse(res=>res.request().method()==='PATCH' && /\/api\/v1\/projects\/[^/]+$/.test(new URL(res.url()).pathname));
  await submitConflict(page);
  expect((await response).status()).toBe(409);
  await expect(alert).toHaveText('Diese Kostenstelle ist bereits einem Projekt zugeordnet.');
  await expect(page.getByRole('heading',{name:'Büroinstallation Westflügel',exact:true})).toBeVisible();
  await expect(page.getByLabel('Kostenstelle',{exact:true})).toHaveValue('K-102');
  await expect(page.getByLabel('Projektnotiz')).toHaveValue('Abstimmung mit dem Kontor steht aus.');
});
