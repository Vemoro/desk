import {expect,test} from '@playwright/test';
import {chooseObject,signIn} from './session';

for(const [theme,width] of [['light',1440],['dark',390]] as const) {
  test(`Projektzuordnung speichert nur die bestätigte Auswahl in ${theme}`,async({page})=>{
    await page.setViewportSize({width,height:812});
    await page.addInitScript(value=>localStorage.setItem('desk-theme',value),theme);
    const rights=[
      {id:'muster-a',name:'Musterauftrag A',stage:'planning'},
      {id:'muster-b',name:'Musterauftrag B',stage:'planning',cost_center:'M-120'},
      {id:'muster-c',name:'Musterauftrag B',stage:'planning',cost_center:'M-130'},
    ];
    const cost={id:'muster-kosten',reference:'M-202',name:'Auftragsmaterial',source:'manual',project_id:'muster-a' as string|null,cents:1800};
    const writes:(string|null)[]=[];
    await page.route('**/api/v1/projects?*',route=>route.fulfill({json:rights}));
    await page.route('**/api/v1/costs?*',route=>route.fulfill({json:[cost]}));
    await page.route('**/api/v1/costs/muster-kosten',route=>{
      expect(route.request().method()).toBe('PATCH');
      const {project_id}=route.request().postDataJSON();
      writes.push(project_id);
      if(writes.length===1) return route.fulfill({status:409,json:{error:'Musterkonflikt bei der Zuordnung.'}});
      cost.project_id=project_id;
      return route.fulfill({json:cost});
    });
    await signIn(page);
    const menu=page.getByRole('button',{name:'Menü',exact:true});
    if(await menu.isVisible()) await menu.click();
    await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Ist-Kosten',exact:true}).click();

    const choice=page.getByRole('combobox',{name:'Projekt für M-202',exact:true});
    const dialog=page.getByRole('dialog',{name:'Projekt für M-202 wählen',exact:true});
    const search=dialog.getByRole('searchbox');
    await expect(choice).toHaveValue('Musterauftrag A');
    await choice.press('ArrowDown');
    await search.fill('ohne Mustertreffer');
    await expect(dialog.getByText('Keine passenden Einträge.')).toBeVisible();
    await search.fill('Musterauftrag B');
    await expect(dialog.getByRole('button',{name:/Musterauftrag B/})).toHaveCount(2);
    await search.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(choice).toBeFocused();
    expect(writes).toEqual([]);

    async function chooseProject() {
      await choice.click();
      await search.fill('M-130');
      await search.press('Enter');
      await expect(dialog).toBeHidden();
    }

    await chooseProject();
    await expect(choice).toHaveAccessibleDescription('Musterkonflikt bei der Zuordnung.');
    await expect(choice).toHaveValue('Musterauftrag A');
    await chooseProject();
    await expect(choice).toHaveValue('Musterauftrag B · M-130');
    await chooseObject(page,choice,'Ohne Zuordnung');
    await expect(choice).toHaveValue('');
    expect(writes).toEqual(['muster-c','muster-c',null]);
  });
}

test('Interessent ist Pflicht und die Objektauswahl speichert das Formular noch nicht',async({page})=>{
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projekte',exact:true}).click();
  await page.getByRole('button',{name:'Neues Projekt',exact:true}).click();
  await page.getByLabel('Projektname',{exact:true}).fill('Musterauftrag für Auswahlprüfung');
  const choice=page.getByLabel('Interessent',{exact:true});
  const submit=page.getByRole('button',{name:'Projekt speichern',exact:true});
  let writes=0;
  await page.route('**/api/v1/projects',route=>{
    writes++;
    expect(route.request().postDataJSON().contact_id).toMatch(/^[0-9a-f-]{36}$/);
    return route.fulfill({status:409,json:{error:'Synthetischer Prüffall.'}});
  });
  await submit.click();
  await expect(choice).toBeFocused();
  await expect(choice).toHaveAccessibleDescription('Wähle einen Eintrag.');
  await chooseObject(page,choice,'Kulturhaus am Park');
  await expect(choice).not.toHaveAttribute('aria-invalid','true');
  expect(writes).toBe(0);
  await submit.click();
  await expect.poll(()=>writes).toBe(1);
});

test('Ein Wareneingang verwendet nach verlorener Antwort dieselbe Artikelwahl',async({page})=>{
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const open=page.getByRole('button',{name:'Wareneingang erfassen',exact:true});
  await open.click();
  const item=page.getByLabel('Artikel',{exact:true});
  await chooseObject(page,item,'Kabelbinder, Packung');
  await page.getByLabel('Lagerort',{exact:true}).selectOption({label:'Hauptlager'});
  const received:{id:string;item:string;key:string|undefined}[]=[];
  await page.route('**/api/v1/movements',async route=>{
    const response=await route.fetch();
    expect(response.status()).toBe(201);
    const body=await response.json();
    received.push({id:body.id,item:route.request().postDataJSON().item_id,key:route.request().headers()['idempotency-key']});
    if(received.length===1) await route.abort('failed');
    else await route.fulfill({response});
  });
  await page.getByRole('button',{name:'Wareneingang buchen',exact:true}).click();
  const retry=page.getByRole('button',{name:'Letzten Vorgang erneut senden',exact:true});
  await expect(retry).toBeVisible();
  await page.reload();
  await open.click();
  await expect(item).toHaveValue('Kabelbinder, Packung');
  await retry.click();
  await expect(retry).toHaveCount(0);
  expect(received).toHaveLength(2);
  expect(received[0].key).toBeTruthy();
  expect(received[0].item).toBeTruthy();
  expect(received[1]).toEqual(received[0]);
});
