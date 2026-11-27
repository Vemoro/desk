import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Bewegungs-CSV enthält ausschließlich die geordneten Treffer aller geladenen Seiten',async({page})=>{
  const common={project_id:'muster',location_id:'ost',quantity:2,action:'issue',created_at:'2028-05-17T22:15:00Z',actor_id:'desk-user'};
  const offsets:number[]=[];
  await page.route('**/api/v1/movements?*',route=>{
    const offset=Number(new URL(route.request().url()).searchParams.get('offset'));
    offsets.push(offset);
    return route.fulfill({json:offset===0?[
      {...common,id:'first',item_id:'kit',delivery_reference:'LS-01'},
      {...common,id:'other-project',item_id:'kit',project_id:'other'},
      {...common,id:'other-place',item_id:'kit',location_id:'west'},
      {...common,id:'correction',item_id:'kit',location_id:'west',action:'receive',delivery_reference:'LS-OFFENE-KORREKTUR'},
      ...Array.from({length:196},(_,i)=>({...common,id:`ignored-${i}`,item_id:'kit',location_id:'west'})),
    ]:[{...common,id:'more',created_at:'2028-05-17T22:14:00Z',item_id:'cable',action:'return',quantity:1,delivery_reference:'=2+2'}]});
  });
  const resources={
    projects:[{id:'muster',name:'Musterinstallation',stage:'running'},{id:'other',name:'Musterwartung',stage:'planning'}],
    items:[{id:'kit',name:'Montagekoffer; "Set"\nNachtrag'},{id:'cable',name:'Verlängerungskabel'}],
    locations:[{id:'ost',name:'Musterlager Ost'},{id:'west',name:'Musterlager West'}],
  };
  for(const [resource,json] of Object.entries(resources)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/users',route=>route.fulfill({json:[{id:'desk-user',name:'Mira Muster'}]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  await expect(panel.getByText('201 von 201 Bewegungen',{exact:true})).toBeVisible();
  expect(offsets).toEqual([0,200]);
  await panel.getByLabel('Projekt filtern').selectOption('muster');
  const correction=panel.locator('tr').filter({hasText:'LS-OFFENE-KORREKTUR'});
  await correction.getByRole('button',{name:'Korrigieren',exact:true}).click();
  await panel.getByLabel('Lagerort filtern').selectOption('ost');
  await expect(panel.getByText('2 von 201 Bewegungen',{exact:true})).toBeVisible();
  await expect(correction).toHaveCount(1);
  await expect(correction).toBeHidden();
  const download=panel.getByRole('button',{name:'CSV herunterladen'});
  await expect(download).toBeEnabled();
  const event=page.waitForEvent('download');
  await download.click();
  const csv=await event;
  expect(csv.suggestedFilename()).toBe('lagerbewegungen.csv');
  const contents=await readFile((await csv.path())!,'utf8');
  expect(contents).toBe('\uFEFF'+[
    'Zeitpunkt (UTC);Bewegung;Artikel;Lagerort;Projekt;Menge;Lieferschein;Erfasst durch',
    '"2028-05-17T22:15:00.000Z";"Ausgabe";"Montagekoffer; ""Set""\nNachtrag";"Musterlager Ost";"Musterinstallation";2;"LS-01";"Mira Muster"',
    '"2028-05-17T22:14:00.000Z";"Rückgabe";"Verlängerungskabel";"Musterlager Ost";"Musterinstallation";1;"\'=2+2";"Mira Muster"',
  ].join('\r\n'));
  expect(offsets).toEqual([0,200]);

  await panel.getByLabel('Vom Datum').fill('2028-05-18');
  await panel.getByLabel('Bis Datum').fill('2028-05-17');
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(download).toBeDisabled();
  await panel.getByLabel('Bis Datum').fill('2028-05-18');
  await expect(download).toBeEnabled();
  await panel.getByRole('searchbox',{name:'Lagerbewegungen suchen'}).fill('keine-buchung');
  await expect(panel.getByText('Keine Lagerbewegungen für diese Filter.')).toBeVisible();
  await expect(download).toBeDisabled();
});

test('Angebots-CSV behält Dateiname, Kopfzeile, Beträge und Textmaskierung',async({page})=>{
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'muster-projekt',name:'Musterinstallation',stage:'planning'},
  ]}));
  await page.route('**/api/v1/projects/muster-projekt/offer-positions',route=>route.fulfill({json:[
    {name:'=Muster; "Holz"\nZweite Zeile',quantity:2,unit_cents:1205},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  await page.getByRole('button',{name:'Musterinstallation',exact:true}).click();
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  await page.getByRole('button',{name:'Angebotspositionen exportieren',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Angebotspositionen',exact:true});
  const event=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'CSV herunterladen',exact:true}).click();
  const csv=await event;
  expect(csv.suggestedFilename()).toBe('angebotspositionen-muster-p.csv');
  expect(await readFile((await csv.path())!,'utf8'))
    .toBe('\uFEFFPosition;Menge;Einzelpreis EUR\r\n"\'=Muster; ""Holz""\nZweite Zeile";2;12,05');
});
