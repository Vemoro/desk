import { useEffect, useRef, useState } from 'react';
import { api, euros, money, type Row } from './client';
import { Field } from './field';
import { ListEmpty } from './list-page';
import type { Data } from './projects';
import { Expand, Form, Panel, Table, type Run } from './widgets';

export function Controlling({project,data,run}:{project:Row;data:Data;run:Run}) {
  const [source,setSource]=useState('');
  const [query,setQuery]=useState('');
  const searchInput=useRef<HTMLInputElement>(null);
  const lines=data.lines.filter((row)=>row.project_id===project.id);
  const costs=data.costs.filter((row)=>row.project_id===project.id);
  const sources=[...new Set<string>(costs.map(row=>row.source))].sort();
  const selectedSource=sources.includes(source)?source:'';
  useEffect(()=>{if(source!==selectedSource) setSource(selectedSource);},[source,selectedSource]);
  const term=query.trim().toLowerCase();
  const filterActive=Boolean(term || selectedSource);
  const visibleCosts=costs.filter(row=>
    (!selectedSource || row.source===selectedSource)
    && (!term || [row.reference,row.name].some(value=>value.toLowerCase().includes(term))));
  const budget=(kind:string)=>lines.filter((row)=>row.kind===kind).reduce((sum,row)=>sum+row.quantity*row.unit_cents,0);
  const actual=costs.reduce((sum,row)=>sum+row.cents,0);

  function clearSearch() {
    setQuery('');
    searchInput.current?.focus();
  }

  return <>
    <div className="metrics">{[
      ['Einkauf geplant',budget('buy')],['Ist-Kosten',actual],['Abweichung',actual-budget('buy')],['Verkauf geplant',budget('sell')],
    ].map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{euros(Number(value))}</strong></div>)}</div>
    <Panel title="Belegbezogene Ist-Kosten">
      <div className="panel-body">
        <div className="form-grid">
          <Field label="Belege suchen">{props=><input {...props} type="search" ref={searchInput}
            value={query} onChange={event=>setQuery(event.currentTarget.value)}/>}</Field>
          <Field label="Kostenquelle filtern">{props=><select {...props} value={selectedSource}
            onChange={event=>setSource(event.currentTarget.value)}>
            <option value="">Alle Quellen</option>
            {sources.map(value=><option key={value} value={value}>{value}</option>)}
          </select>}</Field>
        </div>
        <button className="project-cost-reset" type="button" disabled={!query && !selectedSource}
          onClick={()=>{setSource('');clearSearch();}}>
          Filter zurücksetzen
        </button>
        <Expand title="Ist-Kosten erfassen"><Form caption="Kosten speichern" fields={[
        {name:'reference',label:'Belegreferenz',required:true},{name:'name',label:'Bezeichnung',required:true},{name:'amount',label:'Netto in Euro',required:true},
      ]} submit={(fields)=>run(()=>api('costs','POST',{entries:[{project_id:project.id,source:'manual',reference:fields.reference,name:fields.name,cents:money(fields.amount)}]}),'Ist-Kosten gespeichert.')}/></Expand></div>
      {term && costs.length>0 && !visibleCosts.length
        ? <ListEmpty action={<button type="button" onClick={clearSearch}>Suche leeren</button>}>
          Keine Belege für diese Filter.
        </ListEmpty>
        : <Table numeric={[3]} headers={['Belegreferenz','Bezeichnung','Quelle','Netto']} rows={visibleCosts.map((row)=>({key:row.id,cells:[row.reference,row.name,row.source,euros(row.cents)]}))}/>}
      {filterActive&&visibleCosts.length>0&&<div className="panel-body">
        <output>Summe der sichtbaren Belege <strong className="cost-subtotal">{euros(visibleCosts.reduce((sum,row)=>sum+row.cents,0))}</strong></output>
      </div>}
    </Panel>
  </>;
}
