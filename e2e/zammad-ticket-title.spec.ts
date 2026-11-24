import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

test('Zammad zeigt den Titel und verwirft den verspäteten Titel eines früheren Tickets',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const data={id:'muster',name:'Musterinstallation',stage:'planning',zammad_ticket_id:42};
  const pathname='/api/v1/projects/muster/zammad';
  const titles={42:'<b>Montage im Musterbüro</b>',43:'Anfrage zur Musterinstallation mit langem Ticketbetreff'};
  let phase:'initial'|'error'|'wait'|'empty'='initial';
  let arrived!:()=>void;
  let release!:()=>void;
  const requested=new Promise<void>(resolve=>{arrived=resolve;});
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[data]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route('**/api/v1/projects/muster',route=>{
    expect(route.request().method()).toBe('PATCH');
    data.zammad_ticket_id=43;
    return route.fulfill({json:data});
  });
  await page.route('**'+pathname,async route=>{
    const id=data.zammad_ticket_id as 42|43;
    const current=phase;
    if(id===42 && current==='error') return route.fulfill({status:503,json:{error:'Verlauf vorübergehend nicht verfügbar.'}});
    if(id===42 && current==='wait'){arrived();await gate;}
    await route.fulfill({json:{
      ticket:{id,number:String(id),title:current==='empty'?'':titles[id],url:`https://zammad.example.test/#ticket/zoom/${id}`},
      articles:[],outgoing:[],
    }});
  });
  await signIn(page);
  await project(page,data.name);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  const panel=page.getByRole('region',{name:'Zammad',exact:true});
  const refresh=panel.getByRole('button',{name:'Verlauf aktualisieren'});
  const link=(id:number)=>panel.getByRole('link',{name:`Ticket ${id} öffnen`,exact:true});
  const first=panel.getByText(titles[42],{exact:true});
  await expect(first).toBeVisible();
  await expect(link(42)).toHaveAttribute('href','https://zammad.example.test/#ticket/zoom/42');
  phase='error';
  await refresh.click();
  await expect(panel.getByRole('alert')).toHaveText('Verlauf vorübergehend nicht verfügbar.');
  await expect(first).toBeVisible();
  phase='wait';
  await refresh.click();
  await requested;
  await page.getByLabel('Kommunikationsnotiz').fill('Vorgang aktualisiert.');
  await page.getByRole('button',{name:'Verweis speichern',exact:true}).click();
  const second=panel.getByText(titles[43],{exact:true});
  await expect(second).toBeVisible();
  await expect(link(43)).toHaveAttribute('href','https://zammad.example.test/#ticket/zoom/43');
  expect(await second.evaluate(node=>node.scrollWidth<=node.clientWidth && node.getBoundingClientRect().right<=window.innerWidth)).toBe(true);
  const oldResponse=page.waitForResponse(response=>response.url().endsWith(pathname));
  release();
  await (await oldResponse).finished();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(first).toHaveCount(0);
  await expect(second).toBeVisible();
  await expect(link(42)).toHaveCount(0);
  await expect(link(43)).toHaveAttribute('href','https://zammad.example.test/#ticket/zoom/43');

  phase='empty';
  await refresh.click();
  await expect(second).toHaveCount(0);
  await expect(link(43)).toBeVisible();
});
