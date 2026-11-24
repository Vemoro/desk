import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

const projectName='Montage im Musterbüro';
const resources={
  projects:[
    {id:'muster-a',name:projectName,stage:'running',notes:'Ausgabe für die Büroinstallation'},
    {id:'muster-b',name:projectName,stage:'planning',notes:'Ausgabe für die Veranstaltungsbetreuung'},
  ],
  items:[{id:'kit',name:'Montagekoffer',kind:'equipment'}],
  locations:[{id:'ost',name:'Musterlager Ost'},{id:'west',name:'Musterlager West'}],
  reservations:[
    {id:'first',project_id:'muster-a',item_id:'kit',location_id:'ost',status:'firm',checked_out:1},
    {id:'second',project_id:'muster-b',item_id:'kit',location_id:'west',status:'firm',checked_out:2},
    {id:'missing',project_id:'missing-project',item_id:'kit',location_id:'ost',status:'firm',checked_out:1},
  ],
};
async function openWarehouse(page:Page){
  for(const [resource,json] of Object.entries(resources)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  return page.locator('.panel').filter({has:page.getByRole('heading',{name:'Offene Ausgaben',exact:true})});
}

test('Offene Ausgaben öffnen das Projekt der gewählten Lagerzeile',async({page})=>{
  const panel=await openWarehouse(page);
  const projectFilter=panel.getByLabel('Projekt filtern');
  const locationFilter=panel.getByLabel('Lagerort filtern');
  const rows=panel.locator('tbody tr');
  const openProject=panel.getByRole('link',{name:projectName,exact:true});
  await expect(rows).toHaveCount(3);
  await expect(openProject).toHaveCount(2);
  const missing=rows.filter({hasText:'Projekt nicht verfügbar'});
  await expect(missing).toHaveCount(1);
  await expect(missing.getByRole('link')).toHaveCount(0);
  await expect(missing.getByRole('button')).toHaveCount(0);

  await projectFilter.selectOption('muster-b');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Musterlager West');
  await locationFilter.selectOption('ost');
  await expect(panel.getByText('Keine offenen Ausgaben für diese Filter.')).toBeVisible();
  await panel.getByRole('button',{name:'Filter zurücksetzen'}).click();
  await expect(rows).toHaveCount(3);
  await expect(projectFilter).toHaveValue('');
  await expect(locationFilter).toHaveValue('');

  await locationFilter.selectOption('ost');
  await expect(rows).toHaveCount(2);
  await expect(openProject).toHaveAttribute('href','#projects/muster-a');
  await openProject.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Projektnotiz')).toHaveValue(resources.projects[0].notes);
  await page.goBack();
  await expect(panel).toBeVisible();
  await locationFilter.selectOption('west');
  await expect(rows).toHaveCount(1);
  await openProject.click();
  await expect(page.getByLabel('Projektnotiz')).toHaveValue(resources.projects[1].notes);
});
