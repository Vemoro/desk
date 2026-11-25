import { expect,test } from '@playwright/test';

test('Runtime-Image erlaubt Anmeldung und meldet den ausgelieferten Git-Stand',async({page})=>{
  const password=process.env.DESK_RUNTIME_TEST_PASSWORD;
  const commit=process.env.DESK_RUNTIME_TEST_COMMIT;
  if(!password || !commit) throw new Error('Runtime-Probe über bash scripts/check-runtime-image.sh starten.');

  const anonymous=await page.request.get('/api/v1/projects');
  expect(anonymous.status()).toBe(401);
  await page.goto('/');
  await page.getByLabel('E-Mail').fill('runtime@example.test');
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();

  const projects=await page.request.get('/api/v1/projects');
  expect(projects.status()).toBe(200);
  expect(await projects.json()).toEqual([]);
  await page.getByRole('button',{name:'Mein Konto',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Desk-Version',exact:true})).toBeVisible();
  await expect(page.getByLabel('Version und Git-Commit')).toHaveValue(new RegExp(`Git-Commit ${commit}$`));
});
