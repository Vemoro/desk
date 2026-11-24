import { expect, test, type Page } from '@playwright/test';
import { signIn } from './session';

async function openTarget(page:Page){
  const checkout={project_id:'office',location_id:'ost',status:'firm',checked_out:1};
  const moves={action:'issue',created_at:'2028-05-17T09:00:00Z',actor_id:'mira',quantity:1};
  const fixtures={
    projects:[
      {id:'office',name:'Musterinstallation',stage:'running'},
      {id:'events',name:'Musterbetreuung',stage:'running'},
    ],
    items:[
      {id:'kit-a',name:'Montagekoffer',code:'MK-01',kind:'equipment'},
      {id:'kit-b',name:'Montagekoffer',code:'MK-02',kind:'equipment'},
      {id:'other',name:'Messgerät',kind:'equipment'},
    ],
    locations:[{id:'ost',name:'Musterlager Ost'},{id:'west',name:'Musterlager West'}],
    reservations:[
      {...checkout,id:'r1',item_id:'kit-a'},
      {...checkout,id:'r2',item_id:'kit-b',project_id:'events',location_id:'west'},
      {...checkout,id:'r3',item_id:'kit-a',project_id:'events',location_id:'west'},
      {...checkout,id:'r4',item_id:'historical',checked_out:3},
      {...checkout,id:'r5',item_id:null,checked_out:7},
    ],
    movements:[
      {...moves,id:'m1',item_id:'kit-a',project_id:'office',location_id:'ost',delivery_reference:'LS-01'},
      {...moves,id:'m2',item_id:'kit-b',project_id:'events',location_id:'west',delivery_reference:'LS-02'},
    ],
  };
  for(const [resource,json] of Object.entries(fixtures)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await signIn(page);
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Projektlager',exact:true}).click();
  return page.locator('.panel').filter({has:page.getByRole('heading',{name:'Offene Ausgaben',exact:true})});
}

test('Offene Ausgaben lassen sich exakt nach Artikel, Projekt und Lagerort eingrenzen',async({page})=>{
  const target=await openTarget(page);
  const articles=target.getByLabel('Artikel filtern');
  const project=target.getByLabel('Projekt filtern');
  const location=target.getByLabel('Lagerort filtern');
  const rows=target.locator('tbody tr');
  const movements=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Lagerbewegungen',exact:true})});
  const reset=target.getByRole('button',{name:'Filter zurücksetzen'});
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({hasText:'3'}).getByRole('cell').nth(1)).toHaveText('–');
  await expect(rows.getByRole('cell',{name:'7',exact:true})).toHaveCount(0);
  await expect(articles.locator('option')).toHaveText(['Alle Artikel','Montagekoffer · MK-01','Montagekoffer · MK-02','Messgerät']);
  await articles.selectOption('kit-a');
  await expect(rows).toHaveCount(2);
  await articles.selectOption('kit-b');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Musterbetreuung');
  await project.selectOption('office');
  await expect(target.getByText('Keine offenen Ausgaben für diese Filter.')).toBeVisible();
  await project.selectOption('events');
  await location.selectOption('ost');
  await expect(target.getByText('Keine offenen Ausgaben für diese Filter.')).toBeVisible();
  await location.selectOption('west');
  await expect(rows).toHaveCount(1);
  await reset.click();
  await expect(articles).toHaveValue('');
  await expect(project).toHaveValue('');
  await expect(location).toHaveValue('');
  await expect(rows).toHaveCount(4);
  await expect(reset).toBeDisabled();

  await articles.selectOption('kit-b');
  await expect(movements.locator('tbody tr')).toHaveCount(2);
  await expect(movements.getByText('LS-01',{exact:true})).toBeVisible();
  const link=target.getByRole('link',{name:'Musterbetreuung',exact:true});
  await link.click();
  await expect(page).toHaveURL(/#projects\/events$/);
  await expect(page.getByRole('heading',{name:'Musterbetreuung',exact:true})).toBeVisible();
});
