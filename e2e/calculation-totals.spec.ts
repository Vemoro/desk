import { test, expect, type Page } from '@playwright/test';
import { signIn, project } from './session';

async function openCalculation(page:Page,name:string) {
  await project(page,name);
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  return page.getByRole('region',{name:'Kalkulation',exact:true});
}

test('Kalkulationssummen folgen bestätigten Änderungen im geöffneten Projekt',async({page})=>{
  await signIn(page);
  const origin=new URL(page.url()).origin;
  const projects=await page.request.get('/api/v1/projects');
  expect(projects.ok()).toBe(true);
  const [sample]=await projects.json() as {contact_id:string}[];
  const name='Musterkalkulation '+crypto.randomUUID().slice(0,8);
  const created=await page.request.post('/api/v1/projects',{
    headers:{Origin:origin},data:{name,contact_id:sample.contact_id},
  });
  expect(created.status(),await created.text()).toBe(201);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
  const panel=await openCalculation(page,name);
  const values=panel.getByRole('group',{name:'Kalkulationssummen'}).locator('strong');
  await expect(values).toHaveText(['0,00 €','0,00 €']);
  await expect(panel.getByText('Material und Transport',{exact:true})).toHaveCount(0);

  async function add(kind:string,label:string,quantity:string,price:string) {
    const form=panel.locator('form').filter({has:page.getByRole('button',{name:'Position speichern',exact:true})});
    if(!await form.isVisible()) await panel.getByText('Position anlegen',{exact:true}).click();
    await form.getByLabel('Art').selectOption(kind);
    await form.getByLabel('Position',{exact:true}).fill(label);
    await form.getByLabel('Menge').fill(quantity);
    await form.getByLabel('Einzelpreis netto in Euro').fill(price);
    await form.getByRole('button',{name:'Position speichern',exact:true}).click();
    await expect(panel.getByRole('row').filter({has:page.getByText(label,{exact:true})})).toBeVisible();
  }

  await add('buy','Material','3','2,01');
  await expect(values).toHaveText(['6,03 €','0,00 €']);
  await add('sell','Montage','2','10,20');
  await expect(values).toHaveText(['6,03 €','20,40 €']);

  const material=panel.getByRole('row').filter({has:page.getByText('Material',{exact:true})});
  await material.getByText('Position bearbeiten',{exact:true}).click();
  await material.getByLabel('Art').selectOption('sell');
  await material.getByLabel('Menge').fill('4');
  await material.getByRole('button',{name:'Position aktualisieren',exact:true}).click();
  await expect(values).toHaveText(['0,00 €','28,44 €']);
  await material.getByRole('button',{name:'Position entfernen',exact:true}).click();
  const confirmation=page.getByRole('dialog',{name:'Kalkulationsposition entfernen'});
  await expect(confirmation.getByRole('button',{name:'Abbrechen',exact:true})).toBeFocused();
  await confirmation.getByRole('button',{name:'Position entfernen',exact:true}).click();
  await expect(values).toHaveText(['0,00 €','20,40 €']);
  await expect(material).toHaveCount(0);
});

test('Kalkulationssummen sind über mehrere API-Seiten centgenau',async({page})=>{
  const id='rechnung';
  const position=(name:string,kind:'buy'|'sell',quantity:number,unit_cents:number,project_id=id)=>
    ({id:name,name,kind,quantity,unit_cents,project_id});
  const lines=[
    ...Array.from({length:91},(_,index)=>position('Einkauf '+index,'buy',1_000_000,100_000_000)),
    ...Array.from({length:71},(_,index)=>position('Verkauf '+index,'sell',1_000_000,100_000_000)),
    ...Array.from({length:40},(_,index)=>position('Fremdposition '+index,'buy',1_000_000,100_000_000,'anderes-projekt')),
    position('Einkauf Cent','buy',1,1),
    position('Verkauf Cent','sell',1,1),
  ];
  await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[{id,name:'Musterkalkulation',stage:'planning'}]}));
  await page.route('**/api/v1/lines?*',route=>{
    const search=new URL(route.request().url()).searchParams;
    const offset=Number(search.get('offset'));
    const limit=Number(search.get('limit'));
    return route.fulfill({json:lines.slice(offset,offset+limit)});
  });
  await signIn(page);
  const panel=await openCalculation(page,'Musterkalkulation');
  const sums=panel.getByRole('group',{name:'Kalkulationssummen'});
  await expect(sums.locator('strong')).toHaveText(['91.000.000.000.000,01 €','71.000.000.000.000,01 €']);
  await expect(panel.getByText('Fremdposition 0',{exact:true})).toHaveCount(0);
  await page.setViewportSize({width:375,height:812});
  await expect(sums).toBeVisible();
  expect(await sums.evaluate(group=>group.scrollWidth<=group.clientWidth)).toBe(true);
});
