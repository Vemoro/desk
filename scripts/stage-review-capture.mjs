import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const {chromium}=createRequire(join(process.cwd(),'package.json'))('playwright');
const [label,output]=process.argv.slice(2);
const origin=process.env.DESK_ORIGIN;
await mkdir(output,{recursive:true});
const targets=[
  ['angebot','Veranstaltungsbetreuung im Kulturhaus','Angebot'],
  ['abrechnung','Büroinstallation Westflügel','Abgerechnet'],
];
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
        if(theme==='dunkel'){
          if(mode==='handy') await menu.click();
          await page.getByRole('button',{name:'Dunkles Design',exact:true}).click();
          if(mode==='handy') await menu.click();
          await page.locator('html[data-theme="dark"]').waitFor();
        }
        const projects=await (await page.request.get(origin+'/api/v1/projects?limit=100')).json();
        for(const [caseName,name,button] of targets){
          const project=projects.find(project=>project.name===name);
          await page.goto(origin+'/#projects/'+project.id);
          await page.getByRole('heading',{name,exact:true}).waitFor();
          const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Auftrag und Abrechnung',exact:true})});
          const action=panel.getByRole('button',{name:button,exact:true});
          await action.waitFor();
          if(await action.isEnabled()!==(label==='vorher')) throw new Error('Unerwarteter Zustand: '+caseName);
          await page.mouse.move(0,0);
          await panel.screenshot({path:join(output,label+'-'+caseName+'-'+mode+'-'+theme+'.png'),animations:'disabled'});
        }
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
