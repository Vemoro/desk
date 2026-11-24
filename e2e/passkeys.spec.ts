import { expect, test } from '@playwright/test';
import { signIn } from './session';

const passkeyPath='/api/auth/passkey/';

test('Passkeys gehören einem eigenen Konto und funktionieren neben dem Passwort',async({page,browser})=>{
  const authenticator=await page.context().newCDPSession(page);
  await authenticator.send('WebAuthn.enable');
  await authenticator.send('WebAuthn.addVirtualAuthenticator',{
    options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true},
  });
  const guest=await page.request.get(passkeyPath+'generate-register-options');
  expect(guest.status()).toBe(401);
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const email=`passkey-${crypto.randomUUID()}@example.test`;
  const password=process.env.DESK_DEMO_PASSWORD!;
  const member=await page.request.post('/api/v1/users',{
    headers:{Origin:origin},data:{email,password,name:'Muster Mitarbeit',role:'member'},
  });
  expect(member.status()).toBe(201);
  await page.getByRole('button',{name:'Mein Konto',exact:true}).click();
  const options=await (await page.request.get(passkeyPath+'generate-register-options')).json();
  expect(options.authenticatorSelection).toMatchObject({residentKey:'required',userVerification:'required'});
  const label='Muster Sicherheitsschlüssel';
  await page.getByLabel('Name für den Passkey').fill(label);
  await page.getByRole('button',{name:'Passkey hinzufügen'}).click();
  await expect(page.getByRole('button',{name:`Passkey ${label} entfernen`})).toBeVisible();
  const list=await (await page.request.get(passkeyPath+'list-user-passkeys')).json() as {id:string;name:string}[];
  const key=list.find((entry)=>entry.name===label);
  expect(key).toBeDefined();

  const unauthorized=await browser.newContext({baseURL:origin});
  try {
    const loggedIn=await unauthorized.request.post('/api/v1/login',{
      headers:{Origin:origin},data:{email,password},
    });
    expect(loggedIn.status()).toBe(200);
    const foreign=await unauthorized.request.post(passkeyPath+'delete-passkey',{
      headers:{Origin:origin},data:{id:key!.id},
    });
    expect(foreign.status()).toBe(401);
    const crossOrigin=await page.request.post(passkeyPath+'delete-passkey',{
      headers:{Origin:'https://anderes.example.test'},data:{id:key!.id},
    });
    expect(crossOrigin.status()).toBe(403);
    const memberPage=await unauthorized.newPage();
    const memberAuthenticator=await unauthorized.newCDPSession(memberPage);
    await memberAuthenticator.send('WebAuthn.enable');
    await memberAuthenticator.send('WebAuthn.addVirtualAuthenticator',{
      options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true},
    });
    await memberPage.goto('/#account');
    await expect(memberPage.getByRole('heading',{name:'Mein Konto',exact:true})).toBeVisible();
    await memberPage.getByLabel('Name für den Passkey').fill('Muster Privat');
    await memberPage.getByRole('button',{name:'Passkey hinzufügen'}).click();
    await expect(memberPage.getByRole('button',{name:'Passkey Muster Privat entfernen'})).toBeVisible();
    await expect(memberPage.getByRole('button',{name:`Passkey ${label} entfernen`})).toHaveCount(0);
  } finally {
    await unauthorized.close();
  }

  await page.getByRole('button',{name:'Abmelden',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  const signInOptions=await (await page.request.get(passkeyPath+'generate-authenticate-options')).json();
  expect(signInOptions.userVerification).toBe('required');
  await page.evaluate(()=>{
    const get=navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get=(options)=>{
      navigator.credentials.get=get;
      if(options?.publicKey) return Promise.reject(new DOMException('Abgebrochen','NotAllowedError'));
      return get(options);
    };
  });
  await page.getByRole('button',{name:'Mit Passkey anmelden'}).click();
  await expect(page.getByRole('alert')).toContainText('Anmeldung mit Passkey wurde nicht abgeschlossen');
  await page.getByRole('button',{name:'Mit Passkey anmelden'}).click();
  await expect(page.getByRole('heading',{name:'Mein Konto',exact:true})).toBeVisible();
  await page.getByRole('button',{name:`Passkey ${label} entfernen`}).click();
  await expect(page.getByRole('status')).toContainText('Passkey entfernt.');
  await expect(page.getByRole('button',{name:`Passkey ${label} entfernen`})).toHaveCount(0);

  await page.getByRole('button',{name:'Abmelden',exact:true}).click();
  await page.getByRole('button',{name:'Mit Passkey anmelden'}).click();
  await expect(page.getByRole('alert')).toContainText('Anmeldung mit Passkey wurde nicht abgeschlossen');
  await signIn(page);
});
