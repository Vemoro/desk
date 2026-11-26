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
    for(const [example,name] of [["buero","Büroinstallation Westflügel"],["veranstaltung","Veranstaltungsbetreuung im Kulturhaus"]]) {
      await page.getByRole("button",{name,exact:true}).click();
      await page.getByRole("link",{name:"Kanban",exact:true}).click();
      await page.getByRole("heading",{name:"Aufgaben",exact:true}).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      await page.evaluate(()=>{window.scrollTo(0,0);document.activeElement?.blur();});
      await page.screenshot({path:join(output,`${example}-${variant}-${theme}-${phase}.png`),animations:"disabled",fullPage:true});
      if(phase==='nachher') {
        const from=page.locator('.task').filter({hasText:'Übergabe dokumentieren'});
        const target=page.locator('.task').filter({hasText:'Termin rückbestätigen'});
        const targetBounds=await target.boundingBox();
        const transfer=await page.evaluateHandle(()=>new DataTransfer());
        await from.dispatchEvent('dragstart',{dataTransfer:transfer});
        await target.dispatchEvent('dragover',{dataTransfer:transfer,clientY:targetBounds.y+5});
        await page.locator('.task[data-drop-before]').waitFor();
        await page.screenshot({path:join(output,`${example}-${variant}-${theme}-einfuegehinweis.png`),animations:'disabled'});
        await from.dispatchEvent('dragend',{dataTransfer:transfer});
        await transfer.dispose();
        const card=page.locator('.task').filter({hasText:'Termin rückbestätigen'}).getByRole('button',{name:'Verschieben',exact:true});
        await card.click();
        const dialog=page.getByRole('dialog',{name:'Karte verschieben'});
        await dialog.getByRole('combobox',{name:'Zielspalte'}).waitFor();
        await page.screenshot({path:join(output,`${example}-${variant}-${theme}-verschieben.png`),animations:'disabled'});
        await page.keyboard.press('Escape');
      }
      await page.locator(".breadcrumb").getByRole("button",{name:"Projekte",exact:true}).click();
    }
    await page.close();
  }
} finally { await browser.close(); }
