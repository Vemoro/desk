import { useId, useRef, useState, type RefObject } from 'react';
import { reservationStages } from './client';
import { Field } from './field';

export const emptyReservationFilters={resource:'',status:'',day:'',onlyCheckedOut:false};
type ReservationFilterValues=typeof emptyReservationFilters;

export function ReservationFilters({filters,onChange,resourceSelector,count,timeZone}:{
  filters:ReservationFilterValues;onChange:(value:ReservationFilterValues)=>void;
  resourceSelector:RefObject<HTMLSelectElement|null>;count:number;timeZone:string;
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
      <Field label="Ressourcentyp">{props=><select {...props} ref={resourceSelector} value={filters.resource}
        onChange={event=>onChange({...filters,resource:event.currentTarget.value})}>
        <option value="">Alle</option><option value="user">Personal</option><option value="item">Inventar</option>
      </select>}</Field>
      <Field label="Status filtern">{props=><select {...props} value={filters.status}
        onChange={event=>onChange({...filters,status:event.currentTarget.value})}>
        <option value="">Alle</option>
        {Object.entries(reservationStages).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select>}</Field>
      <Field label="Am Datum" describedBy={dayZone}>{props=><input {...props} type="date" ref={dayInput}
        value={filters.day} onInput={trackDayInput} onKeyUp={trackDayInput} onBlur={trackDayInput}
        onChange={event=>onChange({...filters,day:event.currentTarget.value})}/>}</Field>
      <Field label="Nur offene Geräteausgaben" className="checkbox-label">{props=><input {...props} type="checkbox"
        checked={filters.onlyCheckedOut} onChange={event=>onChange({...filters,onlyCheckedOut:event.currentTarget.checked})}/>}</Field>
    </div>
    <div className="actions">
      <span className="subtle" role="status">{count} {count===1?'Reservierung':'Reservierungen'}</span>
      <button type="button" disabled={!incompleteDay && !Object.values(filters).some(Boolean)} onClick={reset}>Filter zurücksetzen</button>
      <span className="subtle" id={dayZone}>Browser-Zeitzone {timeZone}</span>
    </div>
  </div>;
}
