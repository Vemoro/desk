import { test, expect } from '@playwright/test';
import { project, signIn } from './session';

for(const type of ['Personal','Inventar']) {
  test(`${type} prüft Beginn und Ende vor dem Schreiben`,async({page})=>{
    let writes=0;
    await page.route('**/api/v1/reservations',async route=>{
      if(route.request().method()!=='POST') return route.continue();
      writes++;
      return route.fulfill({response:await route.fetch()});
    });
    await signIn(page);
    await project(page,'Veranstaltungsbetreuung im Kulturhaus');
    await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
    const summary=page.getByText(type+' vormerken',{exact:true}).first();
    await summary.click();
    const form=page.locator('form').filter({has:page.getByRole('button',{name:type==='Personal'?'Person vormerken':'Inventar vormerken',exact:true})});
    if(type==='Personal'){
      await form.getByLabel('Person').selectOption({label:'Mira Muster'});
    }else{
      await form.getByLabel('Artikel').selectOption({label:'Kabelbinder, Packung'});
      await form.getByLabel('Lagerort').selectOption({label:'Hauptlager'});
    }
    const save=form.getByRole('button',{name:type==='Personal'?'Person vormerken':'Inventar vormerken',exact:true});
    await form.getByLabel('Von').fill('2029-05-18T09:00');
    for(const end of ['2029-05-18T08:45','2029-05-18T09:00']){
      await form.getByLabel('Bis').fill(end);
      await save.click();
      await expect(save).toBeEnabled();
      expect(writes).toBe(0);
      await expect(form.getByRole('alert')).toHaveText('Das Ende muss nach dem Beginn liegen.');
      await expect(form.getByLabel('Bis')).toHaveValue(end);
    }
    await form.getByLabel('Bis').fill('2029-05-18T10:00');
    await save.click();
    await expect(page.getByRole('status').getByText(type==='Personal'?'Person vorgemerkt.':'Inventar vorgemerkt.')).toBeVisible();
    expect(writes).toBe(1);
  });
}
