import type { saveCore } from '../src/server/core';

export const addMinutes=(start:number,minutes:number)=>new Date(start+minutes*60000).toISOString();
const getId=(value:unknown)=>(value as {id:string}).id;

export async function fixture(save:typeof saveCore, label:string) {
  const suffix=crypto.randomUUID().slice(0,8);
  const contact=getId(await save('contacts',{name:`Muster ${suffix}`}));
  const center=`K-${suffix}`;
  const project=getId(await save('projects',{name:label,contact_id:contact,cost_center:center}));
  const location=getId(await save('locations',{name:`Hauptlager ${suffix}`}));
  const material=getId(await save('items',{name:`Verbrauchsmaterial ${suffix}`,code:`V-${suffix}`,kind:'consumable'}));
  const equipment=getId(await save('items',{name:`Geräte ${suffix}`,code:`G-${suffix}`,kind:'equipment'}));
  const now=Date.now();
  const booking={project_id:project,location_id:location,starts_at:addMinutes(now,-30),ends_at:addMinutes(now,90)};
  return {contact,project,center,location,material,equipment,booking};
}
