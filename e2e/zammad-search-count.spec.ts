import { expect, test, type Page } from '@playwright/test';
import { project, signIn } from './session';

const apiPath='**/api/v1/projects/muster/zammad';
const article=(id:number,subject:string,body:string)=>({id,subject,body,created_at:'2028-05-17T09:00:00Z'});
const baseArticles=[article(1,'Montage bestätigt','Termin steht.'),article(2,'Rückfrage','Montagekoffer mitbringen.'),article(3,'Anfahrt','Haupteingang')];
async function openTarget(page:Page){
  const record={id:'muster',name:'Musterinstallation',stage:'planning',zammad_ticket_id:42};
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[record]}));
  await page.route('**/api/v1/integrations',route=>route.fulfill({json:{zammad:true,haben:false}}));
  await signIn(page);
  await project(page,record.name);
  await page.getByRole('button',{name:'Kommunikation',exact:true}).click();
  return page.getByRole('region',{name:'Anfrage vom Musterbüro',exact:true});
}
function conversation(articles:typeof baseArticles){
  return {ticket:{id:42,number:'42',title:'Anfrage vom Musterbüro',url:'https://zammad.example.test/'},
    articles,outgoing:[{id:'attempt',subject:'Montageangebot gesendet',status:'sent'}]};
}

test('Zammad zählt passende Artikel und aktualisiert den Zähler mit dem Verlauf',async({page})=>{
  let articles=baseArticles;
  await page.route(apiPath,route=>route.fulfill({json:conversation(articles)}));
  const target=await openTarget(page);
  const search=target.getByRole('searchbox',{name:'Ticketverlauf durchsuchen'});
  const count=target.getByText(/\d+ von \d+ Nachrichten/);
  await expect(target.locator('.thread li')).toHaveCount(3);
  await expect(count).toHaveCount(0);
  await search.fill('  MONTAGE  ');
  await expect(count).toHaveText('2 von 3 Nachrichten');
  await expect(target.locator('.thread li strong')).toHaveText(['Montage bestätigt','Rückfrage']);
  articles=[article(4,'Material für Montage','Bestätigt'),article(5,'Anfahrt','Haupteingang'),
    article(6,'Lieferung','17 Uhr'),article(7,'Ansprechpartner','Mira Muster')];
  await target.getByRole('button',{name:'Verlauf aktualisieren'}).click();
  await expect(count).toHaveText('1 von 4 Nachrichten');
  await search.fill('   ');
  await expect(count).toHaveCount(0);
  await expect(target.locator('.thread li')).toHaveCount(4);
  await search.fill('Verwaltung');
  await expect(target.getByText('Keine Nachrichten für diese Suche.')).toBeVisible();
  await expect(count).toHaveCount(0);
  articles=[];
  await target.getByRole('button',{name:'Verlauf aktualisieren'}).click();
  await expect(target.getByText('Dieses Ticket enthält noch keine Nachrichten.')).toBeVisible();
  await expect(count).toHaveCount(0);
});
