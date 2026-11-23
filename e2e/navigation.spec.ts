import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Handymenü öffnet und schließt per Tastatur und nach Navigation',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await signIn(page);
  const toggle=page.getByRole('button',{name:'Menü',exact:true});
  const nav=page.getByRole('navigation',{name:'Hauptnavigation'});
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(nav).toBeHidden();
  await toggle.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#desk-navigation').getByText('Übersicht',{exact:true})).not.toBeFocused();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(nav).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('button',{name:'Übersicht'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(nav).toBeHidden();

  await toggle.click();
  await page.getByRole('button',{name:'Dunkles Design'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await nav.getByRole('button',{name:'Projektlager'}).click();
  await expect(page.getByRole('heading',{name:'Projektlager',exact:true})).toBeVisible();
  await expect(page.getByRole('main')).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(nav).toBeHidden();
});

test('Desktop behält die sichtbare Seitenleiste und eindeutige Icons',async({page})=>{
  await page.setViewportSize({width:1280,height:900});
  await signIn(page);
  const nav=page.getByRole('navigation',{name:'Hauptnavigation'});
  await expect(nav).toBeVisible();
  await expect(page.getByRole('button',{name:'Menü',exact:true})).toBeHidden();
  const projects=nav.getByRole('button',{name:'Projekte',exact:true});
  await expect(projects.locator('svg')).toHaveAttribute('aria-hidden','true');
  await projects.click();
  await expect(projects).toHaveAttribute('aria-current','page');
  await expect(nav).toBeVisible();
});

test('Fokus bleibt beim Wechsel des Layouts in der Navigation',async({page})=>{
  await page.setViewportSize({width:701,height:900});
  await signIn(page);
  const nav=page.getByRole('navigation',{name:'Hauptnavigation'});
  const overview=nav.getByRole('button',{name:'Übersicht'});
  const toggle=page.getByRole('button',{name:'Menü',exact:true});
  await overview.focus();
  await page.setViewportSize({width:700,height:900});
  await expect(toggle).toBeFocused();
  await expect(nav).toBeHidden();
  await page.setViewportSize({width:701,height:900});
  await expect(overview).toBeFocused();

  await page.getByText('Desk',{exact:true}).click();
  await expect(overview).not.toBeFocused();
  await page.setViewportSize({width:700,height:900});
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeFocused();
});

test('Lange Kontonamen verdecken den Design-Schalter weder am Handy noch am Desktop',async({page})=>{
  await page.route('**/api/v1/me',async(route)=>{
    const response=await route.fetch();
    if(!response.ok()) { await route.fulfill({response}); return; }
    await route.fulfill({response,json:{...await response.json(),name:'Regionalgeschäftsstellenleitung Nord'}});
  });
  await page.setViewportSize({width:320,height:750});
  await signIn(page);
  await page.getByRole('button',{name:'Menü',exact:true}).click();
  await page.getByRole('button',{name:'Dunkles Design'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.setViewportSize({width:701,height:900});
  const lightTheme=page.getByRole('button',{name:'Helles Design'});
  await expect(lightTheme).toBeInViewport({ratio:1});
  await lightTheme.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});
