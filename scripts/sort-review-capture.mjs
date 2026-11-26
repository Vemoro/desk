import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const {chromium}=createRequire(join(process.cwd(),'package.json'))('playwright');
const [label,output]=process.argv.slice(2);
const origin=process.env.DESK_ORIGIN;
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
try {
  for(const mode of ['desktop','handy']) {
    for(const theme of ['hell','dunkel']) {
      const viewport=mode==='desktop'?{width:1440,height:950}:{width:375,height:812};
      const context=await browser.newContext({viewport,locale:'de-DE',timezoneId:'Europe/Berlin',serviceWorkers:'block'});
      try {
        const page=await context.newPage();
        await page.clock.setFixedTime(new Date('2028-05-18T09:00:00Z'));
        await page.goto(origin);
        await page.getByLabel('E-Mail').fill('mira@example.test');
        await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD);
        await page.getByRole('button',{name:'Anmelden',exact:true}).click();
        await page.getByRole('heading',{name:'Übersicht',exact:true}).waitFor();
        const menu=page.getByRole('button',{name:'Menü',exact:true});
        if(mode==='handy') await menu.click();
        if(theme==='dunkel'){
          await page.getByRole('button',{name:'Dunkles Design',exact:true}).click();
          await page.locator('html[data-theme="dark"]').waitFor();
        }
        await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
        const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Projekte',exact:true})});
        const rows=panel.getByRole('row').getByRole('button');
        await panel.getByRole('button',{name:'Aktenablage Musterbüro',exact:true}).waitFor();
        if(label==='nachher') await panel.getByRole('combobox',{name:'Projekte sortieren'}).selectOption('due');
        const first=label==='vorher'?'Aktenablage Musterbüro':'Veranstaltungsbetreuung im Kulturhaus';
        if(await rows.first().innerText()!==first) throw new Error('Unerwartete Projektreihenfolge');
        if(label==='nachher'&&await rows.last().innerText()!=='Aktenablage Musterbüro') throw new Error('Projekt ohne Termin steht nicht am Ende');
        await page.locator('main#desk-main').focus();
        await page.mouse.move(0,0);
        await panel.screenshot({path:join(output,label+'-'+mode+'-'+theme+'.png'),animations:'disabled'});
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }