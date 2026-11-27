import { expect,test } from '@playwright/test';
import { project,signIn } from './session';

test('Zammad zeigt den letzten Sendeversuch und aktualisiert ihn beim Wiederholen',async({page})=>{
  const record={id:'muster',name:'Büroinstallation Westflügel',stage:'planning',zammad_ticket_id:42};
  const path='**/api/v1/projects/muster/zammad';
  const firstTime='2028-05-17T11:25:00Z';
  const articleTime='2028-05-17T09:00:00Z';
  const retriedTime='2028-05-17T12:49:00Z';
  let retries=0;
  let reconciled=false;
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route(path,route=>route.fulfill({json:{
    ticket:{id:42,number:'42',title:'Anfrage des Musterbüros',url:'https://zammad.example.test/#ticket/zoom/42'},
    articles:[{id:1,from:'Mira Muster',kind:'internal-note',subject:'Termin zur Montage',
      created_at:articleTime,body:'Bitte um Rückmeldung.'}],
    outgoing:[
      {id:'offer',subject:'Angebot für die Installation',status:retries?'sent':'unknown',attempted_at:retries?retriedTime:firstTime},
      {id:'confirmation',subject:'Terminbestätigung',status:reconciled?'sent':'unknown',attempted_at:articleTime},
      {id:'note',subject:'Ältere Notiz',status:'sent',attempted_at:null},
    ],
  }}));
  await page.route(path+'/outgoing/offer',route=>{
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({retry:true});
    retries++;
    return route.fulfill({json:{id:'offer',status:'sent'}});
  });
  await page.route(path+'/outgoing/confirmation',route=>{
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({retry:true});
    reconciled=true;
    return route.fulfill({json:{id:'confirmation',status:'sent'}});
  });

  await signIn(page);
  await project(page,record.name);
  await page.getByRole('link',{name:'Kommunikation',exact:true}).click();
  const table=page.locator('.communication-outgoing').getByRole('table');
  await expect(table.getByRole('columnheader',{name:'Letzter Versuch',exact:true})).toBeVisible();
  const first=table.getByRole('row').filter({hasText:'Angebot für die Installation'});
  const second=table.getByRole('row').filter({hasText:'Terminbestätigung'});
  const missing=table.getByRole('row').filter({hasText:'Ältere Notiz'});
  const dateCell=(row:typeof first)=>row.locator('td[data-label="Letzter Versuch"]');
  const date=dateCell(first).locator('time');
  await expect(date).toHaveAttribute('datetime',firstTime);
  await expect(date).toHaveText('17.05.2028, 13:25');
  await expect(dateCell(second)).toHaveText('17.05.2028, 11:00');
  await expect(page.getByRole('region',{name:'Ticketverlauf',exact:true}).locator('time[datetime="'+articleTime+'"]'))
    .toHaveText('17.05.2028, 11:00');
  await expect(dateCell(missing)).toHaveText('–');

  await page.setViewportSize({width:375,height:812});
  await dateCell(first).scrollIntoViewIfNeeded();
  await expect(date).toBeInViewport({ratio:1});
  const presentation=await date.evaluate(time=>{
    const cell=time.closest('td')!;
    const label=getComputedStyle(cell,'::before');
    const text=document.createRange();
    text.selectNodeContents(time);
    const bounds=cell.getBoundingClientRect();
    return {
      label:label.content,
      labelVisible:label.display!=='none' && label.visibility==='visible' && Number.parseFloat(label.width)>0,
      textFits:Array.from(text.getClientRects()).every(rect=>rect.width>0
        && rect.left>=Math.max(0,bounds.left) && rect.right<=Math.min(window.innerWidth,bounds.right)),
    };
  });
  expect(presentation).toEqual({label:'"Letzter Versuch"',labelVisible:true,textFits:true});

  const refresh=page.getByRole('button',{name:'Verlauf aktualisieren',exact:true});
  await refresh.click();
  await expect(refresh).toBeEnabled();
  await expect(date).toHaveAttribute('datetime',firstTime);
  expect(retries).toBe(0);

  await first.getByRole('button',{name:'Erneut senden',exact:true}).click();
  const confirm=page.getByRole('dialog',{name:'Zammad-Sendeversuch wiederholen'});
  await confirm.getByRole('button',{name:'Erneut senden',exact:true}).click();
  await expect(confirm).toHaveCount(0);
  await expect(date).toHaveAttribute('datetime',retriedTime);
  await expect(date).toHaveText('17.05.2028, 14:49');
  await expect(first.getByText('An Zammad übergeben',{exact:true})).toBeVisible();
  expect(retries).toBe(1);

  await second.getByRole('button',{name:'Erneut senden',exact:true}).click();
  await confirm.getByRole('button',{name:'Erneut senden',exact:true}).click();
  await expect(confirm).toHaveCount(0);
  await expect(second.getByText('An Zammad übergeben',{exact:true})).toBeVisible();
  await expect(dateCell(second).locator('time')).toHaveAttribute('datetime',articleTime);
  await expect(dateCell(second)).toHaveText('17.05.2028, 11:00');
});
