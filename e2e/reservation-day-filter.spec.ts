import { expect, test, type Page } from '@playwright/test';
import { signIn, project } from './session';

const base={project_id:'muster',quantity:1,status:'firm',location_id:'lager',checked_out:0};
type Reservation=typeof base & {id:string;starts_at:string;ends_at:string;item_id?:string;user_id?:string};
async function planning(page:Page,reservations:Reservation[]){
  const resources={
    projects:[{id:'muster',name:'Musterinstallation',stage:'planning'}],
    reservations,
    items:[
      {id:'before',name:'Vorher beendet',kind:'equipment'},
      {id:'after',name:'Später begonnen',kind:'equipment'},
      {id:'overlap',name:'Mehrtägiger Einsatz',kind:'equipment'},
      {id:'released',name:'Freigegebenes Gerät',kind:'equipment'},
    ],
    locations:[{id:'lager',name:'Musterlager'}],
  };
  for(const [resource,json] of Object.entries(resources)){
    await page.route('**/api/v1/'+resource+'?*',route=>route.fulfill({json}));
  }
  await page.route('**/api/v1/users',route=>route.fulfill({json:[{id:'mira',name:'Mira Muster'}]}));
  await signIn(page);
  await project(page,'Musterinstallation');
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  return page.locator('section').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
}

test('Tagesfilter kombiniert sich mit Ressourcentyp und Status und behandelt beide Mitternachtsgrenzen korrekt',async({page})=>{
  const panel=await planning(page,[
    {...base,id:'before',item_id:'before',starts_at:'2027-02-09T21:00:00Z',ends_at:'2027-02-09T23:00:00Z'},
    {...base,id:'after',item_id:'after',starts_at:'2027-02-10T23:00:00Z',ends_at:'2027-02-11T01:00:00Z'},
    {...base,id:'long',item_id:'overlap',starts_at:'2027-02-09T22:00:00Z',ends_at:'2027-02-11T02:00:00Z'},
    {...base,id:'user',user_id:'mira',starts_at:'2027-02-10T07:00:00Z',ends_at:'2027-02-10T08:00:00Z'},
    {...base,id:'released',item_id:'released',status:'released',starts_at:'2027-02-10T10:00:00Z',ends_at:'2027-02-10T11:00:00Z'},
  ]);
  const day=panel.getByLabel('Am Datum');
  const status=panel.getByLabel('Status filtern');
  const resource=panel.getByLabel('Ressourcentyp');
  await expect(panel.getByText('5 Reservierungen',{exact:true})).toBeVisible();
  await expect(day).toHaveValue('');
  const row=(name:string)=>panel.getByRole('row').filter({hasText:name});
  await day.fill('2027-02-09');
  await expect(row('Vorher beendet')).toBeVisible();
  await expect(row('Mehrtägiger Einsatz')).toBeVisible();
  await day.fill('2027-02-11');
  await expect(row('Später begonnen')).toBeVisible();
  await expect(row('Mehrtägiger Einsatz')).toBeVisible();
  const reset=panel.getByRole('button',{name:'Filter zurücksetzen'});
  await expect(reset).toBeEnabled();
  await reset.press('Enter');
  await expect(day).toHaveValue('');
  await expect(resource).toBeFocused();
  await day.fill('2027-02-10');
  await expect(panel.getByText('3 Reservierungen',{exact:true})).toBeVisible();
  await expect(row('Mehrtägiger Einsatz')).toBeVisible();
  await expect(row('Vorher beendet')).toHaveCount(0);
  await expect(row('Später begonnen')).toHaveCount(0);
  await status.selectOption('firm');
  await resource.selectOption('item');
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  await expect(row('Mehrtägiger Einsatz')).toBeVisible();
  await expect(row('Mira Muster')).toHaveCount(0);
  await expect(row('Freigegebenes Gerät')).toHaveCount(0);
  await day.fill('2027-02-13');
  await expect(panel.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
  await reset.press('Enter');
  await expect(day).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(resource).toHaveValue('');
  await expect(panel.getByText('5 Reservierungen',{exact:true})).toBeVisible();
  await expect(resource).toBeFocused();
  await day.press('1');
  const badInput=()=>day.evaluate(input=>(input as HTMLInputElement).validity.badInput);
  await expect.poll(badInput).toBe(true);
  await expect(day).toHaveValue('');
  await expect(reset).toBeEnabled();
  await reset.press('Enter');
  await expect.poll(badInput).toBe(false);
  await expect(reset).toBeDisabled();
  await expect(resource).toBeFocused();
});

test('Der Sommerzeittag endet an lokaler Mitternacht nach 23 Stunden',async({page})=>{
  const panel=await planning(page,[
    {...base,id:'match',item_id:'overlap',starts_at:'2027-03-28T21:45:00Z',ends_at:'2027-03-28T21:59:00Z'},
    {...base,id:'next',item_id:'after',starts_at:'2027-03-28T22:01:00Z',ends_at:'2027-03-28T22:20:00Z'},
  ]);
  const day=panel.getByLabel('Am Datum');
  await day.fill('2027-03-28');
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  await expect(panel.getByRole('row').filter({hasText:'Mehrtägiger Einsatz'})).toBeVisible();
  await expect(panel.getByRole('row').filter({hasText:'Später begonnen'})).toHaveCount(0);
  await day.fill('2027-03-29');
  await expect(panel.getByRole('row').filter({hasText:'Später begonnen'})).toBeVisible();
});

test.describe('Kalendertag mit vorgerückter Mitternacht',()=>{
  test.use({timezoneId:'America/Sao_Paulo'});

  test('Die nächste Mitternacht beginnt unabhängig von der verschobenen Startzeit',async({page})=>{
    const panel=await planning(page,[
      {...base,id:'match',item_id:'overlap',starts_at:'2018-11-05T01:45:00Z',ends_at:'2018-11-05T01:59:00Z'},
      {...base,id:'next',item_id:'after',starts_at:'2018-11-05T02:01:00Z',ends_at:'2018-11-05T02:20:00Z'},
    ]);
    await panel.getByLabel('Am Datum').fill('2018-11-04');
    await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
    await expect(panel.getByRole('row').filter({hasText:'Mehrtägiger Einsatz'})).toBeVisible();
    await expect(panel.getByRole('row').filter({hasText:'Später begonnen'})).toHaveCount(0);
  });
});

test.describe('Übersprungener lokaler Kalendertag',()=>{
  test.use({timezoneId:'Pacific/Apia'});

  test('Ein übersprungener Tag zeigt keine Reservierung',async({page})=>{
    const panel=await planning(page,[
      {...base,id:'crossing',item_id:'overlap',starts_at:'2011-12-30T09:00:00Z',ends_at:'2011-12-30T11:00:00Z'},
    ]);
    const day=panel.getByLabel('Am Datum');
    await day.fill('2011-12-30');
    await expect(panel.getByText('Keine Reservierungen für diese Filter.')).toBeVisible();
    await day.fill('2011-12-31');
    await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  });
});

test('Der Winterzeittag enthält beide Vorkommen der wiederholten Stunde',async({page})=>{
  const panel=await planning(page,[
    {...base,id:'first',item_id:'before',starts_at:'2027-10-31T00:30:00Z',ends_at:'2027-10-31T00:50:00Z'},
    {...base,id:'second',item_id:'overlap',starts_at:'2027-10-31T01:30:00Z',ends_at:'2027-10-31T01:50:00Z'},
    {...base,id:'late',item_id:'released',starts_at:'2027-10-31T22:30:00Z',ends_at:'2027-10-31T22:59:59Z'},
    {...base,id:'next',item_id:'after',starts_at:'2027-10-31T23:00:00Z',ends_at:'2027-10-31T23:30:00Z'},
  ]);
  await panel.getByLabel('Am Datum').fill('2027-10-31');
  await expect(panel.getByText('3 Reservierungen',{exact:true})).toBeVisible();
  for(const resource of ['Vorher beendet','Mehrtägiger Einsatz','Freigegebenes Gerät']){
    await expect(panel.getByRole('row').filter({hasText:resource})).toBeVisible();
  }
  await expect(panel.getByRole('row').filter({hasText:'Später begonnen'})).toHaveCount(0);
});

type ReservationExample={name:string;start:string;end:string;serializedEnd:string;submillisecond:number};

async function projectWithReservations(page:Page,examples:ReservationExample[]) {
  await signIn(page);
  const suffix=crypto.randomUUID().slice(0,8);
  const title='Muster Tageswechsel '+suffix;
  const headers={Origin:new URL(page.url()).origin};
  async function post(resource:string,data:object):Promise<{id:string}> {
    const result=await page.request.post('/api/v1/'+resource,{headers,data});
    expect(result.status(),await result.text()).toBe(201);
    return result.json();
  }
  const contact=await post('contacts',{name:'Muster Tageswechsel'});
  const created=await post('projects',{name:title,contact_id:contact.id});
  const location=await post('locations',{name:'Musterlager '+suffix});
  const expected=new Map<string,ReservationExample>();
  for(const example of examples){
    const item=await post('items',{name:example.name,kind:'equipment',code:'TAG-'+crypto.randomUUID().slice(0,8)});
    const reservation=await post('reservations',{
      project_id:created.id,item_id:item.id,location_id:location.id,quantity:1,starts_at:example.start,ends_at:example.end,
    });
    expected.set(reservation.id,example);
  }

  for(let offset=0;expected.size;offset+=200){
    const response=await page.request.get('/api/v1/reservations?limit=200&offset='+offset);
    expect(response.ok()).toBeTruthy();
    const rows=await response.json() as {id:string;starts_at:string;ends_at:string;ends_at_submillisecond?:number}[];
    for(const row of rows){
      const example=expected.get(row.id);
      if(!example) continue;
      expect(row).toMatchObject({
        starts_at:new Date(example.start).toISOString(),
        ends_at:example.serializedEnd,
        ends_at_submillisecond:example.submillisecond,
      });
      expected.delete(row.id);
    }
    if(rows.length<200) break;
  }
  expect(expected.size).toBe(0);

  await page.reload();
  await project(page,title);
  await page.getByRole('link',{name:'Ressourcen & Kalkulation',exact:true}).click();
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Ressourcenplanung',exact:true})});
  await expect(panel.getByText('2 Reservierungen',{exact:true})).toBeVisible();
  return panel;
}

test('Der Projektabruf unterscheidet Ende genau um Mitternacht und knapp danach',async({page})=>{
  const start='2027-02-09T22:59:00Z';
  const serializedEnd='2027-02-09T23:00:00.000Z';
  const panel=await projectWithReservations(page,[
    {name:'Endet genau um Mitternacht',start,end:serializedEnd,serializedEnd,submillisecond:0},
    {name:'Endet knapp nach Mitternacht',start,end:'2027-02-09T23:00:00.000500Z',serializedEnd,submillisecond:500},
  ]);
  await panel.getByLabel('Am Datum').fill('2027-02-10');
  await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
  await expect(panel.getByRole('row').filter({hasText:'Endet knapp nach Mitternacht'})).toBeVisible();
  await expect(panel.getByRole('row').filter({hasText:'Endet genau um Mitternacht'})).toHaveCount(0);
});

test.describe('Erster lokaler ISO-Kalendertag',()=>{
  test.use({timezoneId:'Etc/GMT-1'});

  test('Ein auf UTC-Jahr 0000 fallendes Terminende wird richtig verglichen',async({page})=>{
    const panel=await projectWithReservations(page,[
      {name:'Vor Tagesbeginn',start:'0001-01-01T00:00:00+02:00',end:'0001-01-01T00:00:00+01:00',
        serializedEnd:'0000-12-31T23:00:00.000Z',submillisecond:0},
      {name:'Im gewählten Tag',start:'0001-01-01T00:30:00+01:00',end:'0001-01-01T01:00:00+01:00',
        serializedEnd:'0001-01-01T00:00:00.000Z',submillisecond:0},
    ]);
    await panel.getByLabel('Am Datum').fill('0001-01-01');
    await expect(panel.getByText('1 Reservierung',{exact:true})).toBeVisible();
    await expect(panel.getByRole('row').filter({hasText:'Im gewählten Tag'})).toBeVisible();
    await expect(panel.getByRole('row').filter({hasText:'Vor Tagesbeginn'})).toHaveCount(0);
  });
});

test.describe('Letzter vierstelliger ISO-Kalendertag',()=>{
  test.use({timezoneId:'Etc/GMT+1'});

  test('Ein auf UTC-Jahr 10000 fallendes Terminende wird richtig verglichen',async({page})=>{
    const panel=await projectWithReservations(page,[
      {name:'Spätreservierung',start:'9999-12-31T23:00:00-01:00',end:'9999-12-31T23:59:00-01:00',
        serializedEnd:'+010000-01-01T00:59:00.000Z',submillisecond:0},
      {name:'Frühere Reservierung',start:'9999-12-31T22:00:00-01:00',end:'9999-12-31T22:59:00-01:00',
        serializedEnd:'9999-12-31T23:59:00.000Z',submillisecond:0},
    ]);
    await panel.getByLabel('Am Datum').fill('9999-12-31');
    await expect(panel.getByText('2 Reservierungen',{exact:true})).toBeVisible();
    await expect(panel.getByRole('row').filter({hasText:'Spätreservierung'})).toBeVisible();
    await expect(panel.getByRole('row').filter({hasText:'Frühere Reservierung'})).toBeVisible();
  });
});
