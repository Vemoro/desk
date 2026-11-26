import {mkdir} from 'node:fs/promises';
import {expect,test} from '@playwright/test';
import {project,signIn} from './session';

for(const theme of ['hell','dunkel']){
  test('Ticketarbeitsplatz '+theme,async({page})=>{
    const record={id:'muster',name:'Büroinstallation Westflügel',stage:'planning',zammad_ticket_id:42};
    await page.setViewportSize({width:1440,height:950});
    await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
    await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
    await page.route('**/api/v1/projects/muster/zammad',route=>route.fulfill({json:{
      ticket:{id:42,number:'42',title:'Abstimmung zur Büroinstallation',url:'https://zammad.example.test/'},
      articles:Array.from({length:8},(_,index)=>({id:index+1,kind:index%2?'internal-note':'incoming-email',
        from:'Mira Muster',subject:'Terminabstimmung '+(index+1),created_at:'2028-05-17T09:00:00Z',
        body:'Der Zugang ist bestätigt. Bitte die Details für den Mustertermin prüfen. '.repeat(3),
        ...(index%2?{}:{reply:{recipient:'kunde@example.test',subject:'Terminabstimmung'}})})),
      outgoing:[{id:'attempt',subject:'Abstimmung bestätigen',status:'sent'}],
    }}));
    await signIn(page);
    if(theme==='dunkel') await page.getByRole('button',{name:'Dunkles Design'}).click();
    await project(page,record.name);
    await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
    const activity=page.getByRole('region',{name:'Ticketaktivität'});
    const note=page.getByRole('textbox',{name:'Interne Notiz'});
    const details=page.getByRole('heading',{name:'Ticketdetails',exact:true});
    await expect(note).toBeInViewport({ratio:1});
    await activity.focus();
    await activity.press('End');
    await expect.poll(()=>activity.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
    await expect(note).toBeInViewport({ratio:1});
    await expect(details).toBeInViewport();
    await expect(page.getByRole('heading',{name:'Abstimmung zur Büroinstallation'})).toBeInViewport();
    await expect(activity.getByRole('heading',{name:'Sendeversuche'})).toBeInViewport();
    const output='build/screenshots';
    await mkdir(output,{recursive:true});
    await page.screenshot({path:output+'/desktop-'+theme+'.png',animations:'disabled'});

    await page.setViewportSize({width:375,height:812});
    await expect.poll(()=>activity.evaluate(element=>getComputedStyle(element).overflowY)).toBe('visible');
    await expect(note).toBeVisible();
    await expect(details).toBeVisible();
    const noteBox=await note.boundingBox();
    const detailsBox=await details.boundingBox();
    expect(detailsBox!.y).toBeGreaterThan(noteBox!.y);
    await note.evaluate(element=>element.scrollIntoView({block:'center'}));
    await page.screenshot({path:output+'/smartphone-'+theme+'.png',animations:'disabled'});
  });
}
