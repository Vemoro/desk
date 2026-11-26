import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

async function check(page:Page,view:string) {
  const {violations}=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  expect(violations.map(({id,nodes})=>({id,targets:nodes.map(({target})=>target)})),view).toEqual([]);
}

async function setupTicket(page:Page) {
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{haben:false,zammad:true}}));
  await page.route('**/api/v1/projects?*',async route=>{
    const response=await route.fetch();
    const records=await response.json() as {name:string;zammad_ticket_id?:number}[];
    for(const record of records) {
      if(record.name==='Büroinstallation Westflügel') record.zammad_ticket_id=42;
    }
    await route.fulfill({response,json:records});
  });
  await page.route('**/api/v1/projects/*/zammad',route=>route.fulfill({json:{
    ticket:{number:'42',title:'Musteranfrage Büroinstallation',url:'https://zammad.example.test/#ticket/zoom/42'},
    articles:[{id:1,kind:'incoming-email',subject:'Anfrage',from:'Mara Muster',body:'Bitte den Einbau für Freitag planen.',
      reply:{recipient:'mara@example.test',subject:'AW: Anfrage'}}],outgoing:[],
  }}));
}

for(const [theme,width] of [['light',1280],['dark',1280],['light',390],['dark',390]] as const) {
  test(`Desk erfüllt die automatisierbaren AA-Prüfungen in ${theme} bei ${width} Pixeln`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.addInitScript(value=>localStorage.setItem('desk-theme',value),theme);
    await page.goto('/');
    await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
    await check(page,'Anmeldung');
    await setupTicket(page);
    await signIn(page);
    await check(page,'Übersicht');
    if(width<700) await page.getByRole('button',{name:'Menü',exact:true}).click();
    await project(page,'Büroinstallation Westflügel');
    await check(page,'Projektübersicht');
    for(const tab of ['Kanban','Ressourcen & Kalkulation','Controlling','Kommunikation']) {
      await page.getByRole('link',{name:tab,exact:true}).click();
      await expect(page.getByRole('link',{name:tab,exact:true})).toHaveAttribute('aria-current','page');
      await check(page,tab);
    }
    await page.getByRole('button',{name:'Antworten',exact:true}).click();
    await expect(page.getByRole('region',{name:'E-Mail-Antwort'})).toBeVisible();
    await check(page,'Zammad-Antworteditor');
    if(width<700) await page.getByRole('button',{name:'Menü',exact:true}).click();
    await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Projektlager',exact:true})).toBeVisible();
    await check(page,'Projektlager');
  });
}
