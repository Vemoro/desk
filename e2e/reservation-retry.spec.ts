import { expect,test,type Route,type Page } from '@playwright/test';
import { project,signIn } from './session';

const planningForm=(page:Page,summary:string)=>page.locator('details').filter({
  has:page.locator('summary').filter({hasText:new RegExp('^'+summary+'$')}),
});

for(const [summary,caption,hour] of [['Personal vormerken','Person vormerken','11'],['Inventar vormerken','Inventar vormerken','13']]){
  test(`${summary}: Eine Vormerkung bleibt nach Antwortverlust und Zeitzonenwechsel einmalig`,async({page,browser})=>{
    await signIn(page);
    await project(page,'Büroinstallation Westflügel');
    const projectId=new URL(page.url()).hash.split('/').at(-1);
    await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
    const target=planningForm(page,summary);
    await target.locator('summary').click();
    const newInputHint='Die Zeitzone für neue Eingaben ist Europe/Berlin.';
    await expect(target.getByText(newInputHint,{exact:true})).toBeVisible();
    await expect(target.getByLabel('Von',{exact:true})).toHaveAccessibleDescription(newInputHint);
    await expect(target.getByLabel('Bis',{exact:true})).toHaveAccessibleDescription(newInputHint);
    if(summary==='Personal vormerken'){
      await target.getByRole('combobox',{name:'Person',exact:true}).selectOption({label:'Noah Beispiel'});
    }else{
      await target.getByRole('combobox',{name:'Artikel',exact:true}).selectOption({label:'Kabelbinder, Packung'});
      await target.getByRole('combobox',{name:'Lagerort',exact:true}).selectOption({label:'Hauptlager'});
    }
    await target.getByLabel('Von',{exact:true}).fill(`2028-05-25T${hour}:00`);
    await target.getByLabel('Bis',{exact:true}).fill(`2028-05-25T${hour}:30`);
    const iso=(element:HTMLElement)=>new Date((element as HTMLInputElement).value).toISOString();
    const startsAt=await target.getByLabel('Von',{exact:true}).evaluate(iso);
    const endsAt=await target.getByLabel('Bis',{exact:true}).evaluate(iso);
    async function saved(){
      const response=await page.request.get('/api/v1/reservations');
      expect(response.ok()).toBeTruthy();
      const rows=await response.json() as {id:string;project_id:string;starts_at:string}[];
      return rows.filter(row=>row.project_id===projectId&&row.starts_at===startsAt).map(row=>row.id);
    }
    const previous=new Set(await saved());
    const calls:{key:string|undefined;id:string;input:unknown}[]=[];
    async function intercept(route:Route){
      const response=await route.fetch();
      expect(response.status()).toBe(201);
      const result=await response.json() as {id:string};
      calls.push({key:route.request().headers()['idempotency-key'],id:result.id,input:route.request().postDataJSON()});
      if(calls.length===1) await route.abort('failed');
      else await route.fulfill({response});
    }
    await page.route('**/api/v1/reservations',intercept);
    const submit=target.getByRole('button',{name:caption,exact:true});
    await submit.click();
    await expect(page.getByText('Der letzte Vorgang kann bereits gespeichert sein.',{exact:false})).toBeVisible();
    expect(calls[0].key).toBeTruthy();
    expect((await saved()).filter(id=>!previous.has(id))).toEqual([calls[0].id]);
    const address=page.url();
    const storageState=await page.context().storageState();
    const pending=await page.evaluate(()=>Object.entries(sessionStorage));
    const reopened=await browser.newContext({baseURL:new URL(address).origin,timezoneId:'UTC',storageState});
    try {
      await reopened.addInitScript(entries=>{
        for(const [key,value] of entries) sessionStorage.setItem(key,value);
      },pending);
      const recovered=await reopened.newPage();
      await recovered.route('**/api/v1/reservations',intercept);
      await recovered.goto(address);
      await recovered.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
      const recoveredForm=planningForm(recovered,summary);
      await recoveredForm.locator('summary').click();
      await expect(recoveredForm.getByText('Die Zeitzone für neue Eingaben ist UTC.')).toBeVisible();
      await expect(recoveredForm.getByRole('status')).toContainText('Die Wiederholung verwendet die ursprünglich bestätigten Zeitpunkte.');
      await expect(recoveredForm.getByLabel('Von',{exact:true})).toHaveValue(`2028-05-25T${hour}:00`);
      expect(await recoveredForm.getByLabel('Von',{exact:true}).evaluate(iso)).not.toBe(startsAt);
      await recoveredForm.getByRole('button',{name:'Letzten Vorgang erneut senden'}).click();
      await expect(recovered.getByRole('status').getByText(summary==='Personal vormerken'?'Person vorgemerkt.':'Inventar vorgemerkt.')).toBeVisible();
      expect(calls[1]).toEqual(calls[0]);
      expect((await saved()).filter(id=>!previous.has(id))).toEqual([calls[0].id]);

      await recoveredForm.getByLabel('Von',{exact:true}).fill(startsAt.slice(0,16));
      await recoveredForm.getByLabel('Bis',{exact:true}).fill(endsAt.slice(0,16));
      await recoveredForm.getByRole('button',{name:caption,exact:true}).click();
      await expect.poll(()=>calls.length).toBe(3);
      expect(calls[2].key).toBeTruthy();
      expect(calls[2].key).not.toBe(calls[0].key);
      expect(calls[2].id).not.toBe(calls[0].id);
      expect(calls[2].input).toEqual(calls[0].input);
      expect((await saved()).filter(id=>!previous.has(id)).sort()).toEqual([calls[0].id,calls[2].id].sort());
    } finally { await reopened.close(); }
  });
}
