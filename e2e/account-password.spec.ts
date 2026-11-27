import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Eigenes Passwort ändern und auf Wunsch andere Browsersitzungen beenden',async({page,browser})=>{
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const email=`password-${crypto.randomUUID()}@example.test`;
  const password=process.env.DESK_DEMO_PASSWORD!;
  const newPassword=crypto.randomUUID();
  const finalPassword=crypto.randomUUID();
  const member=await page.request.post('/api/v1/users',{
    headers:{Origin:origin},data:{email,password,name:'Muster Mitarbeit',role:'member'},
  });
  expect(member.status()).toBe(201);
  await page.getByRole('button',{name:'Mein Konto',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Passwort ändern'})).toBeVisible();

  const first=await browser.newContext({baseURL:origin});
  const second=await browser.newContext({baseURL:origin});
  const login=(context:typeof first,password:string)=>context.request.post('/api/v1/login',{
    headers:{Origin:origin},data:{email,password},
  });
  try {
    expect((await login(first,password)).status()).toBe(200);
    expect((await login(second,password)).status()).toBe(200);
    const account=await first.newPage();
    await account.goto('/#account');
    const section=account.getByRole('form',{name:'Passwort ändern'});
    const current=section.getByLabel('Aktuelles Passwort');
    const next=section.getByLabel('Neues Passwort');
    const revoke=section.getByLabel('Andere Browsersitzungen beenden');
    const submit=section.getByRole('button',{name:'Passwort ändern'});

    await current.fill(crypto.randomUUID());
    await next.fill(newPassword);
    await revoke.check();
    await submit.click();
    await expect(section.getByRole('alert')).toHaveText('Das aktuelle Passwort stimmt nicht.');
    expect((await first.request.get('/api/v1/me')).status()).toBe(200);
    expect((await second.request.get('/api/v1/me')).status()).toBe(200);
    expect((await login(second,newPassword)).status()).toBe(401);
    expect((await login(second,password)).status()).toBe(200);

    await current.fill(password);
    await next.fill(newPassword);
    await revoke.uncheck();
    await submit.click();
    await expect(section.getByRole('status')).toHaveText('Passwort geändert.');
    expect((await second.request.get('/api/v1/me')).status()).toBe(200);

    await current.fill(newPassword);
    await next.fill(finalPassword);
    await revoke.check();
    await submit.click();
    await expect(section.getByRole('status')).toHaveText('Passwort geändert. Andere Browsersitzungen wurden beendet.');
    await expect(current).toBeEmpty();
    await expect(next).toBeEmpty();
    expect((await first.request.get('/api/v1/me')).status()).toBe(200);
    expect((await second.request.get('/api/v1/me')).status()).toBe(401);
    expect((await login(second,password)).status()).toBe(401);
    expect((await login(second,finalPassword)).status()).toBe(200);
    expect((await page.request.get('/api/v1/me')).status()).toBe(200);
  } finally {
    await first.close();
    await second.close();
  }
});
