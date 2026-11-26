import { mkdir } from 'node:fs/promises';
import { expect,test } from '@playwright/test';
import { signIn } from './session';

const after=false;
const output='build/screenshots';
for(const theme of ['hell','dunkel']){
  test('Navigation '+theme,async({page})=>{
    await mkdir(output,{recursive:true});
    await page.setViewportSize({width:1440,height:950});
    await signIn(page);
    if(theme==='dunkel') await page.getByRole('button',{name:'Dunkles Design'}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme==='hell'?'light':'dark');
    const nav=page.getByRole('navigation',{name:'Hauptnavigation',exact:true});
    const toggle=page.getByRole('button',{name:'Menü',exact:true});
    await expect(nav).toBeVisible();
    await expect(toggle).toHaveCount(0);
    await page.screenshot({path:output+'/desktop-'+theme+'.png',animations:'disabled'});
    await page.setViewportSize({width:375,height:812});
    if(after){
      await expect(toggle).toHaveAttribute('aria-expanded','false');
      await expect(nav).toHaveCount(0);
    }else{
      await expect(nav).toBeVisible();
      await expect(toggle).toHaveCount(0);
    }
    await page.screenshot({path:output+'/smartphone-'+theme+'.png',animations:'disabled'});
    if(after){
      await toggle.click();
      await expect(nav).toBeVisible();
      await page.screenshot({path:output+'/smartphone-offen-'+theme+'.png',animations:'disabled'});
    }
  });
}
