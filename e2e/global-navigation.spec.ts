import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Globale Suche unterscheidet Treffer und gibt den Fokus an den Hauptinhalt',async({page})=>{
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'muster-a',name:'Büroinstallation',stage:'planning',cost_center:'M-130'},
    {id:'muster-b',name:'Büroinstallation',stage:'planning',cost_center:'M-131'},
  ]}));
  await signIn(page);
  const trigger=page.getByRole('button',{name:'Suchen in Desk',exact:true});
  const main=page.getByRole('main');
  await main.focus();
  await page.keyboard.press('Control+k');
  const dialog=page.getByRole('dialog',{name:'Desk durchsuchen'});
  const input=dialog.getByRole('searchbox');
  await expect(input).toBeFocused();
  await input.fill('Büroinstallation');
  await expect(dialog.getByRole('button',{name:/Büroinstallation/})).toHaveCount(2);
  await input.press('ArrowDown');
  await expect(dialog.getByRole('button',{name:/M-130/})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('button',{name:/M-131/})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#projects\/muster-b$/);
  await expect(main).toBeFocused();

  await trigger.click();
  await input.fill('Kontor West');
  await input.press('Enter');
  await expect(page).toHaveURL(/#contacts\//);
  await expect(main).toBeFocused();
  await trigger.click();
  await input.fill('Kein Mustertreffer');
  await expect(dialog.getByText('Keine passenden Treffer.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(dialog).toBeHidden();
});

test('Kompakte Leiste bleibt nach Neuladen erhalten und weicht dem Handymenü',async({page})=>{
  await page.setViewportSize({width:701,height:600});
  await signIn(page);
  const compact=page.getByRole('button',{name:'Seitenleiste einklappen'});
  const expand=page.getByRole('button',{name:'Seitenleiste ausklappen'});
  const project=page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte'});
  await compact.click();
  await expect(expand).toBeFocused();
  await project.click();
  await expect(project).toHaveAttribute('aria-current','page');
  await page.reload();
  await expect(expand).toBeVisible();
  await expand.focus();
  await page.setViewportSize({width:700,height:600});
  const mobile=page.getByRole('button',{name:'Menü',exact:true});
  await expect(expand).toBeHidden();
  await expect(mobile).toBeFocused();
  await mobile.click();
  const search=page.getByRole('button',{name:'Suchen in Desk',exact:true});
  await search.click();
  await page.keyboard.press('Escape');
  await expect(mobile).toHaveAttribute('aria-expanded','true');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(mobile).toHaveAttribute('aria-expanded','false');
  await expect(mobile).toBeFocused();
  await page.setViewportSize({width:701,height:600});
  await expect(expand).toBeVisible();
  await expect(project).toBeFocused();
});

test('Die Suche zeigt einer Mitarbeitenden-Sitzung nur erlaubte Ziele',async({page})=>{
  const password=process.env.DESK_DEMO_PASSWORD;
  if(!password) throw new Error('DESK_DEMO_PASSWORD fehlt.');
  await page.goto('/');
  await page.getByLabel('E-Mail').fill('noah@example.test');
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await page.getByRole('button',{name:'Suchen in Desk',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Desk durchsuchen'});
  await expect(dialog.getByRole('button',{name:/Mein Konto/})).toBeVisible();
  await expect(dialog.getByRole('button',{name:/Einstellungen/})).toHaveCount(0);
});

test('Ein erkannter Sitzungsablauf entfernt Suche und Treffer',async({page})=>{
  await signIn(page);
  await page.route('**/api/v1/planning/reservations?*',route=>route.fulfill({status:401,json:{error:'Nicht angemeldet.'}}));
  await page.getByRole('button',{name:'Suchen in Desk',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Desk durchsuchen'});
  await dialog.getByRole('button',{name:/Wochenplanung/}).click();
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  await expect(page.getByText('Bitte erneut anmelden, um die Wochenplanung zu öffnen.')).toBeVisible();
  await expect(dialog).toBeHidden();
});
