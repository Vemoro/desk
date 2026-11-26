import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
const [repo,origin,output,phase] = process.argv.slice(2);
const { chromium } = createRequire(join(repo,"package.json"))("playwright");
const browser = await chromium.launch();
await mkdir(output,{recursive:true});
try {
  for(const variant of ["desktop","mobil"]) for(const theme of ["light","dark"]){
    const mobile = variant === "mobil";
    const page = await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:950},
      locale:"de-DE",timezoneId:"Europe/Berlin",deviceScaleFactor:1,serviceWorkers:"block"});
    await page.addInitScript(theme=>localStorage.setItem("desk-theme",theme),theme);
    await page.clock.setFixedTime(new Date("2028-05-18T11:00:00Z"));
    await page.goto(origin);
    await page.getByLabel("E-Mail").fill("mira@example.test");
    await page.getByLabel("Passwort").fill(process.env.DESK_DEMO_PASSWORD);
    await page.getByRole("button",{name:"Anmelden",exact:true}).click();
    await page.getByRole("heading",{name:"Übersicht",exact:true}).waitFor();
    if(mobile) await page.getByRole("button",{name:"Menü",exact:true}).click();
    await page.getByRole("navigation",{name:"Hauptnavigation"}).getByRole("button",{name:"Projekte",exact:true}).click();
    const title = page.getByRole("heading",{name:"Projekte",exact:true,level:2});
    await title.waitFor();
    await page.getByRole("button",{name:"Büroinstallation Westflügel",exact:true}).waitFor();
    if(phase.startsWith("nachher")) await page.getByRole("combobox",{name:"Kontakt",exact:true}).waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await title.evaluate(()=>{window.scrollTo(0,0);document.activeElement?.blur();});
    await page.screenshot({path:join(output,`${variant}-${theme}-${phase}.png`),animations:"disabled",fullPage:true});
    await page.close();
  }
} finally { await browser.close(); }
