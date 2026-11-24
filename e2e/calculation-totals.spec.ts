import { test, expect } from '@playwright/test';
import { signIn, project } from './session';

test('Kalkulation summiert Netto-Positionen des geöffneten Projekts',async({page})=>{
  const projects=[{id:'p1',name:'Musterinstallation',stage:'planning'},{id:'p2',name:'Leeres Projekt',stage:'planning'}];
  const lines=[
    {id:'buy',project_id:'p1',kind:'buy',name:'Kabel',quantity:3,unit_cents:200},
    {id:'sell',project_id:'p1',kind:'sell',name:'Montage',quantity:2,unit_cents:1000},
    {id:'foreign',project_id:'foreign',kind:'buy',name:'Anderes Projekt',quantity:10,unit_cents:1200},
  ];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:projects}));
  await page.route('**/api/v1/lines?*',route=>route.fulfill({json:lines}));
  await page.route('**/api/v1/lines',route=>{
    const data={id:'new',...route.request().postDataJSON()};
    lines.push(data);
    return route.fulfill({json:data});
  });
  await page.route('**/api/v1/lines/buy',route=>{
    if(route.request().method()==='PATCH'){
      Object.assign(lines[0],route.request().postDataJSON());
      return route.fulfill({json:lines[0]});
    }
    expect(route.request().method()).toBe('DELETE');
    const [removed]=lines.splice(0,1);
    return route.fulfill({json:removed});
  });
  await signIn(page);
  await project(page,'Musterinstallation');
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  const sums=page.getByRole('group',{name:'Kalkulationssummen',exact:true});
  const values=()=>sums.locator('strong');
  await expect(values()).toHaveText(['6,00 €','20,00 €']);

  await page.getByText('Position anlegen',{exact:true}).click();
  const add=page.locator('form').filter({has:page.getByRole('button',{name:'Position speichern',exact:true})});
  await add.getByLabel('Art').selectOption('sell');
  await add.getByLabel('Position',{exact:true}).fill('Einweisung');
  await add.getByLabel('Menge').fill('2');
  await add.getByLabel('Einzelpreis netto in Euro').fill('10');
  await add.getByRole('button',{name:'Position speichern',exact:true}).click();
  await expect(values()).toHaveText(['6,00 €','40,00 €']);

  const buy=page.getByRole('row').filter({hasText:'Kabel'});
  await buy.getByText('Position bearbeiten',{exact:true}).click();
  await buy.getByLabel('Menge').fill('4');
  await buy.getByRole('button',{name:'Position aktualisieren',exact:true}).click();
  await expect(values()).toHaveText(['8,00 €','40,00 €']);
  await buy.getByRole('button',{name:'Position entfernen',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Position entfernen',exact:true}).click();
  await expect(values()).toHaveText(['0,00 €','40,00 €']);

  await project(page,'Leeres Projekt');
  await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
  await expect(values()).toHaveText(['0,00 €','0,00 €']);
});
