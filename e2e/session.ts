import { expect, type Locator, type Page, type Route } from '@playwright/test';

export function holdRoute(){
  let resolve!:(route:Route)=>void;
  const request=new Promise<Route>(done=>{resolve=done;});
  return {request,resolve};
}

export async function settleResponse(page:Page,route:Route,json:unknown,status=200){
  const response=page.waitForResponse(result=>result.request()===route.request());
  await route.fulfill({status,json});
  await (await response).finished();
  await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
}

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

export async function chooseObject(page:Page,control:Locator,label:string) {
  await control.press('Enter');
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('searchbox',{name:'Einträge suchen'}).fill(label);
  await dialog.getByRole('button').filter({has:page.getByText(label,{exact:true})}).click();
  await expect(dialog).toBeHidden();
}
