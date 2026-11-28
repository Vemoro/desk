import { useId, useRef, useState, type RefObject } from 'react';
import { reservationStages, type Row } from './client';
import { Field } from './field';
import { options } from './widgets';

export const emptyReservationFilters={query:'',resource:'',location:'',status:'',day:'',onlyCheckedOut:false};
type ReservationFilterValues=typeof emptyReservationFilters;

export function matchesReservationQuery(row:Row,people:Row[],items:Row[],query:string) {
  const resource=(row.user_id?people:items).find(entry=>entry.id===(row.user_id??row.item_id));
  const inventoryNumber=row.user_id?undefined:resource?.inventory_number;
  return [resource?.name,inventoryNumber].some(value=>typeof value==='string' && value.toLowerCase().includes(query));
}

export function ReservationFilters({filters,onChange,resourceSelector,locations,count,timeZone}:{
  filters:ReservationFilterValues;onChange:(value:ReservationFilterValues)=>void;
  resourceSelector:RefObject<HTMLSelectElement|null>;locations:Row[];count:number;timeZone:string;
}) {
  const dayInput=useRef<HTMLInputElement>(null);
  const dayZone=useId();
  const [incompleteDay,setIncompleteDay]=useState(false);

  // A partially entered native date can have an empty value.
  function trackDayInput() {
    setIncompleteDay(dayInput.current?.validity.badInput ?? false);
  }

  function reset() {
    if(dayInput.current) dayInput.current.value='';
    setIncompleteDay(false);
    onChange(emptyReservationFilters);
    resourceSelector.current?.focus();
  }

  return <div className="panel-body">
    <div className="form-grid">
      <Field label="Ressourcen suchen">{props=><input {...props} type="search" value={filters.query}
        onChange={event=>onChange({...filters,query:event.currentTarget.value})}/>}</Field>
      <Field label="Ressourcentyp">{props=><select {...props} ref={resourceSelector} value={filters.resource}
        onChange={event=>onChange({...filters,resource:event.currentTarget.value})}>
        <option value="">Alle</option><option value="user">Personal</option><option value="item">Inventar</option>
      </select>}</Field>
      <Field label="Lagerort">{props=><select {...props} value={filters.location}
        onChange={event=>onChange({...filters,location:event.currentTarget.value})}>
        <option value="">Alle Lagerorte</option>
        {options(locations).map(({value,label})=><option key={value} value={value}>{label}</option>)}
      </select>}</Field>
      <Field label="Status filtern">{props=><select {...props} value={filters.status}
        onChange={event=>onChange({...filters,status:event.currentTarget.value})}>
        <option value="">Alle</option>
        {Object.entries(reservationStages).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select>}</Field>
      <Field label="Am Datum" describedBy={dayZone}>{props=><input {...props} type="date" ref={dayInput}
        value={filters.day} onInput={trackDayInput} onKeyUp={trackDayInput} onBlur={trackDayInput}
        onChange={event=>onChange({...filters,day:event.currentTarget.value})}/>}</Field>
      <Field label="Nur offene Geräteausgaben" className="checkbox-label reservation-open-filter">{props=><input {...props} type="checkbox"
        checked={filters.onlyCheckedOut} onChange={event=>onChange({...filters,onlyCheckedOut:event.currentTarget.checked})}/>}</Field>
    </div>
    <div className="actions">
      <span className="subtle" role="status">{count} {count===1?'Reservierung':'Reservierungen'}</span>
      <button type="button" disabled={!incompleteDay && !Object.values(filters).some(Boolean)} onClick={reset}>Filter zurücksetzen</button>
      <span className="subtle" id={dayZone}>Browser-Zeitzone {timeZone}</span>
    </div>
  </div>;
}
