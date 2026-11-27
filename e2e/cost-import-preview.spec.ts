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
  await input.fill(large.split('\n').slice(0,-1).join('\n'));
  await inspect.click();
  await expect(preview.getByRole('button',{name:'500 gültige Zeilen übernehmen'})).toBeEnabled();
  await input.fill(large);
  await inspect.click();
  await expect(preview.getByRole('alert')).toContainText('Höchstens 500 gültige Zeilen');
  await expect(preview.getByRole('button',{name:'501 gültige Zeilen übernehmen'})).toBeDisabled();
  expect(posts).toHaveLength(2);
});

test('Die Vorschau liest aktuelle Belege und die echte Bestätigung erhält eine spätere Zuordnung',async({page,browser})=>{
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Ist-Kosten',exact:true}).click();
  await page.getByText('Kosten aus CSV übernehmen',{exact:true}).click();
  const input=page.getByRole('textbox',{name:'CSV-Inhalt'});
  const inspect=page.getByRole('button',{name:'CSV prüfen',exact:true});
  const preview=page.getByRole('region',{name:'Importvorschau',exact:true});
  const origin=new URL(page.url()).origin;
  const other=await browser.newContext({baseURL:origin});
  try {
    const secondPage=await other.newPage();
    await signIn(secondPage);
    const request=secondPage.request;
    const projectsResponse=await request.get('/api/v1/projects');
    expect(projectsResponse.ok()).toBe(true);
    const projects=await projectsResponse.json() as {id:string;name:string;cost_center:string}[];
    const [first,second]=projects.filter(project=>project.cost_center);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    const reference='CSV-'+crypto.randomUUID();
    const added=await request.post('/api/v1/costs',{headers:{Origin:origin},data:{entries:[
      {source:'haben-export',reference,name:'Export vorher',cents:1050,project_id:first.id},
      {source:'manual',reference,name:'Manueller Beleg',cents:350,project_id:first.id},
    ]}});
    expect(added.status(),await added.text()).toBe(201);
    const [exported,manual]=await added.json() as {id:string}[];
    const invalid=reference+'-fehler';
    const invalidText=reference+'-text';
    const csv=['reference;name;amount;cost_center',[reference,'Export nachher','21,00',first.cost_center].join(';'),invalid+';Fehler;ungültig;',invalidText+';Aus\0lage;6;'].join('\n');
    const persisted=async()=>{
      const response=await request.get('/api/v1/costs?limit=200');
      expect(response.ok()).toBe(true);
      const costs=await response.json() as {id:string;reference:string;cents:number;project_id:string;source:string}[];
      expect(costs.some(cost=>cost.reference===invalid || cost.reference===invalidText)).toBe(false);
      return costs.filter(cost=>cost.reference===reference);
    };

    await input.fill(csv);
    await inspect.click();
    const row=preview.getByRole('row').filter({has:page.getByRole('cell',{name:reference,exact:true})});
    await expect(row).toContainText('Aktualisierung');
    await expect(preview.getByText('name: Ungültige Zeichen.',{exact:true})).toBeVisible();
    await expect(row).toContainText(first.name);
    await expect(preview.getByRole('heading')).toBeFocused();
    await preview.getByRole('button',{name:'Abbrechen',exact:true}).press('Enter');
    await expect(input).toBeFocused();
    expect((await persisted()).find(cost=>cost.id===exported.id)?.cents).toBe(1050);

    await inspect.click();
    await expect(row).toContainText(first.name);
    const assignment=await request.patch('/api/v1/costs/'+exported.id,{headers:{Origin:origin},data:{project_id:second.id}});
    expect(assignment.ok(),await assignment.text()).toBe(true);
    await preview.getByRole('button',{name:'1 gültige Zeile übernehmen',exact:true}).press('Enter');
    await expect(preview).toBeHidden();
    await expect(input).toBeFocused();

    await input.fill(csv);
    await inspect.click();
    await expect(row).toContainText(second.name);
    await preview.getByRole('button',{name:'1 gültige Zeile übernehmen',exact:true}).click();
    await expect(preview).toBeHidden();
    const result=await persisted();
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({id:exported.id,source:'haben-export',cents:2100,project_id:second.id}),
      expect.objectContaining({id:manual.id,source:'manual',cents:350,project_id:first.id}),
    ]));
  } finally { await other.close(); }
});
