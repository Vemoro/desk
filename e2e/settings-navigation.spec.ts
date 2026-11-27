import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Einstellungsbereiche haben Direktlinks und fokussieren ihren Titel',async({page})=>{
  await signIn(page);
  await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Einstellungsbereiche'});
  const team=page.getByRole('heading',{name:'Team',exact:true});
  const api=page.getByRole('heading',{name:'API-Zugriff',exact:true});
  await expect(team).toBeVisible();
  await expect(nav.getByRole('link',{name:/^Team /})).toHaveAttribute('aria-current','page');

  const apiLink=nav.getByRole('link',{name:/^API-Zugriff /});
  await apiLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#settings\/api$/);
  await expect(api).toBeFocused();
  await expect(apiLink).toHaveAttribute('aria-current','page');
  await expect(team).toHaveCount(0);
  await page.reload();
  await expect(api).toBeVisible();

  await nav.getByRole('link',{name:/^Integrationen /}).click();
  await expect(page.getByRole('heading',{name:'Integrationen',exact:true})).toBeFocused();
  await page.goBack();
  await expect(api).toBeFocused();
  await apiLink.press('Enter');
  await expect(api).toBeFocused();
  await nav.getByRole('link',{name:/^Integrationen /}).focus();
  await page.setViewportSize({width:390,height:844});
  await expect(nav).toBeHidden();
  await expect(api).toBeFocused();
  await page.getByRole('link',{name:'Zurück zu Einstellungen'}).focus();
  await page.setViewportSize({width:1280,height:900});
  await expect(api).toBeFocused();
  await page.goto('/#settings');
  await page.getByText('Konto anlegen',{exact:true}).focus();
  await page.setViewportSize({width:390,height:844});
  await expect(nav.getByRole('link',{name:/^Team /})).toBeFocused();
});

test('Das mobile Einstellungsmenü kehrt zum gewählten Bereich zurück',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await signIn(page);
  const nav=page.getByRole('navigation',{name:'Einstellungsbereiche'});
  await page.getByRole('button',{name:'Menü',exact:true}).click();
  await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Team',exact:true})).toBeHidden();
  const teamLink=nav.getByRole('link',{name:/^Team /});
  await expect(nav.locator('[aria-current]')).toHaveCount(0);
  await teamLink.click();
  await expect(nav).toBeHidden();
  await expect(page.getByRole('heading',{name:'Team',exact:true})).toBeFocused();
  const back=page.getByRole('link',{name:'Zurück zu Einstellungen'});
  await back.click();
  await expect(page).toHaveURL(/#settings$/);
  await expect(teamLink).toBeFocused();

  await page.goto('/#settings/integrations');
  await expect(page.getByRole('heading',{name:'Integrationen',exact:true})).toBeFocused();
  await back.click();
  await expect(page).toHaveURL(/#settings$/);
  await expect(nav.getByRole('link',{name:/^Integrationen /})).toBeFocused();
});

test('Direktlinks laden keine administrativen Bereiche für Mitarbeitende',async({page})=>{
  await page.goto('/');
  await page.getByLabel('E-Mail').fill('noah@example.test');
  await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD!);
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
  const requests:string[]=[];
  page.on('request',request=>{
    if(new URL(request.url()).pathname==='/api/v1/tokens') requests.push(request.url());
  });
  await page.goto('/#settings/api');
  await expect(page.getByText('Die Einstellungen sind der Administration vorbehalten.')).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Einstellungsbereiche'})).toHaveCount(0);
  expect(requests).toEqual([]);
  expect((await page.request.get('/api/v1/tokens')).status()).toBe(403);
});

test('Ein offener Teamsperrdialog bleibt beim Wechsel ins schmale Layout bedienbar',async({page})=>{
  await signIn(page);
  await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
  const person=page.getByRole('row').filter({hasText:'Noah'});
  const trigger=person.getByRole('button',{name:'Konto sperren',exact:true});
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Konto sperren',exact:true});
  const cancel=dialog.getByRole('button',{name:'Abbrechen',exact:true});
  await expect(cancel).toBeFocused();

  await page.setViewportSize({width:390,height:844});
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/#settings\/team$/);
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('link',{name:'Zurück zu Einstellungen'}).click();
  await expect(page.getByRole('link',{name:/^Team /})).toBeFocused();
});
