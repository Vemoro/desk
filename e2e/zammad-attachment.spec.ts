import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { project, signIn } from './session';

test('Ticketanhänge bleiben bei Wartezeit und Fehler am Artikel bedienbar',async({page})=>{
  const name='Büroinstallation Westflügel';
  const filename='Materialliste Westflügel.pdf';
  const data=Buffer.from('%PDF-1.4\nSynthetische Materialliste\n%%EOF');
  const apiPath='**/api/v1/projects/muster285/zammad';
  const requests:string[]=[];
  const unblock=Promise.withResolvers<void>();
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[{id:'muster285',name,stage:'planning',zammad_ticket_id:42}]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route(apiPath,route=>route.fulfill({json:{
    ticket:{id:42,number:'1042',title:'Material zum Westflügel',url:'https://zammad.example.test/'},outgoing:[],
    articles:[{id:12,subject:'Büroanfrage',body:'Anbei der Plan.',attachments:[
      {filename,id:101},{filename,id:102},{filename:'Alte Anlage.pdf'},
    ]}],
  }}));
  await page.route(apiPath+'/attachment?*',async route=>{
    const query=new URL(route.request().url()).searchParams;
    expect(query.get('ticket')).toBe('42');
    expect(query.get('article')).toBe('12');
    const id=query.get('attachment')!;
    requests.push(id);
    if(id==='101'){
      await unblock.promise;
      return route.fulfill({body:data,contentType:'application/octet-stream'});
    }
    return route.fulfill({status:404,json:{error:'Der Anhang ist nicht mehr verfügbar.'}});
  });
  await signIn(page);
  await project(page,name);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  const article=page.getByRole('region',{name:'Ticketverlauf'}).getByRole('listitem').filter({hasText:'Büroanfrage'});
  const controls=article.getByRole('button',{name:`${filename} herunterladen`,exact:true});
  await expect(controls).toHaveCount(2);
  await expect(article.getByText('Alte Anlage.pdf',{exact:true})).toBeVisible();
  await expect(article.getByRole('button',{name:'Alte Anlage.pdf herunterladen'})).toHaveCount(0);
  await controls.first().focus();
  await controls.first().press('Enter');
  try{
    await expect(article.getByRole('status')).toHaveText('Anhang wird geladen …');
    await expect(controls.first()).toBeDisabled();
    await expect(controls.first()).toBeFocused();
  }finally{
    const download=page.waitForEvent('download');
    unblock.resolve();
    const completed=await download;
    expect(completed.suggestedFilename()).toBe(filename);
    expect(await readFile((await completed.path())!)).toEqual(data);
  }
  await expect(controls.first()).toBeEnabled();
  const current=page.url();
  await controls.last().click();
  await expect(article.getByRole('alert')).toHaveText('Der Anhang ist nicht mehr verfügbar.');
  await expect(controls.last()).toBeEnabled();
  expect(page.url()).toBe(current);
  expect(requests).toEqual(['101','102']);
});

test('Filtern und Notizzitat brechen einen gestarteten Download nicht ab',async({page})=>{
  const name='Büroinstallation Westflügel';
  const apiPath='**/api/v1/projects/muster285/zammad';
  const body=Buffer.from('%PDF-1.4\nSynthetische Materialliste\n%%EOF');
  const unblock=Promise.withResolvers<void>();
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[{id:'muster285',name,stage:'planning',zammad_ticket_id:42}]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await page.route(apiPath,route=>route.fulfill({json:{
    ticket:{id:42,number:'1042',title:'Material zum Westflügel',url:'https://zammad.example.test/'},outgoing:[],
    articles:[{id:12,subject:'Büroanfrage',body:'Anbei der Plan.',attachments:[{filename:'Materialliste.pdf',id:101}]},
      {id:13,subject:'Termin',body:'Bitte Montag.',kind:'internal-note'}],
  }}));
  await page.route(apiPath+'/attachment?*',async route=>{
    await unblock.promise;
    await route.fulfill({body,contentType:'application/octet-stream'});
  });
  await signIn(page);
  await project(page,name);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  const history=page.getByRole('region',{name:'Ticketverlauf'});
  const attachment=history.getByRole('button',{name:'Materialliste.pdf herunterladen'});
  try{
    await attachment.click();
    await expect(attachment).toBeDisabled();
    await history.getByRole('searchbox',{name:'Ticketverlauf durchsuchen'}).fill('Termin');
    await expect(attachment).toHaveCount(0);
    await history.getByRole('button',{name:'In Notiz zitieren'}).click();
    const download=page.waitForEvent('download',{timeout:3000});
    unblock.resolve();
    const completed=await download;
    expect(completed.suggestedFilename()).toBe('Materialliste.pdf');
    expect(await readFile((await completed.path())!)).toEqual(body);
  }finally{
    unblock.resolve();
  }
});
