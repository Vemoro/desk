import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('Wochenplanung zeigt überlappende Tage, Status, Lagerort und verlinkte Projekte',async({page})=>{
  await signIn(page);
  const headers={Origin:new URL(page.url()).origin};
  const rows=async(path:string)=>(await page.request.get('/api/v1/'+path)).json();
  const [projects,users,items,locations]=await Promise.all(['projects','users','items','locations'].map(rows));
  const venue=projects.find((row:{name:string})=>row.name==='Veranstaltungsbetreuung im Kulturhaus');
  const office=projects.find((row:{name:string})=>row.name==='Büroinstallation Westflügel');
  const person=users.find((row:{name:string})=>row.name==='Noah Beispiel');
  const material=items.find((row:{code:string})=>row.code==='MAT-11');
  const warehouse=locations.find((row:{name:string})=>row.name==='Hauptlager');
  const workshop=locations.find((row:{name:string})=>row.name==='Werkstatt');
  async function book(data:object) {
    const created=await page.request.post('/api/v1/reservations',{headers,data});
    expect(created.status(),await created.text()).toBe(201);
    return (await created.json()).id as string;
  }
  async function status(id:string,status:string) {
    expect((await page.request.patch(`/api/v1/reservations/${id}`,{headers,data:{status}})).status()).toBe(200);
  }
  const sunday={starts_at:'2028-03-26T22:30:00+02:00',ends_at:'2028-03-27T01:30:00+02:00'};
  await status(await book({...sunday,project_id:venue.id,user_id:person.id,quantity:1}),'firm');
  const overnight={starts_at:'2028-03-24T23:00:00+01:00',ends_at:'2028-03-25T02:00:00+01:00'};
  const stock={project_id:office.id,item_id:material.id,quantity:2};
  await book({...stock,...overnight,location_id:warehouse.id});
  await book({...stock,...overnight,location_id:workshop.id});
  await status(await book({...stock,...sunday,location_id:warehouse.id}),'released');
  await book({...stock,location_id:warehouse.id,starts_at:'2028-03-27T00:00:00+02:00',ends_at:'2028-03-27T02:00:00+02:00'});
  await book({...stock,location_id:warehouse.id,starts_at:'2028-03-26T19:00:00+02:00',ends_at:'2028-03-27T00:00:00+02:00'});
  await book({...stock,quantity:7,location_id:warehouse.id,starts_at:'2028-03-26T23:00:00+02:00',ends_at:'2028-03-27T00:00:00.000500+02:00'});

  const planning=page.getByRole('button',{name:'Wochenplanung',exact:true});
  await expect(planning).toBeVisible();
  await planning.click();
  const select=page.getByLabel('Datum der Woche');
  const interval=page.waitForRequest(request=>{
    const url=new URL(request.url());
    return url.pathname.endsWith('/planning/reservations') && url.searchParams.get('from')==='2028-03-19T23:00:00.000Z';
  });
  await select.fill('2028-03-26');
  expect(new URL((await interval).url()).searchParams.get('to')).toBe('2028-03-26T22:00:00.000Z');
  await expect(select).toHaveValue('2028-03-20');
  await expect(page.getByText('Fest reserviert',{exact:true})).toBeVisible();
  await expect(page.getByText('22:30–24:00',{exact:true})).toBeVisible();
  await expect(page.getByText('23:00–24:00',{exact:true})).toHaveCount(3);
  await expect(page.getByText('00:00–02:00',{exact:true})).toHaveCount(2);
  await expect(page.getByText('Vorgemerkt · Menge 2',{exact:true})).toHaveCount(5);
  await expect(page.getByText('Hauptlager',{exact:true})).toBeVisible();
  await expect(page.getByText('Werkstatt',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Nächste Woche'}).click();
  await expect(select).toHaveValue('2028-03-27');
  await expect(page.getByText('00:00–01:30',{exact:true})).toBeVisible();
  await expect(page.getByText('00:00–02:00',{exact:true})).toHaveCount(1);
  await expect(page.getByText('Vorgemerkt · Menge 2',{exact:true})).toHaveCount(1);
  await expect(page.getByText('Vorgemerkt · Menge 7',{exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button',{name:venue.name,exact:true}).click();
  await expect(page.getByRole('heading',{name:venue.name,exact:true})).toBeVisible();
  await page.goBack();
  await expect(select).toHaveValue('2028-03-27');
});

test('Wochenplanung unterscheidet die wiederholte Stunde bei der Herbstumstellung',async({page})=>{
  await signIn(page);
  const person=await (await page.request.get('/api/v1/me')).json();
  const projects=await (await page.request.get('/api/v1/projects')).json();
  const venue=projects.find((row:{name:string})=>row.name==='Veranstaltungsbetreuung im Kulturhaus');
  const origin=new URL(page.url()).origin;
  const booking=await page.request.post('/api/v1/reservations',{headers:{Origin:origin},data:{
    project_id:venue.id,user_id:person.id,quantity:1,
    starts_at:'2028-10-29T02:30:00+02:00',ends_at:'2028-10-29T02:30:00+01:00',
  }});
  expect(booking.status(),await booking.text()).toBe(201);
  await page.getByRole('button',{name:'Wochenplanung',exact:true}).click();
  await page.getByLabel('Datum der Woche').fill('2028-10-29');
  await expect(page.getByText(/02:30\s*GMT\+2.*02:30\s*GMT\+1/)).toBeVisible();
});

test('Wochenplanung führt bei abgelaufener Sitzung zur Anmeldung',async({page})=>{
  await signIn(page);
  await page.route('**/api/v1/planning/reservations?**',route=>route.fulfill({
    status:401,json:{error:'Anmeldung erforderlich.'},
  }));
  await page.getByRole('button',{name:'Wochenplanung',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Anmelden',exact:true})).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Bitte erneut anmelden, um die Wochenplanung zu öffnen.');
});
