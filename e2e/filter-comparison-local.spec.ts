import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

const screenshotDirectory=process.env.DESK_FILTER_SCREENSHOTS!;
for (const name of ['Büroinstallation Westflügel','Veranstaltungsbetreuung im Kulturhaus']) {
  for (const dark of [false,true]) {
    for (const mobile of [false,true]) {
      test(`${name}, ${dark?'dunkel':'hell'}, ${mobile?'handy':'desktop'}`,async({page})=>{
        await page.setViewportSize({width:1440,height:950});
        await signIn(page);
        if(dark) await page.getByRole('button',{name:'Dunkles Design'}).click();
        await project(page,name);
        await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
        if(mobile) await page.setViewportSize({width:390,height:844});
        await expect(page.getByRole('heading',{name:'Ressourcenplanung',exact:true})).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme',dark?'dark':'light');
        await mkdir(screenshotDirectory,{recursive:true});
        await page.screenshot({path:`${screenshotDirectory}/${name.startsWith('Büro')?'buero':'veranstaltung'}-${dark?'dunkel':'hell'}-${mobile?'handy':'desktop'}.png`,fullPage:true,animations:'disabled'});
      });
    }
  }
}