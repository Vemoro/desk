import { test, expect } from '@playwright/test';
import { signIn } from './session';

const csv=[
  'reference;name;amount;cost_center',
  'B-1;Mustertransport;12,30;FREMD',
  'B-2;"Aufbau; Material";20,00;K-2',
  'B-3;Werkzeug;4,05;',
  'B-4;Ersatz;falsch;K-2',
  'B-5;Schrauben;6;K-2',
  ' B-5 ;Schrauben erneut;6;K-2',
  'B-6;Kaputtes"Feld;2;K-2',
].join('\r\n');

test('Kosten-CSV lokal prüfen und nur gültige Zeilen ausdrücklich übernehmen',async({page})=>{
  const entries=[{id:'alt',source:'haben-export',reference:'B-1',name:'Alt',cents:1200,project_id:'p1'}];
  const posts:unknown[][]=[];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'p1',name:'Musterinstallation',cost_center:'K-1'},{id:'p2',name:'Werkstatt',cost_center:'K-2'},
  ]}));
  await page.route('**/api/v1/costs?*',route=>route.fulfill({json:entries}));
  await page.route('**/api/v1/costs',route=>{
    const body=route.request().postDataJSON().entries;
    posts.push(body);
    for(const item of body){
      const found=entries.find((entry)=>entry.source===item.source && entry.reference===item.reference);
      if(found) Object.assign(found,item);
      else entries.push({...item,id:item.reference,project_id:item.cost_center==='K-2'?'p2':null});
    }
    return route.fulfill({status:201,json:entries});
  });

  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Ist-Kosten',exact:true}).click();
  await page.getByText('Kosten aus CSV übernehmen',{exact:true}).click();
  const input=page.getByRole('textbox',{name:/CSV-Inhalt/});
  const preview=page.getByRole('region',{name:'Importvorschau',exact:true});
  const inspect=page.getByRole('button',{name:'CSV prüfen',exact:true});
  await input.fill('name;amount\nBeleg;5');
  await inspect.click();
  await expect(page.getByRole('alert').filter({hasText:'Kopfzeile'})).toBeVisible();
  await expect(preview).toBeHidden();

  await input.fill(csv);
  await inspect.click();
  await expect(preview.getByRole('row').filter({hasText:'B-1'})).toContainText('Musterinstallation');
  await expect(preview.getByRole('row').filter({hasText:'B-1'})).toContainText('Kostenstelle „FREMD“ unbekannt.');
  await expect(preview.getByRole('row').filter({hasText:'B-1'})).toContainText('Aktualisierung');
  await expect(preview.getByRole('row').filter({hasText:'B-2'})).toContainText('Werkstatt');
  await expect(preview.getByRole('row').filter({hasText:'B-3'})).toContainText('Ohne Zuordnung');
  await expect(preview.getByRole('row').filter({hasText:'B-3'})).toContainText('Kostenstelle fehlt.');
  await expect(preview.getByRole('row').filter({hasText:'B-4'})).toContainText('amount');
  await expect(preview.getByRole('row').filter({hasText:'B-6'})).toContainText('name: Ungültige Anführungszeichen.');
  await expect(preview.getByRole('row').filter({hasText:'B-5'})).toHaveCount(2);
  await expect(preview.getByText('reference: Doppelte Belegreferenz.',{exact:true})).toHaveCount(2);
  expect(posts).toHaveLength(0);

  await preview.getByRole('button',{name:'Abbrechen',exact:true}).click();
  await expect(preview).toBeHidden();
  await expect(input).toHaveValue(csv.replaceAll('\r\n','\n'));
  expect(posts).toHaveLength(0);

  for(let index=0;index<2;index++){
    await input.fill(csv);
    await inspect.click();
    await preview.getByRole('button',{name:'3 gültige Zeilen übernehmen',exact:true}).click();
    await expect(preview).toBeHidden();
  }
  expect(posts).toEqual(Array.from({length:2},()=>[
    {source:'haben-export',reference:'B-1',name:'Mustertransport',cents:1230,cost_center:'FREMD'},
    {source:'haben-export',reference:'B-2',name:'Aufbau; Material',cents:2000,cost_center:'K-2'},
    {source:'haben-export',reference:'B-3',name:'Werkzeug',cents:405,cost_center:''},
  ]));
  await expect(page.getByRole('cell',{name:'Mustertransport',exact:true})).toHaveCount(1);

  const large=['reference;name;amount',...Array.from({length:501},(_,index)=>`BE-${index};Testbeleg;1`)].join('\n');
  await input.fill(large);
  await inspect.click();
  await expect(preview.getByRole('alert')).toContainText('Höchstens 500 gültige Zeilen');
  await expect(preview.getByRole('button',{name:'501 gültige Zeilen übernehmen'})).toBeDisabled();
  expect(posts).toHaveLength(2);
});
