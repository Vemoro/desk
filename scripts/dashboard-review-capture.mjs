import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const { chromium }=createRequire(join(process.cwd(),'package.json'))('playwright');
const [label,output]=process.argv.slice(2);
const url=process.env.DESK_ORIGIN;
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
try {
  for(const mode of ['desktop','handy']) {
    for(const theme of ['hell','dunkel']) {
      const viewport=mode==='desktop'?{width:1440,height:950}:{width:375,height:812};
      const context=await browser.newContext({viewport,locale:'de-DE',timezoneId:'America/Los_Angeles',serviceWorkers:'block'});
      try {
        const page=await context.newPage();
        await page.clock.setFixedTime(new Date('2028-05-19T01:00:00Z'));
        await page.goto(url);
        await page.getByLabel('E-Mail').fill('mira@example.test');
        await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD);
        await page.getByRole('button',{name:'Anmelden',exact:true}).click();
        const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Fällige Aufgaben',exact:true})});
        await panel.getByText('Einsatz vorbereiten',{exact:true}).first().waitFor();
        if(theme==='dunkel'){
          const menu=page.getByRole('button',{name:'Menü',exact:true});
          if(mode==='handy') await menu.click();
          await page.getByRole('button',{name:'Dunkles Design',exact:true}).click();
          if(mode==='handy') await menu.click();
          await page.locator('html[data-theme="dark"]').waitFor();
        }
        await page.mouse.move(0,0);
        await panel.screenshot({path:join(output,label+'-'+mode+'-'+theme+'.png'),animations:'disabled'});
      } finally {
        await context.close();
      }
    }
  }
} finally { await browser.close(); }