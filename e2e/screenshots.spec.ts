import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { project, signIn } from './session';

for (const theme of ['hell', 'dunkel']) {
  test(theme, async ({page}) => {
    await page.setViewportSize({width:1440,height:950});
    await signIn(page);
    if(theme==='dunkel') await page.getByRole('button',{name:'Dunkles Design'}).click();
    await project(page,'Büroinstallation Westflügel');
    const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Projektdaten',exact:true})});
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link',{name:'Kontor West',exact:true})).toBeVisible();
    await mkdir('build/screenshots',{recursive:true});
    for (const [device,width,height] of [['desktop',1440,950],['smartphone',375,812]] as const) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:join('build/screenshots',[device,theme].join('-')+'.png'),animations:'disabled'});
    }
  });
}
