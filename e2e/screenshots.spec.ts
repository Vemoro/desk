import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {expect,test,type Route} from '@playwright/test';
import {project,signIn} from './session';

for(const theme of ['hell','dunkel']){
  test(theme,async({page})=>{
    const ticket={id:42,number:'42',title:'Anfrage des Musterbüros',url:'https://zammad.example.test/'};
    const record={id:'muster',name:'Büroinstallation Westflügel',stage:'planning',zammad_ticket_id:42};
    const conversation={ticket,articles:[{id:1,kind:'internal-note',from:'Mira Muster',subject:'Termin zur Montage',body:'Die Installation ist für Dienstag vorgemerkt.',created_at:'2028-05-17T09:00:00Z'}],
      outgoing:[{id:'attempt',subject:'Bestätigung für das Musterbüro',status:'sent'}]};
    let reads=0;
    let held:Route|undefined;
    await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
    await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
    await page.route('**/api/v1/projects/muster/zammad',route=>{
      if(++reads===1) return route.fulfill({json:conversation});
      held=route;
    });
    await page.setViewportSize({width:1440,height:950});
    await signIn(page);
    if(theme==='dunkel') await page.getByRole('button',{name:'Dunkles Design'}).click();
    await project(page,record.name);
    await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
    const refresh=page.getByRole('button',{name:'Verlauf aktualisieren',exact:true});
    await expect(page.getByText('Termin zur Montage',{exact:true})).toBeVisible();
    await refresh.click();
    try {
      await expect(page.getByRole('status').filter({hasText:'Ticketverlauf wird geladen'})).toBeVisible();
      const after=true;
      if(after) await expect(refresh).toBeEnabled();
      else await expect(refresh).toBeDisabled();
      const output='build/screenshots';
      await mkdir(output,{recursive:true});
      for(const [name,width,height] of [['desktop',1440,950],['smartphone',375,812]] as const){
        await page.setViewportSize({width,height});
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:join(output,[name,theme].join('-')+'.png'),animations:'disabled'});
      }
    }finally{
      await held?.abort().catch(()=>{});
    }
  });
}
