import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { project,signIn } from './session';

const output='build/screenshots';
const examples=[
  {directory:'veranstaltungsbetreuung',name:'Veranstaltungsbetreuung im Kulturhaus'},
  {directory:'bueroinstallation',name:'Büroinstallation Westflügel'},
];
for(const theme of ['hell','dunkel']) {
  test(`Doku-Bilder ${theme}`,async({page})=>{
    await page.setViewportSize({width:1440,height:950});
    await signIn(page);
    if(theme==='dunkel') await page.getByRole('button',{name:'Dunkles Design'}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme==='hell'?'light':'dark');
    for(const {directory,name} of examples) {
      const projectOutput=`${output}/${directory}`;
      await mkdir(projectOutput,{recursive:true});
      await project(page,name);
      await expect(page.getByRole('heading',{name,level:1,exact:true})).toBeVisible();
      for(const [tab,image,label] of [
        ['Kanban','kanban','Aufgaben'],['Ressourcen & Kalkulation','ressourcenplanung','Ressourcenplanung'],
        ['Controlling','controlling','Belegbezogene Ist-Kosten'],
      ]) {
        await page.getByRole('link',{name:tab,exact:true}).click();
        await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
        await page.screenshot({path:`${projectOutput}/${image}-${theme}.png`,animations:'disabled',fullPage:true});
      }
    }
    await page.getByRole('button',{name:'Projektlager',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Bestand je Lagerort'})).toBeVisible();
    await page.screenshot({path:`${output}/projektlager-${theme}.png`,animations:'disabled',fullPage:true});
    await page.setViewportSize({width:375,height:812});
    await page.screenshot({path:`${output}/projektlager-${theme}-handy.png`,animations:'disabled',fullPage:true});
    await page.getByRole('button',{name:'Menü',exact:true}).click();
    await expect(page.getByRole('navigation',{name:'Hauptnavigation'})).toBeVisible();
    await page.screenshot({path:`${output}/navigation-${theme}-handy-offen.png`,animations:'disabled',fullPage:true});
  });
}
