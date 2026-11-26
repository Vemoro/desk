import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { signIn } from './session';

const directory=process.env.DESK_FILTER_SCREENSHOTS!;
for (const dark of [false,true]) {
  for (const mobile of [false,true]) {
    test(`Projekt-Kostenstellensuche ${dark?'dunkel':'hell'} ${mobile?'handy':'desktop'}`,async({page})=>{
      await page.setViewportSize({width:1440,height:950});
      await page.clock.setFixedTime(new Date('2028-05-17T11:00:00Z'));
      await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
        {id:'buero',name:'Büroinstallation Westflügel',stage:'planning',due:'2028-05-25',cost_center:'K-AB-230',offer_ref:'ANG-2028-04'},
        {id:'veranstaltung',name:'Veranstaltungsbetreuung im Kulturhaus',stage:'confirmed',due:'2028-05-18',cost_center:'K-AB-231',offer_ref:'ANG-2028-02'},
      ]}));
      await signIn(page);
      if(dark) await page.getByRole('button',{name:'Dunkles Design'}).click();
      await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
      if(mobile) await page.setViewportSize({width:390,height:844});
      await expect(page.locator('html')).toHaveAttribute('data-theme',dark?'dark':'light');
      const search=page.getByRole('searchbox',{name:'Projekte suchen'});
      await expect(search).toBeVisible();
      await mkdir(directory,{recursive:true});
      const variant=`${dark?'dunkel':'hell'}-${mobile?'handy':'desktop'}`;
      await page.screenshot({path:`${directory}/leer-${variant}.png`,fullPage:true,animations:'disabled'});
      await search.fill('AB-23');
      await expect(search).toHaveValue('AB-23');
      await search.blur();
      await page.screenshot({path:`${directory}/suche-${variant}.png`,fullPage:true,animations:'disabled'});
    });
  }
}