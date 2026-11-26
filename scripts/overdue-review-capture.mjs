import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const {chromium}=createRequire(join(process.cwd(),'package.json'))('playwright');
const [label,output]=process.argv.slice(2);
const origin=process.env.DESK_ORIGIN;
const office='Büroinstallation Westflügel';
const event='Veranstaltungsbetreuung im Kulturhaus';
const statuses=[office,'Muster Abrechnung','Muster Absage',event];
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
try {
  for(const mode of ['desktop','handy']){
    for(const theme of ['hell','dunkel']){
      const viewport=mode==='desktop'?{width:1440,height:950}:{width:375,height:812};
      const context=await browser.newContext({viewport,locale:'de-DE',timezoneId:'America/Los_Angeles',serviceWorkers:'block'});
      try {
        const page=await context.newPage();
        await page.clock.setFixedTime(new Date('2028-05-18T01:00:00Z'));
        await page.goto(origin);
        await page.getByLabel('E-Mail').fill('mira@example.test');
        await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD);
        await page.getByRole('button',{name:'Anmelden',exact:true}).click();
        await page.getByRole('heading',{name:'Übersicht',exact:true}).waitFor();
        if(mode==='handy') await page.getByRole('button',{name:'Menü',exact:true}).click();
        if(theme==='dunkel'){
          await page.getByRole('button',{name:'Dunkles Design',exact:true}).click();
          await page.locator('html[data-theme="dark"]').waitFor();
        }
        await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
        const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Projekte',exact:true})});
        const due=panel.getByRole('combobox',{name:'Fälligkeit',exact:true});
        const rows=panel.getByRole('row').getByRole('button');
        const checkRows=async(expected)=>{
          const actual=await rows.allTextContents();
          if(JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error('Unerwartete Treffer: '+actual.join(', '));
        };
        await panel.getByRole('button',{name:'Muster Absage',exact:true}).waitFor();
        await due.selectOption('overdue');
        await checkRows(label==='vorher'?statuses:[office,event]);
        if(label==='kombiniert'){
          const sort=panel.getByRole('combobox',{name:'Projekte sortieren',exact:true});
          await sort.selectOption('due');
          await checkRows([event,office]);
          await sort.selectOption('standard');
          await checkRows([office,event]);
          await sort.selectOption('due');
        }
        await page.locator('main#desk-main').focus();
        await page.mouse.move(0,0);
        await panel.screenshot({path:join(output,label+'-'+mode+'-'+theme+'.png'),animations:'disabled'});
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }