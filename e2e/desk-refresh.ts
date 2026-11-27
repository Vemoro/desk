import { type Page, type Route } from '@playwright/test';

export async function triggerDeskRead(page:Page) {
  const pattern='**/api/v1/planning/reservations?*';
  const planningFixture=(route:Route)=>{
    const start=Date.parse(new URL(route.request().url()).searchParams.get('from')!)+3_600_000;
    return route.fulfill({json:[{
      id:'wochenplan-reservierung',project_id:'projekt-nur-im-wochenplan',project_name:'Musterprojekt aus Wochenplanung',
      resource_kind:'person',resource_id:'muster-person',resource_name:'Musterpersonal',
      starts_at:new Date(start).toISOString(),ends_at:new Date(start+3_600_000).toISOString(),status:'tentative',
    }]});
  };
  await page.route(pattern,planningFixture);
  try{
    await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Wochenplanung',exact:true}).click();
    await page.getByRole('button',{name:'Musterprojekt aus Wochenplanung',exact:true}).click();
  }finally{
    await page.unroute(pattern,planningFixture);
  }
}
