import {mkdir} from 'node:fs/promises';
import {expect,test} from '@playwright/test';
import {project,signIn} from './session';

const after=true;
const title='Terminabstimmung Musterbüro';
for(const theme of ['hell','dunkel']){
  test('Ticketarbeitsplatz '+theme,async({page})=>{
    const record={id:'muster',name:'Büroinstallation Westflügel',stage:'planning',zammad_ticket_id:42,
      external_link:'https://vorgang.example.test/muster',communication_note:'Abstimmung im Musterbüro.'};
    const articles=[
      {id:11,kind:'incoming-email',from:'Musterkontakt',subject:'Zutritt für die Montage',created_at:'2028-05-17T09:00:00Z',
        body:'Der Haupteingang ist ab 08:00 Uhr offen.',reply:{recipient:'kontakt@example.test',subject:'Zutritt für die Montage'}},
      {id:12,kind:'outgoing-email',from:'Mira Muster',subject:'Termin bestätigt',created_at:'2028-05-17T09:21:00Z',
        body:'Vielen Dank. Wir melden uns am Empfang.',attachments:[{id:101,filename:'Terminbestätigung.pdf'}]},
      {id:13,kind:'internal-note',from:'Mira Muster',subject:'Schlüssel am Empfang',created_at:'2028-05-17T10:15:00Z',
        body:'Bitte den Schlüssel beim Empfang mitnehmen.'},
    ];
    await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
    await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
    await page.route('**/api/v1/projects/muster/zammad',route=>route.fulfill({json:{
      ticket:{id:42,number:'42',title,url:'https://zammad.example.test/#ticket/zoom/42'},articles,outgoing:[],
    }}));
    await page.setViewportSize({width:1440,height:950});
    await signIn(page);
    if(theme==='dunkel') await page.getByRole('button',{name:'Dunkles Design'}).click();
    await project(page,record.name);
    await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
    await expect(page.getByText('Zutritt für die Montage',{exact:true})).toBeVisible();
    if(after){
      await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
      await expect(page.getByText('Zammad-Ticket #42',{exact:true})).toBeVisible();
      const workspace=page.getByRole('region',{name:'Ticketverlauf',exact:true});
      const entries=workspace.locator('.thread li');
      await expect(entries.locator('strong')).toHaveText(articles.map(article=>article.subject));
      expect(await entries.nth(0).evaluate(row=>getComputedStyle(row).flexDirection)).toBe('row-reverse');
      expect(await entries.nth(1).evaluate(row=>getComputedStyle(row).flexDirection)).toBe('row');
      expect(await entries.nth(2).locator('.communication-bubble').evaluate(bubble=>getComputedStyle(bubble).backgroundImage))
        .toContain('repeating-linear-gradient');
      await expect(entries.nth(0).getByRole('button',{name:'Antworten',exact:true})).toBeVisible();
      await expect(entries.nth(1).getByRole('button',{name:'Text weiterleiten',exact:true})).toBeVisible();
      await expect(entries.nth(2).getByRole('button',{name:'In Notiz zitieren',exact:true})).toBeVisible();
      await expect(page.getByRole('textbox',{name:'Interne Notiz'})).toBeVisible();
      await expect(page.getByRole('link',{name:'Ticket 42 öffnen'})).toHaveAttribute('href','https://zammad.example.test/#ticket/zoom/42');
      await expect(page.getByText('Terminbestätigung.pdf',{exact:true})).toBeVisible();
    }
    const output='build/screenshots';
    await mkdir(output,{recursive:true});
    await page.screenshot({path:output+'/desktop-'+theme+'.png',animations:'disabled'});
    await page.setViewportSize({width:375,height:812});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:output+'/smartphone-'+theme+'.png',animations:'disabled',fullPage:true});
  });
}
