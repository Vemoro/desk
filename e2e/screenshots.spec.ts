import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {expect,test} from '@playwright/test';
import {project,signIn} from './session';

for(const theme of ['hell','dunkel']){
  test('Sendeversuche '+theme,async({page})=>{
    const record={id:'muster',name:'Büroinstallation Westflügel',stage:'planning',zammad_ticket_id:42};
    await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
    await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
    await page.route('**/api/v1/projects/muster/zammad',route=>route.fulfill({json:{
      ticket:{id:42,number:'42',title:'Anfrage des Musterbüros',url:'https://zammad.example.test/'},
      articles:[{id:1,kind:'internal-note',from:'Mira Muster',subject:'Termin zur Montage',body:'Musteranfrage zur Installation.',created_at:'2028-05-17T09:00:00Z'}],
      outgoing:[
        {id:'offer',subject:'Angebot für die Installation',status:'unknown',attempted_at:'2028-05-17T11:25:00Z'},
        {id:'confirmation',subject:'Terminbestätigung',status:'sent',attempted_at:'2028-05-17T09:00:00Z'},
        {id:'note',subject:'Interne Rückfrage',status:'sent'},
      ],
    }}));
    await page.setViewportSize({width:1440,height:950});
    await signIn(page);
    if(theme==='dunkel') await page.getByRole('button',{name:'Dunkles Design'}).click();
    await project(page,record.name);
    await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
    const heading=page.getByRole('heading',{name:'Sendeversuche',exact:true});
    const first=page.getByRole('row').filter({hasText:'Angebot für die Installation'});
    await expect(first).toBeVisible();
    const after=true;
    if(after) await expect(first.getByText('17.05.2028, 13:25',{exact:true})).toBeVisible();
    else await expect(first.locator('time')).toHaveCount(0);
    const output='build/screenshots';
    await mkdir(output,{recursive:true});
    for(const [name,width,height] of [['desktop',1440,950],['smartphone',375,812]] as const){
      await page.setViewportSize({width,height});
      await heading.evaluate(element=>element.scrollIntoView({block:'start'}));
      await page.screenshot({path:join(output,[name,theme].join('-')+'.png'),animations:'disabled'});
    }
  });
}
