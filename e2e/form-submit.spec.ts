import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Zu kurzes Teampasswort wird am Feld erklärt und löst keinen Schreibzugriff aus',async({page})=>{
  let writes=0;
  await page.route('**/api/v1/users',route=>{
    if(route.request().method()==='POST') writes++;
    return route.continue();
  });
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Einstellungen',exact:true}).click();
  await page.getByText('Konto anlegen',{exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Muster Team');
  await page.getByLabel('E-Mail',{exact:true}).fill('muster-team@example.test');
  await page.getByLabel('Rolle',{exact:true}).selectOption('member');
  const password=page.getByLabel('Passwort',{exact:true});
  await password.pressSequentially('kurz');
  await page.getByRole('button',{name:'Konto speichern',exact:true}).click();
  await expect(password).toBeFocused();
  await expect(password).toHaveAccessibleDescription('Mindestens 12 Zeichen Gib mindestens 12 Zeichen ein.');
  expect(writes).toBe(0);
});

test('Leere Lagerort-Eingabe zeigt einen Feldfehler, fokussiert das Feld und schreibt nichts',async({page})=>{
  let writes=0;
  await page.route('**/api/v1/locations**',route=>{
    if(route.request().method()==='POST') writes++;
    return route.continue();
  });
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  await page.getByText('Lagerort anlegen',{exact:true}).click();
  const field=page.getByLabel('Lagerort',{exact:true}).first();
  const save=page.getByRole('button',{name:'Lagerort speichern',exact:true});
  await expect(save).toBeEnabled();
  await save.click();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-invalid','true');
  await expect(field).toHaveAccessibleDescription('Fülle dieses Feld aus.');
  expect(writes).toBe(0);
  await field.fill('Muster Lager '+crypto.randomUUID().slice(0,8));
  await expect(field).not.toHaveAttribute('aria-invalid','true');
  await save.click();
  await expect(page.getByRole('status').getByText('Lagerort angelegt.')).toBeVisible();
  expect(writes).toBe(1);
});

test('Ungültige Zahl in der Lagerbuchung erhält einen passenden Feldfehler',async({page})=>{
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  await page.getByText('Wareneingang',{exact:true}).first().click();
  const form=page.locator('form').filter({has:page.getByRole('button',{name:'Wareneingang buchen',exact:true})});
  const quantity=form.getByLabel('Menge',{exact:true});
  await quantity.fill('');
  await quantity.press('e');
  await form.getByRole('button',{name:'Wareneingang buchen',exact:true}).click();
  await expect(quantity).toHaveAccessibleDescription('Gib eine Zahl ein.');
});

test('Formular sperrt synchrone Doppelauslösung bis zum Abschluss des gesamten Vorgangs',async({page})=>{
  let writes=0;
  let freePost:()=>void=()=>{};
  let freeRead:()=>void=()=>{};
  let readStarted=false;
  let holdLocationReload=false;
  const postGate=new Promise<void>(resolve=>{freePost=resolve;});
  const readGate=new Promise<void>(resolve=>{freeRead=resolve;});
  await page.route('**/api/v1/locations**',async route=>{
    if(route.request().method()==='POST') {
      writes++;
      if(writes===1) {
        await postGate;
        return route.fulfill({status:409,json:{error:'Simulierter Konflikt.'}});
      }
      return route.fulfill({response:await route.fetch()});
    }
    if(holdLocationReload && !readStarted) {
      const response=await route.fetch();
      readStarted=true;
      await readGate;
      return route.fulfill({response});
    }
    await route.continue();
  });

  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  await page.getByText('Lagerort anlegen',{exact:true}).click();
  const save=page.getByRole('button',{name:'Lagerort speichern',exact:true});
  const locationForm=page.locator('form').filter({has:page.getByLabel('Lagerort',{exact:true})}).first();
  const suffix=crypto.randomUUID().slice(0,8);
  await locationForm.getByLabel('Lagerort',{exact:true}).fill('Muster Lager '+suffix);

  try {
    await locationForm.evaluate(form=>{
      form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true}));
      form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true}));
    });
    await expect.poll(()=>writes).toBeGreaterThanOrEqual(1);

    await page.getByText('Artikel anlegen',{exact:true}).click();
    const article=page.getByLabel('Artikelname',{exact:true});
    await article.fill('Muster Koffer '+suffix);
    await page.getByLabel('Artikelnummer',{exact:true}).fill('MK-'+suffix);
    await page.getByLabel('Artikelart').selectOption('equipment');
    await article.press('Enter');
    await expect(page.getByRole('status').getByText('Artikel angelegt.')).toBeVisible();
    expect(writes).toBe(1);
  } finally {
    freePost();
  }
  await expect(page.getByRole('alert')).toHaveText('Simulierter Konflikt.');

  holdLocationReload=true;
  try {
    await save.click();
    await expect.poll(()=>readStarted).toBe(true);
    await locationForm.dispatchEvent('submit');
    await expect(locationForm.getByRole('button',{name:'Wird gespeichert …'})).toBeDisabled();
  } finally {
    freeRead();
  }
  await expect(page.getByRole('status').getByText('Lagerort angelegt.')).toBeVisible();
  expect(writes).toBe(2);

  await locationForm.getByLabel('Lagerort',{exact:true}).fill('Muster Zweites Lager '+suffix);
  await save.click();
  await expect(page.getByRole('status').getByText('Lagerort angelegt.')).toBeVisible();
  await expect.poll(()=>writes).toBe(3);
});

test('Nach einem geworfenen Formularfehler funktioniert ein erneuter Login',async({page})=>{
  await page.goto('/');
  await page.getByLabel('E-Mail').fill('mira@example.test');
  await page.getByLabel('Passwort').fill('falsches-muster-passwort');
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD!);
  await page.getByLabel('Passwort').press('Enter');
  await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
});
