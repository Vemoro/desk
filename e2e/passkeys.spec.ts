import { expect, test } from '@playwright/test';
import { signIn } from './session';

const passkeyPath='/api/auth/passkey/';

test('Passkey-Anmeldung und Passwort-Anmeldung werden nacheinander ausgeführt',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  const requestStarted=Promise.withResolvers<void>();
  const cancelPasskey=Promise.withResolvers<void>();
  await page.route('**'+passkeyPath+'generate-authenticate-options',async(route)=>{
    requestStarted.resolve();
    await cancelPasskey.promise;
    await route.fulfill({status:400,json:{message:'Synthetischer Abbruch'}});
  });
  try {
    await page.getByRole('button',{name:'Mit Passkey anmelden'}).click();
    await requestStarted.promise;
    await page.getByLabel('E-Mail').fill('mira@example.test');
    await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD!);
    await page.getByRole('button',{name:'Anmelden',exact:true}).click();
    await expect(page.getByRole('alert')).toHaveText('Eine Anmeldung läuft bereits.');
  } finally {
    cancelPasskey.resolve();
  }
  await expect(page.getByText('Die Anmeldung mit Passkey wurde nicht abgeschlossen.',{exact:false})).toBeVisible();
  await signIn(page);
});

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
  const memberName=`Muster Mitarbeit ${email.slice(8,16)}`;
  const password=process.env.DESK_DEMO_PASSWORD!;
  const member=await page.request.post('/api/v1/users',{
    headers:{Origin:origin},data:{email,password,name:memberName,role:'member'},
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
    await memberPage.setViewportSize({width:390,height:844});
    await memberPage.goto('/');
    const menu=memberPage.getByRole('button',{name:'Menü',exact:true});
    const account=memberPage.getByRole('button',{name:'Mein Konto',exact:true});
    await expect(menu).toBeVisible();
    await expect(account).toBeHidden();
    await menu.click();
    await expect(memberPage.getByRole('button',{name:'Einstellungen',exact:true})).toHaveCount(0);
    await account.click();
    await expect(menu).toHaveAttribute('aria-expanded','false');
    await expect(memberPage.getByRole('heading',{name:'Mein Konto',exact:true})).toBeVisible();
    await memberPage.getByLabel('Name für den Passkey').fill('Muster Privat');
    await memberPage.getByRole('button',{name:'Passkey hinzufügen'}).click();
    await expect(memberPage.getByRole('button',{name:'Passkey Muster Privat entfernen'})).toBeVisible();
    await expect(memberPage.getByRole('button',{name:`Passkey ${label} entfernen`})).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
    const teamRow=page.getByRole('row').filter({has:page.getByText(memberName,{exact:true})});
    page.once('dialog',dialog=>dialog.dismiss());
    await teamRow.getByRole('button',{name:'Konto sperren'}).click();
    await expect(teamRow.getByRole('cell',{name:'Aktiv',exact:true})).toBeVisible();
    page.once('dialog',dialog=>dialog.accept());
    await teamRow.getByRole('button',{name:'Konto sperren'}).click();
    await expect(teamRow.getByRole('cell',{name:'Gesperrt',exact:true})).toBeVisible();
    expect((await unauthorized.request.get('/api/v1/me')).status()).toBe(401);

    await memberPage.reload();
    await expect(memberPage.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
    const verifyBlocked=memberPage.waitForResponse(response=>response.url().endsWith(passkeyPath+'verify-authentication'));
    await memberPage.getByRole('button',{name:'Mit Passkey anmelden'}).click();
    expect((await verifyBlocked).status()).toBe(401);
    await expect(memberPage.getByRole('alert')).toContainText('Anmeldung mit Passkey wurde nicht abgeschlossen');

    await teamRow.getByRole('button',{name:'Konto freigeben'}).click();
    await expect(teamRow.getByRole('cell',{name:'Aktiv',exact:true})).toBeVisible();
    await memberPage.getByRole('button',{name:'Mit Passkey anmelden'}).click();
    await expect(memberPage.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
  } finally {
    await unauthorized.close();
  }

  await page.getByRole('button',{name:'Mein Konto',exact:true}).click();
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
