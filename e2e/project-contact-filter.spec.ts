import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

async function openTarget(page:Page){
  await page.clock.setFixedTime(new Date('2028-05-17T11:00:00Z'));
  await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
    {id:'first',name:'Kontor Muster',email:'eins@example.test'},
    {id:'second',name:'Kontor Muster',email:'zwei@example.test'},
    {id:'third',name:'Kulturhaus  am Park',phone:'030 555 0101'},
    {id:'fourth',name:'Kulturhaus am Park',phone:'030 555 0102'},
    {id:'fifth',name:'Muster Servicebüro'},
  ]}));
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
    {id:'target',name:'Montage Büro',stage:'planning',due:'2028-05-17',contact_id:'first'},
    {id:'later',name:'Montage später',stage:'planning',due:'2028-05-18',contact_id:'first'},
    {id:'closed',name:'Montage Bühne',stage:'complete',due:'2028-05-17',contact_id:'first'},
    {id:'check',name:'Abnahme Büro',stage:'planning',due:'2028-05-17',contact_id:'first'},
    {id:'other',name:'Montage Empfang',stage:'planning',due:'2028-05-17',contact_id:'second'},
    {id:'hall-a',name:'Tonprobe Bühne',stage:'planning',contact_id:'third'},
    {id:'hall-b',name:'Tontechnik Foyer',stage:'planning',contact_id:'fourth'},
    {id:'free',name:'Montage ohne Kontakt',stage:'planning',due:'2028-05-17'},
  ]}));
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  return page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Projekte',exact:true})});
}

test('Die Projektliste kombiniert exakte Kontaktwahl mit Suche, Status und Fälligkeit',async({page})=>{
  const panel=await openTarget(page);
  const contact=panel.getByRole('combobox',{name:'Kontakt',exact:true});
  const search=panel.getByRole('searchbox',{name:'Projekte suchen'});
  const status=panel.getByRole('combobox',{name:'Status',exact:true});
  const due=panel.getByRole('combobox',{name:'Fälligkeit',exact:true});
  const rows=panel.locator('tbody tr');
  const reset=panel.getByRole('button',{name:'Filter zurücksetzen'});
  await expect(contact.locator('option')).toHaveText(['Alle Kontakte','Kontor Muster · eins@example.test','Kontor Muster · zwei@example.test','Kulturhaus am Park · 030 555 0101','Kulturhaus am Park · 030 555 0102','Muster Servicebüro']);
  await expect(rows).toHaveCount(8);
  await expect(reset).toBeDisabled();
  await contact.selectOption('second');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Montage Empfang');
  await reset.click();
  await expect(contact).toHaveValue('');
  await expect(rows).toHaveCount(8);
  await expect(rows.filter({hasText:'Montage ohne Kontakt'})).toHaveCount(1);

  await contact.selectOption({label:'Kulturhaus am Park · 030 555 0101'});
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Tonprobe Bühne');
  await contact.selectOption({label:'Kulturhaus am Park · 030 555 0102'});
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Tontechnik Foyer');

  await contact.selectOption('first');
  await expect(rows).toHaveCount(4);
  await search.fill('Montage');
  await expect(rows).toHaveCount(3);
  await status.selectOption('open');
  await expect(rows).toHaveCount(2);
  await due.selectOption('today');
  await expect(rows).toHaveCount(1);
  await rows.first().getByRole('button',{name:'Montage Büro',exact:true}).click();
  await expect(page).toHaveURL(/#projects\/target$/);
  await page.locator('.breadcrumb').getByRole('button',{name:'Projekte',exact:true}).click();
  await expect(contact).toHaveValue('first');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Montage Büro');
  await rows.first().getByRole('button',{name:'Montage Büro',exact:true}).click();
  await expect(page).toHaveURL(/#projects\/target$/);
  await page.goBack();
  await expect(contact).toHaveValue('first');
  await expect(rows).toHaveCount(1);

  await search.fill('Kontor ohne Treffer');
  await expect(panel.getByText('Keine Projekte entsprechen den Filtern.')).toBeVisible();
  await page.reload();
  await expect(contact).toHaveValue('');
  await expect(rows).toHaveCount(8);

  await due.focus();
  await page.keyboard.press('Tab');
  await expect(contact).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(contact).toHaveValue('first');
  await page.keyboard.press('Tab');
  await expect(reset).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(contact).toHaveValue('');
  await expect(search).toBeFocused();

  await contact.selectOption('second');
  await page.getByRole('button',{name:'Abmelden',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  await page.getByLabel('E-Mail').fill('mira@example.test');
  await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD!);
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await expect(contact).toHaveValue('');
  await expect(rows).toHaveCount(8);
});
