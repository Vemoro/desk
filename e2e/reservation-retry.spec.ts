import { expect,test } from '@playwright/test';
import { project,signIn } from './session';

for(const [summary,caption,hour] of [['Personal vormerken','Person vormerken','11'],['Inventar vormerken','Inventar vormerken','13']]){
  test(`${summary}: Eine Vormerkung bleibt nach gespeicherter Anfrage und verlorener Antwort einmalig`,async({page})=>{
    await signIn(page);
    await project(page,'Büroinstallation Westflügel');
    const projectId=new URL(page.url()).hash.split('/').at(-1);
    await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
    const target=page.locator('details').filter({has:page.locator('summary').filter({hasText:new RegExp('^'+summary+'$')})});
    await target.locator('summary').click();
    if(summary==='Personal vormerken'){
      await target.getByRole('combobox',{name:'Person',exact:true}).selectOption({label:'Noah Beispiel'});
    }else{
      await target.getByRole('combobox',{name:'Artikel',exact:true}).selectOption({label:'Kabelbinder, Packung'});
      await target.getByRole('combobox',{name:'Lagerort',exact:true}).selectOption({label:'Hauptlager'});
    }
    await target.getByLabel('Von',{exact:true}).fill(`2028-05-25T${hour}:00`);
    await target.getByLabel('Bis',{exact:true}).fill(`2028-05-25T${hour}:30`);
    const startsAt=await target.getByLabel('Von',{exact:true}).evaluate(element=>new Date((element as HTMLInputElement).value).toISOString());
    async function saved(){
      const response=await page.request.get('/api/v1/reservations');
      expect(response.ok()).toBeTruthy();
      const rows=await response.json() as {id:string;project_id:string;starts_at:string}[];
      return rows.filter(row=>row.project_id===projectId&&row.starts_at===startsAt).map(row=>row.id);
    }
    const previous=new Set(await saved());
    const calls:{key:string|undefined;id:string}[]=[];
    await page.route('**/api/v1/reservations',async route=>{
      const response=await route.fetch();
      expect(response.status()).toBe(201);
      const result=await response.json() as {id:string};
      calls.push({key:route.request().headers()['idempotency-key'],id:result.id});
      if(calls.length===1) await route.abort('failed');
      else await route.fulfill({response});
    });
    const submit=target.getByRole('button',{name:caption,exact:true});
    await submit.click();
    await expect(page.getByText('Der letzte Vorgang kann bereits gespeichert sein.',{exact:false})).toBeVisible();
    expect(calls[0].key).toBeTruthy();
    expect((await saved()).filter(id=>!previous.has(id))).toEqual([calls[0].id]);
    await page.reload();
    await page.getByRole('button',{name:'Ressourcen & Kalkulation',exact:true}).click();
    await target.locator('summary').click();
    await target.getByRole('button',{name:'Letzten Vorgang erneut senden'}).click();
    await expect(page.getByRole('status').getByText(summary==='Personal vormerken'?'Person vorgemerkt.':'Inventar vorgemerkt.')).toBeVisible();
    expect(calls[1]).toEqual(calls[0]);
    expect((await saved()).filter(id=>!previous.has(id))).toEqual([calls[0].id]);
    await submit.click();
    await expect.poll(()=>calls.length).toBe(3);
    expect(calls[2].key).toBeTruthy();
    expect(calls[2].key).not.toBe(calls[0].key);
    expect(calls[2].id).not.toBe(calls[0].id);
    expect((await saved()).filter(id=>!previous.has(id)).sort()).toEqual([calls[0].id,calls[2].id].sort());
  });
}
