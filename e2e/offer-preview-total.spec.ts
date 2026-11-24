import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { project, signIn } from './session';

test('Angebotsvorschau berechnet die Netto-Summe aus den tatsächlich angezeigten CSV-Positionen',async({page})=>{
  const data={id:'muster',name:'Musterinstallation',stage:'planning'};
  const initial=[
    {name:'Montagekoffer',quantity:2,unit_cents:1025},
    {name:'Material',quantity:3,unit_cents:499},
  ];
  let positions=initial;
  let error=false;
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[data]}));
  await page.route('**/api/v1/projects/muster/offer-positions',route=>error
    ? route.fulfill({status:503,json:{error:'Abruf fehlgeschlagen.'}})
    : route.fulfill({json:positions}));
  await signIn(page);
  await project(page,data.name);
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  const open=page.getByRole('button',{name:'Angebotspositionen exportieren'});
  const dialog=page.getByRole('dialog',{name:'Angebotspositionen'});
  const download=dialog.getByRole('button',{name:'CSV herunterladen'});
  await open.click();
  await expect(dialog.getByText(/Netto-Summe\s+35,47\s*€/)).toBeVisible();
  const rows=dialog.getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1).getByRole('cell')).toHaveText(['Montagekoffer','2',/10,25\s*€/]);
  await expect(rows.nth(2).getByRole('cell')).toHaveText(['Material','3',/4,99\s*€/]);
  const downloaded=page.waitForEvent('download');
  await download.click();
  const csv=await readFile((await (await downloaded).path())!,'utf8');
  expect(csv.replace(/^\uFEFF/,'').split('\r\n')).toEqual([
    'Position;Menge;Einzelpreis EUR','"Montagekoffer";2;10,25','"Material";3;4,99',
  ]);
  positions=[{name:'Montagekoffer',quantity:1,unit_cents:1100}];
  await open.click();
  await expect(dialog.getByText(/Netto-Summe\s+11,00\s*€/)).toBeVisible();
  await expect(dialog.getByText('Material',{exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Schließen'}).click();

  positions=[];
  await open.click();
  await expect(dialog.getByText('Für dieses Projekt sind keine Verkaufspositionen vorhanden.')).toBeVisible();
  await expect(dialog.getByText(/Netto-Summe/)).toHaveCount(0);
  await expect(download).toHaveCount(0);
  await dialog.getByRole('button',{name:'Schließen'}).click();

  error=true;
  await open.click();
  await expect(dialog.getByRole('alert')).toHaveText('Die Angebotspositionen konnten nicht geladen werden.');
  await expect(dialog.getByText(/Netto-Summe/)).toHaveCount(0);
});
