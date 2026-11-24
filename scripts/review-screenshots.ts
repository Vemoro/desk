import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type Route } from '@playwright/test';

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const viewports = [
  {name:'desktop',width:1440,height:950},
  {name:'handy',width:375,height:812},
];
const themes = ['hell','dunkel'] as const;
type Target = {label:'vorher'|'nachher'; origin:string};

function localOrigin(value:string) {
  const url = URL.parse(value);
  if(!url || !['http:','https:'].includes(url.protocol) || !loopback.has(url.hostname)
    || url.username || url.password || url.pathname!=='/' || url.search || url.hash) {
    throw new Error('Die Zieladresse muss eine lokale HTTP- oder HTTPS-Origin ohne Zugangsdaten sein.');
  }
  return url.origin;
}

function targets(args:string[]):Target[] {
  if(args.length===2 && args[0]==='--nur-nachher') {
    return [{label:'nachher',origin:localOrigin(args[1])}];
  }
  if(args.length!==2) throw new Error('Erwartet zwei lokale Origins oder --nur-nachher mit einer lokalen Origin.');
  const before=localOrigin(args[0]);
  const after=localOrigin(args[1]);
  const port=(origin:string)=>{
    const url=new URL(origin);
    return url.port || (url.protocol==='https:'?'443':'80');
  };
  if(port(before)===port(after)) {
    throw new Error('Vorher und Nachher benötigen verschiedene lokale Ports.');
  }
  return [{label:'vorher',origin:before},{label:'nachher',origin:after}];
}

async function localRoute(route:Route, origin:string) {
  const url=new URL(route.request().url());
  if(url.origin!==origin) { await route.abort(); return; }
  const response=await route.fetch({maxRedirects:0,timeout:10_000});
  const destination=response.headers().location;
  // Browser interception does not cover every hop in a redirect chain.
  if(response.status()>=300 && response.status()<400 && destination) {
    await route.abort();
    return;
  }
  await route.fulfill({response});
}

async function capture(browser:Browser, target:Target, password:string) {
  const captures:{filename:string;bytes:Buffer}[]=[];
  for(const {name,width,height} of viewports) {
    for(const theme of themes) {
      const context=await browser.newContext({
        viewport:{width,height},locale:'de-DE',timezoneId:'Europe/Berlin',serviceWorkers:'block',
      });
      try {
        await context.route('**/*',async route=>{
          try {
            await localRoute(route,target.origin);
          } catch {
            // A closed or unreachable target must not surface Playwright request details.
            await route.abort().catch(()=>{});
          }
        });
        const page=await context.newPage();
        page.setDefaultTimeout(8_000);
        await page.clock.setFixedTime(new Date('2028-05-18T10:00:00Z'));
        await page.goto(target.origin);
        await page.getByRole('heading',{name:'Anmelden',exact:true}).waitFor();

        // Keep the demo password out of browser navigation and redirect requests.
        const login=await context.request.post(`${target.origin}/api/v1/login`,{
          maxRedirects:0,timeout:10_000,headers:{Origin:target.origin},
          data:{email:'mira@example.test',password},
        });
        if(!login.ok()) throw new Error('Die Demo-Anmeldung ist fehlgeschlagen.');

        await page.goto(`${target.origin}/#projects`);
        await page.reload();
        await page.getByRole('heading',{name:'Projekte',exact:true,level:1}).waitFor();
        for(const project of ['Büroinstallation Westflügel','Veranstaltungsbetreuung im Kulturhaus']) {
          await page.getByRole('button',{name:project,exact:true}).waitFor();
        }
        if(theme==='dunkel') {
          await page.getByRole('button',{name:'Dunkles Design'}).click();
          await page.locator('html[data-theme="dark"]').waitFor();
        }
        captures.push({
          filename:`${target.label}-${name}-${theme}.png`,
          bytes:await page.screenshot({animations:'disabled',fullPage:true}),
        });
      } catch {
        throw new Error(`${target.label}, ${name}, ${theme}: Demo-Anmeldung oder Muster-Projektliste fehlt.`);
      } finally {
        await context.close();
      }
    }
  }
  return captures;
}

async function main() {
  const destinations=targets(process.argv.slice(2));
  const password=process.env.DESK_DEMO_PASSWORD;
  if(!password) throw new Error('DESK_DEMO_PASSWORD fehlt.');
  const browser=await chromium.launch();
  const captures:Awaited<ReturnType<typeof capture>>=[];
  try {
    for(const target of destinations) captures.push(...await capture(browser,target,password));
  } finally {
    await browser.close();
  }

  const base='build/screenshots';
  await mkdir(base,{recursive:true});
  const output=await mkdtemp(join(base,'projektliste-'));
  await Promise.all(captures.map(({filename,bytes})=>writeFile(join(output,filename),bytes)));
  console.log(`${captures.length} Bilder in ${output}`);
}

try {
  await main();
} catch(error) {
  console.error(error instanceof Error ? error.message : 'Der Screenshot-Lauf ist fehlgeschlagen.');
  process.exitCode=1;
}
