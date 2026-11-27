import { useEffect, useState } from 'react';
import type { ProjectHistoryEntry } from '../server/contracts';
import { api, moment, movementStages, projectStages, reservationStages } from './client';
import { Panel, Table } from './widgets';

const pageSize=50;
const lastOffset=1_000_000;
const sourceLabel={desk:'',haben:'Haben-Abgleich',project:'Automatische Freigabe'};

function eventLabel(event:ProjectHistoryEntry) {
  if (event.kind==='stage') return 'Status geändert';
  if (event.kind==='reservation') return reservationStages[event.status];
  return movementStages[event.status];
}

function details(event:ProjectHistoryEntry) {
  if (event.kind==='stage') return `${projectStages[event.previous_status ?? '']} → ${projectStages[event.status]}`;
  const resource=event.inventory_number ? `${event.resource_name} (${event.inventory_number})` : event.resource_name;
  return [resource && (event.location_name ? `${event.quantity} × ${resource}` : resource),
    event.location_name,event.correction_reason].filter(Boolean).join(' · ') || '–';
}

export function ProjectHistory({projectId}:{projectId:string}) {
  const [offset,setOffset]=useState(0);
  const [attempt,setAttempt]=useState(0);
  const [entries,setEntries]=useState<ProjectHistoryEntry[]>();
  const [problem,setProblem]=useState('');

  useEffect(()=>{
    let current=true;
    void api<ProjectHistoryEntry[]>(`projects/${projectId}/history?limit=${pageSize+1}&offset=${offset}`).then(
      result=>{if (current) setEntries(result);},
      error=>{if (current) setProblem(error instanceof Error ? error.message : 'Der Projektverlauf konnte nicht geladen werden.');},
    );
    return ()=>{current=false;};
  },[projectId,offset,attempt]);

  function turnPage(next:number) {
    setEntries(undefined);
    setProblem('');
    if (offset===next) setAttempt(value=>value+1);
    else setOffset(next);
  }

  const more=(entries?.length ?? 0)>pageSize;
  return <Panel title="Projektverlauf">
    {problem ? <div className="panel-body">
      <p className="inline-error" role="alert">{problem}</p>
      <div className="actions"><button type="button" onClick={()=>turnPage(offset)}>Erneut laden</button></div>
    </div> : entries ? <Table headers={['Zeitpunkt','Ereignis','Details','Ausgelöst von']} rows={entries.slice(0,pageSize).map(event=>({
      key:`${event.kind}:${event.id}`,
      cells:[<time dateTime={event.created_at}>{moment(event.created_at)}</time>, eventLabel(event),
        <span className="booking-details">{details(event)}</span>,
        [event.actor_name ?? 'Ohne Zuordnung',sourceLabel[event.source]].filter(Boolean).join(' · ')],
    }))}/> : <p className="empty" role="status">Projektverlauf wird geladen …</p>}
    {(offset>0 || more) && <div className="panel-body"><div className="actions">
      <button type="button" disabled={offset===0} onClick={()=>turnPage(offset-pageSize)}>Neuere Ereignisse</button>
      <button type="button" disabled={!more || offset>=lastOffset} onClick={()=>turnPage(offset+pageSize)}>Ältere Ereignisse</button>
    </div></div>}
  </Panel>;
}
