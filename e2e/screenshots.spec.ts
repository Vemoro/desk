import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { project,signIn } from './session';

const output='build/screenshots';
for(const theme of ['hell','dunkel']) {
  test(`Doku-Bilder ${theme}`,async({page})=>{
    await mkdir(output,{recursive:true});
    await page.setViewportSize({width:1440,height:950});
    await signIn(page);
    if(theme==='dunkel') await page.getByRole('button',{name:'Dunkles Design'}).click();
    await project(page,'Veranstaltungsbetreuung im Kulturhaus');
    for(const [tab,image,label] of [
      ['Kanban','kanban','Aufgaben'],['Ressourcen & Kalkulation','ressourcenplanung','Ressourcenplanung'],
      ['Controlling','controlling','Belegbezogene Ist-Kosten'],
    ]) {
      await page.getByRole('link',{name:tab,exact:true}).click();
      await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
      await page.screenshot({path:`${output}/${image}-${theme}.png`,animations:'disabled',fullPage:true});
    }
    await page.getByRole('button',{name:'Projektlager',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Bestand je Lagerort'})).toBeVisible();
    await page.screenshot({path:`${output}/projektlager-${theme}.png`,animations:'disabled',fullPage:true});
    await page.setViewportSize({width:375,height:812});
    await page.screenshot({path:`${output}/projektlager-${theme}-handy.png`,animations:'disabled',fullPage:true});
  });
}
