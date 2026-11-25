import { useEffect, useState } from 'react';
import type { PlanningBooking } from '../server/contracts';
import { all, date, reservationStages } from './client';
import { Panel } from './widgets';

const weekday=new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'numeric',month:'numeric'});
const clock=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const names=new Intl.Collator('de-DE');

function localDate(value:Date) {
  return [String(value.getFullYear()).padStart(4,'0'),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
}

function localDay(value:Date, delta:number) {
  const day=new Date(value);
  day.setDate(day.getDate()+delta);
  day.setHours(0,0,0,0);
  return day;
}

function startOfWeek(value:Date) {
  return localDay(value,-((value.getDay()+6)%7));
}

type Day = {key:string; starts:Date; ends:Date};
type Slot = {booking:PlanningBooking; period:string};
type Resource = {label:string; person:boolean; location:string | null; days:Map<string, Slot[]>};

function assignDays(bookings:PlanningBooking[], days:Day[]) {
  const resources=new Map<string,Resource>();
  for(const booking of bookings) {
    const key=`${booking.resource_kind}:${booking.resource_id}:${booking.location_id ?? ''}`;
    let resource=resources.get(key);
    if(!resource) {
      resource={
        label:booking.inventory_number ? `${booking.resource_name} (${booking.inventory_number})` : booking.resource_name,
        person:booking.resource_kind==='person',location:booking.location_name,days:new Map(),
      };
      resources.set(key,resource);
    }
    const start=Date.parse(booking.starts_at);
    const end=Date.parse(booking.ends_at);
    for(const day of days) {
      const startOfDay=day.starts.getTime();
      const endOfDay=day.ends.getTime();
      if(start>=endOfDay || end<=startOfDay) continue;
      const from=clock.format(Math.max(start,startOfDay));
      const to=end>=endOfDay?'24:00':clock.format(end);
      const slots=resource.days.get(day.key) ?? [];
      slots.push({booking,period:`${from}–${to}`});
      resource.days.set(day.key,slots);
    }
  }
  return [...resources].sort(([,a],[,b])=>Number(b.person)-Number(a.person)
    || names.compare(a.label,b.label) || names.compare(a.location ?? '',b.location ?? ''));
}

export function WeeklyPlanning({selectedWeek,onWeek,openProject}:{
  selectedWeek:string | undefined; onWeek:(week:string)=>void; openProject:(id:string)=>void;
}) {
  const [attempt,setAttempt]=useState(0);
  const [result,setResult]=useState<{from:string; bookings:PlanningBooking[]; error:string}>();
  const today=selectedWeek?new Date(`${selectedWeek}T12:00:00`):new Date();
  const monday=startOfWeek(today);
  const days=Array.from({length:7},(_,index)=>{
    const starts=localDay(monday,index);
    return {key:localDate(starts),starts,ends:localDay(monday,index+1)};
  });
  const from=monday.toISOString();
  const to=days[6].ends.toISOString();
  const current=result?.from===from ? result : undefined;

  useEffect(()=>{
    let active=true;
    const params=new URLSearchParams({from,to});
    void all<PlanningBooking>(`planning/reservations?${params}`).then(
      bookings=>{if(active) setResult({from,bookings,error:''});},
      error=>{if(active) setResult({from,bookings:[],error:error instanceof Error?error.message:'Die Wochenplanung konnte nicht geladen werden.'});},
    );
    return ()=>{active=false;};
  },[from,to,attempt]);

  function choose(value:Date) {
    if(!Number.isFinite(value.getTime())) return;
    const selected=localDate(startOfWeek(value));
    if(selected===days[0].key) return;
    setResult(undefined);
    onWeek(selected);
  }

  const resources=current ? assignDays(current.bookings,days) : [];
  return <>
    <Panel title={`${date(from)} bis ${date(days[6].starts.toISOString())}`}
      action={<span className="subtle">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>}>
      <div className="panel-body">
        <div className="week-controls">
          <div className="actions">
            <button type="button" onClick={()=>choose(localDay(monday,-7))}>Vorige Woche</button>
            <button type="button" onClick={()=>choose(new Date())}>Diese Woche</button>
            <button type="button" onClick={()=>choose(localDay(monday,7))}>Nächste Woche</button>
          </div>
          <label><span>Datum der Woche</span><input type="date" value={days[0].key} onChange={event=>choose(new Date(`${event.target.value}T12:00:00`))}/></label>
        </div>
        {!current && <p className="subtle" role="status">Reservierungen werden geladen …</p>}
        {current?.error && <div className="actions">
          <p className="inline-error" role="alert">{current.error}</p>
          <button type="button" onClick={()=>{setResult(undefined);setAttempt(value=>value+1);}}>Erneut laden</button>
        </div>}
        {current && !current.error && !resources.length && <p className="subtle">Keine Reservierungen in dieser Woche.</p>}
      </div>
    </Panel>
    {resources.map(([key,resource])=><Panel key={key} title={resource.label}
      action={resource.location && <span className="subtle">{resource.location}</span>}>
      <div className="week-grid">{days.map(day=>{
        const slots=resource.days.get(day.key) ?? [];
        return <section aria-label={weekday.format(day.starts)} key={day.key} className={`week-day ${slots.length?'':'week-day-empty'}`}>
          <h3><time dateTime={day.key}>{weekday.format(day.starts)}</time></h3>
          {slots.length>0 && <ul>{slots.map(({booking,period})=><li key={booking.id} className={`week-booking week-${booking.status}`}>
            <span>{period}</span>
            <button type="button" className="text-button" onClick={()=>openProject(booking.project_id)}>{booking.project_name}</button>
            <span>{reservationStages[booking.status]}{resource.person?'':` · Menge ${booking.quantity}`}</span>
          </li>)}</ul>}
        </section>;
      })}</div>
    </Panel>)}
  </>;
}
