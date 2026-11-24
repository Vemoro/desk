import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { project, signIn } from './session';

const installation={id:'musterinstallation',name:'Musterinstallation',stage:'planning'};
const second={id:'buero',name:'Büroprojekt',stage:'planning'};
const positions=[
  {name:'Montage "Nord"; Aufbau',quantity:2,unit_cents:10050},
  {name:'Einweisung',quantity:1,unit_cents:1200},
];

async function openCalculation(page:Page,name:string){
  await project(page,name);
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
}

test.beforeEach(async({page})=>{
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[installation,second]}));
  await page.route('**/api/v1/lines?*',route=>route.fulfill({json:[
    {id:'buy',project_id:installation.id,name:'Einkauf Material',quantity:4,unit_cents:500,kind:'buy'},
    ...positions.map((line,index)=>({...line,id:'sell-'+index,project_id:installation.id,kind:'sell'})),
  ]}));
});

test('Angebots-CSV enthält genau die bestätigte Vorschau',async({page})=>{
  let requests=0;
  let downloads=0;
  page.on('download',()=>downloads++);
  await page.route('**/api/v1/projects/musterinstallation/offer-positions',route=>{
    expect(route.request().method()).toBe('GET');
    requests++;
    return route.fulfill({json:positions});
  });
  await signIn(page);
  await openCalculation(page,installation.name);
  await expect(page.getByText('Einkauf Material',{exact:true})).toBeVisible();
  const open=page.getByRole('button',{name:'Angebotspositionen exportieren',exact:true});
  const dialog=page.getByRole('dialog',{name:'Angebotspositionen',exact:true});
  await open.click();
  await expect(dialog.getByRole('row').nth(1).getByRole('cell')).toHaveText([positions[0].name,'2','100,50 €']);
  await expect(dialog.getByRole('row').nth(2).getByRole('cell')).toHaveText([positions[1].name,'1','12,00 €']);
  await expect(dialog.getByText('Einkauf Material',{exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  expect(downloads).toBe(0);

  await open.click();
  await expect(dialog.getByRole('row')).toHaveCount(3);
  const downloaded=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'CSV herunterladen',exact:true}).click();
  const file=await downloaded;
  expect(file.suggestedFilename()).toBe('angebotspositionen-musterin.csv');
  expect(await readFile(await file.path(),'utf8')).toBe('\uFEFFPosition;Menge;Einzelpreis EUR\r\n"Montage ""Nord""; Aufbau";2;100,50\r\n"Einweisung";1;12,00');
  expect(requests).toBe(2);
  expect(downloads).toBe(1);
});

test('Angebotsvorschau kann nach einem Abruffehler erneut laden und bleibt beim Projektwechsel geschlossen',async({page})=>{
  let phase:'error'|'empty'|'pending'='error';
  let release!:()=>void;
  const pending=new Promise<void>((resolve)=>{release=resolve;});
  await page.route('**/api/v1/projects/musterinstallation/offer-positions',async(route)=>{
    expect(route.request().method()).toBe('GET');
    if(phase==='error') return route.fulfill({status:503,json:{error:'Testfehler'}});
    if(phase==='empty') return route.fulfill({json:[]});
    await pending;
    return route.fulfill({status:401,json:{error:'Verspätete Antwort des alten Projekts'}});
  });
  await page.route('**/api/v1/projects/buero/offer-positions',route=>route.fulfill({json:[]}));

  await signIn(page);
  await openCalculation(page,installation.name);
  const open=page.getByRole('button',{name:'Angebotspositionen exportieren',exact:true});
  const dialog=page.getByRole('dialog',{name:'Angebotspositionen',exact:true});
  await open.click();
  await expect(dialog.getByRole('alert')).toHaveText('Die Angebotspositionen konnten nicht geladen werden.');
  await expect(dialog.getByRole('button',{name:'CSV herunterladen'})).toHaveCount(0);
  phase='empty';
  await dialog.getByRole('button',{name:'Erneut laden',exact:true}).click();
  await expect(dialog.getByRole('status')).toHaveText('Für dieses Projekt sind keine Verkaufspositionen vorhanden.');
  await expect(dialog.getByRole('button',{name:'CSV herunterladen'})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Schließen',exact:true}).click();
  await expect(dialog).toBeHidden();

  phase='pending';
  const request=page.waitForRequest((request)=>request.url().endsWith('/musterinstallation/offer-positions'));
  await open.click();
  await request;
  await expect(dialog.getByRole('status')).toHaveText('Angebotspositionen werden geladen …');
  await page.evaluate(()=>{location.hash='projects/buero';});
  await expect(page.getByRole('heading',{name:second.name,exact:true})).toBeVisible();
  await expect(dialog).toBeHidden();
  const old=page.waitForResponse((response)=>response.url().endsWith('/musterinstallation/offer-positions') && response.status()===401);
  release();
  await (await old).finished();
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  await open.click();
  await expect(dialog.getByRole('status')).toHaveText('Für dieses Projekt sind keine Verkaufspositionen vorhanden.');
});
