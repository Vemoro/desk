import { test, expect } from '@playwright/test';
import { signIn } from './session';

test.use({timezoneId:'America/Los_Angeles'});

for(const device of ['Desktop','Smartphone'] as const) {
  test(`${device}: Gleichnamige Kontakte zeigen ausschließlich ihre eigenen Projekte`,async({page})=>{
    if(device==='Smartphone') await page.setViewportSize({width:390,height:844});
    await page.route('**/api/v1/contacts?*',route=>route.fulfill({json:[
      {id:'a',name:'Mira Muster',email:'montage@example.test'},
      {id:'b',name:'Mira Muster',email:'lager@example.test'},
      {id:'c',name:'Nora Beispiel',email:'nora@example.test'},
      ...Array.from({length:28},(_,index)=>({id:`demo-${index}`,name:`Musterkontakt ${index}`,email:''})),
    ]}));
    await page.route('**/api/v1/projects?*',route=>route.fulfill({json:[
      {id:'montage',contact_id:'a',name:'Musterinstallation',stage:'confirmed',due:'2028-04-15T00:00:00.000Z'},
      {id:'service',contact_id:'a',name:'Vor-Ort-Service',stage:'inquiry',due:null},
      {id:'lager',contact_id:'b',name:'Musterlager',stage:'planning',due:'2028-04-23T00:00:00.000Z'},
    ]}));
    await signIn(page);
    if(device==='Smartphone') await page.getByRole('button',{name:'Menü',exact:true}).click();
    await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Kontakte',exact:true}).click();
    const listing=page.getByRole('region',{name:'Interessenten und Kontakte',exact:true});
    const projects=page.getByRole('region',{name:'Zugehörige Projekte',exact:true});
    await listing.getByRole('row').filter({hasText:'montage@example.test'}).getByRole('button',{name:'Mira Muster'}).click();
    await expect(projects.getByRole('row').nth(1).getByRole('cell')).toHaveText(['Musterinstallation','Bestätigt','15.04.2028']);
    await expect(projects.getByRole('row').nth(2).getByRole('cell')).toHaveText(['Vor-Ort-Service','Anfrage','–']);
    await expect(projects.getByRole('row')).toHaveCount(3);
    await expect(page.getByRole('region',{name:'Mira Muster',exact:true})).toBeFocused();

    await listing.getByRole('row').filter({hasText:'lager@example.test'}).getByRole('button',{name:'Mira Muster'}).click();
    await expect(projects.getByRole('row').nth(1).getByRole('cell')).toHaveText(['Musterlager','Planung','23.04.2028']);
    await expect(projects.getByRole('row')).toHaveCount(2);

    await listing.getByRole('button',{name:'Nora Beispiel'}).click();
    await expect(projects.getByText('Diesem Kontakt sind noch keine Projekte zugeordnet.')).toBeVisible();

    await listing.getByRole('row').filter({hasText:'montage@example.test'}).getByRole('button',{name:'Mira Muster'}).click();
    const projectLink=projects.getByRole('button',{name:'Musterinstallation',exact:true});
    await projectLink.focus();
    await projectLink.press('Enter');
    const projectTitle=page.getByRole('heading',{name:'Musterinstallation',exact:true});
    await expect(projectTitle).toBeFocused();
    await expect(projectTitle).toBeInViewport();
    await expect(page.getByText(/Termin 15\.04\.2028/)).toBeVisible();
    await expect(page).toHaveURL(/#projects\/montage$/);
  });
}
