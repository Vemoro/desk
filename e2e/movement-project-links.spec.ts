import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Bewegung öffnet das richtige Projekt und Browser-Zurück erhält die Filter der Anmeldung',async({page})=>{
  const movement={item_id:'kit',location_id:'lager',quantity:1,created_at:'2028-05-17T22:15:00Z'};
  const projects=[
    {id:'muster-a',name:'Montage im Musterbüro',stage:'running'},
    {id:'muster-b',name:'Montage im Musterbüro',stage:'planning'},
  ];
  const resources={
    projects,
    items:[{id:'kit',name:'Montagekoffer',code:'WK-200',kind:'equipment'}],
    locations:[{id:'lager',name:'Musterlager'}],
    reservations:[{id:'r1',project_id:'muster-a',item_id:'kit',location_id:'lager',quantity:1,status:'firm',checked_out:1}],
    movements:[
      {...movement,id:'target',action:'issue',project_id:'muster-b',delivery_reference:'LS-2028-018'},
      {...movement,id:'other',action:'issue',project_id:'muster-a',delivery_reference:'LS-2028-017'},
      {...movement,id:'missing',action:'receive',project_id:'hidden',delivery_reference:'LS-ohne-sichtbares-projekt'},
      {...movement,id:'unassigned',action:'receive',project_id:null,delivery_reference:'LS-ohne-projekt'},
    ],
  };
  for(const [resource,json] of Object.entries(resources)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await signIn(page);
  const warehouse=page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true});
  await warehouse.click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  const checkouts=page.locator('section').filter({has:page.getByRole('heading',{name:'Offene Ausgaben',exact:true})});
  const checkoutLocation=checkouts.getByLabel('Lagerort filtern');
  await checkoutLocation.selectOption('lager');
  const search=panel.getByRole('searchbox',{name:'Lagerbewegungen suchen'});
  const location=panel.getByLabel('Lagerort filtern');
  const action=panel.getByLabel('Bewegungsart filtern');
  const project=panel.getByLabel('Projekt filtern');
  const from=panel.getByLabel('Vom Datum');
  const to=panel.getByLabel('Bis Datum');
  await search.fill('LS-2028');
  await location.selectOption('lager');
  await action.selectOption('issue');
  await project.selectOption('muster-b');
  await from.fill('2028-05-18');
  await to.fill('2028-05-18');
  const openProject=panel.getByRole('link',{name:'Montage im Musterbüro',exact:true});
  await expect(panel.getByText('LS-2028-018',{exact:true})).toBeVisible();
  await expect(openProject).toHaveAttribute('href','#projects/muster-b');
  await openProject.click();
  await expect(page.getByRole('heading',{name:'Montage im Musterbüro',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/#projects\/muster-b$/);
  await page.goBack();
  await expect(page.getByRole('heading',{name:'Projektlager',exact:true})).toBeVisible();
  await expect(search).toHaveValue('LS-2028');
  await expect(location).toHaveValue('lager');
  await expect(action).toHaveValue('issue');
  await expect(project).toHaveValue('muster-b');
  await expect(from).toHaveValue('2028-05-18');
  await expect(to).toHaveValue('2028-05-18');
  await expect(checkoutLocation).toHaveValue('');
  await expect(panel.getByText('1 Bewegung',{exact:true})).toBeVisible();
  await expect(panel.getByText('LS-2028-018',{exact:true})).toBeVisible();
  await expect(panel.getByText('LS-2028-017',{exact:true})).toHaveCount(0);

  await panel.getByRole('button',{name:'Filter zurücksetzen'}).click();
  await expect(panel.getByText('4 Bewegungen',{exact:true})).toBeVisible();
  await expect(openProject).toHaveCount(2);
  for(const reference of ['LS-ohne-sichtbares-projekt','LS-ohne-projekt']){
    const projectCell=panel.getByRole('row').filter({has:page.getByText(reference,{exact:true})}).locator('td[data-label="Projekt"]');
    await expect(projectCell).toHaveText('–');
    await expect(projectCell.getByRole('link')).toHaveCount(0);
  }
  await expect(search).toHaveValue('');
  await expect(location).toHaveValue('');
  await expect(action).toHaveValue('');
  await expect(project).toHaveValue('');
  await expect(from).toHaveValue('');
  await expect(to).toHaveValue('');

  await search.fill('LS-2028');
  await location.selectOption('lager');
  await action.selectOption('issue');
  await project.selectOption('muster-a');
  await from.fill('2028-05-18');
  await to.fill('2028-05-18');
  await page.getByRole('button',{name:'Abmelden',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  await page.getByLabel('E-Mail').fill('mira@example.test');
  await page.getByLabel('Passwort').fill(process.env.DESK_DEMO_PASSWORD!);
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await expect(panel.getByText('4 Bewegungen',{exact:true})).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(location).toHaveValue('');
  await expect(action).toHaveValue('');
  await expect(project).toHaveValue('');
  await expect(from).toHaveValue('');
  await expect(to).toHaveValue('');
});
