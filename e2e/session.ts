import { expect, type Page } from '@playwright/test';

export async function signIn(page:Page) {
  const password=process.env.DESK_DEMO_PASSWORD;
  if(!password) throw new Error('DESK_DEMO_PASSWORD fehlt.');
  await page.goto('/');
  await page.getByLabel('E-Mail').fill('mira@example.test');
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
}

export async function project(page:Page,name:string) {
  await page.getByRole('button',{name:'Projekte',exact:true}).first().click();
  await page.getByRole('button',{name,exact:true}).click();
  await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
}
