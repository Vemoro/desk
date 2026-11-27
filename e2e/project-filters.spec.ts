import { expect, test } from '@playwright/test';
import { signIn } from './session';

test.use({timezoneId:'America/Los_Angeles'});

test('Projektfilter kombinieren sich und bleiben bei der Rückkehr erhalten',async({page})=>{
  const id='11111111-1111-4111-8111-111111111111';
  await page.clock.setFixedTime(new Date('2028-05-18T01:00:00Z'));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id,name:'Muster Montage',stage:'planning',due:'2028-05-17T00:00:00.000Z'},
    {id:'past',name:'Muster Wartung',stage:'inquiry',due:'2028-05-16'},
    {id:'closed',name:'Muster Abschluss',stage:'complete',due:'2028-05-17'},
    {id:'cancelled',name:'Muster Absage',stage:'cancelled',due:'2028-05-17'},
    {id:'missing',name:'Muster ohne Termin',stage:'planning',due:null},
    {id:'next',name:'Andere Montage',stage:'planning',due:'2028-05-17'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte'}).click();
  const search=page.getByRole('searchbox',{name:'Projekte suchen'});
  const stage=page.getByRole('combobox',{name:'Status'});
  const due=page.getByRole('combobox',{name:'Fälligkeit'});
  await expect(page.getByText('6 Projekte gefunden.')).toBeVisible();
  await search.fill('Muster');
  await stage.selectOption({label:'Offen'});
  await due.selectOption({label:'Heute'});
  const montage=page.getByRole('button',{name:'Muster Montage',exact:true});
  await expect(page.getByText('1 Projekt gefunden.')).toBeVisible();
  await expect(page.getByRole('row').filter({has:montage})).toContainText('17.05.2028');

  await montage.click();
  await expect(page.getByRole('heading',{name:'Muster Montage'})).toBeVisible();
  await page.getByRole('button',{name:'Projekte',exact:true}).last().click();
  await expect(search).toHaveValue('Muster');
  await expect(stage).toHaveValue('open');
  await expect(due).toHaveValue('today');
  await montage.click();
  await expect(page.getByRole('heading',{name:'Muster Montage'})).toBeVisible();
  await page.goBack();
  await expect(page.getByText('1 Projekt gefunden.')).toBeVisible();
  await expect(montage).toBeVisible();
  await expect(search).toHaveValue('Muster');
  await expect(stage).toHaveValue('open');
  await expect(due).toHaveValue('today');

  await due.selectOption({label:'Überfällig'});
  await expect(page.getByRole('button',{name:'Muster Wartung',exact:true})).toBeVisible();
  await due.selectOption({label:'Ohne Termin'});
  await expect(page.getByRole('button',{name:'Muster ohne Termin',exact:true})).toBeVisible();
  await search.fill('zzzz');
  await expect(page.getByText('Keine Projekte entsprechen den Filtern.')).toBeVisible();
  await page.getByRole('button',{name:'Filter zurücksetzen'}).click();
  await expect(page.getByText('6 Projekte gefunden.')).toBeVisible();
  await expect(search).toBeFocused();

  await search.fill('Muster');
  await stage.selectOption('open');
  await due.selectOption('overdue');
  await page.getByRole('button',{name:'Abmelden',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  await page.getByLabel('E-Mail').fill('mira@example.test');
  await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD!);
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await expect(page.getByText('6 Projekte gefunden.')).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(stage).toHaveValue('all');
  await expect(due).toHaveValue('all');
});


test('Die Fälligkeit wechselt beim lokalen Tageswechsel ohne weitere Eingabe',async({page})=>{
  await page.clock.install({time:new Date('2028-05-18T06:59:00Z')});
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'before',name:'Projekt am 17. Mai',stage:'planning',due:'2028-05-17'},
    {id:'after',name:'Projekt am 18. Mai',stage:'planning',due:'2028-05-18'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte'}).click();
  await page.getByRole('combobox',{name:'Fälligkeit'}).selectOption({label:'Heute'});
  await expect(page.getByRole('button',{name:'Projekt am 17. Mai'})).toBeVisible();
  await page.clock.fastForward(70_000);
  await expect(page.getByRole('button',{name:'Projekt am 18. Mai'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Projekt am 17. Mai'})).toHaveCount(0);
});
