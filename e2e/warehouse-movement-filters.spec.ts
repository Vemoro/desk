import { test, expect } from '@playwright/test';
import { signIn } from './session';

test('Lagerbewegungen nach Typ, Projekt und fehlendem Projektbezug filtern',async({page})=>{
  const item={item_id:'artikel',location_id:'ort',quantity:2,created_at:'2028-04-15T08:00:00Z'};
  const data={
    items:[{id:'artikel',name:'Montagekoffer'}],
    locations:[{id:'ort',name:'Werkstatt'}],
    projects:[{id:'p1',name:'Musterinstallation'},{id:'p2',name:'Musterveranstaltung'}],
    movements:[
      {...item,id:'m1',action:'return',project_id:'p1'},
      {...item,id:'m2',action:'return',project_id:'p2'},
      {...item,id:'m3',action:'receive',project_id:null},
    ],
  };
  for(const [resource,json] of Object.entries(data)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  const open=page.locator('section').filter({has:page.getByRole('heading',{name:'Offene Ausgaben',exact:true})});
  const type=panel.getByRole('combobox',{name:'Bewegungsart filtern'});
  const project=panel.getByRole('combobox',{name:'Projekt filtern'});
  const openProject=open.getByRole('combobox',{name:'Projekt filtern'});
  await expect(panel.getByText('3 Bewegungen',{exact:true})).toBeVisible();
  await openProject.selectOption({label:'Musterveranstaltung'});
  await type.selectOption({label:'Rückgabe'});
  await project.selectOption({label:'Musterinstallation'});
  await expect(panel.getByText('1 Bewegung',{exact:true})).toBeVisible();
  await expect(panel.getByRole('row').nth(1).getByRole('cell',{name:'Musterinstallation',exact:true})).toBeVisible();
  await expect(panel.getByRole('cell',{name:'Musterveranstaltung',exact:true})).toHaveCount(0);
  await project.selectOption({label:'Ohne Projektbezug'});
  await expect(panel.getByText('Keine Bewegungen für diese Filter.')).toBeVisible();
  await type.selectOption({label:'Wareneingang'});
  await expect(panel.getByRole('cell',{name:'Wareneingang',exact:true})).toBeVisible();
  await expect(panel.getByText('1 Bewegung',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Filter zurücksetzen',exact:true}).click();
  await expect(panel.getByRole('row')).toHaveCount(4);
  await expect(type).toHaveValue('');
  await expect(project).toHaveValue('');
  await expect(openProject).toHaveValue('p2');
});
